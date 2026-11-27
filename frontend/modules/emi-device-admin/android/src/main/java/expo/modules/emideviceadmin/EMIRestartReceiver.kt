package expo.modules.emideviceadmin

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Auto-restart receiver - Triggered by AlarmManager to restart the app
 * and its protection services if they were killed while the device was locked.
 */
class EMIRestartReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EMIRestartReceiver"
        private const val PREFS_NAME = "emi_device_admin_prefs"
        private const val KEY_LOCKED = "is_locked"
        const val ACTION_RESTART = "expo.modules.emideviceadmin.ACTION_RESTART"

        fun scheduleRestart(context: Context, delayMs: Long = 3000) {
            try {
                val intent = Intent(context, EMIRestartReceiver::class.java).apply {
                    action = ACTION_RESTART
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context, 2001, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                    ?: return
                val triggerAt = System.currentTimeMillis() + delayMs
                val exactAllowed = try {
                    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
                } catch (_: Exception) {
                    false
                }
                try {
                    if (exactAllowed) {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                    } else {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "exact alarm failed, falling back: ${e.message}")
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
                }
                Log.d(TAG, "Restart alarm scheduled in ${delayMs}ms (exact=$exactAllowed)")
            } catch (e: Exception) {
                Log.e(TAG, "scheduleRestart error: ${e.message}")
            }
        }

        fun cancelRestart(context: Context) {
            try {
                val intent = Intent(context, EMIRestartReceiver::class.java).apply {
                    action = ACTION_RESTART
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context, 2001, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                am?.cancel(pendingIntent)
                Log.d(TAG, "Restart alarm cancelled")
            } catch (e: Exception) {
                Log.e(TAG, "cancelRestart error: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        Log.d(TAG, "Restart receiver triggered: ${intent?.action}")

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val isLocked = prefs.getBoolean(KEY_LOCKED, false)

        if (!isLocked) {
            Log.d(TAG, "Device not locked — skipping restart")
            return
        }

        try {
            // Restart the main app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                context.startActivity(launchIntent)
                Log.d(TAG, "App restarted")
            }

            // Restart the overlay service
            val overlayIntent = Intent(context, EMIOverlayService::class.java)
            try {
                context.startForegroundService(overlayIntent)
                Log.d(TAG, "Overlay service restarted")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart overlay service: ${e.message}")
            }

            // Restart the foreground monitor
            val monitorIntent = Intent(context, EMIForegroundMonitorService::class.java)
            try {
                context.startForegroundService(monitorIntent)
                Log.d(TAG, "Foreground monitor restarted")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to restart monitor: ${e.message}")
            }

            // Watchdog: tight interval only if a protection service is down.
            // A 5s exact loop is throttled under Doze and burns budget.
            val bothRunning = EMIOverlayService.isRunning && EMIForegroundMonitorService.isRunning
            scheduleRestart(context, if (bothRunning) 120_000 else 10_000)
        } catch (e: Exception) {
            Log.e(TAG, "Restart error: ${e.message}")
        }
    }
}
