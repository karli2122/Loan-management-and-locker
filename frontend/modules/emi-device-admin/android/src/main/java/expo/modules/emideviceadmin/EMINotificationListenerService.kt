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
                // Don't dismiss our own foreground service notification
                if (sbn.packageName == packageName) return

                Log.d(TAG, "Dismissing notification from: ${sbn.packageName}")
                cancelNotification(sbn.key)
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
                for (sbn in notifications) {
                    if (sbn.packageName != packageName) {
                        cancelNotification(sbn.key)
                    }
                }
                Log.d(TAG, "Dismissed ${notifications.size} existing notifications")
            }
        } catch (e: Exception) {
            Log.e(TAG, "dismissAllIfLocked error: ${e.message}")
        }
    }
}
