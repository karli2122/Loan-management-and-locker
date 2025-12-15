const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withDeviceOwner(config) {
  // Add Device Admin Receiver to AndroidManifest.xml
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    
    // Get the application node
    const application = manifest.application[0];
    
    // Add the DeviceAdminReceiver
    if (!application.receiver) {
      application.receiver = [];
    }
    
    // Check if already added
    const receiverClass = '.EmiDeviceAdminReceiver';
    const hasReceiver = application.receiver.some(
      r => r.$['android:name'] === receiverClass
    );
    
    if (!hasReceiver) {
      application.receiver.push({
        $: {
          'android:name': receiverClass,
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [{
          $: {
            'android:name': 'android.app.device_admin',
            'android:resource': '@xml/device_admin',
          },
        }],
        'intent-filter': [{
          action: [{
            $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' },
          }],
        }],
      });
    }
    
    // Add required permissions
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.BIND_DEVICE_ADMIN',
      'android.permission.REQUEST_DELETE_PACKAGES',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ];
    
    permissions.forEach(perm => {
      const exists = manifest['uses-permission'].some(
        p => p.$['android:name'] === perm
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });
    
    // Add boot receiver
    const hasBootReceiver = application.receiver.some(
      r => r.$['android:name'] === '.BootReceiver'
    );
    
    if (!hasBootReceiver) {
      application.receiver.push({
        $: {
          'android:name': '.BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [{
          action: [{
            $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' },
          }],
        }],
      });
    }
    
    return config;
  });
  
  // Add native Java files and resources
  config = withDangerousMod(config, ['android', async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const packageName = config.android?.package || 'com.emi.client';
    const packagePath = packageName.replace(/\./g, '/');
    
    // Create directories
    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...packagePath.split('/'));
    const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');
    
    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(resDir, { recursive: true });
    
    // Write device_admin.xml
    const deviceAdminXml = `<?xml version="1.0" encoding="utf-8"?>
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <limit-password />
        <watch-login />
        <reset-password />
        <force-lock />
        <wipe-data />
        <disable-camera />
        <disable-keyguard-features />
    </uses-policies>
</device-admin>`;
    
    fs.writeFileSync(path.join(resDir, 'device_admin.xml'), deviceAdminXml);
    
    // Write DeviceAdminReceiver.java
    const deviceAdminReceiver = `package ${packageName};

import android.content.Context;
import android.content.Intent;
import android.widget.Toast;

public class EmiDeviceAdminReceiver extends android.app.admin.DeviceAdminReceiver {
    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "EMI kaitse on aktiivne. Desaktiveerimine pole lubatud.";
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'EmiDeviceAdminReceiver.java'), deviceAdminReceiver);
    
    // Write BootReceiver.java
    const bootReceiver = `package ${packageName};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // Start the app on boot if device is locked
            SharedPreferences prefs = context.getSharedPreferences("EMILock", Context.MODE_PRIVATE);
            boolean isLocked = prefs.getBoolean("is_locked", false);
            
            if (isLocked) {
                Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launchIntent);
                }
            }
        }
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'BootReceiver.java'), bootReceiver);
    
    // Write DevicePolicyModule.java (Native Module)
    const devicePolicyModule = `package ${packageName};

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.app.Activity;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class DevicePolicyModule extends ReactContextBaseJavaModule {
    private static final int REQUEST_CODE_ENABLE_ADMIN = 1;
    private DevicePolicyManager devicePolicyManager;
    private ComponentName componentName;
    private ReactApplicationContext reactContext;

    public DevicePolicyModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.devicePolicyManager = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        this.componentName = new ComponentName(context, EmiDeviceAdminReceiver.class);
    }

    @Override
    public String getName() {
        return "DevicePolicyModule";
    }

    @ReactMethod
    public void isDeviceOwner(Promise promise) {
        try {
            boolean isOwner = devicePolicyManager.isDeviceOwnerApp(reactContext.getPackageName());
            promise.resolve(isOwner);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isAdminActive(Promise promise) {
        try {
            boolean isActive = devicePolicyManager.isAdminActive(componentName);
            promise.resolve(isActive);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void requestAdmin(Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, componentName);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "EMI kaitse vajab administraatori õigusi seadme lukustamiseks.");
                activity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN);
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "No activity");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            if (devicePolicyManager.isAdminActive(componentName)) {
                devicePolicyManager.lockNow();
                setLockState(true);
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "Admin not active");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void setKioskMode(boolean enable, Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null && devicePolicyManager.isDeviceOwnerApp(reactContext.getPackageName())) {
                if (enable) {
                    // Set as lock task package
                    devicePolicyManager.setLockTaskPackages(componentName, new String[]{reactContext.getPackageName()});
                    activity.startLockTask();
                } else {
                    activity.stopLockTask();
                }
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "Not device owner or no activity");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void disableUninstall(boolean disable, Promise promise) {
        try {
            if (devicePolicyManager.isDeviceOwnerApp(reactContext.getPackageName())) {
                devicePolicyManager.setUninstallBlocked(componentName, reactContext.getPackageName(), disable);
                promise.resolve(true);
            } else {
                promise.reject("ERROR", "Not device owner");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getDeviceInfo(Promise promise) {
        try {
            WritableMap info = Arguments.createMap();
            info.putBoolean("isDeviceOwner", devicePolicyManager.isDeviceOwnerApp(reactContext.getPackageName()));
            info.putBoolean("isAdminActive", devicePolicyManager.isAdminActive(componentName));
            info.putString("packageName", reactContext.getPackageName());
            promise.resolve(info);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    private void setLockState(boolean locked) {
        SharedPreferences prefs = reactContext.getSharedPreferences("EMILock", Context.MODE_PRIVATE);
        prefs.edit().putBoolean("is_locked", locked).apply();
    }

    @ReactMethod
    public void setLockState(boolean locked, Promise promise) {
        try {
            setLockState(locked);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'DevicePolicyModule.java'), devicePolicyModule);
    
    // Write DevicePolicyPackage.java
    const devicePolicyPackage = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class DevicePolicyPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new DevicePolicyModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}`;
    
    fs.writeFileSync(path.join(javaDir, 'DevicePolicyPackage.java'), devicePolicyPackage);
    
    return config;
  }]);
  
  return config;
}

module.exports = withDeviceOwner;
