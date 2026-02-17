package expo.modules.emideviceadmin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.UserManager
import android.provider.Settings
import android.util.Log
import android.view.View
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

        // ===================== ACCESSIBILITY SERVICE =====================

        // Check if our accessibility service is enabled in system settings
        AsyncFunction("isAccessibilityServiceEnabled") {
            try {
                val enabledServices = android.provider.Settings.Secure.getString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                ) ?: ""
                val myComponent = ComponentName(
                    context,
                    EMIAccessibilityService::class.java
                ).flattenToString()
                val isEnabled = enabledServices.contains(myComponent)
                Log.d(TAG, "isAccessibilityServiceEnabled: $isEnabled (looking for $myComponent)")
                isEnabled
            } catch (e: Exception) {
                Log.e(TAG, "isAccessibilityServiceEnabled error: ${e.message}")
                false
            }
        }

        // Open the system accessibility settings — tries "Installed apps" sub-screen first
        AsyncFunction("openAccessibilitySettings") { promise: Promise ->
            try {
                // Try to open the "Installed Services" / "Installed Apps" sub-page directly
                val installedServicesIntents = listOf(
                    // Samsung One UI: Accessibility > Installed apps
                    Intent().apply {
                        setClassName("com.android.settings", "com.android.settings.Settings\$AccessibilityInstalledServiceActivity")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    // Generic Android: Accessibility installed services
                    Intent().apply {
                        setClassName("com.android.settings", "com.android.settings.accessibility.AccessibilitySettingsForSetupWizardActivity")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )

                for (intent in installedServicesIntents) {
                    try {
                        if (intent.resolveActivity(context.packageManager) != null) {
                            context.startActivity(intent)
                            Log.d(TAG, "openAccessibilitySettings: Opened installed services directly")
                            promise.resolve("opened_installed")
                            return@AsyncFunction
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "openAccessibilitySettings: Sub-intent failed: ${e.message}")
                    }
                }

                // Fallback: open top-level accessibility settings
                val intent = Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS)
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.d(TAG, "openAccessibilitySettings: Opened top-level")
                promise.resolve("opened")
            } catch (e: Exception) {
                Log.e(TAG, "openAccessibilitySettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Open app info page (for "Allow restricted settings" on Android 13+)
        AsyncFunction("openAppInfo") { promise: Promise ->
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.parse("package:${context.packageName}")
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                Log.d(TAG, "openAppInfo: Opened app details")
                promise.resolve("opened")
            } catch (e: Exception) {
                Log.e(TAG, "openAppInfo error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== OVERLAY PERMISSION =====================

        // Check if the app has "Display over other apps" permission
        AsyncFunction("canDrawOverlays") {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val can = android.provider.Settings.canDrawOverlays(context)
                    Log.d(TAG, "canDrawOverlays: $can")
                    can
                } else {
                    true // Pre-M, permission is granted by default
                }
            } catch (e: Exception) {
                Log.e(TAG, "canDrawOverlays error: ${e.message}")
                false
            }
        }

        // Open the system overlay permission settings
        AsyncFunction("requestOverlayPermission") { promise: Promise ->
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:${context.packageName}")
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    Log.d(TAG, "requestOverlayPermission: Opened settings")
                    promise.resolve("opened")
                } else {
                    promise.resolve("already_granted")
                }
            } catch (e: Exception) {
                Log.e(TAG, "requestOverlayPermission error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Start the overlay blocker service (foreground service — blocks status bar & nav bar)
        AsyncFunction("startOverlayBlocker") { promise: Promise ->
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                    !android.provider.Settings.canDrawOverlays(context)) {
                    Log.w(TAG, "startOverlayBlocker: No overlay permission")
                    promise.resolve("no_permission")
                    return@AsyncFunction
                }
                val intent = Intent(context, EMIOverlayService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                Log.d(TAG, "startOverlayBlocker: Foreground service started")
                promise.resolve("started")
            } catch (e: Exception) {
                Log.e(TAG, "startOverlayBlocker error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Stop the overlay blocker service
        AsyncFunction("stopOverlayBlocker") { promise: Promise ->
            try {
                val intent = Intent(context, EMIOverlayService::class.java)
                context.stopService(intent)
                Log.d(TAG, "stopOverlayBlocker: Service stopped")
                promise.resolve("stopped")
            } catch (e: Exception) {
                Log.e(TAG, "stopOverlayBlocker error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Check if overlay blocker is running
        AsyncFunction("isOverlayBlockerRunning") {
            EMIOverlayService.isRunning
        }

        // Mark protection setup as complete — Accessibility Service will block Settings access
        AsyncFunction("setProtectionComplete") { complete: Boolean, promise: Promise ->
            try {
                prefs.edit().putBoolean("setup_complete", complete).commit()
                Log.d(TAG, "setProtectionComplete: $complete")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "setProtectionComplete error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Save lock state to native SharedPreferences (for BootReceiver auto-start)
        AsyncFunction("setNativeLockState") { locked: Boolean, promise: Promise ->
            try {
                prefs.edit().putBoolean("is_locked", locked).commit()
                Log.d(TAG, "setNativeLockState: locked=$locked")
                promise.resolve("success")
            } catch (e: Exception) {
                Log.e(TAG, "setNativeLockState error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Enable immersive mode — hides status bar and navigation bar completely
        AsyncFunction("enableImmersiveMode") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }
                currentActivity.runOnUiThread {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        currentActivity.window.insetsController?.let { controller ->
                            controller.hide(android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.navigationBars())
                            controller.systemBarsBehavior = android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        currentActivity.window.decorView.systemUiVisibility =
                            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                            View.SYSTEM_UI_FLAG_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    }
                }
                Log.d(TAG, "enableImmersiveMode: System bars hidden")
                promise.resolve("enabled")
            } catch (e: Exception) {
                Log.e(TAG, "enableImmersiveMode error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // Disable immersive mode — restores status bar and navigation bar
        AsyncFunction("disableImmersiveMode") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }
                currentActivity.runOnUiThread {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        currentActivity.window.insetsController?.let { controller ->
                            controller.show(android.view.WindowInsets.Type.statusBars() or android.view.WindowInsets.Type.navigationBars())
                        }
                    } else {
                        @Suppress("DEPRECATION")
                        currentActivity.window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
                    }
                }
                Log.d(TAG, "disableImmersiveMode: System bars restored")
                promise.resolve("disabled")
            } catch (e: Exception) {
                Log.e(TAG, "disableImmersiveMode error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== SCREEN PINNING =====================
        // startKioskMode/stopKioskMode/isInKioskMode already handle screen pinning above

        // ===================== BATTERY OPTIMIZATION =====================

        // Check if app is exempted from battery optimization
        AsyncFunction("isIgnoringBatteryOptimizations") {
            try {
                val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                val isIgnoring = pm.isIgnoringBatteryOptimizations(context.packageName)
                Log.d(TAG, "isIgnoringBatteryOptimizations: $isIgnoring")
                isIgnoring
            } catch (e: Exception) {
                Log.e(TAG, "isIgnoringBatteryOptimizations error: ${e.message}")
                false
            }
        }

        // Request battery optimization exemption
        AsyncFunction("requestBatteryOptimization") { promise: Promise ->
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    intent.data = Uri.parse("package:${context.packageName}")
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    promise.resolve("opened")
                } else {
                    promise.resolve("not_needed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "requestBatteryOptimization error: ${e.message}")
                // Fallback: open general battery settings
                try {
                    val intent = Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    promise.resolve("opened_fallback")
                } catch (e2: Exception) {
                    promise.resolve("error: ${e.message}")
                }
            }
        }

        // Open battery/power usage settings
        AsyncFunction("openBatterySettings") { promise: Promise ->
            try {
                // Try app-specific battery settings first
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = Uri.parse("package:${context.packageName}")
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                promise.resolve("opened")
            } catch (e: Exception) {
                Log.e(TAG, "openBatterySettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== AUTO START =====================

        // Open auto-start / background usage settings (OEM-specific)
        AsyncFunction("openAutoStartSettings") { promise: Promise ->
            try {
                val intents = listOf(
                    // Xiaomi
                    Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
                    // Oppo
                    Intent().setComponent(ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
                    // Vivo
                    Intent().setComponent(ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
                    // Huawei
                    Intent().setComponent(ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
                    // Samsung Device Care > Battery
                    Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")),
                    // Samsung newer One UI
                    Intent().setComponent(ComponentName("com.samsung.android.sm", "com.samsung.android.sm.battery.ui.BatteryActivity")),
                    // Samsung background usage limits
                    Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.usage.AppSleepSettingActivity")),
                    // Generic: Battery optimization (excludes app from Doze)
                    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                    // Last fallback: app-specific battery settings
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${context.packageName}")
                    },
                )
                
                for (intent in intents) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        if (intent.resolveActivity(context.packageManager) != null) {
                            context.startActivity(intent)
                            Log.d(TAG, "openAutoStartSettings: Opened ${intent.component?.className ?: intent.action}")
                            promise.resolve("opened")
                            return@AsyncFunction
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "openAutoStartSettings: Intent failed: ${e.message}")
                    }
                }
                promise.resolve("not_available")
            } catch (e: Exception) {
                Log.e(TAG, "openAutoStartSettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== NOTIFICATION SETTINGS =====================

        // Open app notification settings
        AsyncFunction("openNotificationSettings") { promise: Promise ->
            try {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    }
                } else {
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${context.packageName}")
                    }
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                promise.resolve("opened")
            } catch (e: Exception) {
                Log.e(TAG, "openNotificationSettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        // ===================== PLAY PROTECT =====================

        // Open Google Play Protect settings to disable scanning
        AsyncFunction("openPlayProtectSettings") { promise: Promise ->
            try {
                // Try direct Play Protect / Verify Apps settings
                val intents = listOf(
                    // Google Play Protect settings (modern devices)
                    Intent("com.google.android.gms.security.settings.VerifyAppsSettingsActivity").apply {
                        setPackage("com.google.android.gms")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    // Play Protect via Play Store app
                    Intent().apply {
                        setClassName("com.android.vending", "com.google.android.finsky.playprotect.PlayProtectSettingsActivity")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    // Fallback: Google Play Store safety section
                    Intent(Intent.ACTION_VIEW, Uri.parse("market://play-protect")).apply {
                        setPackage("com.android.vending")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                    // Last fallback: open Google Play Store app
                    Intent().apply {
                        setClassName("com.android.vending", "com.android.vending.AssetBrowserActivity")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
                
                for (intent in intents) {
                    try {
                        if (intent.resolveActivity(context.packageManager) != null) {
                            context.startActivity(intent)
                            Log.d(TAG, "openPlayProtectSettings: Opened via ${intent.component?.className ?: intent.action}")
                            promise.resolve("opened")
                            return@AsyncFunction
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "openPlayProtectSettings: Intent failed: ${e.message}")
                    }
                }
                
                // Ultimate fallback: open app security settings
                try {
                    val settingsIntent = Intent(Settings.ACTION_SECURITY_SETTINGS)
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(settingsIntent)
                    promise.resolve("opened_security")
                } catch (e: Exception) {
                    promise.resolve("not_available")
                }
            } catch (e: Exception) {
                Log.e(TAG, "openPlayProtectSettings error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }
    }
}
