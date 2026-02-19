package expo.modules.emideviceadmin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Boot receiver that auto-starts the app when the device restarts.
 * Reads lock/registration state from SharedPreferences.
 * If the device was locked or registered, launches the app and starts overlay service.
 */
class EMIBootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "EMIBootReceiver"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_REGISTERED = "device_registered"
        private const val KEY_LOCKED = "is_locked"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != "android.intent.action.QUICKBOOT_POWERON" &&
            intent.action != "com.htc.intent.action.QUICKBOOT_POWERON") {
            return
        }

        Log.d(TAG, "Boot completed - checking device state")

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isRegistered = prefs.getBoolean(KEY_REGISTERED, false)
        val isLocked = prefs.getBoolean(KEY_LOCKED, false)
        val setupComplete = prefs.getBoolean(KEY_SETUP_COMPLETE, false)

        Log.d(TAG, "Boot state: registered=$isRegistered, locked=$isLocked, setupComplete=$setupComplete")

        // Only force-launch app on boot if device is LOCKED
        // PROTECTED state: app starts normally via Android launcher, no force needed
        if (isLocked) {
            try {
                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                if (launchIntent != null) {
                    launchIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                    launchIntent.putExtra("boot_start", true)
                    launchIntent.putExtra("is_locked", isLocked)
                    context.startActivity(launchIntent)
                    Log.d(TAG, "App launched on boot (device is LOCKED)")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch app on boot: ${e.message}")
            }
        }

        // Only start overlay service if LOCKED (not for PROTECTED state)
        // PROTECTED state should not block status bar or navigation
        if (isLocked) {
            try {
                val overlayIntent = Intent(context, EMIOverlayService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(overlayIntent)
                } else {
                    context.startService(overlayIntent)
                }
                Log.d(TAG, "Overlay service started on boot")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start overlay on boot: ${e.message}")
            }
        }
    }
}
