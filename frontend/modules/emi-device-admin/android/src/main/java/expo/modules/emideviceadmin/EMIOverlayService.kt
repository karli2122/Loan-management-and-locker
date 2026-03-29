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
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Native Overlay Lock Service - Renders a FULL-SCREEN opaque lock UI natively.
 *
 * This is the last line of defense. Even if React Native crashes, the JS bridge
 * dies, or the app process is swapped, this Android service keeps a system-level
 * overlay on screen that cannot be dismissed by the user.
 *
 * Key design:
 *   - Runs as a FOREGROUND service (survives Doze mode better)
 *   - Creates TYPE_APPLICATION_OVERLAY windows (above everything)
 *   - Watchdog loop every 200ms: re-creates blockers if removed
 *   - Cross-monitors EMIForegroundMonitorService and restarts it
 *   - On destroy, schedules self-restart via EMIRestartReceiver
 */
class EMIOverlayService : Service() {

    companion object {
        private const val TAG = "EMIOverlayService"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        private const val KEY_MESSAGE = "lock_message"
        private const val CHANNEL_ID = "emi_overlay_channel"
        private const val NOTIFICATION_ID = 1001
        private const val WATCHDOG_INTERVAL_MS = 200L
        @Volatile
        var isRunning = false
    }

    private var windowManager: WindowManager? = null
    private var fullScreenBlocker: View? = null
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

    // ─── Notification (required for foreground service) ─────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Device Protection",
                NotificationManager.IMPORTANCE_MIN
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
                        // Ensure full-screen blocker exists
                        if (fullScreenBlocker == null || !fullScreenBlocker!!.isAttachedToWindow) {
                            removeAllBlockers()
                            createFullScreenBlocker()
                        }
                        // Ensure status bar blocker exists (catches pull-down)
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

                        // Collapse status bar (belt-and-suspenders)
                        collapseStatusBar()

                        // Immersive mode
                        enableImmersiveMode()
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

    // ─── Full Screen Blocker (native lock UI) ───────────────────────

    private fun createFullScreenBlocker() {
        if (!Settings.canDrawOverlays(this)) {
            Log.w(TAG, "No overlay permission — cannot create blocker")
            return
        }
        try {
            val lockMessage = prefs.getString(KEY_MESSAGE, "") ?: ""

            // Build native lock screen layout
            val container = FrameLayout(this).apply {
                setBackgroundColor(Color.parseColor("#0B1527"))
                isClickable = true
                isFocusable = true
            }

            val content = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(dp(32), dp(64), dp(32), dp(64))
            }

            // Lock icon (circle with icon inside)
            val iconContainer = FrameLayout(this).apply {
                val size = dp(120)
                layoutParams = LinearLayout.LayoutParams(size, size).apply {
                    gravity = Gravity.CENTER_HORIZONTAL
                    bottomMargin = dp(24)
                }
                setBackgroundColor(Color.parseColor("#1A0000"))
                // Rounded via clipping
                clipToOutline = true
                outlineProvider = object : android.view.ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: android.graphics.Outline) {
                        outline.setRoundRect(0, 0, view.width, view.height, view.width / 2f)
                    }
                }
            }

            val lockIcon = ImageView(this).apply {
                setImageResource(android.R.drawable.ic_lock_lock)
                setColorFilter(Color.parseColor("#FF3B3B"))
                layoutParams = FrameLayout.LayoutParams(dp(60), dp(60), Gravity.CENTER)
            }
            iconContainer.addView(lockIcon)
            content.addView(iconContainer)

            // Title
            val title = TextView(this).apply {
                text = "Device Locked"
                setTextColor(Color.WHITE)
                textSize = 28f
                typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(16) }
            }
            content.addView(title)

            // Lock message
            if (lockMessage.isNotEmpty()) {
                val msgView = TextView(this).apply {
                    text = lockMessage
                    setTextColor(Color.parseColor("#94A3B8"))
                    textSize = 16f
                    gravity = Gravity.CENTER
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = dp(32) }
                }
                content.addView(msgView)
            }

            // Protection badge
            val badge = TextView(this).apply {
                text = "Device Protection Active"
                setTextColor(Color.parseColor("#10B981"))
                textSize = 14f
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(24) }
            }
            content.addView(badge)

            // Emergency call text
            val emergencyText = TextView(this).apply {
                text = "For emergency call 112"
                setTextColor(Color.parseColor("#64748B"))
                textSize = 12f
                gravity = Gravity.CENTER
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(48) }
            }
            content.addView(emergencyText)

            container.addView(content, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            ))

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    @Suppress("DEPRECATION")
                    WindowManager.LayoutParams.TYPE_SYSTEM_ERROR,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.OPAQUE
            ).apply {
                gravity = Gravity.TOP or Gravity.START
                x = 0
                y = 0
            }

            windowManager?.addView(container, params)
            fullScreenBlocker = container
            Log.d(TAG, "Full-screen blocker created")

        } catch (e: Exception) {
            Log.e(TAG, "createFullScreenBlocker error: ${e.message}")
        }
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
        } catch (e: Exception) {
            Log.e(TAG, "createNavBarBlocker error: ${e.message}")
        }
    }

    // ─── Remove All Blockers ────────────────────────────────────────

    private fun removeAllBlockers() {
        listOf(fullScreenBlocker, statusBarBlocker, navBarBlocker).forEach { view ->
            try {
                view?.let {
                    if (it.isAttachedToWindow) windowManager?.removeView(it)
                }
            } catch (_: Exception) {}
        }
        fullScreenBlocker = null
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

    private fun enableImmersiveMode() {
        // Immersive mode can only be set from an Activity, not a Service.
        // The JS side handles this. We do collapseStatusBar instead.
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
