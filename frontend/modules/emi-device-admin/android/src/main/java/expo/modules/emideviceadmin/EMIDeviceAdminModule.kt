package expo.modules.emideviceadmin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import android.os.Environment
import android.os.UserManager
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File

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
        // CRITICAL: Uses commit() (synchronous) so the preference is persisted
        // BEFORE removeActiveAdmin triggers onDisableRequested in the receiver.
        AsyncFunction("allowUninstall") { promise: Promise ->
            try {
                // Step 1: Synchronously write the flag so onDisableRequested sees it
                val committed = prefs.edit().putBoolean(KEY_UNINSTALL_ALLOWED, true).commit()
                Log.d(TAG, "allowUninstall: FLAG committed=$committed")

                // Step 2: If device owner, stop kiosk mode and clear restrictions first
                if (dpm.isDeviceOwnerApp(context.packageName)) {
                    try {
                        // Stop lock task if running
                        val currentActivity = activity
                        if (currentActivity != null) {
                            val am = currentActivity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
                                currentActivity.stopLockTask()
                                Log.d(TAG, "allowUninstall: Stopped lock task")
                            }
                        }
                        // Clear lock task packages
                        dpm.setLockTaskPackages(adminComponent, arrayOf())
                        Log.d(TAG, "allowUninstall: Cleared lock task packages")
                    } catch (e: Exception) {
                        Log.w(TAG, "allowUninstall: lock task cleanup error: ${e.message}")
                    }
                    try {
                        dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_APPS_CONTROL)
                        Log.d(TAG, "allowUninstall: App settings restriction cleared")
                    } catch (e: Exception) {
                        Log.w(TAG, "allowUninstall: clear restriction error: ${e.message}")
                    }
                    // Device owner must call clearDeviceOwnerApp before removeActiveAdmin
                    try {
                        dpm.clearDeviceOwnerApp(context.packageName)
                        Log.d(TAG, "allowUninstall: Device owner cleared")
                    } catch (e: Exception) {
                        Log.w(TAG, "allowUninstall: clearDeviceOwner error: ${e.message}")
                    }
                }

                // Step 3: Remove admin (this triggers onDisableRequested which now sees the flag)
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

        // Check if admin was forcefully disabled (tamper detection)
        AsyncFunction("wasAdminDisabled") {
            try {
                val wasDisabled = prefs.getBoolean("admin_was_disabled", false)
                val tamperDetected = prefs.getBoolean("tamper_detected", false)
                Log.d(TAG, "wasAdminDisabled: $wasDisabled, tamperDetected: $tamperDetected")
                wasDisabled || tamperDetected
            } catch (e: Exception) {
                Log.e(TAG, "wasAdminDisabled error: ${e.message}")
                false
            }
        }

        // Clear tamper flags after they've been handled
        AsyncFunction("clearTamperFlags") { promise: Promise ->
            try {
                prefs.edit()
                    .putBoolean("admin_was_disabled", false)
                    .putBoolean("tamper_detected", false)
                    .apply()
                Log.d(TAG, "Tamper flags cleared")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "clearTamperFlags error: ${e.message}")
                promise.resolve("error: ${e.message}")
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

        // Lock app settings - disables Clear Data / Clear Cache buttons
        // Requires Device Owner. Applies DISALLOW_APPS_CONTROL user restriction.
        AsyncFunction("lockAppSettings") { lock: Boolean, promise: Promise ->
            try {
                if (!dpm.isDeviceOwnerApp(context.packageName)) {
                    Log.w(TAG, "lockAppSettings: Not device owner, cannot apply restriction")
                    promise.resolve("not_device_owner")
                    return@AsyncFunction
                }
                if (lock) {
                    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_APPS_CONTROL)
                    Log.d(TAG, "lockAppSettings: DISALLOW_APPS_CONTROL applied")
                } else {
                    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_APPS_CONTROL)
                    Log.d(TAG, "lockAppSettings: DISALLOW_APPS_CONTROL cleared")
                }
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "lockAppSettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== KIOSK MODE (LOCK TASK) =====================

        // Start kiosk mode - pins the app so user cannot leave.
        // If Device Owner: seamless kiosk via setLockTaskPackages + startLockTask
        // If not Device Owner: uses startLockTask which shows a system confirmation dialog
        AsyncFunction("startKioskMode") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    Log.e(TAG, "startKioskMode: No activity")
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }

                // If device owner, whitelist our package for lock task (no user confirmation)
                if (dpm.isDeviceOwnerApp(context.packageName)) {
                    dpm.setLockTaskPackages(adminComponent, arrayOf(context.packageName))
                    Log.d(TAG, "startKioskMode: Lock task packages set (device owner)")
                }

                // Check if already in lock task mode
                val am = currentActivity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
                        Log.d(TAG, "startKioskMode: Already in lock task mode")
                        promise.resolve("already_locked")
                        return@AsyncFunction
                    }
                }

                currentActivity.startLockTask()
                Log.d(TAG, "startKioskMode: Lock task started")
                promise.resolve("started")
            } catch (e: Exception) {
                Log.e(TAG, "startKioskMode error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Stop kiosk mode - unpins the app.
        AsyncFunction("stopKioskMode") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    Log.e(TAG, "stopKioskMode: No activity")
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }

                val am = currentActivity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (am.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
                        Log.d(TAG, "stopKioskMode: Not in lock task mode")
                        promise.resolve("not_locked")
                        return@AsyncFunction
                    }
                }

                currentActivity.stopLockTask()
                Log.d(TAG, "stopKioskMode: Lock task stopped")
                promise.resolve("stopped")
            } catch (e: Exception) {
                Log.e(TAG, "stopKioskMode error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Check if currently in kiosk (lock task) mode
        AsyncFunction("isInKioskMode") {
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    false
                } else {
                    val am = currentActivity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
                    } else {
                        false
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "isInKioskMode error: ${e.message}")
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

        // Reset password not supported on modern Android (deprecated since API 28)
        // Kept as no-op for backward compatibility
        AsyncFunction("resetPassword") { _: String, promise: Promise ->
            try {
                Log.d(TAG, "resetPassword: Not supported on modern Android (deprecated)")
                promise.resolve("not_supported")
            } catch (e: Exception) {
                Log.e(TAG, "resetPassword error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Backup client data to external storage (survives Clear Data)
        // Writes client_id to a hidden file on shared storage
        AsyncFunction("backupClientData") { clientId: String, promise: Promise ->
            try {
                val backupDir = File(Environment.getExternalStorageDirectory(), ".emi_backup")
                if (!backupDir.exists()) {
                    backupDir.mkdirs()
                }
                val backupFile = File(backupDir, "client_identity")
                backupFile.writeText(clientId)
                // Also create a .nomedia file to hide from gallery
                val nomedia = File(backupDir, ".nomedia")
                if (!nomedia.exists()) {
                    nomedia.createNewFile()
                }
                Log.d(TAG, "backupClientData: Backed up client_id to external storage")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "backupClientData error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Restore client data from external storage backup
        // Returns the backed-up client_id or empty string if not found
        AsyncFunction("restoreClientData") { promise: Promise ->
            try {
                val backupFile = File(Environment.getExternalStorageDirectory(), ".emi_backup/client_identity")
                if (backupFile.exists()) {
                    val clientId = backupFile.readText().trim()
                    if (clientId.isNotEmpty()) {
                        Log.d(TAG, "restoreClientData: Restored client_id from backup")
                        promise.resolve(clientId)
                        return@AsyncFunction
                    }
                }
                Log.d(TAG, "restoreClientData: No backup found")
                promise.resolve("")
            } catch (e: Exception) {
                Log.e(TAG, "restoreClientData error: ${e.message}")
                promise.resolve("")
            }
        }

        // Clear the external backup (called when admin deletes client)
        AsyncFunction("clearBackupData") { promise: Promise ->
            try {
                val backupDir = File(Environment.getExternalStorageDirectory(), ".emi_backup")
                if (backupDir.exists()) {
                    backupDir.listFiles()?.forEach { it.delete() }
                    backupDir.delete()
                    Log.d(TAG, "clearBackupData: Backup cleared")
                }
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "clearBackupData error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }
    }
}
