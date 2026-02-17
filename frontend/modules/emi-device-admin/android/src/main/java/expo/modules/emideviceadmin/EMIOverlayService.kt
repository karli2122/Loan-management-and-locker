package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
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
 * - Places invisible touch-intercepting views over status bar and nav bar
 * - Runs as a foreground service so Android won't kill it
 * - Refreshes overlay every second to ensure persistence
 * - Survives process restarts via foreground notification
 */
class EMIOverlayService : Service() {
    companion object {
        private const val TAG = "EMIOverlay"
        private const val CHANNEL_ID = "emi_overlay_channel"
        private const val NOTIFICATION_ID = 1001
        private const val REFRESH_INTERVAL_MS = 1000L
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
        // Restart if killed
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Device Protection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps device protection active"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
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
            .setContentTitle("Device Protection Active")
            .setContentText("Device is secured")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .build()
    }

    private fun startPeriodicRefresh() {
        refreshRunnable = object : Runnable {
            override fun run() {
                ensureBlockersActive()
                handler.postDelayed(this, REFRESH_INTERVAL_MS)
            }
        }
        handler.postDelayed(refreshRunnable!!, REFRESH_INTERVAL_MS)
    }

    private fun ensureBlockersActive() {
        try {
            // Check if top blocker is still attached
            if (topBlocker == null || !topBlocker!!.isAttachedToWindow) {
                Log.d(TAG, "Top blocker detached, re-creating")
                removeBlockers()
                createBlockers()
            }
        } catch (e: Exception) {
            Log.e(TAG, "ensureBlockersActive error: ${e.message}")
        }
    }

    private fun createBlockers() {
        val wm = windowManager ?: return

        // Top blocker — covers status bar area to prevent pull-down
        topBlocker = View(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_OUTSIDE) false
                else true
            }
        }

        val topParams = WindowManager.LayoutParams().apply {
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = getStatusBarHeight()
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            }
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            format = PixelFormat.TRANSLUCENT
            gravity = Gravity.TOP
        }

        try {
            wm.addView(topBlocker, topParams)
            Log.d(TAG, "Top blocker added, height=${topParams.height}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add top blocker: ${e.message}")
        }

        // Bottom blocker — covers navigation bar area
        bottomBlocker = View(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            setOnTouchListener { _, event ->
                if (event.action == MotionEvent.ACTION_OUTSIDE) false
                else true
            }
        }

        val bottomParams = WindowManager.LayoutParams().apply {
            width = WindowManager.LayoutParams.MATCH_PARENT
            height = getNavigationBarHeight()
            type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
            }
            flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            format = PixelFormat.TRANSLUCENT
            gravity = Gravity.BOTTOM
        }

        try {
            wm.addView(bottomBlocker, bottomParams)
            Log.d(TAG, "Bottom blocker added, height=${bottomParams.height}")
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

    override fun onDestroy() {
        super.onDestroy()
        refreshRunnable?.let { handler.removeCallbacks(it) }
        refreshRunnable = null
        removeBlockers()
        isRunning = false
        Log.d(TAG, "Overlay foreground service stopped")
    }
}
