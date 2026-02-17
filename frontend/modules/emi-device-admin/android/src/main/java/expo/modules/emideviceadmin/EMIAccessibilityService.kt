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
 * If an unauthorized app (not our app or system UI) comes to the foreground,
 * it relaunches our app to keep it pinned in the foreground.
 *
 * When uninstall is not allowed: shows warning toast + relaunches app.
 * When uninstall is allowed: does nothing (permissions can be changed freely).
 */
class EMIAccessibilityService : AccessibilityService() {
    companion object {
        private const val TAG = "EMIAccessibility"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_UNINSTALL_ALLOWED = "uninstall_allowed"
        private const val KEY_PROTECTION_ENABLED = "protection_enabled"
        private const val KEY_SETUP_COMPLETE = "setup_complete"
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
            notificationTimeout = 200
            flags = 0
        }
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        val myPackage = applicationContext.packageName

        // If this is our own app, do nothing
        if (packageName == myPackage) return

        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Don't interfere if uninstall has been allowed — permissions can be changed freely
        if (prefs.getBoolean(KEY_UNINSTALL_ALLOWED, false)) return

        // Don't interfere if protection is not enabled
        if (!prefs.getBoolean(KEY_PROTECTION_ENABLED, true)) return

        val setupComplete = prefs.getBoolean(KEY_SETUP_COMPLETE, false)

        val allowedPackages = mutableSetOf(
            "com.android.systemui",
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.google.android.permissioncontroller",
            "android",
            "com.android.server.telecom",
            "com.android.phone",
            "com.android.incallui",
        )

        // Only allow Settings during setup (before protection is complete)
        if (!setupComplete) {
            allowedPackages.add("com.android.settings")
            allowedPackages.add("com.google.android.gms")
            allowedPackages.add("com.android.vending")
        }

        if (packageName in allowedPackages) return

        // After setup complete: block unauthorized apps and show warning
        Log.d(TAG, "Unauthorized app in foreground: $packageName — blocking")

        // Show warning toast on main thread
        val isSettingsApp = packageName == "com.android.settings" ||
                            packageName == "com.samsung.android.settings" ||
                            packageName.contains("settings")
        if (isSettingsApp) {
            mainHandler.post {
                Toast.makeText(
                    applicationContext,
                    "Disabling permissions is not allowed. If you continue, device admin will wipe data. Contact your administrator.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

        try {
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
