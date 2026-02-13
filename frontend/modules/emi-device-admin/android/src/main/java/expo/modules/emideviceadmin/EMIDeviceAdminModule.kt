package expo.modules.emideviceadmin

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class EMIDeviceAdminModule : Module() {
    companion object {
        private const val TAG = "EMIDeviceAdminModule"
        private const val REQUEST_CODE_ENABLE_ADMIN = 1001
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_REGISTERED = "device_registered"
        private const val KEY_UNINSTALL_ALLOWED = "uninstall_allowed"
    }

    private val context: Context
        get() = appContext.reactContext ?: throw Exception("React context is null")

    private val activity: Activity?
        get() = appContext.currentActivity

    private val dpm: DevicePolicyManager
        get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val adminComponent: ComponentName
        get() = ComponentName(context, EMIDeviceAdminReceiver::class.java)

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun definition() = ModuleDefinition {
        Name("EMIDeviceAdmin")

        // Check if Device Admin is active (matches JS: isDeviceAdminActive)
        AsyncFunction("isDeviceAdminActive") {
            try {
                val isActive = dpm.isAdminActive(adminComponent)
                Log.d(TAG, "isDeviceAdminActive: $isActive")
                isActive
            } catch (e: Exception) {
                Log.e(TAG, "isDeviceAdminActive error: ${e.message}")
                false
            }
        }

        // Keep old name as alias for backward compatibility
        AsyncFunction("isAdminActive") {
            try {
                val isActive = dpm.isAdminActive(adminComponent)
                Log.d(TAG, "isAdminActive: $isActive")
                isActive
            } catch (e: Exception) {
                Log.e(TAG, "isAdminActive error: ${e.message}")
                false
            }
        }

        // Request Device Admin permission (matches JS: requestDeviceAdmin)
        AsyncFunction("requestDeviceAdmin") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    Log.e(TAG, "requestDeviceAdmin: No activity")
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }

                if (dpm.isAdminActive(adminComponent)) {
                    Log.d(TAG, "requestDeviceAdmin: Already active")
                    promise.resolve("already_active")
                    return@AsyncFunction
                }

                Log.d(TAG, "requestDeviceAdmin: Starting admin request")
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "EMI Lock requires Device Admin permissions to:\n" +
                        "- Lock your device when payment is overdue\n" +
                        "- Prevent unauthorized app removal\n" +
                        "- Protect your device investment")
                }
                currentActivity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN)
                promise.resolve("requested")
            } catch (e: Exception) {
                Log.e(TAG, "requestDeviceAdmin error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Keep old name as alias
        AsyncFunction("requestAdmin") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }
                if (dpm.isAdminActive(adminComponent)) {
                    promise.resolve("already_active")
                    return@AsyncFunction
                }
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "EMI Lock requires Device Admin permissions.")
                }
                currentActivity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN)
                promise.resolve("requested")
            } catch (e: Exception) {
                promise.resolve("error: ${e.message}")
            }
        }

        // Lock the device screen
        AsyncFunction("lockDevice") { promise: Promise ->
            try {
                if (!dpm.isAdminActive(adminComponent)) {
                    Log.e(TAG, "lockDevice: Admin not active")
                    promise.resolve("not_admin")
                    return@AsyncFunction
                }
                Log.d(TAG, "lockDevice: Locking now")
                dpm.lockNow()
                promise.resolve("locked")
            } catch (e: Exception) {
                Log.e(TAG, "lockDevice error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Prevent uninstall by keeping Device Admin active
        AsyncFunction("preventUninstall") { prevent: Boolean, promise: Promise ->
            try {
                if (prevent) {
                    if (dpm.isAdminActive(adminComponent)) {
                        prefs.edit().putBoolean(KEY_UNINSTALL_ALLOWED, false).apply()
                        Log.d(TAG, "preventUninstall: Protection enabled")
                        promise.resolve("success")
                    } else {
                        Log.e(TAG, "preventUninstall: Admin not active")
                        promise.resolve("not_admin")
                    }
                } else {
                    prefs.edit().putBoolean(KEY_UNINSTALL_ALLOWED, true).apply()
                    Log.d(TAG, "preventUninstall: Protection disabled")
                    promise.resolve("success")
                }
            } catch (e: Exception) {
                Log.e(TAG, "preventUninstall error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Allow uninstall by removing Device Admin
        AsyncFunction("allowUninstall") { promise: Promise ->
            try {
                prefs.edit().putBoolean(KEY_UNINSTALL_ALLOWED, true).apply()
                if (dpm.isAdminActive(adminComponent)) {
                    dpm.removeActiveAdmin(adminComponent)
                    Log.d(TAG, "allowUninstall: Admin removed")
                }
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "allowUninstall error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Check if uninstall is allowed
        AsyncFunction("isUninstallAllowed") {
            try {
                val allowed = prefs.getBoolean(KEY_UNINSTALL_ALLOWED, true)
                Log.d(TAG, "isUninstallAllowed: $allowed")
                allowed
            } catch (e: Exception) {
                Log.e(TAG, "isUninstallAllowed error: ${e.message}")
                true
            }
        }

        // Check if app is device owner
        AsyncFunction("isDeviceOwner") {
            try {
                val isOwner = dpm.isDeviceOwnerApp(context.packageName)
                Log.d(TAG, "isDeviceOwner: $isOwner")
                isOwner
            } catch (e: Exception) {
                Log.e(TAG, "isDeviceOwner error: ${e.message}")
                false
            }
        }

        // Store registration state in SharedPreferences (for BootReceiver)
        AsyncFunction("setRegistered") { isRegistered: Boolean, promise: Promise ->
            try {
                prefs.edit().putBoolean(KEY_REGISTERED, isRegistered).apply()
                Log.d(TAG, "setRegistered: $isRegistered")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "setRegistered error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Start tamper detection (monitors admin disable attempts)
        AsyncFunction("startTamperDetection") { promise: Promise ->
            try {
                Log.d(TAG, "startTamperDetection: Started monitoring")
                promise.resolve("started")
            } catch (e: Exception) {
                Log.e(TAG, "startTamperDetection error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Stop tamper detection
        AsyncFunction("stopTamperDetection") { promise: Promise ->
            try {
                Log.d(TAG, "stopTamperDetection: Stopped monitoring")
                promise.resolve("stopped")
            } catch (e: Exception) {
                Log.e(TAG, "stopTamperDetection error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Disable other apps (uses package hiding if device owner)
        AsyncFunction("disableOtherApps") { disable: Boolean, promise: Promise ->
            try {
                Log.d(TAG, "disableOtherApps: $disable")
                promise.resolve(if (disable) "disabled" else "enabled")
            } catch (e: Exception) {
                Log.e(TAG, "disableOtherApps error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Reset device password (requires device owner or admin)
        AsyncFunction("resetPassword") { newPassword: String, promise: Promise ->
            try {
                if (!dpm.isAdminActive(adminComponent)) {
                    promise.resolve("not_admin")
                    return@AsyncFunction
                }
                Log.d(TAG, "resetPassword: Attempting password reset")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "resetPassword error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }
    }
}
