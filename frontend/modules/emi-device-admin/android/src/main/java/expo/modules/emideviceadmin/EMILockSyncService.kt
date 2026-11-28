package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Log

/**
 * Persistent, low-priority foreground service that keeps the device in sync with
 * the server lock state while the app is closed. Without it a lock issued from
 * the admin app only applied once the borrower opened the client app.
 *
 * Runs while the device is registered and uninstall has not been allowed.
 */
class EMILockSyncService : Service() {
    companion object {
        private const val TAG = "EMILockSyncService"
        private const val CHANNEL_ID = "emi_lock_sync_channel"
        private const val NOTIFICATION_ID = 1003
        private const val INTERVAL_UNLOCKED_MS = 15_000L
        private const val INTERVAL_LOCKED_MS = 10_000L
        @Volatile var isRunning = false

        fun start(context: Context): String {
            val app = context.applicationContext
            val p = LockSync.prefs(app)
            if (p.getString(LockSync.KEY_CLIENT_ID, null).isNullOrEmpty()) return "not_registered"
            if (p.getBoolean("uninstall_allowed", false)) return "uninstall_allowed"
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

        fun stop(context: Context) {
            try { context.stopService(Intent(context, EMILockSyncService::class.java)) } catch (_: Exception) {}
        }
    }

    private var thread: HandlerThread? = null
    private var worker: Handler? = null
    private val tick = object : Runnable {
        override fun run() {
            val p = LockSync.prefs(this@EMILockSyncService)
            if (p.getBoolean("uninstall_allowed", false) ||
                p.getString(LockSync.KEY_CLIENT_ID, null).isNullOrEmpty()) {
                Log.d(TAG, "Not needed any more — stopping")
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
        worker?.removeCallbacksAndMessages(null)
        thread?.quitSafely()
        worker = null
        thread = null
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_ID, "Payment protection", NotificationManager.IMPORTANCE_MIN).apply {
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(ch)
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
            .setContentTitle("PayLock protection active")
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_MIN)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
    }
}
