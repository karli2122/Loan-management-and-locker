package expo.modules.emideviceadmin

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import java.lang.ref.WeakReference

/**
 * Accessibility service that monitors the foreground app and periodically
 * checks the backend for lock state changes (even when the app is closed).
 *
 * Behavior depends on device state:
 * - LOCKED (is_locked=true): Blocks ALL apps except system UI. Shows warning toast.
 *   Relaunches our app immediately. This is the most aggressive mode.
 * - SETUP COMPLETE (setup_complete=true, not locked): Shows warning for Settings.
 *   Allows all other apps normally.
 * - DURING SETUP (setup_complete=false): Allows everything.
 * - UNINSTALL ALLOWED: Does nothing, all apps accessible.
 */
class EMIAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "EMIAccessibility"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_UNINSTALL_ALLOWED = "uninstall_allowed"
        private const val KEY_PROTECTION_ENABLED = "protection_enabled"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
        private const val KEY_LOCKED = "is_locked"
        private const val KEY_CLIENT_ID = "client_id"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val INTERVAL_LOCKED_MS = 10_000L
        private const val INTERVAL_UNLOCKED_MS = 15_000L
        @Volatile var isRunning = false
        /** Used by [ShadeGuard] to close the notification shade (GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE). */
        @Volatile var instance: WeakReference<EMIAccessibilityService>? = null
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var syncThread: HandlerThread? = null
    private var syncHandler: Handler? = null
    private var triggersRegistered = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var lastTriggerAt = 0L
    @Volatile private var lastRelaunchAt = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        isRunning = true
        instance = WeakReference(this)
        Log.d(TAG, "Accessibility service connected")

        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                         AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED or
                         AccessibilityEvent.TYPE_WINDOWS_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 50
            flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
        serviceInfo = info

        // Host the lock-state sync here. The system keeps an enabled accessibility service
        // bound (process alive) without a foreground-service notification, so the persistent
        // lock-sync notification is not needed while this service runs.
        startLockSyncHost()
    }

    private val syncTick = object : Runnable {
        override fun run() {
            val app = applicationContext
            val p = LockSync.prefs(app)
            if (p.getBoolean(KEY_UNINSTALL_ALLOWED, false) || p.getString(KEY_CLIENT_ID, null).isNullOrEmpty()) {
                syncHandler?.postDelayed(this, INTERVAL_UNLOCKED_MS)
                return
            }
            try { LockSync.check(app) } catch (e: Exception) { Log.d(TAG, "lock check failed: ${e.message}") }
            try { LockSync.enforceTamperIfDue(app) } catch (e: Exception) { Log.w(TAG, "tamper enforce: ${e.message}") }
            LockSyncBackup.scheduleAlarm(app)
            LockSyncBackup.scheduleJob(app)
            val locked = p.getBoolean(KEY_LOCKED, false)
            syncHandler?.postDelayed(this, if (locked) INTERVAL_LOCKED_MS else INTERVAL_UNLOCKED_MS)
        }
    }

    private fun startLockSyncHost() {
        if (syncThread == null) {
            syncThread = HandlerThread("emi-a11y-lock-sync").also { it.start() }
            syncHandler = Handler(syncThread!!.looper)
        }
        syncHandler?.removeCallbacks(syncTick)
        syncHandler?.post(syncTick)
        registerTriggers()
        // The foreground lock-sync service (and its notification) is redundant now.
        EMILockSyncService.stopServiceOnly(applicationContext)
        Log.d(TAG, "Lock sync hosted by accessibility service")
    }

    private fun stopLockSyncHost() {
        unregisterTriggers()
        syncHandler?.removeCallbacksAndMessages(null)
        syncThread?.quitSafely()
        syncHandler = null
        syncThread = null
    }

    /** Screen on / unlock / network back: check right away. */
    private fun checkNow(reason: String) {
        val now = System.currentTimeMillis()
        if (now - lastTriggerAt < 3_000L) return
        lastTriggerAt = now
        Log.d(TAG, "Immediate lock check ($reason)")
        syncHandler?.removeCallbacks(syncTick)
        syncHandler?.post(syncTick)
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { checkNow(intent?.action ?: "screen") }
    }

    private fun registerTriggers() {
        if (triggersRegistered) return
        try {
            val f = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_USER_PRESENT)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(screenReceiver, f)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                val cb = object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: android.net.Network) { checkNow("network_available") }
                }
                cm?.registerDefaultNetworkCallback(cb)
                networkCallback = cb
            }
            triggersRegistered = true
        } catch (e: Exception) {
            Log.w(TAG, "trigger registration failed: ${e.message}")
        }
    }

    private fun unregisterTriggers() {
        try { unregisterReceiver(screenReceiver) } catch (_: Exception) {}
        try {
            networkCallback?.let { (getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager)?.unregisterNetworkCallback(it) }
        } catch (_: Exception) {}
        networkCallback = null
        triggersRegistered = false
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        val myPackage = applicationContext.packageName

        if (packageName == myPackage) return

        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Don't interfere if uninstall has been allowed
        if (prefs.getBoolean(KEY_UNINSTALL_ALLOWED, false)) return

        // Don't interfere if protection is not enabled
        if (!prefs.getBoolean(KEY_PROTECTION_ENABLED, true)) return

        val isLocked = prefs.getBoolean(KEY_LOCKED, false)
        val setupComplete = prefs.getBoolean(KEY_SETUP_COMPLETE, false)

        // LOCKED MODE: Block everything except bare system UI
        if (isLocked) {
            // If systemui opens (notification shade / quick settings), immediately close it
            if (packageName == "com.android.systemui") {
                // System UI windows include the shade, heads-up notifications, toasts,
                // the volume panel and permission/pinning prompts. The old handler fired
                // GLOBAL_ACTION_HOME plus 8 BACK presses and relaunched the app on EVERY
                // such event, which pushed our own lock screen to the background and back
                // again — the lock screen visibly flashed and the app could be killed.
                // Now: close the shade once (throttled), never press HOME, and only bring
                // the app back if it actually lost the foreground.
                if (EmergencyCallSession.isActive(this)) return
                // Close the shade on EVERY SystemUI window event (a throttle let a quick
                // second swipe keep the shade open), a few times during its open animation.
                ShadeGuard.dismissBurst(applicationContext, "systemui_window")
                try {
                    sendBroadcast(Intent("expo.modules.emideviceadmin.REAPPLY_IMMERSIVE").setPackage(applicationContext.packageName))
                } catch (_: Exception) {}
                // Only the relaunch is throttled.
                val now = System.currentTimeMillis()
                if (now - lastRelaunchAt < 1_500L) return
                lastRelaunchAt = now
                mainHandler.postDelayed({ LockSync.launchApp(applicationContext) }, 400)
                return
            }

            val lockedAllowed = setOf(
                "android",
            )
            if (packageName in lockedAllowed) return

            // During a live emergency-call session let the dialer and the runtime
            // permission prompt (READ_PHONE_STATE) through.
            val emergencySession = EmergencyCallSession.isActive(this)
            if (emergencySession && (packageName.contains("permissioncontroller") ||
                    EmergencyCallSession.isDialerPackage(packageName, this))) {
                return
            }

            // Phone/Dialer apps: reject calls unless emergency call is active
            val isPhoneApp = packageName.contains("dialer") ||
                             packageName.contains("incall") ||
                             packageName.contains("telecom") ||
                             packageName.contains("phone") ||
                             packageName == "com.android.dialer" ||
                             packageName == "com.google.android.dialer" ||
                             packageName == "com.samsung.android.dialer"
            if (isPhoneApp) {
                if (emergencySession) {
                    Log.d(TAG, "LOCKED: Emergency call active — allowing: $packageName")
                    return
                }
                // Regular incoming call — reject it and kill dialer
                Log.d(TAG, "LOCKED: Rejecting incoming call, killing dialer: $packageName")
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        val telecom = applicationContext.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
                        telecom?.endCall()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to end call: ${e.message}")
                }
                // Mute the ringer
                try {
                    val audio = applicationContext.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
                    audio.ringerMode = android.media.AudioManager.RINGER_MODE_SILENT
                } catch (_: Exception) {}
                // Bring our app back
                launchApp()
                return
            }

            Log.d(TAG, "LOCKED: Blocking $packageName — relaunching app")

            val isSettingsApp = packageName.contains("settings") ||
                                packageName == "com.android.settings"
            if (isSettingsApp) {
                mainHandler.post {
                    Toast.makeText(
                        applicationContext,
                        "Device is locked. Disabling permissions will wipe data. Contact your administrator.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            launchApp()
            return
        }

        // SETUP COMPLETE (PROTECTED mode): Show warning for Settings, allow all other apps
        if (setupComplete) {
            val isSettingsApp = packageName == "com.android.settings" ||
                                packageName == "com.samsung.android.settings" ||
                                packageName.contains("settings")

            if (isSettingsApp) {
                mainHandler.post {
                    Toast.makeText(
                        applicationContext,
                        "Warning: Disabling app permissions may trigger security measures.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            return
        }

        // DURING SETUP: Allow everything
        return
    }

    private fun launchApp() {
        if (EmergencyCallSession.isActive(this)) return
        try {
            val myPackage = applicationContext.packageName
            val launchIntent = applicationContext.packageManager
                .getLaunchIntentForPackage(myPackage)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                applicationContext.startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to relaunch app: ${e.message}")
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        instance = null
        stopLockSyncHost()
        // Hand the lock sync back to the foreground service (backups retry if refused).
        try { EMILockSyncService.start(applicationContext) } catch (_: Exception) {}
        Log.d(TAG, "Accessibility service destroyed")
    }
}
