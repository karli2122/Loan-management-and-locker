package expo.modules.emideviceadmin

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager

/**
 * Overlay service that places invisible touch-intercepting views
 * over the status bar (top) and navigation bar (bottom) areas.
 * This prevents the user from pulling down the notification shade
 * or accessing the navigation bar buttons.
 */
class EMIOverlayService : Service() {
    companion object {
        private const val TAG = "EMIOverlay"
        var isRunning = false
    }

    private var windowManager: WindowManager? = null
    private var topBlocker: View? = null
    private var bottomBlocker: View? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createBlockers()
        Log.d(TAG, "Overlay service started")
    }

    private fun createBlockers() {
        val wm = windowManager ?: return

        // Top blocker — covers status bar area to prevent pull-down
        topBlocker = View(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            setOnTouchListener { _, event ->
                // Consume all touch events in the status bar area
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
        try {
            topBlocker?.let { windowManager?.removeView(it) }
            bottomBlocker?.let { windowManager?.removeView(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Error removing views: ${e.message}")
        }
        topBlocker = null
        bottomBlocker = null
        isRunning = false
        Log.d(TAG, "Overlay service stopped")
    }
}
