package expo.modules.emideviceadmin

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native, JS-independent lock-state sync.
 *
 * Polls GET {backend}/api/device/status/{client_id} and applies a server lock
 * even when the React Native app is closed or swiped away. Works against the
 * legacy live API (no signature, no lock_level) and the newer API.
 *
 * The decision is intentionally one-directional for safety:
 *  - server LOCKED  -> write native lock flag, launch the app, start overlay/monitor
 *  - server UNLOCKED -> clear the native flag and stop overlay/monitor (the JS app
 *    clears kiosk/immersive when it next runs)
 */
object LockSync {
    private const val TAG = "EMILockSync"
    private const val PREFS = "emi_device_admin_prefs"
    const val KEY_LOCKED = "is_locked"
    const val KEY_MESSAGE = "lock_message"
    const val KEY_LEVEL = "lock_level"
    const val KEY_CLIENT_ID = "client_id"
    const val KEY_BACKEND_URL = "backend_url"
    const val KEY_DEVICE_TOKEN = "device_auth_token"
    const val KEY_LAST_SYNC = "lock_sync_last_ok"

    /** Invisible marker the admin app puts in lock_message to request restricted mode on the legacy API. */
    const val RESTRICTED_MARKER = "\u2063R\u2063"

    private val main = Handler(Looper.getMainLooper())
    @Volatile private var lastLaunchAt = 0L

    fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Blocking network call: run off the main thread. */
    fun check(context: Context): Boolean {
        val app = context.applicationContext
        val p = prefs(app)
        val clientId = p.getString(KEY_CLIENT_ID, null)
        val backendUrl = p.getString(KEY_BACKEND_URL, null)
        if (clientId.isNullOrEmpty() || backendUrl.isNullOrEmpty()) return false

        var connection: HttpURLConnection? = null
        try {
            val url = URL("${backendUrl.trimEnd('/')}/api/device/status/$clientId")
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            val token = p.getString(KEY_DEVICE_TOKEN, null)
            if (!token.isNullOrEmpty()) connection.setRequestProperty("X-Device-Token", token)

            val code = connection.responseCode
            if (code != 200) {
                Log.d(TAG, "status HTTP $code")
                return false
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            apply(app, json)
            p.edit().putLong(KEY_LAST_SYNC, System.currentTimeMillis()).apply()
            return true
        } catch (e: Exception) {
            Log.d(TAG, "status check failed (will retry): ${e.message}")
            return false
        } finally {
            try { connection?.disconnect() } catch (_: Exception) {}
        }
    }

    private fun apply(app: Context, json: JSONObject) {
        val p = prefs(app)
        val uninstallAllowed = json.optBoolean("uninstall_allowed", false)
        val deleted = json.optBoolean("is_deleted", false)
        p.edit().putBoolean("uninstall_allowed", uninstallAllowed).apply()
        if (uninstallAllowed || deleted) {
            // Admin released the device: never hold a lock.
            if (p.getBoolean(KEY_LOCKED, false)) clearLock(app)
            return
        }

        val serverLocked = json.optBoolean("is_locked", false)
        val rawMessage = if (json.isNull("lock_message")) "" else json.optString("lock_message", "")
        var level = if (json.isNull("lock_level")) "" else json.optString("lock_level", "")
        if (level.isEmpty()) {
            level = when {
                !serverLocked -> "none"
                rawMessage.contains(RESTRICTED_MARKER) -> "restricted"
                else -> "full"
            }
        }
        val message = rawMessage.replace(RESTRICTED_MARKER, "").trim()
        val wasLocked = p.getBoolean(KEY_LOCKED, false)
        val prevLevel = p.getString(KEY_LEVEL, "none") ?: "none"

        if (serverLocked && level.equals("restricted", true) && isDeviceOwner(app)) {
            // Restricted mode is applied by the JS app (package suspension); no full overlay.
            p.edit().putString(KEY_LEVEL, "restricted").putString(KEY_MESSAGE, message).apply()
            if (wasLocked) {
                p.edit().putBoolean(KEY_LOCKED, false).apply()
                stopServices(app)
            }
            if (prevLevel != "restricted") launchApp(app, force = true)
            return
        }

        if (serverLocked && !level.equals("warning", true)) {
            p.edit()
                .putBoolean(KEY_LOCKED, true)
                .putString(KEY_MESSAGE, message)
                .putString(KEY_LEVEL, "full")
                .commit()
            if (!wasLocked) Log.w(TAG, "Server says LOCKED — enforcing natively")
            enforceLock(app, launch = !wasLocked)
        } else {
            if (wasLocked || prevLevel != "none") {
                Log.w(TAG, "Server says UNLOCKED — clearing native lock")
                clearLock(app)
            }
        }
    }

    fun enforceLock(context: Context, launch: Boolean) {
        val app = context.applicationContext
        if (EmergencyCallSession.isActive(app)) return
        // Launch the activity first: once it is visible the app is "foreground"
        // and starting the overlay / monitor foreground services is allowed.
        if (launch || !isAppInForeground(app)) launchApp(app, force = launch)
        main.postDelayed({
            if (!prefs(app).getBoolean(KEY_LOCKED, false)) return@postDelayed
            if (!EMIOverlayService.isRunning && canDrawOverlays(app)) {
                startFgs(app, Intent(app, EMIOverlayService::class.java), "overlay")
            }
            if (!EMIForegroundMonitorService.isRunning) {
                startFgs(app, Intent(app, EMIForegroundMonitorService::class.java), "monitor")
            }
        }, if (launch) 1_200L else 0L)
    }

    private fun clearLock(app: Context) {
        prefs(app).edit()
            .putBoolean(KEY_LOCKED, false)
            .putString(KEY_LEVEL, "none")
            .commit()
        stopServices(app)
    }

    private fun stopServices(app: Context) {
        try { app.stopService(Intent(app, EMIOverlayService::class.java)) } catch (_: Exception) {}
        try { app.stopService(Intent(app, EMIForegroundMonitorService::class.java)) } catch (_: Exception) {}
    }

    private fun startFgs(app: Context, intent: Intent, label: String) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent)
            else app.startService(intent)
        } catch (e: Exception) {
            // Background FGS start can be refused (Android 12+). The launched activity
            // starts these services itself once JS runs.
            Log.w(TAG, "start $label deferred: ${e.message}")
        }
    }

    fun launchApp(context: Context, force: Boolean = false) {
        val app = context.applicationContext
        val now = System.currentTimeMillis()
        // Debounce relaunches so we never fight with the app in a loop.
        if (!force && now - lastLaunchAt < 5_000) return
        if (!force && isAppInForeground(app)) return
        lastLaunchAt = now
        main.post {
            try {
                val intent = app.packageManager.getLaunchIntentForPackage(app.packageName) ?: return@post
                intent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                intent.putExtra("lock_sync", true)
                app.startActivity(intent)
            } catch (e: Exception) {
                Log.w(TAG, "launchApp failed: ${e.message}")
            }
        }
    }

    fun isAppInForeground(context: Context): Boolean {
        return try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val procs = am.runningAppProcesses ?: return false
            val myPid = android.os.Process.myPid()
            procs.any {
                it.pid == myPid &&
                    it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun canDrawOverlays(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    private fun isDeviceOwner(context: Context): Boolean = try {
        (context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager)
            .isDeviceOwnerApp(context.packageName)
    } catch (_: Exception) {
        false
    }
}
