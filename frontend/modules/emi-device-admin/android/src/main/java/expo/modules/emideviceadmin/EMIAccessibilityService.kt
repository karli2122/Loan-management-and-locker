package expo.modules.emideviceadmin

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast

/**
 * Accessibility service that monitors the foreground app.
 *
 * Behavior depends on device state:
 * - LOCKED (is_locked=true): Blocks ALL apps except system UI. Shows warning toast.
 *   Relaunches our app immediately. This is the most aggressive mode.
 * - SETUP COMPLETE (setup_complete=true, not locked): Blocks Settings and other non-allowlisted apps.
 *   Shows warning toast for Settings access.
 * - DURING SETUP (setup_complete=false): Allows Settings for permission setup.
 * - UNINSTALL ALLOWED: Does nothing, all apps accessible.
 */
class EMIAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "EMIAccessibility"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_UNINSTALL_ALLOWED = "uninstall_allowed"
        private const val KEY_PROTECTION_ENABLED = "protection_enabled"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
        private const val KEY_LOCKED = "is_locked"
        var isRunning = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        isRunning = true
        Log.d(TAG, "Accessibility service connected")

        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags = 0
        }
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        val myPackage = applicationContext.packageName

        if (packageName == myPackage) return

        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Don't interfere if uninstall has been allowed
        if (prefs.getBoolean(KEY_UNINSTALL_ALLOWED, false)) return

        // Don't interfere if protection is not enabled
        if (!prefs.getBoolean(KEY_PROTECTION_ENABLED, true)) return

        val isLocked = prefs.getBoolean(KEY_LOCKED, false)
        val setupComplete = prefs.getBoolean(KEY_SETUP_COMPLETE, false)

        // LOCKED MODE: Block everything except bare system UI
        if (isLocked) {
            val lockedAllowed = setOf(
                "com.android.systemui",
                "android",
            )
            if (packageName in lockedAllowed) return

            Log.d(TAG, "LOCKED: Blocking $packageName — relaunching app")

            val isSettingsApp = packageName.contains("settings") ||
                                packageName == "com.android.settings"
            if (isSettingsApp) {
                mainHandler.post {
                    Toast.makeText(
                        applicationContext,
                        "Device is locked. Disabling permissions will wipe data. Contact your administrator.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            launchApp()
            return
        }

        // SETUP COMPLETE: Block non-allowlisted apps
        if (setupComplete) {
            val allowedPackages = setOf(
                "com.android.systemui",
                "com.android.packageinstaller",
                "com.google.android.packageinstaller",
                "com.google.android.permissioncontroller",
                "android",
                "com.android.server.telecom",
                "com.android.phone",
                "com.android.incallui",
            )
            if (packageName in allowedPackages) return

            Log.d(TAG, "PROTECTED: Blocking $packageName — relaunching app")

            if (packageName.contains("settings")) {
                mainHandler.post {
                    Toast.makeText(
                        applicationContext,
                        "Disabling permissions is not allowed. If you continue, device admin will wipe data.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            launchApp()
            return
        }

        // DURING SETUP: Allow Settings and permission-related apps
        val setupAllowed = setOf(
            "com.android.systemui",
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.google.android.permissioncontroller",
            "android",
            "com.android.server.telecom",
            "com.android.phone",
            "com.android.incallui",
            "com.android.settings",
            "com.samsung.android.settings",
            "com.google.android.gms",
            "com.android.vending",
        )
        if (packageName in setupAllowed) return
        // During setup, still block random other apps
        launchApp()
    }

    private fun launchApp() {
        try {
            val myPackage = applicationContext.packageName
            val launchIntent = applicationContext.packageManager
                .getLaunchIntentForPackage(myPackage)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                applicationContext.startActivity(launchIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to relaunch app: ${e.message}")
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        Log.d(TAG, "Accessibility service destroyed")
    }
}
