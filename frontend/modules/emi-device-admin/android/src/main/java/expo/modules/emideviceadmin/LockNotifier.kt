package expo.modules.emideviceadmin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import java.util.Locale

/**
 * Local notifications posted by the native lock sync, so they arrive while the app is
 * closed or swiped away (the sync runs in the accessibility service / fallback foreground
 * service, plus AlarmManager + JobScheduler backups).
 *
 * The old live server only exposes `warning_message` (and the lock state) to the device;
 * payment reminders are sent by the server as Expo pushes only. Channels used by those
 * pushes ("warnings", "default", "payments") are created here too, so a push is never
 * dropped because the app has not created its channels yet.
 */
object LockNotifier {
    private const val TAG = "EMILockNotifier"
    const val CHANNEL_WARNINGS = "warnings"
    const val CHANNEL_DEFAULT = "default"
    const val CHANNEL_PAYMENTS = "payments"
    private const val KEY_LAST_WARNING = "last_warning_notified"
    const val KEY_APP_LANGUAGE = "app_language"
    private const val ID_WARNING = 4101
    private const val ID_UNLOCKED = 4102

    private fun et(context: Context): Boolean {
        val lang = LockSync.prefs(context).getString(KEY_APP_LANGUAGE, null)
            ?: Locale.getDefault().language
        return lang.lowercase(Locale.ROOT).startsWith("et")
    }

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val et = et(context)
        fun make(id: String, name: String, importance: Int) {
            try {
                if (nm.getNotificationChannel(id) != null) return
                nm.createNotificationChannel(NotificationChannel(id, name, importance).apply {
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                })
            } catch (e: Exception) { Log.w(TAG, "channel $id: ${e.message}") }
        }
        make(CHANNEL_WARNINGS, if (et) "Hoiatused" else "Warnings", NotificationManager.IMPORTANCE_HIGH)
        make(CHANNEL_PAYMENTS, if (et) "Maksed" else "Payments", NotificationManager.IMPORTANCE_HIGH)
        make(CHANNEL_DEFAULT, if (et) "Teavitused" else "Notifications", NotificationManager.IMPORTANCE_DEFAULT)
    }

    /** Post a warning once per distinct text. Empty text resets, so a repeated warning shows again. */
    fun onWarning(context: Context, rawMessage: String, adminName: String) {
        val app = context.applicationContext
        val p = LockSync.prefs(app)
        val message = rawMessage.trim()
        if (message.isEmpty()) {
            if (p.contains(KEY_LAST_WARNING)) p.edit().remove(KEY_LAST_WARNING).apply()
            return
        }
        synchronized(this) {
            if (p.getString(KEY_LAST_WARNING, null) == message) return
            p.edit().putString(KEY_LAST_WARNING, message).commit()
        }
        if (alreadyShowing(app, message)) {
            Log.d(TAG, "Warning already shown (push or app) — skipping duplicate")
            return
        }
        val et = et(app)
        val title = when {
            adminName.isNotBlank() -> if (et) "Hoiatus: $adminName" else "Warning from $adminName"
            else -> if (et) "Hoiatus haldurilt" else "Warning from your lender"
        }
        post(app, ID_WARNING, CHANNEL_WARNINGS, title, message, high = true)
    }

    fun onUnlocked(context: Context) {
        val app = context.applicationContext
        val et = et(app)
        post(
            app, ID_UNLOCKED, CHANNEL_DEFAULT,
            if (et) "Telefon on avatud" else "Phone unlocked",
            if (et) "Teie telefon on uuesti kasutatav." else "Your phone can be used again.",
            high = false,
        )
    }

    private fun alreadyShowing(context: Context, text: String): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        return try {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return false
            nm.activeNotifications.any { sbn ->
                val extras = sbn.notification.extras
                val body = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
                val big = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
                body == text || big == text
            }
        } catch (_: Exception) { false }
    }

    private fun post(context: Context, id: Int, channel: String, title: String, text: String, high: Boolean) {
        try {
            ensureChannels(context)
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !nm.areNotificationsEnabled()) {
                Log.d(TAG, "Notifications disabled by the user — cannot post")
                return
            }
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            val pi = launch?.let {
                PendingIntent.getActivity(context, id, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            }
            val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel)
            else @Suppress("DEPRECATION") Notification.Builder(context)
            val n = b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setCategory(if (high) Notification.CATEGORY_REMINDER else Notification.CATEGORY_STATUS)
                .apply {
                    if (pi != null) setContentIntent(pi)
                    @Suppress("DEPRECATION")
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                        setPriority(if (high) Notification.PRIORITY_HIGH else Notification.PRIORITY_DEFAULT)
                        setDefaults(Notification.DEFAULT_ALL)
                    }
                }
                .build()
            nm.notify(id, n)
        } catch (e: Exception) {
            Log.w(TAG, "post failed: ${e.message}")
        }
    }
}
