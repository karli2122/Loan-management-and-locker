package expo.modules.emideviceadmin

import android.content.Context
import android.util.Log

/**
 * Local tamper lock (replaces the old factory wipe).
 *
 * When protection permissions are revoked and not restored within the grace period,
 * the JS app engages a full local lock and sets [KEY_ACTIVE]. The native lock sync and
 * the accessibility service must then NOT clear the lock just because the server says
 * "unlocked" (the server does not know about the tamper).
 *
 * The lock is released when:
 *  - the borrower re-grants the permissions (JS calls set(false)),
 *  - the lender releases the device (uninstall_allowed / deleted), or
 *  - the lender locks and then unlocks the device from the admin app (server lock seen,
 *    followed by server unlocked) — a remote release that works on the legacy API.
 *
 * A short "fix window" lets the borrower open Android Settings to re-grant permissions
 * without the overlay / kiosk fighting them. When it expires the lock is re-applied.
 */
object TamperLock {
    private const val TAG = "EMITamperLock"
    const val KEY_ACTIVE = "tamper_lock_active"
    const val KEY_REASON = "tamper_lock_reason"
    const val KEY_FIX_UNTIL = "tamper_fix_until"
    const val KEY_SERVER_LOCK_SEEN = "tamper_server_lock_seen"
    const val KEY_SINCE = "tamper_lock_since"

    private fun prefs(context: Context) = LockSync.prefs(context)

    fun isActive(context: Context): Boolean = prefs(context).getBoolean(KEY_ACTIVE, false)

    fun fixUntil(context: Context): Long = prefs(context).getLong(KEY_FIX_UNTIL, 0L)

    fun inFixWindow(context: Context): Boolean =
        isActive(context) && System.currentTimeMillis() < fixUntil(context)

    /** True when the device must stay fully locked because of tampering. */
    fun shouldHoldLock(context: Context): Boolean = isActive(context) && !inFixWindow(context)

    fun set(context: Context, active: Boolean, reason: String) {
        val e = prefs(context).edit()
        if (active) {
            if (!isActive(context)) e.putLong(KEY_SINCE, System.currentTimeMillis())
            e.putBoolean(KEY_ACTIVE, true)
                .putString(KEY_REASON, reason)
                .putLong(KEY_FIX_UNTIL, 0L)
                .putBoolean(KEY_SERVER_LOCK_SEEN, false)
        } else {
            e.putBoolean(KEY_ACTIVE, false)
                .remove(KEY_REASON)
                .remove(KEY_FIX_UNTIL)
                .remove(KEY_SERVER_LOCK_SEEN)
                .remove(KEY_SINCE)
        }
        e.commit()
        Log.d(TAG, "tamper lock active=$active reason=$reason")
    }

    fun setFixWindow(context: Context, untilMs: Long) {
        prefs(context).edit().putLong(KEY_FIX_UNTIL, untilMs).commit()
    }

    /**
     * Feed the latest server state. Returns whether the tamper lock is still active.
     * @param serverLocked the server currently holds a (non-warning) lock
     * @param released the lender released the device (uninstall allowed / client deleted)
     */
    fun onServerState(context: Context, serverLocked: Boolean, released: Boolean): Boolean {
        if (!isActive(context)) return false
        if (released) {
            set(context, false, "released_by_lender")
            return false
        }
        val p = prefs(context)
        if (serverLocked) {
            if (!p.getBoolean(KEY_SERVER_LOCK_SEEN, false)) {
                p.edit().putBoolean(KEY_SERVER_LOCK_SEEN, true).commit()
            }
            return true
        }
        if (p.getBoolean(KEY_SERVER_LOCK_SEEN, false)) {
            // Lender locked and then unlocked: explicit remote release.
            set(context, false, "lender_unlock")
            return false
        }
        return true
    }

    fun state(context: Context): Map<String, Any?> {
        val p = prefs(context)
        return mapOf(
            "active" to isActive(context),
            "inFixWindow" to inFixWindow(context),
            "fixUntil" to fixUntil(context).toDouble(),
            "reason" to (p.getString(KEY_REASON, "") ?: ""),
            "serverLockSeen" to p.getBoolean(KEY_SERVER_LOCK_SEEN, false),
            "since" to p.getLong(KEY_SINCE, 0L).toDouble(),
        )
    }
}
