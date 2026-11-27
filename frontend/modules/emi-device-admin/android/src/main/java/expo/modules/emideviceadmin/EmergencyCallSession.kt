package expo.modules.emideviceadmin

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import java.lang.ref.WeakReference

/**
 * Emergency-dialer session that keeps the device contained.
 * - Device owner: lock task stays on; dialer packages are temporarily allowlisted.
 * - Overlay mode: overlay is dropped for the session and restored afterwards.
 * Never places a call itself (ACTION_DIAL only). Never relocks over a live call.
 */
object EmergencyCallSession {
    private const val TAG = "EmergencyCallSession"

    private const val PREFS = "emi_device_admin_prefs"
    const val KEY_LOCKED = "is_locked"
    const val KEY_ACTIVE = "emergency_call_active"
    const val KEY_STARTED = "emergency_call_started_at"
    const val KEY_SAW_OFFHOOK = "emergency_call_saw_offhook"
    const val KEY_CALL_ENDED = "emergency_call_ended"
    const val KEY_OVERLAY_WAS_RUNNING = "emergency_overlay_was_running"
    const val KEY_BOOT_COUNT = "emergency_call_boot_count"
    const val KEY_STARTED_RT = "emergency_call_started_rt"

    private const val GRACE_MS = 4_000L
    private const val MAX_SESSION_MS = 30 * 60_000L
    private const val POLL_MS = 1_500L
    private const val DEFAULT_NUMBER = "112"

    // AOSP emergency dialer action (not an SDK constant); only used if it resolves to a dialer package.
    private const val EMERGENCY_DIALER_ACTION = "com.android.phone.EmergencyDialer.DIAL"
    // Official TelecomManager action; use the string because some compile classpaths
    // do not expose SHOW_EMERGENCY_DIALER as a visible field.
    private const val SHOW_EMERGENCY_DIALER = "android.telecom.action.SHOW_EMERGENCY_DIALER"

    private val FALLBACK_EMERGENCY_NUMBERS =
        setOf("112", "911", "999", "000", "08", "110", "118", "119", "100", "101", "102", "108")

    private val KNOWN_DIALER_PACKAGES = setOf(
        "com.android.dialer",
        "com.google.android.dialer",
        "com.android.phone",
        "com.android.server.telecom",
        "com.android.incallui",
        "com.android.emergency",
        "com.samsung.android.dialer",
        "com.samsung.android.incallui",
        "com.oneplus.dialer",
        "com.sonymobile.android.dialer",
        "com.motorola.dialer",
    )

    // System telephony processes: never killed.
    private val CORE_TELEPHONY = setOf("com.android.phone", "com.android.server.telecom")

    private val main = Handler(Looper.getMainLooper())

    @Volatile private var appContext: Context? = null
    @Volatile private var activityRef: WeakReference<Activity>? = null
    @Volatile private var lastCallState = TelephonyManager.CALL_STATE_IDLE
    @Volatile private var telephonyRegistered = false
    private var telephonyCallback: Any? = null          // TelephonyCallback on S+
    private var phoneStateListener: PhoneStateListener? = null

    private val watchdog = object : Runnable {
        override fun run() {
            val c = appContext ?: return
            if (!isActive(c)) return
            if (shouldRelock(c)) {
                finish(c, activityRef?.get())
                if (!isActive(c)) return
            }
            main.postDelayed(this, POLL_MS)
        }
    }

    // ---------- public API ----------

