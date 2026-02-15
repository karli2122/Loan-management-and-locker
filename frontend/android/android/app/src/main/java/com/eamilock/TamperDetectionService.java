package com.eamilock;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.admin.DevicePolicyManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

public class TamperDetectionService extends Service {
    private static final String TAG = "TamperDetection";
    private static final String CHANNEL_ID = "emi_protection_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final String PREFS_NAME = "EMILockPrefs";
    private static final String KEY_ADMIN_ACTIVE = "admin_active";
    private static final long ADMIN_CHECK_INTERVAL = 10000; // 10 seconds

    private BroadcastReceiver screenReceiver;
    private PowerManager powerManager;
    private Handler adminCheckHandler;
    private Runnable adminCheckRunnable;
    private DevicePolicyManager dpm;
    private ComponentName adminComponent;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Tamper Detection Foreground Service Created");

        powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        adminComponent = new ComponentName(this, EmiDeviceAdminReceiver.class);

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        registerScreenReceiver();
        startAdminMonitoring();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Device Protection",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps your device protected");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        // Intent to open the app when notification is tapped
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        boolean adminActive = dpm.isAdminActive(adminComponent);
        String contentText = adminActive
                ? "Device admin active - protection enabled"
                : "Warning: Device admin not active";

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
                .setContentTitle("Device Protected")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    /**
     * Periodically checks if Device Admin is still active.
     * If disabled, flags it as a tamper attempt and updates the notification.
     */
    private void startAdminMonitoring() {
        adminCheckHandler = new Handler(Looper.getMainLooper());
        adminCheckRunnable = new Runnable() {
            @Override
            public void run() {
                boolean isActive = dpm.isAdminActive(adminComponent);
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                boolean wasActive = prefs.getBoolean(KEY_ADMIN_ACTIVE, false);

                if (wasActive && !isActive) {
                    // Admin was disabled — tamper detected
                    Log.w(TAG, "TAMPER DETECTED: Device Admin was disabled!");
                    prefs.edit()
                            .putBoolean(KEY_ADMIN_ACTIVE, false)
                            .putBoolean("admin_was_disabled", true)
                            .apply();

                    // Broadcast tamper event so React Native can handle it
                    Intent tamperIntent = new Intent("com.eamilock.TAMPER_EVENT");
                    tamperIntent.putExtra("eventType", "ADMIN_DISABLED");
                    tamperIntent.putExtra("timestamp", System.currentTimeMillis());
                    sendBroadcast(tamperIntent);
                } else if (isActive && !wasActive) {
                    // Admin was re-enabled
                    prefs.edit().putBoolean(KEY_ADMIN_ACTIVE, true).apply();
                }

                updateNotification();
                adminCheckHandler.postDelayed(this, ADMIN_CHECK_INTERVAL);
            }
        };
        adminCheckHandler.postDelayed(adminCheckRunnable, ADMIN_CHECK_INTERVAL);
    }

    private void registerScreenReceiver() {
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        filter.addAction(Intent.ACTION_SHUTDOWN);
        filter.addAction(Intent.ACTION_REBOOT);

        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                Log.d(TAG, "Received action: " + action);

                if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                    sendTamperEvent("SCREEN_OFF");
                } else if (Intent.ACTION_SHUTDOWN.equals(action)) {
                    sendTamperEvent("SHUTDOWN_ATTEMPT");
                } else if (Intent.ACTION_REBOOT.equals(action)) {
                    sendTamperEvent("REBOOT_ATTEMPT");
                }
            }
        };

        registerReceiver(screenReceiver, filter);
    }

    private void sendTamperEvent(String eventType) {
        Intent intent = new Intent("com.eamilock.TAMPER_EVENT");
        intent.putExtra("eventType", eventType);
        intent.putExtra("timestamp", System.currentTimeMillis());
        sendBroadcast(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Foreground service started");
        return START_STICKY; // Restart service if killed by OS
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (screenReceiver != null) {
            unregisterReceiver(screenReceiver);
        }
        if (adminCheckHandler != null && adminCheckRunnable != null) {
            adminCheckHandler.removeCallbacks(adminCheckRunnable);
        }
        Log.d(TAG, "Service destroyed — scheduling restart");
        // Try to restart self via broadcast
        Intent restartIntent = new Intent("com.eamilock.RESTART_SERVICE");
        sendBroadcast(restartIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Boot receiver to start foreground service on device boot
    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                    || "com.eamilock.RESTART_SERVICE".equals(action)) {
                Log.d(TAG, "Boot/restart received — starting foreground service");
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                boolean isRegistered = prefs.getBoolean("is_registered", false);
                if (isRegistered) {
                    Intent serviceIntent = new Intent(context, TamperDetectionService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent);
                    } else {
                        context.startService(serviceIntent);
                    }
                }
            }
        }
    }
}
