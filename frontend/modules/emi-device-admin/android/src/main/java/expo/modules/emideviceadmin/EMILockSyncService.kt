package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log

/**
 * Fallback host for the lock-state sync while the app is closed.
 *
 * Primary host is [EMIAccessibilityService]: an enabled accessibility service keeps the
 * process alive without any notification. Only when that service is NOT running does this
 * foreground service run, and Android requires a notification for it. That notification uses
 * a silent IMPORTANCE_MIN channel (no sound, vibration, badge, status-bar icon or lock-screen
 * content); it still appears collapsed in the shade's "silent" section on most phones.
 *
 * Runs while the device is registered and uninstall has not been allowed.
 */
class EMILockSyncService : Service() {
    companion object {
        private const val TAG = "EMILockSyncService"
        private const val CHANNEL_ID = "emi_lock_sync_silent"
        private const val OLD_CHANNEL_ID = "emi_lock_sync_channel"
        private const val NOTIFICATION_ID = 1003
        private const val INTERVAL_UNLOCKED_MS = 15_000L
        private const val INTERVAL_LOCKED_MS = 10_000L
        @Volatile var isRunning = false

        fun start(context: Context): String {
            val app = context.applicationContext
            val p = LockSync.prefs(app)
            if (p.getString(LockSync.KEY_CLIENT_ID, null).isNullOrEmpty()) return "not_registered"
            if (p.getBoolean("uninstall_allowed", false)) return "uninstall_allowed"
            if (EMIAccessibilityService.isRunning) {
                // The accessibility service hosts the sync: no foreground notification needed.
                stopServiceOnly(app)
                LockSyncBackup.scheduleAlarm(app)
                LockSyncBackup.scheduleJob(app)
                return "accessibility_host"
            }
            return try {
                val intent = Intent(app, EMILockSyncService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) app.startForegroundService(intent)
                else app.startService(intent)
                "started"
            } catch (e: Exception) {
                Log.w(TAG, "start refused: ${e.message}")
                "error: ${e.message}"
            }
        }

        /** Stop only this service (backups stay armed). */
        fun stopServiceOnly(context: Context) {
            try { context.applicationContext.stopService(Intent(context.applicationContext, EMILockSyncService::class.java)) } catch (_: Exception) {}
        }

        fun stop(context: Context) {
            LockSyncBackup.cancelAll(context)
            try { context.stopService(Intent(context, EMILockSyncService::class.java)) } catch (_: Exception) {}
        }
    }

    private var thread: HandlerThread? = null
    private var worker: Handler? = null
    private var triggersRegistered = false
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var lastTriggerAt = 0L

    /** Screen on / unlock / network back: check right away instead of waiting for the next tick. */
    private fun checkNow(reason: String) {
        val now = System.currentTimeMillis()
        if (now - lastTriggerAt < 3_000L) return
        lastTriggerAt = now
        Log.d(TAG, "Immediate lock check ($reason)")
        worker?.removeCallbacks(tick)
        worker?.post(tick)
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            checkNow(intent?.action ?: "screen")
        }
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

    private val tick = object : Runnable {
        override fun run() {
            val p = LockSync.prefs(this@EMILockSyncService)
            if (p.getBoolean("uninstall_allowed", false) ||
                p.getString(LockSync.KEY_CLIENT_ID, null).isNullOrEmpty()) {
                Log.d(TAG, "Not needed any more — stopping")
                stopSelf()
                return
            }
            if (EMIAccessibilityService.isRunning) {
                Log.d(TAG, "Accessibility service hosts the sync now — stopping (removes the notification)")
                stopSelf()
                return
            }
            try { LockSync.check(this@EMILockSyncService) } catch (e: Exception) {
                Log.w(TAG, "tick error: ${e.message}")
            }
            // Works offline too: a tamper lock whose fix window ran out is re-applied.
            try { LockSync.enforceTamperIfDue(this@EMILockSyncService) } catch (e: Exception) {
                Log.w(TAG, "tamper enforce error: ${e.message}")
            }
            val locked = p.getBoolean(LockSync.KEY_LOCKED, false)
            // Keep the Doze-proof backups armed (alarm + periodic job).
            LockSyncBackup.scheduleAlarm(this@EMILockSyncService)
            LockSyncBackup.scheduleJob(this@EMILockSyncService)
            worker?.postDelayed(this, if (locked) INTERVAL_LOCKED_MS else INTERVAL_UNLOCKED_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (e: Exception) {
            Log.w(TAG, "startForeground refused: ${e.message}")
            stopSelf()
            return
        }
        isRunning = true
        thread = HandlerThread("emi-lock-sync").also { it.start() }
        worker = Handler(thread!!.looper)
        worker?.post(tick)
        registerTriggers()
        Log.d(TAG, "Lock sync started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // An explicit start (app launch, boot, push) triggers an immediate check.
        worker?.removeCallbacks(tick)
        worker?.post(tick)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        isRunning = false
        unregisterTriggers()
        worker?.removeCallbacksAndMessages(null)
        thread?.quitSafely()
        worker = null
        thread = null
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            try { nm?.deleteNotificationChannel(OLD_CHANNEL_ID) } catch (_: Exception) {}
            val ch = NotificationChannel(CHANNEL_ID, "Background sync", NotificationManager.IMPORTANCE_MIN).apply {
                description = "Silent. Required by Android while PayLock syncs in the background."
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            nm?.createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL_ID) else @Suppress("DEPRECATION") Notification.Builder(this)
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pi = launch?.let {
            android.app.PendingIntent.getActivity(
                this, 0, it,
                android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
        return b.setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle("PayLock")
            .setOngoing(true)
            .setShowWhen(false)
            .setLocalOnly(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_SECRET)
            .setPriority(Notification.PRIORITY_MIN)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
    }
}
