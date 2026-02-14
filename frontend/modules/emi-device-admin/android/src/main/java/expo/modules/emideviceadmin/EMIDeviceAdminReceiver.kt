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

    /**
     * Launch the app's main activity to show tamper detection prompt.
     * Works even when the app is closed because the receiver is manifest-registered
     * and Android starts the process to deliver the broadcast.
     */
    private fun launchAppForTamperPrompt(context: Context) {
        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                launchIntent.putExtra("tamper_detected", true)
                context.startActivity(launchIntent)
                Log.d(TAG, "App launched for tamper re-enable prompt")
            } else {
                Log.e(TAG, "Could not get launch intent for package: ${context.packageName}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app for tamper prompt: ${e.message}")
        }
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
        // Admin was forcefully disabled - record tamper and launch app immediately
        getPrefs(context).edit()
            .putBoolean(KEY_UNINSTALL_ALLOWED, true)
            .putBoolean("admin_was_disabled", true)
            .apply()

        // Launch the app to show the non-dismissable re-enable prompt
        // even if the app was not running
        launchAppForTamperPrompt(context)
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.d(TAG, "Device Admin disable requested - this is a security event")
        // Check if uninstall has been explicitly allowed by the admin
        val prefs = getPrefs(context)
        val uninstallAllowed = prefs.getBoolean(KEY_UNINSTALL_ALLOWED, false)
        
        if (!uninstallAllowed) {
            // FACTORY RESET: Wipe the device data immediately.
            // Admin is still active at this point so wipeData() succeeds.
            // This prevents the user from ever completing the disable flow.
            try {
                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                val adminComponent = android.content.ComponentName(context, EMIDeviceAdminReceiver::class.java)
                if (dpm.isAdminActive(adminComponent)) {
                    Log.w(TAG, "UNAUTHORIZED DISABLE ATTEMPT - WIPING DEVICE")
                    prefs.edit().putBoolean("tamper_detected", true).apply()
                    dpm.wipeData(0)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to wipe device on disable request: ${e.message}")
                // Fallback: lock screen and launch app
                try {
                    val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
                    val adminComponent = android.content.ComponentName(context, EMIDeviceAdminReceiver::class.java)
                    if (dpm.isAdminActive(adminComponent)) {
                        dpm.lockNow()
                    }
                } catch (e2: Exception) {
                    Log.e(TAG, "Fallback lock also failed: ${e2.message}")
                }
                prefs.edit().putBoolean("tamper_detected", true).apply()
                launchAppForTamperPrompt(context)
            }
        }
        
        return if (uninstallAllowed) {
            "Device admin will be deactivated."
        } else {
            "WARNING: Disabling device admin will WIPE ALL DATA on this device. " +
            "This action is irreversible."
        }
    }
}
