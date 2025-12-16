const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withDeviceAdmin(config) {
  // Add Device Admin Receiver to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Add Device Admin Receiver
    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }

    const application = androidManifest.application[0];

    if (!application.receiver) {
      application.receiver = [];
    }

    // Check if receiver already exists
    const receiverExists = application.receiver.some(
      receiver => receiver.$?.['android:name'] === 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver'
    );

    if (!receiverExists) {
      application.receiver.push({
        $: {
          'android:name': 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver',
          'android:label': '@string/app_name',
          'android:description': '@string/app_name',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.app.device_admin',
              'android:resource': '@xml/device_admin',
            },
          },
        ],
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED',
                },
              },
            ],
          },
        ],
      });
    }

    // Add TamperDetectionService
    if (!application.service) {
      application.service = [];
    }
    
    const serviceExists = application.service.some(
      service => service.$?.['android:name'] === 'com.eamilock.TamperDetectionService'
    );
    
    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': 'com.eamilock.TamperDetectionService',
          'android:enabled': 'true',
          'android:exported': 'false',
        },
      });
    }

    // Add Boot Receiver for TamperDetectionService
    const bootReceiverExists = application.receiver.some(
      receiver => receiver.$?.['android:name'] === 'com.eamilock.TamperDetectionService$BootReceiver'
    );

    if (!bootReceiverExists) {
      application.receiver.push({
        $: {
          'android:name': 'com.eamilock.TamperDetectionService$BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.intent.action.BOOT_COMPLETED',
                },
              },
            ],
          },
        ],
      });
    }

    // Add required permissions
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
    ];

    permissions.forEach(perm => {
      const exists = androidManifest['uses-permission'].some(
        p => p.$['android:name'] === perm
      );
      if (!exists) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    return config;
  });

  // Add native files and device_admin.xml resource
  config = withDangerousMod(config, ['android', async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    
    // Create res/xml directory and device_admin.xml
    const resXmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(resXmlDir, { recursive: true });
    
    const deviceAdminXml = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <limit-password />
        <watch-login />
        <reset-password />
        <force-lock />
        <wipe-data />
        <expire-password />
        <encrypted-storage />
        <disable-camera />
    </uses-policies>
</device-admin>`;
    
    fs.writeFileSync(path.join(resXmlDir, 'device_admin.xml'), deviceAdminXml);

    // Create java directory for native modules
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'eamilock');
    fs.mkdirSync(javaDir, { recursive: true });

    // Write DeviceAdminModule.java
    const deviceAdminModule = `package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class DeviceAdminModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private DevicePolicyManager dpm;
    private ComponentName adminComponent;

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.dpm = (DevicePolicyManager) reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
        this.adminComponent = new ComponentName(reactContext, MyDeviceAdminReceiver.class);
    }

    @Override
    public String getName() {
        return "DeviceAdmin";
    }

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            boolean isActive = dpm.isAdminActive(adminComponent);
            promise.resolve(isActive);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            if (!dpm.isAdminActive(adminComponent)) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                    "Enable device admin to protect your device and EMI payment.");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
                promise.resolve("requested");
            } else {
                promise.resolve("already_active");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow();
                promise.resolve("locked");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void disableOtherApps(boolean disable, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(disable ? "apps_restricted" : "apps_enabled");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void resetPassword(String newPassword, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    boolean result = dpm.resetPassword(newPassword, 0);
                    promise.resolve(result ? "password_set" : "failed");
                } else {
                    promise.resolve("not_supported_on_this_android_version");
                }
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, TamperDetectionService.class);
            reactContext.startService(serviceIntent);
            promise.resolve("tamper_detection_started");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, TamperDetectionService.class);
            reactContext.stopService(serviceIntent);
            promise.resolve("tamper_detection_stopped");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void preventUninstall(boolean prevent, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(prevent ? "uninstall_blocked" : "uninstall_allowed");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void allowUninstall(Promise promise) {
        try {
            reactContext.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", true)
                   .apply();
            promise.resolve("uninstall_allowed");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isUninstallAllowed(Promise promise) {
        try {
            boolean allowed = reactContext.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                                         .getBoolean("allow_uninstall", false);
            promise.resolve(allowed);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // Inner class for Device Admin Receiver
    public static class MyDeviceAdminReceiver extends DeviceAdminReceiver {
        @Override
        public void onEnabled(Context context, Intent intent) {
            super.onEnabled(context, intent);
            context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", false)
                   .apply();
        }

        @Override
        public CharSequence onDisableRequested(Context context, Intent intent) {
            boolean allowed = context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                                     .getBoolean("allow_uninstall", false);
            
            if (allowed) {
                return "Device admin will be disabled.";
            } else {
                return "CANNOT DISABLE - This device is protected by EMI payment system. Contact your administrator.";
            }
        }

        @Override
        public void onDisabled(Context context, Intent intent) {
            super.onDisabled(context, intent);
            context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", false)
                   .apply();
        }
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'DeviceAdminModule.java'), deviceAdminModule);

    // Write DeviceAdminPackage.java
    const deviceAdminPackage = `package com.eamilock;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class DeviceAdminPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new DeviceAdminModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'DeviceAdminPackage.java'), deviceAdminPackage);

    // Write TamperDetectionService.java
    const tamperService = `package com.eamilock;

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
    private PowerManager powerManager;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Tamper Detection Service Created");
        powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
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
                
                if (Intent.ACTION_SHUTDOWN.equals(action) || Intent.ACTION_REBOOT.equals(action)) {
                    sendEventToReactNative(action.equals(Intent.ACTION_SHUTDOWN) ? "SHUTDOWN_ATTEMPT" : "REBOOT_ATTEMPT");
                }
            }
        };
        
        registerReceiver(screenReceiver, filter);
    }

    private void sendEventToReactNative(String eventType) {
        Intent intent = new Intent("com.eamilock.TAMPER_EVENT");
        intent.putExtra("eventType", eventType);
        intent.putExtra("timestamp", System.currentTimeMillis());
        sendBroadcast(intent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Service started");
        return START_STICKY;
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
}`;
    
    fs.writeFileSync(path.join(javaDir, 'TamperDetectionService.java'), tamperService);

    return config;
  }]);

  return config;
}

module.exports = withDeviceAdmin;
