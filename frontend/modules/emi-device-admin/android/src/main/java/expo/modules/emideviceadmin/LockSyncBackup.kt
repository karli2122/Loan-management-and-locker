package expo.modules.emideviceadmin

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * Backups for the lock-state poll. The foreground service's own timer is not reliable under
 * Doze / battery saver (the CPU sleeps and the network is blocked), which could leave a phone
 * showing the lock screen after the lender unlocked it. Two independent wake-ups re-check the
 * server and restart the service if the system killed it:
 *  - AlarmManager (setExactAndAllowWhileIdle / setAndAllowWhileIdle), re-armed after each run
 *  - JobScheduler periodic job (the platform engine behind WorkManager; survives reboot)
 * Both only read the lock state (same one-directional rules as [LockSync]).
 */
object LockSyncBackup {
    private const val TAG = "EMILockSyncBackup"
    const val ACTION_ALARM = "expo.modules.emideviceadmin.ACTION_LOCK_SYNC_ALARM"
    private const val ALARM_REQUEST = 3001
    private const val JOB_ID = 3002
    const val ALARM_LOCKED_MS = 60_000L
    const val ALARM_UNLOCKED_MS = 5 * 60_000L

    private fun needed(context: Context): Boolean {
        val p = LockSync.prefs(context)
        return !p.getString(LockSync.KEY_CLIENT_ID, null).isNullOrEmpty() &&
            !p.getBoolean("uninstall_allowed", false)
    }

    private fun alarmIntent(context: Context): PendingIntent {
        val intent = Intent(context, EMILockSyncAlarmReceiver::class.java).apply { action = ACTION_ALARM }
        return PendingIntent.getBroadcast(
            context, ALARM_REQUEST, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** Arm the next backup alarm (replaces any pending one). */
    fun scheduleAlarm(context: Context, delayMs: Long? = null) {
        val app = context.applicationContext
        try {
            if (!needed(app)) { cancelAll(app); return }
            val locked = LockSync.prefs(app).getBoolean(LockSync.KEY_LOCKED, false)
            val delay = delayMs ?: if (locked) ALARM_LOCKED_MS else ALARM_UNLOCKED_MS
            val am = app.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val at = System.currentTimeMillis() + delay
            val pi = alarmIntent(app)
            val exact = try {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
            } catch (_: Exception) { false }
            try {
                if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } catch (e: Exception) {
                Log.w(TAG, "exact alarm refused, using inexact: ${e.message}")
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        } catch (e: Exception) {
            Log.e(TAG, "scheduleAlarm failed: ${e.message}")
        }
    }

    /** Periodic JobScheduler backup (15 min is the platform minimum). Idempotent. */
    fun scheduleJob(context: Context) {
        val app = context.applicationContext
        try {
            if (!needed(app)) return
            val js = app.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
            if (js.allPendingJobs.any { it.id == JOB_ID }) return
            val info = JobInfo.Builder(JOB_ID, ComponentName(app, EMILockSyncJobService::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60_000L)
                .setPersisted(true)
                .build()
            val r = js.schedule(info)
            Log.d(TAG, "periodic job scheduled: ${if (r == JobScheduler.RESULT_SUCCESS) "ok" else "refused"}")
        } catch (e: Exception) {
            Log.e(TAG, "scheduleJob failed: ${e.message}")
        }
    }

    fun cancelAll(context: Context) {
        val app = context.applicationContext
        try { (app.getSystemService(Context.ALARM_SERVICE) as? AlarmManager)?.cancel(alarmIntent(app)) } catch (_: Exception) {}
        try { (app.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler)?.cancel(JOB_ID) } catch (_: Exception) {}
    }

    /**
     * One backup run: re-check the server, re-apply a due tamper lock, make sure the foreground
     * service is alive. Blocking — call off the main thread. Holds a short wake lock.
     */
    fun runOnce(context: Context, source: String) {
        val app = context.applicationContext
        var wl: PowerManager.WakeLock? = null
        try {
            wl = (app.getSystemService(Context.POWER_SERVICE) as? PowerManager)
                ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "emi:locksync-backup")
            wl?.acquire(30_000L)
        } catch (_: Exception) {}
        try {
            if (!needed(app)) { cancelAll(app); return }
            val ok = LockSync.check(app)
            try { LockSync.enforceTamperIfDue(app) } catch (e: Exception) { Log.w(TAG, "tamper enforce error: ${e.message}") }
            if (!EMILockSyncService.isRunning && !EMIAccessibilityService.isRunning) {
                Log.w(TAG, "[$source] lock-sync service was down — restarting (${EMILockSyncService.start(app)})")
            }
            Log.d(TAG, "[$source] backup check done (server reachable=$ok)")
        } catch (e: Exception) {
            Log.e(TAG, "[$source] backup run failed: ${e.message}")
        } finally {
            try { if (wl?.isHeld == true) wl.release() } catch (_: Exception) {}
        }
    }
}

/** AlarmManager backup: runs a check and re-arms itself. */
class EMILockSyncAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val app = context.applicationContext
        val pending = goAsync()
        Thread {
            try {
                LockSyncBackup.runOnce(app, "alarm")
            } finally {
                LockSyncBackup.scheduleAlarm(app)
                LockSyncBackup.scheduleJob(app)
                pending.finish()
            }
        }.start()
    }
}

/** JobScheduler backup (periodic, persisted across reboot). */
class EMILockSyncJobService : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        Thread {
            try {
                LockSyncBackup.runOnce(applicationContext, "job")
                LockSyncBackup.scheduleAlarm(applicationContext)
            } finally {
                try { jobFinished(params, false) } catch (_: Exception) {}
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true
}
