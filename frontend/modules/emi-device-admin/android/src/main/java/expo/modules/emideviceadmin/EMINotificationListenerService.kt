package expo.modules.emideviceadmin

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.content.Context
import android.util.Log

/**
 * NotificationListenerService - Auto-dismisses ALL notifications while device is locked.
 * This makes the status bar notification shade completely empty and useless.
 */
class EMINotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "EMINotifListener"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isLocked = prefs.getBoolean(KEY_LOCKED, false)

            if (isLocked) {
                // Dismiss ALL notifications including our own (foreground service notif can't be
                // cancelled by the listener, so this is safe — it just hides non-essential ones)
                Log.d(TAG, "Dismissing notification from: ${sbn.packageName}")
                try {
                    cancelNotification(sbn.key)
                } catch (e: Exception) {
                    // Foreground service notifications will throw — that's expected
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "onNotificationPosted error: ${e.message}")
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "Notification listener connected")
        // Dismiss all existing notifications if device is locked
        dismissAllIfLocked()
    }

    private fun dismissAllIfLocked() {
        try {
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val isLocked = prefs.getBoolean(KEY_LOCKED, false)

            if (isLocked) {
                val notifications = activeNotifications
                var dismissed = 0
                for (sbn in notifications) {
                    try {
                        cancelNotification(sbn.key)
                        dismissed++
                    } catch (e: Exception) {
                        // Foreground service notifications can't be cancelled — expected
                    }
                }
                Log.d(TAG, "Dismissed $dismissed/${notifications.size} existing notifications")
            }
        } catch (e: Exception) {
            Log.e(TAG, "dismissAllIfLocked error: ${e.message}")
        }
    }
}
