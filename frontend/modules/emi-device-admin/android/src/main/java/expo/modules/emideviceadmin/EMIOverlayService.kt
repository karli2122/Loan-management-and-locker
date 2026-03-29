package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.util.Log

/**
 * Overlay Service - Transparent bar blockers that prevent status bar pull-down
 * and navigation bar gestures. The visible lock UI is rendered by React Native.
 *
 * Runs as a FOREGROUND service for resilience against Android killing it.
 * Watchdog loop every 200ms re-creates blockers if they are removed.
 * Cross-monitors EMIForegroundMonitorService and restarts it if dead.
 */
class EMIOverlayService : Service() {

    companion object {
        private const val TAG = "EMIOverlayService"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        private const val CHANNEL_ID = "emi_overlay_channel"
        private const val NOTIFICATION_ID = 1001
        private const val WATCHDOG_INTERVAL_MS = 200L
        @Volatile
        var isRunning = false
    }

    private var windowManager: WindowManager? = null
    private var statusBarBlocker: View? = null
    private var navBarBlocker: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private var watchdogRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var prefs: SharedPreferences

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWakeLock()
        Log.d(TAG, "Overlay service created (foreground)")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startWatchdogLoop()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Device Protection",
                NotificationManager.IMPORTANCE_NONE
            ).apply {
                description = "Active device protection"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
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
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_MIN)
            .build()
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as? PowerManager
            wakeLock = pm?.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "emi:overlay_service"
            )?.apply { acquire(24 * 60 * 60 * 1000L) }
        } catch (e: Exception) {
            Log.e(TAG, "Wake lock error: ${e.message}")
        }
    }

    // ─── Watchdog Loop ──────────────────────────────────────────────

    private fun startWatchdogLoop() {
        watchdogRunnable?.let { handler.removeCallbacks(it) }

        watchdogRunnable = object : Runnable {
            override fun run() {
                try {
                    val isLocked = prefs.getBoolean(KEY_LOCKED, false)

                    if (isLocked) {
                        // Ensure status bar blocker exists
                        if (statusBarBlocker == null || !statusBarBlocker!!.isAttachedToWindow) {
                            createStatusBarBlocker()
                        }
                        // Ensure nav bar blocker exists
                        if (navBarBlocker == null || !navBarBlocker!!.isAttachedToWindow) {
                            createNavBarBlocker()
                        }

                        // Cross-check: restart foreground monitor if dead
                        if (!EMIForegroundMonitorService.isRunning) {
                            try {
                                val monitorIntent = Intent(this@EMIOverlayService, EMIForegroundMonitorService::class.java)
                                startForegroundService(monitorIntent)
                            } catch (_: Exception) {}
                        }

                        // Collapse status bar
                        collapseStatusBar()
                    } else {
                        // Not locked — remove all blockers
                        removeAllBlockers()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Watchdog error: ${e.message}")
                }
                handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
            }
        }
        handler.post(watchdogRunnable!!)
        Log.d(TAG, "Watchdog started (${WATCHDOG_INTERVAL_MS}ms)")
    }

    // ─── Status Bar Blocker (prevent pull-down) ─────────────────────

    private fun createStatusBarBlocker() {
        if (!Settings.canDrawOverlays(this)) return
        try {
            val blocker = View(this).apply { setBackgroundColor(Color.TRANSPARENT) }
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                dp(50),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_SYSTEM_ERROR,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSPARENT
            ).apply { gravity = Gravity.TOP or Gravity.START }

            windowManager?.addView(blocker, params)
            statusBarBlocker = blocker
            Log.d(TAG, "Status bar blocker created")
        } catch (e: Exception) {
            Log.e(TAG, "createStatusBarBlocker error: ${e.message}")
        }
    }

    // ─── Nav Bar Blocker (prevent gesture nav) ──────────────────────

    private fun createNavBarBlocker() {
        if (!Settings.canDrawOverlays(this)) return
        try {
            val blocker = View(this).apply { setBackgroundColor(Color.TRANSPARENT) }
            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                dp(80),
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_SYSTEM_ERROR,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSPARENT
            ).apply { gravity = Gravity.BOTTOM or Gravity.START }

            windowManager?.addView(blocker, params)
            navBarBlocker = blocker
            Log.d(TAG, "Nav bar blocker created")
        } catch (e: Exception) {
            Log.e(TAG, "createNavBarBlocker error: ${e.message}")
        }
    }

    // ─── Remove All Blockers ────────────────────────────────────────

    private fun removeAllBlockers() {
        listOf(statusBarBlocker, navBarBlocker).forEach { view ->
            try {
                view?.let {
                    if (it.isAttachedToWindow) windowManager?.removeView(it)
                }
            } catch (_: Exception) {}
        }
        statusBarBlocker = null
        navBarBlocker = null
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics
        ).toInt()
    }

    private fun collapseStatusBar() {
        try {
            @Suppress("DEPRECATION")
            val sbService = getSystemService("statusbar")
            val sbClass = Class.forName("android.app.StatusBarManager")
            sbClass.getMethod("collapsePanels").invoke(sbService)
        } catch (_: Exception) {}
    }

    // ─── Lifecycle: Auto-restart on kill ────────────────────────────

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            EMIRestartReceiver.scheduleRestart(this, 1000)
        }
    }

    override fun onDestroy() {
        isRunning = false
        watchdogRunnable?.let { handler.removeCallbacks(it) }
        watchdogRunnable = null
        removeAllBlockers()
        try { wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null

        if (prefs.getBoolean(KEY_LOCKED, false)) {
            Log.w(TAG, "Overlay service killed while locked — scheduling restart")
            EMIRestartReceiver.scheduleRestart(this, 2000)
        }
        super.onDestroy()
    }
}
