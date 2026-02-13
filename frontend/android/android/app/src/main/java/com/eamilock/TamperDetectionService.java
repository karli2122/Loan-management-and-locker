package com.eamilock;

import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

public class TamperDetectionService extends Service {
    private static final String TAG = "TamperDetection";
    private BroadcastReceiver screenReceiver;
    private BroadcastReceiver bootReceiver;
    private PowerManager powerManager;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Tamper Detection Service Created");
        
        powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        
        // Register receivers
        registerScreenReceiver();
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
                    handleScreenOff();
                } else if (Intent.ACTION_SHUTDOWN.equals(action)) {
                    handleShutdownAttempt();
                } else if (Intent.ACTION_REBOOT.equals(action)) {
                    handleRebootAttempt();
                }
            }
        };
        
        registerReceiver(screenReceiver, filter);
    }

    private void handleScreenOff() {
        Log.w(TAG, "Screen turned off - potential tamper attempt");
        // Send event to React Native
        sendEventToReactNative("SCREEN_OFF");
    }

    private void handleShutdownAttempt() {
        Log.w(TAG, "Shutdown attempt detected");
        sendEventToReactNative("SHUTDOWN_ATTEMPT");
    }

    private void handleRebootAttempt() {
        Log.w(TAG, "Reboot attempt detected");
        sendEventToReactNative("REBOOT_ATTEMPT");
    }

    private void sendEventToReactNative(String eventType) {
        // This will be handled by the native module
        Intent intent = new Intent("com.eamilock.TAMPER_EVENT");
        intent.putExtra("eventType", eventType);
        intent.putExtra("timestamp", System.currentTimeMillis());
        sendBroadcast(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service started");
        return START_STICKY; // Restart service if killed
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (screenReceiver != null) {
            unregisterReceiver(screenReceiver);
        }
        Log.d(TAG, "Service destroyed");
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Boot receiver to start service on device boot
    public static class BootReceiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
                Log.d(TAG, "Device booted - starting tamper detection");
                Intent serviceIntent = new Intent(context, TamperDetectionService.class);
                context.startService(serviceIntent);
            }
        }
    }
}
