package expo.modules.emideviceadmin

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager

/**
 * Foreground overlay service that:
 * - Blocks status bar pull-down and navigation bar with expanded overlay zones
 * - Runs as foreground service (won't be killed by Android)
 * - When device is LOCKED: watchdog relaunches app every second if not in foreground
 * - Re-enforces immersive mode every refresh cycle to prevent bar re-appearance
 * - Refreshes overlay every second for persistence
 */
class EMIOverlayService : Service() {
    companion object {
        private const val TAG = "EMIOverlay"
        private const val CHANNEL_ID = "emi_overlay_channel"
        private const val NOTIFICATION_ID = 1001
        private const val REFRESH_INTERVAL_MS = 150L
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        // Extra pixels beyond the actual bar height to catch edge swipe gestures
        private const val BLOCKER_OVERFLOW_PX = 300
        var isRunning = false
    }

    private var windowManager: WindowManager? = null
    private var topBlocker: View? = null
    private var bottomBlocker: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private var refreshRunnable: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        createBlockers()
        startPeriodicRefresh()
        Log.d(TAG, "Overlay foreground service started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Device Protection",
                NotificationManager.IMPORTANCE_MIN  // Minimal: no sound, no status bar icon
            ).apply {
                description = "Keeps device protection active"
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

    private fun startPeriodicRefresh() {
        refreshRunnable = object : Runnable {
            override fun run() {
                ensureBlockersActive()
                reEnforceImmersiveMode()
                watchdogRelaunchIfLocked()
                handler.postDelayed(this, REFRESH_INTERVAL_MS)
            }
        }
        handler.postDelayed(refreshRunnable!!, REFRESH_INTERVAL_MS)
    }

    /**
     * Re-enforce immersive mode every refresh cycle.
     * Also actively collapse status bar and re-enforce DPM status bar disable for Device Owner apps.
     */
    private fun reEnforceImmersiveMode() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isLocked = prefs.getBoolean(KEY_LOCKED, false)
            if (!isLocked) return

            // Actively collapse status bar via reflection
            try {
                val statusBarService = getSystemService("statusbar")
                if (statusBarService != null) {
                    val collapse = statusBarService.javaClass.getMethod("collapsePanels")
                    collapse.invoke(statusBarService)
                }
            } catch (e: Exception) {
                // Expected to fail on some devices/versions
            }

            // Re-enforce DPM status bar disable (Device Owner only)
            try {
                val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
                val adminComponent = ComponentName(this, EMIDeviceAdminReceiver::class.java)
                if (dpm != null && dpm.isDeviceOwnerApp(packageName)) {
                    dpm.setStatusBarDisabled(adminComponent, true)
                }
            } catch (e: Exception) {
                // Not device owner or DPM not available - skip silently
            }

            // Find the foreground activity and re-apply immersive mode
            val am = getSystemService(ACTIVITY_SERVICE) as? ActivityManager ?: return
            val processInfo = ActivityManager.RunningAppProcessInfo()
            ActivityManager.getMyMemoryState(processInfo)
            val isInForeground = processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND

            if (isInForeground) {
                handler.post {
                    try {
                        val intent = Intent("expo.modules.emideviceadmin.REAPPLY_IMMERSIVE")
                        sendBroadcast(intent)
                    } catch (e: Exception) {
                        Log.e(TAG, "reEnforceImmersiveMode error: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "reEnforceImmersiveMode error: ${e.message}")
        }
    }

    /**
     * Watchdog: if device is locked (SharedPreferences), force-relaunch app if not foreground.
     * Uses getMyMemoryState for reliable foreground detection on modern Android.
     */
    private fun watchdogRelaunchIfLocked() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isLocked = prefs.getBoolean(KEY_LOCKED, false)
            if (!isLocked) return

            // Use getMyMemoryState — works on all Android versions without extra permissions
            val processInfo = ActivityManager.RunningAppProcessInfo()
            ActivityManager.getMyMemoryState(processInfo)
            val isInForeground = processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND

            if (!isInForeground) {
                Log.d(TAG, "Watchdog: App not in foreground while locked — relaunching")
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                if (launchIntent != null) {
                    launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    startActivity(launchIntent)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Watchdog error: ${e.message}")
        }
    }

    private fun ensureBlockersActive() {
        try {
            if (topBlocker == null || !topBlocker!!.isAttachedToWindow) {
                Log.d(TAG, "Blockers detached, re-creating")
                removeBlockers()
                createBlockers()
            }
        } catch (e: Exception) {
            Log.e(TAG, "ensureBlockersActive error: ${e.message}")
        }
    }

    private fun createBlockers() {
        val wm = windowManager ?: return

        // Status bar blocker — solid black, expanded height to catch edge swipe gestures
        topBlocker = View(this).apply {
            setBackgroundColor(Color.BLACK)
            setOnTouchListener { _, _ -> true } // Consume all touches
        }

        val topHeight = getStatusBarHeight() + BLOCKER_OVERFLOW_PX

        val topParams = WindowManager.LayoutParams().apply {
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = topHeight
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            }
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
            format = PixelFormat.OPAQUE
            gravity = Gravity.TOP
        }

        try {
            wm.addView(topBlocker, topParams)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add top blocker: ${e.message}")
        }

        // Navigation bar blocker — solid black, expanded height to catch edge swipe gestures
        bottomBlocker = View(this).apply {
            setBackgroundColor(Color.BLACK)
            setOnTouchListener { _, _ -> true } // Consume all touches
        }

        val bottomHeight = getNavigationBarHeight() + BLOCKER_OVERFLOW_PX

        val bottomParams = WindowManager.LayoutParams().apply {
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = bottomHeight
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            }
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH
            format = PixelFormat.OPAQUE
            gravity = Gravity.BOTTOM
        }

        try {
            wm.addView(bottomBlocker, bottomParams)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add bottom blocker: ${e.message}")
        }
    }

    private fun removeBlockers() {
        try {
            topBlocker?.let {
                if (it.isAttachedToWindow) windowManager?.removeView(it)
            }
            bottomBlocker?.let {
                if (it.isAttachedToWindow) windowManager?.removeView(it)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error removing views: ${e.message}")
        }
        topBlocker = null
        bottomBlocker = null
    }

    private fun getStatusBarHeight(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 80
    }

    private fun getNavigationBarHeight(): Int {
        val resourceId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
        return if (resourceId > 0) resources.getDimensionPixelSize(resourceId) else 100
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Called when the user swipes the app from the recent apps list.
     * This is the critical handler for the lock screen bypass bug.
     * We must restart all protection services immediately.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.w(TAG, "onTaskRemoved: App removed from recents")

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isLocked = prefs.getBoolean(KEY_LOCKED, false)
        if (!isLocked) return

        Log.w(TAG, "onTaskRemoved: Device is LOCKED — scheduling immediate restart")

        // Schedule restart via alarm
        EMIRestartReceiver.scheduleRestart(this, 1000)

        // Also try to relaunch app directly
        try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
                )
                startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "onTaskRemoved: relaunch failed: ${e.message}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        refreshRunnable?.let { handler.removeCallbacks(it) }
        refreshRunnable = null
        removeBlockers()
        isRunning = false
        Log.d(TAG, "Overlay foreground service stopped")

        // If device is locked, schedule restart to maintain protection
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            Log.w(TAG, "onDestroy: Device is locked — scheduling restart")
            EMIRestartReceiver.scheduleRestart(this, 2000)
        }
    }
}