    fun currentBootCount(context: Context): Int =
        try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
        } catch (_: Exception) {
            -1
        }

    /**
     * True only for a session started on this boot, still within the monotonic TTL.
     * A leftover flag after reboot or an implausible elapsedRealtime is treated as inactive.
     */
    fun isActive(context: Context): Boolean {
        val p = prefs(context)
        if (!p.getBoolean(KEY_ACTIVE, false)) return false
        val boot = currentBootCount(context)
        val savedBoot = p.getInt(KEY_BOOT_COUNT, -2)
        if (boot == -1 || savedBoot != boot) return false
        val startedRt = p.getLong(KEY_STARTED_RT, -1L)
        val nowRt = SystemClock.elapsedRealtime()
        if (startedRt < 0L || nowRt < startedRt) return false
        if (nowRt - startedRt > MAX_SESSION_MS) return false
        return true
    }

    /** Clear a stale persisted emergency flag (e.g. after reboot) without a full finish dance. */
    fun clearStale(context: Context) {
        val app = context.applicationContext
        if (!prefs(app).getBoolean(KEY_ACTIVE, false)) return
        if (isActive(app)) return
        prefs(app).edit()
            .putBoolean(KEY_ACTIVE, false)
            .remove(KEY_STARTED)
            .remove(KEY_STARTED_RT)
            .remove(KEY_BOOT_COUNT)
            .remove(KEY_SAW_OFFHOOK)
            .remove(KEY_CALL_ENDED)
            .remove(KEY_OVERLAY_WAS_RUNNING)
            .commit()
        unregisterTelephonyListeners(app)
        main.removeCallbacks(watchdog)
    }

    fun start(context: Context, activity: Activity?, number: String): String {
        val app = context.applicationContext
        appContext = app
        val dialNumber = sanitizeNumber(app, number)
        val p = prefs(app)
        val now = System.currentTimeMillis()
        val resumed = isActive(app) && now - p.getLong(KEY_STARTED, 0L) in 0..MAX_SESSION_MS
        if (!resumed) {
            p.edit()
                .putBoolean(KEY_ACTIVE, true)
                .putLong(KEY_STARTED, now)
                .putLong(KEY_STARTED_RT, SystemClock.elapsedRealtime())
                .putInt(KEY_BOOT_COUNT, currentBootCount(app))
                .putBoolean(KEY_SAW_OFFHOOK, false)
                .putBoolean(KEY_CALL_ENDED, false)
                .commit()
        }
        if (activity != null) activityRef = WeakReference(activity)

        runOnMain {
            if (isDeviceOwner(app)) prepareDeviceOwner(app)
            dropOverlay(app)
            registerTelephonyListeners(app)
            if (!launchEmergencyDialer(app, activityRef?.get(), dialNumber)) {
                Log.w(TAG, "No dialer could be launched; ending session")
                finish(app, activityRef?.get())
                return@runOnMain
            }
            main.removeCallbacks(watchdog)
            main.postDelayed(watchdog, POLL_MS)
        }
        return if (resumed) "resumed" else "started"
    }

    fun shouldRelock(context: Context): Boolean {
        val app = context.applicationContext
        val p = prefs(app)
        if (!isActive(app)) return false

        val now = System.currentTimeMillis()
        val started = p.getLong(KEY_STARTED, 0L)
        val elapsed = now - started
        if (elapsed < 0) { // clock moved backwards: restart window
            p.edit().putLong(KEY_STARTED, now).apply()
            return false
        }
        if (elapsed < GRACE_MS) return false
        if (!telephonyRegistered) registerTelephonyListeners(app) // e.g. after process restart

        // Live call always wins (including past the safety valve).
        if (isInCall(app)) {
            if (!p.getBoolean(KEY_SAW_OFFHOOK, false)) {
                p.edit().putBoolean(KEY_SAW_OFFHOOK, true).putBoolean(KEY_CALL_ENDED, false).apply()
            }
            return false
        }
        if (elapsed > MAX_SESSION_MS) return true

        // A call happened and is no longer active -> call ended.
        if (p.getBoolean(KEY_SAW_OFFHOOK, false)) return true

        // Never dialed: composing in the dialer must not relock.
        if (isOwnAppVisible(app)) return true
        val fg = foregroundPackage(app, started) ?: return false // unknown -> rely on MAX window
        if (fg == app.packageName) return true
        return !isDialerPackage(fg, app)
    }

    fun finish(context: Context, activity: Activity?): String {
        val app = context.applicationContext
        if (isActive(app) && isInCall(app)) return "in_call" // never relock over a live call

        main.removeCallbacks(watchdog)
        val p = prefs(app)
        p.edit()
            .putBoolean(KEY_ACTIVE, false)
            .remove(KEY_STARTED)
            .remove(KEY_STARTED_RT)
            .remove(KEY_BOOT_COUNT)
            .remove(KEY_SAW_OFFHOOK)
            .remove(KEY_CALL_ENDED)
            .commit()
        val act = activity ?: activityRef?.get()

        runOnMain {
            unregisterTelephonyListeners(app)
            val locked = p.getBoolean(KEY_LOCKED, false)
            val deviceOwner = isDeviceOwner(app)
            if (locked) {
                bringAppToFront(app, act)
                if (deviceOwner && act != null) {
                    main.postDelayed({ startLockTaskIfNeeded(act) }, 300)
                }
            }
            // Bring our task forward before shrinking the allowlist.
            if (deviceOwner) main.postDelayed({ restoreDeviceOwner(app) }, 600)
            if (locked) {
                restoreOverlayIfLocked(app)
                main.postDelayed({ killDialerBackgroundProcesses(app) }, 1_500)
            }
            p.edit().remove(KEY_OVERLAY_WAS_RUNNING).apply()
            activityRef = null
        }
        return "finished"
    }

    fun isDialerPackage(pkg: String?, context: Context? = null): Boolean {
        if (pkg.isNullOrEmpty()) return false
        if (pkg in KNOWN_DIALER_PACKAGES) return true
        return context != null && pkg in dynamicDialerPackages(context)
    }

    fun isInCall(context: Context): Boolean {
        if (telephonyRegistered && lastCallState != TelephonyManager.CALL_STATE_IDLE) return true
        try {
            val telecom = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            if (telecom?.isInCall == true) return true
        } catch (_: SecurityException) {
            // READ_PHONE_STATE missing: fall through to audio mode
        }
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        return audio?.mode == AudioManager.MODE_IN_CALL
    }

    // ---------- telephony ----------

    @Suppress("DEPRECATION")
    fun registerTelephonyListeners(context: Context) {
        val app = context.applicationContext
        runOnMain {
            if (telephonyRegistered) return@runOnMain
            val tm = app.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                ?: return@runOnMain
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                        override fun onCallStateChanged(state: Int) = onCallState(app, state)
                    }
                    tm.registerTelephonyCallback(app.mainExecutor, cb)
                    telephonyCallback = cb
                } else {
                    val l = object : PhoneStateListener() {
                        override fun onCallStateChanged(state: Int, phoneNumber: String?) =
                            onCallState(app, state)
                    }
                    tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                    phoneStateListener = l
                }
                telephonyRegistered = true
            } catch (e: SecurityException) {
                Log.w(TAG, "No READ_PHONE_STATE; using foreground/audio fallback")
                telephonyRegistered = false
            } catch (e: Exception) {
                Log.w(TAG, "Telephony listener failed", e)
                telephonyRegistered = false
            }
        }
    }

    @Suppress("DEPRECATION")
    fun unregisterTelephonyListeners(context: Context) {
        val app = context.applicationContext
        runOnMain {
            val tm = app.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    (telephonyCallback as? TelephonyCallback)?.let { tm?.unregisterTelephonyCallback(it) }
                } else {
                    phoneStateListener?.let { tm?.listen(it, PhoneStateListener.LISTEN_NONE) }
                }
            } catch (_: Exception) {
            }
            telephonyCallback = null
            phoneStateListener = null
            telephonyRegistered = false
            lastCallState = TelephonyManager.CALL_STATE_IDLE
        }
    }

    private fun onCallState(context: Context, state: Int) {
        lastCallState = state
        val p = prefs(context)
        if (!p.getBoolean(KEY_ACTIVE, false)) return
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK, TelephonyManager.CALL_STATE_RINGING ->
                p.edit().putBoolean(KEY_SAW_OFFHOOK, true).putBoolean(KEY_CALL_ENDED, false).apply()
            TelephonyManager.CALL_STATE_IDLE -> {
                // IDLE before OFFHOOK/RINGING (on registration / while composing) is ignored.
                if (p.getBoolean(KEY_SAW_OFFHOOK, false)) {
                    p.edit().putBoolean(KEY_CALL_ENDED, true).apply()
                    main.postDelayed({
                        if (shouldRelock(context)) finish(context, activityRef?.get())
                    }, 800)
                }
            }
        }
    }

    // ---------- dialer ----------

    fun launchEmergencyDialer(context: Context, activity: Activity?, number: String): Boolean {
        val pm = context.packageManager
        val candidates = mutableListOf<Intent>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            candidates.add(Intent(SHOW_EMERGENCY_DIALER))
        }
        candidates.add(Intent(EMERGENCY_DIALER_ACTION))
        candidates.add(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")))
        for (intent in candidates) {
            val target = intent.resolveActivity(pm)?.packageName ?: continue
            // Official emergency-dialer actions may resolve to a package not in the static list.
            val officialEmergency = intent.action == SHOW_EMERGENCY_DIALER ||
                intent.action == EMERGENCY_DIALER_ACTION
            if (!officialEmergency && !isDialerPackage(target, context)) continue
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                if (activity != null && !activity.isFinishing) activity.startActivity(intent)
                else context.startActivity(intent)
                return true
            } catch (e: Exception) {
                Log.w(TAG, "Dialer launch failed for $target", e)
            }
        }
        return false
    }

    private fun dynamicDialerPackages(context: Context): Set<String> {
        // Only the system dialer and packages that actually resolve emergency / ACTION_DIAL
        // intents. Do not blindly allowlist the user-selected default dialer (it may be a
        // third-party app with a full UI, which would be an escape route).
        val out = HashSet<String>()
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            telecom?.systemDialerPackage?.let { out.add(it) }
        }
        val pm = context.packageManager
        val probes = mutableListOf(
            Intent(Intent.ACTION_DIAL, Uri.parse("tel:$DEFAULT_NUMBER")),
            Intent(EMERGENCY_DIALER_ACTION),
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            probes.add(Intent(SHOW_EMERGENCY_DIALER))
        }
        for (intent in probes) {
            try {
                intent.resolveActivity(pm)?.packageName?.let { out.add(it) }
            } catch (_: Exception) {
            }
        }
        return out
    }

    // ---------- device owner ----------

    fun prepareDeviceOwner(context: Context) {
        val dpm = dpm(context) ?: return
        if (!dpm.isDeviceOwnerApp(context.packageName)) return
        val admin = adminComponent(context)
        val pkgs = linkedSetOf<String>().apply {
            add(context.packageName)
            addAll(KNOWN_DIALER_PACKAGES)
            addAll(dynamicDialerPackages(context))
        }
        try {
            dpm.setLockTaskPackages(admin, pkgs.toTypedArray())
        } catch (e: SecurityException) {
            Log.w(TAG, "setLockTaskPackages failed", e)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                // GLOBAL_ACTIONS only: no HOME / OVERVIEW / NOTIFICATIONS (escape routes).
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS)
            } catch (e: Exception) {
                Log.w(TAG, "setLockTaskFeatures failed", e)
            }
        }
    }

    fun restoreDeviceOwner(context: Context) {
        val dpm = dpm(context) ?: return
        if (!dpm.isDeviceOwnerApp(context.packageName)) return
        val admin = adminComponent(context)
        try {
            dpm.setLockTaskPackages(admin, arrayOf(context.packageName))
        } catch (e: SecurityException) {
            Log.w(TAG, "restore lock task packages failed", e)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
            } catch (e: Exception) {
                Log.w(TAG, "restore lock task features failed", e)
            }
        }
        if (prefs(context).getBoolean(KEY_LOCKED, false)) {
            try {
                dpm.setStatusBarDisabled(admin, true)
            } catch (e: Exception) {
                Log.w(TAG, "restore status bar disabled failed", e)
            }
        }
    }

    private fun startLockTaskIfNeeded(activity: Activity) {
        if (activity.isFinishing || !prefs(activity).getBoolean(KEY_LOCKED, false)) return
        val am = activity.getSystemService(ActivityManager::class.java) ?: return
        if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            try {
                activity.startLockTask()
            } catch (e: Exception) {
                Log.w(TAG, "startLockTask failed", e)
            }
        }
    }

    // ---------- overlay ----------

    fun dropOverlay(context: Context) {
        if (EMIOverlayService.isRunning) {
            prefs(context).edit().putBoolean(KEY_OVERLAY_WAS_RUNNING, true).apply()
        }
        try {
            context.stopService(Intent(context, EMIOverlayService::class.java))
        } catch (e: Exception) {
            Log.w(TAG, "stop overlay failed", e)
        }
    }

    fun restoreOverlayIfLocked(context: Context) {
        val p = prefs(context)
        if (!p.getBoolean(KEY_LOCKED, false)) return
        val wanted = p.getBoolean(KEY_OVERLAY_WAS_RUNNING, false) || !isDeviceOwner(context)
        if (!wanted || EMIOverlayService.isRunning) return
        try {
            val intent = Intent(context, EMIOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: IllegalStateException) {
            // Background-start restriction; the foreground monitor retries once the session is cleared.
            Log.w(TAG, "overlay restart deferred to monitor", e)
        }
    }

    // ---------- helpers ----------

    private fun bringAppToFront(context: Context, activity: Activity?) {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        )
        try {
            (activity?.takeUnless { it.isFinishing } ?: context).startActivity(intent)
        } catch (e: Exception) {
            Log.w(TAG, "bringAppToFront failed", e)
        }
    }

    private fun killDialerBackgroundProcesses(context: Context) {
        if (isActive(context) || isInCall(context)) return
        if (context.checkSelfPermission(Manifest.permission.KILL_BACKGROUND_PROCESSES) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        val am = context.getSystemService(ActivityManager::class.java) ?: return
        (KNOWN_DIALER_PACKAGES + dynamicDialerPackages(context))
            .filter { it !in CORE_TELEPHONY && it != context.packageName }
            .forEach {
                try {
                    am.killBackgroundProcesses(it) // only affects background processes
                } catch (_: Exception) {
                }
            }
    }

    @Suppress("DEPRECATION")
    private fun foregroundPackage(context: Context, since: Long): String? {
        val usm = context.getSystemService(UsageStatsManager::class.java) ?: return null
        val end = System.currentTimeMillis()
        val begin = maxOf(since - 5_000L, end - MAX_SESSION_MS)
        val events = try {
            usm.queryEvents(begin, end)
        } catch (_: Exception) {
            return null
        } ?: return null
        val ev = UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(ev)
            if (ev.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) last = ev.packageName
        }
        return last // null if no usage access or no events
    }

    private fun isOwnAppVisible(context: Context): Boolean {
        val am = context.getSystemService(ActivityManager::class.java) ?: return false
        val pid = Process.myPid()
        return am.runningAppProcesses?.any {
            it.pid == pid &&
                it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        } == true
    }

    private fun sanitizeNumber(context: Context, raw: String): String {
        val digits = raw.filter { it.isDigit() }
        if (digits.isEmpty()) return DEFAULT_NUMBER
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                if (tm?.isEmergencyNumber(digits) == true) return digits
            } catch (_: Exception) {
            }
        }
        return if (digits in FALLBACK_EMERGENCY_NUMBERS) digits else DEFAULT_NUMBER
    }

    private fun isDeviceOwner(context: Context): Boolean =
        dpm(context)?.isDeviceOwnerApp(context.packageName) == true

    private fun dpm(context: Context): DevicePolicyManager? =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager

    private fun adminComponent(context: Context) =
        ComponentName(context, EMIDeviceAdminReceiver::class.java)

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }
}
