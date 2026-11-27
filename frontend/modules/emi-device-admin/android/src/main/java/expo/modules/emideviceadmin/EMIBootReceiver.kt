package expo.modules.emideviceadmin

import android.app.ActivityOptions
import android.app.admin.DevicePolicyManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Re-applies lock services after boot or an app update.
 * Reads lock/registration state from SharedPreferences.
 * If the device was locked, launches the app, starts overlay + monitor,
 * and (Device Owner) re-enters lock-task via ActivityOptions.
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
        val action = intent.action ?: return
        val allowed = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )
        if (action !in allowed) return

        Log.d(TAG, "State restore trigger: $action")
        applyLockedPolicy(context, action)
    }

    private fun applyLockedPolicy(context: Context, reason: String) {
        // Leftover emergency flags from a previous boot must not stay active.
        try {
            EmergencyCallSession.clearStale(context)
        } catch (e: Exception) {
            Log.e(TAG, "clearStale emergency failed: ${e.message}")
        }

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isRegistered = prefs.getBoolean(KEY_REGISTERED, false)
        val isLocked = prefs.getBoolean(KEY_LOCKED, false)
        val setupComplete = prefs.getBoolean(KEY_SETUP_COMPLETE, false)
        Log.d(TAG, "State ($reason): registered=$isRegistered, locked=$isLocked, setupComplete=$setupComplete")
        if (!isLocked) return

        // Device Owner: re-apply lock-task allowlist (this app only) before launching.
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
        val adminComponent = ComponentName(context, EMIDeviceAdminReceiver::class.java)
        val isOwner = dpm?.isDeviceOwnerApp(context.packageName) == true
        if (isOwner && dpm != null) {
            try {
                dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
                }
                try {
                    dpm.setStatusBarDisabled(adminComponent, true)
                } catch (e: Exception) {
                    Log.w(TAG, "setStatusBarDisabled on restore: ${e.message}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to re-apply lock-task policy: ${e.message}")
            }
        }

        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                launchIntent.putExtra("boot_start", true)
                launchIntent.putExtra("is_locked", true)
                if (isOwner && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val opts = ActivityOptions.makeBasic()
                    opts.setLockTaskEnabled(true)
                    context.startActivity(launchIntent, opts.toBundle())
                    Log.d(TAG, "App launched into lock-task ($reason)")
                } else {
                    context.startActivity(launchIntent)
                    Log.d(TAG, "App launched ($reason)")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app: ${e.message}")
        }

        try {
            val overlayIntent = Intent(context, EMIOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(overlayIntent)
            } else {
                context.startService(overlayIntent)
            }
            Log.d(TAG, "Overlay service started ($reason)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start overlay: ${e.message}")
        }

        try {
            val monitorIntent = Intent(context, EMIForegroundMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(monitorIntent)
            } else {
                context.startService(monitorIntent)
            }
            Log.d(TAG, "Foreground monitor started ($reason)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start monitor: ${e.message}")
        }

        try {
            EMIRestartReceiver.scheduleRestart(context, 10_000)
            Log.d(TAG, "Auto-restart scheduled ($reason)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart: ${e.message}")
        }

        try {
            if (dpm != null && dpm.isAdminActive(adminComponent)) {
                dpm.setCameraDisabled(adminComponent, true)
                Log.d(TAG, "Camera disabled ($reason)")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to disable camera: ${e.message}")
        }
    }
}
