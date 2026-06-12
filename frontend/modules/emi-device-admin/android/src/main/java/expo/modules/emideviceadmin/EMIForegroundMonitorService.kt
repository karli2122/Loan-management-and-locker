package expo.modules.emideviceadmin

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * Foreground App Monitor - Runs as a FOREGROUND SERVICE to resist Android killing it.
 * Uses UsageStatsManager to detect when another app comes to foreground while locked.
 * Immediately brings our app back. Holds a partial wake lock to prevent CPU sleep.
 */
class EMIForegroundMonitorService : Service() {

    companion object {
        private const val TAG = "EMIForegroundMonitor"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        private const val CHECK_INTERVAL_MS = 1000L
        private const val WAKELOCK_RENEW_MS = 5 * 60 * 1000L // renew window: 5 min
        private const val EMERGENCY_MAX_MS = 10 * 60 * 1000L // max emergency-call window: 10 min
        private const val CHANNEL_ID = "emi_monitor_channel"
        private const val NOTIFICATION_ID = 1002
        @Volatile
        var isRunning = false
    }

    private val handler = Handler(Looper.getMainLooper())
    private var monitorRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        Log.d(TAG, "Foreground monitor service created")
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startMonitoring()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Device Monitor",
                NotificationManager.IMPORTANCE_NONE
            ).apply {
                description = "Monitors device state"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("")
            .setContentText("")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_MIN)
            .build()
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as? PowerManager
            // Hold a short, renewable wake-lock instead of a continuous 24h hold.
            // The monitor renews it each check while locked, so the CPU only
            // stays awake as long as enforcement is actually active. A permanent
            // 24h PARTIAL_WAKE_LOCK drains the battery and is flagged by OEM
            // battery managers (which then kill the service).
            wakeLock = pm?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "emi:foreground_monitor"
            )
            renewWakeLock()
            Log.d(TAG, "Wake lock initialized (renewable)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to acquire wake lock: ${e.message}")
        }
    }

    private fun renewWakeLock() {
        try {
            wakeLock?.let { wl ->
                if (!wl.isHeld) wl.acquire(WAKELOCK_RENEW_MS)
            }
        } catch (e: Exception) {
            Log.e(TAG, "renewWakeLock error: ${e.message}")
        }
    }

    private fun startMonitoring() {
        monitorRunnable?.let { handler.removeCallbacks(it) }

        monitorRunnable = object : Runnable {
            override fun run() {
                try {
                    val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    val isLocked = prefs.getBoolean(KEY_LOCKED, false)

                    if (isLocked) {
                        renewWakeLock()
                        val foregroundPackage = getForegroundPackage()
                        if (foregroundPackage != null && foregroundPackage != packageName) {
                            // Phone/Dialer apps: only allow during emergency calls.
                            // Match an allowlist of known dialer packages rather
                            // than broad substrings like "phone", which a
                            // maliciously-named app could satisfy to escape lock.
                            val knownDialers = setOf(
                                "com.android.dialer",
                                "com.google.android.dialer",
                                "com.samsung.android.dialer",
                                "com.android.server.telecom",
                                "com.android.incallui",
                                "com.android.phone"
                            )
                            val isPhoneApp = foregroundPackage in knownDialers
                            if (isPhoneApp) {
                                val emergencyActive = prefs.getBoolean("emergency_call_active", false)
                                // Cap the emergency window: if it's been open too
                                // long (e.g. call ended but flag wasn't cleared),
                                // force it closed so the lock re-asserts.
                                val startedAt = prefs.getLong("emergency_call_started_at", 0L)
                                val withinWindow = startedAt > 0 &&
                                    (System.currentTimeMillis() - startedAt) < EMERGENCY_MAX_MS
                                if (emergencyActive && withinWindow) {
                                    Log.d(TAG, "Emergency call active - allowing dialer: $foregroundPackage")
                                } else {
                                    Log.d(TAG, "Locked: Rejecting regular call, killing dialer: $foregroundPackage")
                                    try {
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                            val telecom = applicationContext.getSystemService(Context.TELECOM_SERVICE) as? android.telecom.TelecomManager
                                            telecom?.endCall()
                                        }
                                    } catch (_: Exception) {}
                                    bringAppToForeground()
                                }
                            } else {
                                Log.w(TAG, "Foreign app detected in foreground: $foregroundPackage - bringing back our app")
                                bringAppToForeground()
                            }
                        }

                        // Also ensure overlay service is alive
                        if (!EMIOverlayService.isRunning) {
                            Log.w(TAG, "Overlay service not running while locked - restarting it")
                            try {
                                val overlayIntent = Intent(this@EMIForegroundMonitorService, EMIOverlayService::class.java)
                                startForegroundService(overlayIntent)
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to restart overlay: ${e.message}")
                            }
                        }
                    } else {
                        // Not locked: release the wake-lock so the CPU can sleep.
                        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
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
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
                )
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "bringAppToForeground error: ${e.message}")
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            Log.w(TAG, "onTaskRemoved while locked - scheduling restart")
            EMIRestartReceiver.scheduleRestart(this, 1000)
        }
    }

    override fun onDestroy() {
        isRunning = false
        monitorRunnable?.let { handler.removeCallbacks(it) }
        monitorRunnable = null
        try { wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
        Log.d(TAG, "Foreground monitor service destroyed")

        // Auto-restart if killed while device is locked
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            Log.w(TAG, "Monitor killed while locked - scheduling restart")
            EMIRestartReceiver.scheduleRestart(this, 2000)
        }
        super.onDestroy()
    }
}
