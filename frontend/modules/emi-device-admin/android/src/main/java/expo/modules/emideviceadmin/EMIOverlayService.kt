package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.telecom.TelecomManager
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Native Overlay Lock Service — the BLUE lockscreen.
 *
 * When is_locked=true:
 *   • Shows a full-screen, opaque, TOUCHABLE overlay with lock UI
 *   • Only the emergency-call button is interactive
 *   • Status-bar and nav-bar blockers sit on top to absorb swipes
 *
 * When is_locked=false:
 *   • All overlay views are removed
 *
 * Runs as a FOREGROUND service with a partial wake-lock.
 */
class EMIOverlayService : Service() {

    companion object {
        private const val TAG = "EMIOverlayService"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        private const val KEY_MESSAGE = "lock_message"
        private const val CHANNEL_ID = "emi_overlay_channel"
        private const val NOTIFICATION_ID = 1001
        private const val WATCHDOG_INTERVAL_MS = 500L
        @Volatile var isRunning = false
    }

    private var wm: WindowManager? = null
    private var fullScreenView: View? = null
    private var statusBarBlocker: View? = null
    private var navBarBlocker: View? = null
    private val handler = Handler(Looper.getMainLooper())
    private var watchdog: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var prefs: SharedPreferences

    // ─── Lifecycle ──────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        acquireWakeLock()
        Log.d(TAG, "Overlay service started (foreground)")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startWatchdog()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        if (prefs.getBoolean(KEY_LOCKED, false)) EMIRestartReceiver.scheduleRestart(this, 1000)
    }

    override fun onDestroy() {
        isRunning = false
        watchdog?.let { handler.removeCallbacks(it) }; watchdog = null
        removeAll()
        try { wakeLock?.release() } catch (_: Exception) {}; wakeLock = null
        if (prefs.getBoolean(KEY_LOCKED, false)) {
            Log.w(TAG, "Killed while locked — scheduling restart")
            EMIRestartReceiver.scheduleRestart(this, 2000)
        }
        super.onDestroy()
    }

    // ─── Notification (hidden) ──────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Device Protection", NotificationManager.IMPORTANCE_NONE).apply {
                setShowBadge(false); lockscreenVisibility = Notification.VISIBILITY_SECRET
                enableLights(false); enableVibration(false); setSound(null, null)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL_ID) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(android.R.drawable.ic_lock_lock).setOngoing(true)
            .setPriority(Notification.PRIORITY_MIN).build()
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as? PowerManager
            // The lock UI uses FLAG_KEEP_SCREEN_ON for display; this partial
            // wake-lock only needs to cover the watchdog. Bound it to 30 min and
            // renew via the watchdog while locked rather than holding 24h, which
            // drains the battery and trips OEM battery managers.
            wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "emi:overlay")
            renewWakeLock()
        } catch (e: Exception) { Log.e(TAG, "WakeLock error: ${e.message}") }
    }

    private fun renewWakeLock() {
        try { wakeLock?.let { if (!it.isHeld) it.acquire(30 * 60 * 1000L) } }
        catch (e: Exception) { Log.e(TAG, "renewWakeLock: ${e.message}") }
    }

    // ─── Watchdog ───────────────────────────────────────────────────

    private fun startWatchdog() {
        watchdog?.let { handler.removeCallbacks(it) }
        watchdog = object : Runnable {
            override fun run() {
                try {
                    val locked = prefs.getBoolean(KEY_LOCKED, false)
                    if (locked) {
                        renewWakeLock()
                        if (fullScreenView == null || !fullScreenView!!.isAttachedToWindow) {
                            removeAll()
                            createFullScreen()
                            createBarBlocker(top = true)
                            createBarBlocker(top = false)
                        }
                        // Cross-monitor
                        if (!EMIForegroundMonitorService.isRunning) {
                            try { startForegroundService(Intent(this@EMIOverlayService, EMIForegroundMonitorService::class.java)) }
                            catch (_: Exception) {}
                        }
                        collapseStatusBar()
                    } else {
                        removeAll()
                        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
                    }
                } catch (e: Exception) { Log.e(TAG, "Watchdog: ${e.message}") }
                handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
            }
        }
        handler.post(watchdog!!)
    }

    // ─── Full-Screen Lock UI ────────────────────────────────────────

    private fun createFullScreen() {
        if (!Settings.canDrawOverlays(this)) return
        try {
            val msg = prefs.getString(KEY_MESSAGE, "") ?: ""
            val root = buildLockUI(msg)

            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                overlayType(),
                // NOT_TOUCH_MODAL lets the emergency button receive touches
                // LAYOUT_IN_SCREEN covers status bar area
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
                PixelFormat.OPAQUE
            ).apply { gravity = Gravity.TOP or Gravity.START }

            wm?.addView(root, lp)
            fullScreenView = root
            Log.d(TAG, "Full-screen lock UI created")
        } catch (e: Exception) { Log.e(TAG, "createFullScreen: ${e.message}") }
    }

    @Suppress("DEPRECATION")
    private fun buildLockUI(lockMessage: String): FrameLayout {
        val bg = Color.parseColor("#0B1527")
        val accent = Color.parseColor("#3B82F6") // blue accent
        val textPrimary = Color.WHITE
        val textSecondary = Color.parseColor("#94A3B8")
        val emergencyRed = Color.parseColor("#EF4444")

        val root = FrameLayout(this).apply {
            setBackgroundColor(bg)
            isClickable = true
            isFocusable = true
            // Consume all touches except where we place interactive buttons
            setOnTouchListener { _, _ -> true }
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(32), dp(80), dp(32), dp(40))
        }

        // Lock icon circle
        val iconBg = FrameLayout(this).apply {
            val s = dp(110)
            layoutParams = LinearLayout.LayoutParams(s, s).apply {
                gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(28)
            }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1E3A5F"))
            }
        }
        val icon = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_lock_lock)
            setColorFilter(accent)
            layoutParams = FrameLayout.LayoutParams(dp(52), dp(52), Gravity.CENTER)
        }
        iconBg.addView(icon)
        content.addView(iconBg)

        // Title
        content.addView(TextView(this).apply {
            text = "Device Locked"
            setTextColor(textPrimary); textSize = 26f
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            gravity = Gravity.CENTER
            layoutParams = llp().apply { bottomMargin = dp(12) }
        })

        // Subtitle / lock message
        if (lockMessage.isNotEmpty()) {
            content.addView(TextView(this).apply {
                text = lockMessage; setTextColor(textSecondary); textSize = 15f
                gravity = Gravity.CENTER
                layoutParams = llp().apply { bottomMargin = dp(24) }
            })
        }

        // "Protected" badge
        content.addView(TextView(this).apply {
            text = "PayLock Protection Active"
            setTextColor(accent); textSize = 13f; gravity = Gravity.CENTER
            layoutParams = llp().apply { topMargin = dp(16); bottomMargin = dp(48) }
        })

        // ── Emergency Call Button ───────────────────────────────────
        val emergencyBtn = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(14), dp(24), dp(14))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(28).toFloat()
                setStroke(dp(2), emergencyRed)
                setColor(Color.parseColor("#1A0000"))
            }
            isClickable = true
            isFocusable = true
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(8) }
        }
        emergencyBtn.addView(ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_call)
            setColorFilter(emergencyRed)
            layoutParams = LinearLayout.LayoutParams(dp(22), dp(22)).apply { rightMargin = dp(10) }
        })
        emergencyBtn.addView(TextView(this).apply {
            text = "Emergency Call 112"
            setTextColor(emergencyRed); textSize = 15f
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        })
        emergencyBtn.setOnClickListener { handleEmergencyCall() }

        content.addView(emergencyBtn)

        root.addView(content, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        ))
        return root
    }

    // ─── Emergency Call Logic ───────────────────────────────────────

    private fun handleEmergencyCall() {
        Log.d(TAG, "Emergency call 112 triggered from native overlay")

        // Set flag so monitor allows the dialer
        prefs.edit()
            .putBoolean("emergency_call_active", true)
            .putLong("emergency_call_started_at", System.currentTimeMillis())
            .commit()

        // Remove overlay to let the dialer show
        removeAll()

        // Dial 112
        try {
            val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:112")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(callIntent)
        } catch (e: Exception) {
            Log.e(TAG, "ACTION_CALL failed, trying ACTION_DIAL: ${e.message}")
            try {
                val dialIntent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:112")).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(dialIntent)
            } catch (e2: Exception) {
                Log.e(TAG, "ACTION_DIAL also failed: ${e2.message}")
            }
        }

        // Schedule: wait for call to end, then re-apply lock
        handler.postDelayed(object : Runnable {
            override fun run() {
                val stillInCall = isInCall()
                if (stillInCall) {
                    handler.postDelayed(this, 3000)
                } else {
                    Log.d(TAG, "Emergency call ended — re-applying lock")
                    prefs.edit()
                        .putBoolean("emergency_call_active", false)
                        .putLong("emergency_call_started_at", 0L)
                        .commit()
                    // Re-create the lock overlay
                    startWatchdog()
                }
            }
        }, 5000) // First check after 5 seconds
    }

    private fun isInCall(): Boolean {
        return try {
            val tm = getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            tm?.isInCall ?: false
        } catch (_: Exception) { false }
    }

    // ─── Bar Blockers (status bar / nav bar) ────────────────────────

    private fun createBarBlocker(top: Boolean) {
        if (!Settings.canDrawOverlays(this)) return
        try {
            val blocker = View(this).apply { setBackgroundColor(Color.TRANSPARENT) }
            val h = if (top) dp(50) else dp(80)
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, h, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSPARENT
            ).apply { gravity = (if (top) Gravity.TOP else Gravity.BOTTOM) or Gravity.START }
            wm?.addView(blocker, lp)
            if (top) statusBarBlocker = blocker else navBarBlocker = blocker
        } catch (e: Exception) { Log.e(TAG, "createBarBlocker($top): ${e.message}") }
    }

    // ─── Remove Everything ──────────────────────────────────────────

    private fun removeAll() {
        listOf(fullScreenView, statusBarBlocker, navBarBlocker).forEach {
            try { it?.let { v -> if (v.isAttachedToWindow) wm?.removeView(v) } } catch (_: Exception) {}
        }
        fullScreenView = null; statusBarBlocker = null; navBarBlocker = null
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    private fun llp() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    )

    private fun overlayType() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_SYSTEM_ERROR

    private fun collapseStatusBar() {
        try {
            @Suppress("DEPRECATION")
            val sb = getSystemService("statusbar")
            Class.forName("android.app.StatusBarManager").getMethod("collapsePanels").invoke(sb)
        } catch (_: Exception) {}
    }
}
