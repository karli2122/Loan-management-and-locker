const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

function ensurePermission(manifest, permission) {
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }
  const exists = manifest['uses-permission'].some(
    (item) => item.$?.['android:name'] === permission
  );
  if (!exists) {
    manifest['uses-permission'].push({
      $: { 'android:name': permission },
    });
  }
}

function ensureArray(target, key) {
  if (!target[key]) {
    target[key] = [];
  }
}

function ensureComponent(list, name, factory) {
  const exists = list.some((entry) => entry.$?.['android:name'] === name);
  if (!exists) {
    list.push(factory());
  }
}

const FILES = [
  {
    name: 'DeviceAdminModule.java',
    content: `package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class DeviceAdminModule extends ReactContextBaseJavaModule {
    private static final String TAG = "DeviceAdminModule";
    static final String PREFS_NAME = "EMILockPrefs";
    static final String KEY_ALLOW_UNINSTALL = "allow_uninstall";

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "DeviceAdmin";
    }

    private Context getContext() {
        return getReactApplicationContext();
    }

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
            promise.resolve(dpm.isAdminActive(adminComponent));
        } catch (Exception e) {
            Log.e(TAG, "isDeviceAdminActive failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (!dpm.isAdminActive(adminComponent)) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Enable device admin to protect your device and EMI payment.");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                promise.resolve("requested");
                return;
            }
            promise.resolve("already_active");
        } catch (SecurityException e) {
            Log.e(TAG, "requestDeviceAdmin security failure", e);
            promise.resolve("security_error");
        } catch (Exception e) {
            Log.e(TAG, "requestDeviceAdmin failed", e);
            promise.resolve("error_request_admin");
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow();
                promise.resolve("locked");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void disableOtherApps(boolean disable, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(disable ? "apps_restricted" : "apps_enabled");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resetPassword(String newPassword, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    boolean result = dpm.resetPassword(newPassword, 0);
                    promise.resolve(result ? "password_set" : "failed");
                } else {
                    promise.resolve("not_supported_on_this_android_version");
                }
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void startTamperDetection(Promise promise) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, TamperDetectionService.class);
            context.startService(serviceIntent);
            promise.resolve("tamper_detection_started");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopTamperDetection(Promise promise) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, TamperDetectionService.class);
            context.stopService(serviceIntent);
            promise.resolve("tamper_detection_stopped");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void preventUninstall(boolean prevent, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(prevent ? "uninstall_blocked" : "uninstall_allowed");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void allowUninstall(Promise promise) {
        try {
            Context context = getContext();
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_ALLOW_UNINSTALL, true)
                    .apply();
            promise.resolve("uninstall_allowed");
        } catch (Exception e) {
            Log.e(TAG, "allowUninstall failed", e);
            promise.resolve("error_allow_uninstall");
        }
    }

    @ReactMethod
    public void isUninstallAllowed(Promise promise) {
        try {
            Context context = getContext();
            promise.resolve(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(KEY_ALLOW_UNINSTALL, false));
        } catch (Exception e) {
            Log.e(TAG, "isUninstallAllowed failed", e);
            promise.resolve(false);
        }
    }

    public static class MyDeviceAdminReceiver extends DeviceAdminReceiver {
        @Override
        public void onEnabled(Context context, Intent intent) {
            super.onEnabled(context, intent);
            context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false)
                    .apply();
        }

        @Override
        public CharSequence onDisableRequested(Context context, Intent intent) {
            boolean allowed = context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false);

            if (allowed) {
                return "Device admin will be disabled.";
            } else {
                return "❌ CANNOT DISABLE\\n\\n" +
                        "This device is protected by EMI payment system.\\n\\n" +
                        "To uninstall this app, contact your administrator.\\n\\n" +
                        "Administrator must remove this device from the admin panel first.";
            }
        }

        @Override
        public void onDisabled(Context context, Intent intent) {
            super.onDisabled(context, intent);
            context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false)
                    .apply();
        }
    }
}
`,
  },
  {
    name: 'DeviceAdminPackage.java',
    content: `package com.eamilock;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class DeviceAdminPackage implements ReactPackage {
    @NonNull
    @Override
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new DeviceAdminModule(reactContext));
        return modules;
    }

    @NonNull
    @Override
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`,
  },
  {
    name: 'TamperDetectionService.java',
    content: `package com.eamilock;

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
}
`,
  },
];

module.exports = function withDeviceAdmin(config) {
  config = withDangerousMod(config, 'android', (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'eamilock');
    fs.mkdirSync(javaDir, { recursive: true });

    FILES.forEach(({ name, content }) => {
      const target = path.join(javaDir, name);
      if (!fs.existsSync(target)) {
        fs.writeFileSync(target, content);
      }
    });

    return config;
  });

  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }

    const application = androidManifest.application[0];

    ensureArray(application, 'receiver');
    ensureArray(application, 'service');

    ensurePermission(androidManifest, 'android.permission.RECEIVE_BOOT_COMPLETED');
    ensurePermission(androidManifest, 'android.permission.FOREGROUND_SERVICE');

    ensureComponent(application.receiver, 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver', () => ({
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
    }));

    ensureComponent(application.service, 'com.eamilock.TamperDetectionService', () => ({
      $: {
        'android:name': 'com.eamilock.TamperDetectionService',
        'android:exported': 'false',
      },
    }));

    ensureComponent(application.receiver, 'com.eamilock.TamperDetectionService$BootReceiver', () => ({
      $: {
        'android:name': 'com.eamilock.TamperDetectionService$BootReceiver',
        'android:exported': 'true',
        'android:enabled': 'true',
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
    }));

    return config;
  });
};
