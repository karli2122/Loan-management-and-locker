package expo.modules.emideviceadmin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log

class EMIDeviceAdminReceiver : DeviceAdminReceiver() {
    companion object {
        private const val TAG = "EMIDeviceAdmin"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_UNINSTALL_ALLOWED = "uninstall_allowed"
    }

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin ENABLED")
        // Mark uninstall as not allowed when admin is enabled
        getPrefs(context).edit().putBoolean(KEY_UNINSTALL_ALLOWED, false).apply()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device Admin DISABLED - protection removed")
        // Admin was forcefully disabled - report this as a tamper attempt
        // The client app will pick this up on next status check
        getPrefs(context).edit()
            .putBoolean(KEY_UNINSTALL_ALLOWED, true)
            .putBoolean("admin_was_disabled", true)
            .apply()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.d(TAG, "Device Admin disable requested - this is a security event")
        // Check if uninstall has been explicitly allowed by the admin
        val prefs = getPrefs(context)
        val uninstallAllowed = prefs.getBoolean(KEY_UNINSTALL_ALLOWED, false)
        
        return if (uninstallAllowed) {
            "Device admin will be deactivated."
        } else {
            "WARNING: Disabling device admin will remove EMI payment protection. " +
            "This action will be reported to your loan provider and may result in " +
            "immediate device lock and additional penalties."
        }
    }
}
