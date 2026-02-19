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
import java.net.HttpURLConnection
import java.net.URL

/**
 * Accessibility service that monitors the foreground app and periodically
 * checks the backend for lock state changes (even when the app is closed).
 *
 * Behavior depends on device state:
 * - LOCKED (is_locked=true): Blocks ALL apps except system UI. Shows warning toast.
 *   Relaunches our app immediately. This is the most aggressive mode.
 * - SETUP COMPLETE (setup_complete=true, not locked): Shows warning for Settings.
 *   Allows all other apps normally.
 * - DURING SETUP (setup_complete=false): Allows everything.
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
        private const val KEY_CLIENT_ID = "client_id"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val CHECK_INTERVAL_MS = 60000L // Check server every 60 seconds
        var isRunning = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val checkHandler = Handler(Looper.getMainLooper())
    private var lockCheckRunnable: Runnable? = null

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

        // Start periodic lock state checking
        startPeriodicLockCheck()
    }

    /**
     * Periodically checks the backend for lock state changes.
     * This runs even when the main app is closed/swiped away.
     */
    private fun startPeriodicLockCheck() {
        lockCheckRunnable = object : Runnable {
            override fun run() {
                Thread {
                    checkServerLockState()
                }.start()
                checkHandler.postDelayed(this, CHECK_INTERVAL_MS)
            }
        }
        checkHandler.postDelayed(lockCheckRunnable!!, CHECK_INTERVAL_MS)
        Log.d(TAG, "Started periodic lock state checking (every ${CHECK_INTERVAL_MS/1000}s)")
    }

    private fun checkServerLockState() {
        try {
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val clientId = prefs.getString(KEY_CLIENT_ID, null)
            val backendUrl = prefs.getString(KEY_BACKEND_URL, null)

            if (clientId.isNullOrEmpty() || backendUrl.isNullOrEmpty()) {
                return // Not registered yet or no backend URL
            }

            val url = URL("$backendUrl/api/device/status/$clientId")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val response = connection.inputStream.bufferedReader().readText()
                
                // Simple JSON parsing for is_locked field
                val isLockedMatch = Regex("\"is_locked\"\\s*:\\s*(true|false)").find(response)
                val serverLocked = isLockedMatch?.groupValues?.get(1) == "true"
                val currentlyLocked = prefs.getBoolean(KEY_LOCKED, false)

                if (serverLocked && !currentlyLocked) {
                    Log.d(TAG, "Server says LOCKED — updating local state and launching app")
                    prefs.edit().putBoolean(KEY_LOCKED, true).apply()
                    
                    // Parse lock message
                    val messageMatch = Regex("\"lock_message\"\\s*:\\s*\"([^\"]+)\"").find(response)
                    val lockMessage = messageMatch?.groupValues?.get(1) ?: ""
                    
                    // Launch the app so it can display the lock screen
                    mainHandler.post {
                        launchApp()
                        // Start overlay service
                        try {
                            val overlayIntent = Intent(applicationContext, EMIOverlayService::class.java)
                            overlayIntent.putExtra("lock_message", lockMessage)
                            applicationContext.startForegroundService(overlayIntent)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to start overlay from accessibility: ${e.message}")
                        }
                    }
                } else if (!serverLocked && currentlyLocked) {
                    Log.d(TAG, "Server says UNLOCKED — updating local state")
                    prefs.edit().putBoolean(KEY_LOCKED, false).apply()
                    // Launch app so it can update its UI
                    mainHandler.post { launchApp() }
                }
            }
            connection.disconnect()
        } catch (e: Exception) {
            Log.d(TAG, "Lock state check failed (will retry): ${e.message}")
        }
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

        // SETUP COMPLETE (PROTECTED mode): Show warning for Settings, allow all other apps
        if (setupComplete) {
            val isSettingsApp = packageName == "com.android.settings" ||
                                packageName == "com.samsung.android.settings" ||
                                packageName.contains("settings")

            if (isSettingsApp) {
                mainHandler.post {
                    Toast.makeText(
                        applicationContext,
                        "Warning: Disabling app permissions may trigger security measures.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }

            return
        }

        // DURING SETUP: Allow everything
        return
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
        lockCheckRunnable?.let { checkHandler.removeCallbacks(it) }
        Log.d(TAG, "Accessibility service destroyed")
    }
}
