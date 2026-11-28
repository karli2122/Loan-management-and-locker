package expo.modules.emideviceadmin

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Closes the notification shade / quick settings while the phone is payment-locked.
 *
 * Device Owner: lock task (features NONE) + setStatusBarDisabled already stop the shade.
 * Device Admin (no Device Owner): third-party apps cannot block the status-bar swipe itself,
 * so the shade is closed as soon as it opens:
 *  - Android 12+: AccessibilityService.performGlobalAction(GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
 *  - older: StatusBarManager.collapsePanels (EXPAND_STATUS_BAR), BACK via accessibility as backup
 * Triggers: SystemUI window events (accessibility), lock-overlay / activity focus loss.
 * Never acts when unlocked or during an emergency-call session.
 */
object ShadeGuard {
    private const val TAG = "EMIShadeGuard"
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var lastBurstAt = 0L

    fun shouldGuard(context: Context): Boolean {
        val p = LockSync.prefs(context.applicationContext)
        if (!p.getBoolean(LockSync.KEY_LOCKED, false)) return false
        if (p.getBoolean("uninstall_allowed", false)) return false
        if (EmergencyCallSession.isActive(context)) return false
        return true
    }

    /** Dismiss now and a few times during the shade's open animation. */
    fun dismissBurst(context: Context, reason: String) {
        val app = context.applicationContext
        if (!shouldGuard(app)) return
        val now = System.currentTimeMillis()
        if (now - lastBurstAt < 250L) return
        lastBurstAt = now
        Log.d(TAG, "Closing shade ($reason)")
        for (delay in longArrayOf(0L, 120L, 350L, 800L)) {
            main.postDelayed({ if (shouldGuard(app)) dismissOnce(app) }, delay)
        }
    }

    private fun dismissOnce(app: Context) {
        val svc = EMIAccessibilityService.instance?.get()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && svc != null) {
            try {
                svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
            } catch (e: Exception) {
                Log.w(TAG, "dismiss action failed: ${e.message}")
            }
            return
        }
        // Pre-Android 12: collapsePanels works with EXPAND_STATUS_BAR.
        try {
            @Suppress("WrongConstant")
            val sb = app.getSystemService("statusbar")
            Class.forName("android.app.StatusBarManager").getMethod("collapsePanels").invoke(sb)
        } catch (_: Exception) {
            // Last resort on old versions: BACK closes an open shade.
            try { svc?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK) } catch (_: Exception) {}
        }
    }
}
