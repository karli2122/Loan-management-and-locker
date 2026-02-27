package expo.modules.emideviceadmin

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * Foreground App Monitor - Uses UsageStatsManager to detect when another app
 * comes to the foreground while the device is locked.
 * Immediately brings our app back to the foreground.
 */
class EMIForegroundMonitorService : Service() {

    companion object {
        private const val TAG = "EMIForegroundMonitor"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        private const val CHECK_INTERVAL_MS = 500L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var monitorRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Foreground monitor service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startMonitoring()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startMonitoring() {
        monitorRunnable?.let { handler.removeCallbacks(it) }

        monitorRunnable = object : Runnable {
            override fun run() {
                try {
                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val isLocked = prefs.getBoolean(KEY_LOCKED, false)

                    if (isLocked) {
                        val foregroundPackage = getForegroundPackage()
                        if (foregroundPackage != null && foregroundPackage != packageName) {
                            // Phone/Dialer apps: only allow during emergency calls
                            val isPhoneApp = foregroundPackage.contains("dialer") ||
                                             foregroundPackage.contains("incall") ||
                                             foregroundPackage.contains("telecom") ||
                                             foregroundPackage.contains("phone") ||
                                             foregroundPackage == "com.android.dialer" ||
                                             foregroundPackage == "com.google.android.dialer" ||
                                             foregroundPackage == "com.samsung.android.dialer"
                            if (isPhoneApp) {
                                val prefs = applicationContext.getSharedPreferences("emi_device_admin_prefs", Context.MODE_PRIVATE)
                                val emergencyActive = prefs.getBoolean("emergency_call_active", false)
                                if (emergencyActive) {
                                    Log.d(TAG, "Emergency call active — allowing dialer: $foregroundPackage")
                                } else {
                                    Log.d(TAG, "Locked: Rejecting regular call, killing dialer: $foregroundPackage")
                                    // End the call
                                    try {
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                            val telecom = applicationContext.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
                                            telecom?.endCall()
                                        }
                                    } catch (_: Exception) {}
                                    bringAppToForeground()
                                }
                            } else {
                                Log.w(TAG, "Foreign app detected in foreground: $foregroundPackage — bringing back our app")
                                bringAppToForeground()
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Monitor check error: ${e.message}")
                }
                handler.postDelayed(this, CHECK_INTERVAL_MS)
            }
        }
        handler.post(monitorRunnable!!)
        Log.d(TAG, "Foreground monitoring started (${CHECK_INTERVAL_MS}ms interval)")
    }

    private fun getForegroundPackage(): String? {
        try {
            val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
                ?: return null
            val now = System.currentTimeMillis()
            val stats = usm.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                now - 10_000, // last 10 seconds
                now
            )
            if (stats.isNullOrEmpty()) return null

            // Find the most recently used app
            return stats.maxByOrNull { it.lastTimeUsed }?.packageName
        } catch (e: Exception) {
            Log.e(TAG, "getForegroundPackage error: ${e.message}")
            return null
        }
    }

    private fun bringAppToForeground() {
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "bringAppToForeground error: ${e.message}")
        }
    }

    override fun onDestroy() {
        monitorRunnable?.let { handler.removeCallbacks(it) }
        monitorRunnable = null
        Log.d(TAG, "Foreground monitor service destroyed")

        // Auto-restart if killed while device is locked
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            scheduleRestart()
        }
        super.onDestroy()
    }

    private fun scheduleRestart() {
        try {
            val restartIntent = Intent(this, EMIForegroundMonitorService::class.java)
            val pendingIntent = PendingIntent.getService(
                this, 1001, restartIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val am = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            am?.set(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 3000, // restart in 3 seconds
                pendingIntent
            )
            Log.d(TAG, "Restart scheduled in 3 seconds")
        } catch (e: Exception) {
            Log.e(TAG, "scheduleRestart error: ${e.message}")
        }
    }
}
