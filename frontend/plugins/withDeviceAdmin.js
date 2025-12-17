const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withDeviceAdmin(config) {
  // Get the package name from config
  const packageName = config.android?.package || 'com.emi.client';
  
  // Add Device Admin Receiver to AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }

    const application = androidManifest.application[0];

    if (!application.receiver) {
      application.receiver = [];
    }

    // Add Device Admin Receiver
    const receiverExists = application.receiver.some(
      receiver => receiver.$?.['android:name'] === '.EMIDeviceAdminReceiver'
    );

    if (!receiverExists) {
      application.receiver.push({
        $: {
          'android:name': '.EMIDeviceAdminReceiver',
          'android:label': 'EMI Device Admin',
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

    // Add required permissions
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.BIND_DEVICE_ADMIN',
    ];

    permissions.forEach(perm => {
      const exists = androidManifest['uses-permission'].some(
        p => p.$?.['android:name'] === perm
      );
      if (!exists) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    });

    return config;
  });

  // Add native files
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const pkgName = config.android?.package || 'com.emi.client';
      const pkgPath = pkgName.replace(/\./g, '/');
      
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

      // Create java directory
      const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...pkgPath.split('/'));
      fs.mkdirSync(javaDir, { recursive: true });

      // Write EMIDeviceAdminReceiver.java
      const receiverCode = `package ${pkgName};

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class EMIDeviceAdminReceiver extends DeviceAdminReceiver {
    private static final String TAG = "EMIDeviceAdmin";

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.d(TAG, "Device Admin ENABLED");
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Log.d(TAG, "Device Admin DISABLED");
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        Log.d(TAG, "Device Admin disable requested");
        return "WARNING: Disabling device admin will remove EMI payment protection. Contact your administrator if you need to uninstall this app.";
    }
}`;
      
      fs.writeFileSync(path.join(javaDir, 'EMIDeviceAdminReceiver.java'), receiverCode);

      // Write EMIDeviceAdminModule.java - the React Native bridge module
      const moduleCode = `package ${pkgName};

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class EMIDeviceAdminModule extends ReactContextBaseJavaModule {
    private static final String TAG = "EMIDeviceAdminModule";
    private static final int REQUEST_CODE_ENABLE_ADMIN = 1001;
    
    private final ReactApplicationContext reactContext;
    private final DevicePolicyManager dpm;
    private final ComponentName adminComponent;

    public EMIDeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.dpm = (DevicePolicyManager) reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
        this.adminComponent = new ComponentName(reactContext, EMIDeviceAdminReceiver.class);
        Log.d(TAG, "Module initialized. Admin component: " + adminComponent.flattenToString());
    }

    @Override
    public String getName() {
        return "EMIDeviceAdmin";
    }

    @ReactMethod
    public void isAdminActive(Promise promise) {
        try {
            boolean isActive = dpm.isAdminActive(adminComponent);
            Log.d(TAG, "isAdminActive: " + isActive);
            promise.resolve(isActive);
        } catch (Exception e) {
            Log.e(TAG, "isAdminActive error: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestAdmin(Promise promise) {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null) {
                Log.e(TAG, "requestAdmin: No activity");
                promise.reject("NO_ACTIVITY", "No activity available");
                return;
            }

            if (dpm.isAdminActive(adminComponent)) {
                Log.d(TAG, "requestAdmin: Already active");
                promise.resolve("already_active");
                return;
            }

            Log.d(TAG, "requestAdmin: Starting admin request activity");
            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                "EMI Lock requires Device Admin permissions to:\\n" +
                "• Lock your device when payment is overdue\\n" +
                "• Prevent unauthorized app removal\\n" +
                "• Protect your device investment");
            activity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN);
            promise.resolve("requested");
        } catch (Exception e) {
            Log.e(TAG, "requestAdmin error: " + e.getMessage());
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            if (!dpm.isAdminActive(adminComponent)) {
                Log.e(TAG, "lockDevice: Admin not active");
                promise.reject("NOT_ADMIN", "Device Admin not active");
                return;
            }
            Log.d(TAG, "lockDevice: Locking now");
            dpm.lockNow();
            promise.resolve("locked");
        } catch (Exception e) {
            Log.e(TAG, "lockDevice error: " + e.getMessage());
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isDeviceOwner(Promise promise) {
        try {
            boolean isOwner = dpm.isDeviceOwnerApp(reactContext.getPackageName());
            Log.d(TAG, "isDeviceOwner: " + isOwner);
            promise.resolve(isOwner);
        } catch (Exception e) {
            Log.e(TAG, "isDeviceOwner error: " + e.getMessage());
            promise.resolve(false);
        }
    }
}`;
      
      fs.writeFileSync(path.join(javaDir, 'EMIDeviceAdminModule.java'), moduleCode);

      // Write EMIDeviceAdminPackage.java
      const packageCode = `package ${pkgName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class EMIDeviceAdminPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new EMIDeviceAdminModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}`;
      
      fs.writeFileSync(path.join(javaDir, 'EMIDeviceAdminPackage.java'), packageCode);

      return config;
    },
  ]);

  // Register the package in MainApplication
  config = withMainApplication(config, (config) => {
    const mainApplication = config.modResults;
    const pkgName = config.android?.package || 'com.emi.client';
    const isKotlin = mainApplication.language === 'kt' || mainApplication.contents.includes('fun ');
    
    console.log('withDeviceAdmin: MainApplication language:', isKotlin ? 'Kotlin' : 'Java');
    
    // First, remove any old/conflicting package references
    mainApplication.contents = mainApplication.contents.replace(/import\s+[\w.]+\.DevicePolicyPackage\n?/g, '');
    mainApplication.contents = mainApplication.contents.replace(/import\s+[\w.]+\.DeviceAdminPackage\n?/g, '');
    
    // Add import for EMIDeviceAdminPackage
    const importStatement = `import ${pkgName}.EMIDeviceAdminPackage`;
    
    if (!mainApplication.contents.includes('EMIDeviceAdminPackage')) {
      // Find where to add the import - after the package declaration
      const packageIndex = mainApplication.contents.indexOf('package ');
      const packageEndIndex = mainApplication.contents.indexOf('\n', packageIndex);
      
      if (packageEndIndex !== -1) {
        mainApplication.contents = 
          mainApplication.contents.substring(0, packageEndIndex + 1) + 
          '\n' + importStatement + '\n' +
          mainApplication.contents.substring(packageEndIndex + 1);
      }
      
      if (isKotlin) {
        // Kotlin: Look for override fun getPackages() or the PackageList usage
        // In newer Expo, packages are returned from PackageList(this).packages
        
        // Try to find where packages are created and add our package
        // Look for "PackageList(this).packages" pattern
        if (mainApplication.contents.includes('PackageList(this).packages')) {
          // Replace PackageList(this).packages with our package added
          mainApplication.contents = mainApplication.contents.replace(
            /PackageList\(this\)\.packages/g,
            'PackageList(this).packages.apply { add(EMIDeviceAdminPackage()) }'
          );
        } else if (mainApplication.contents.includes('override val reactNativeHost')) {
          // New architecture - add to the packages list
          const packagesMatch = mainApplication.contents.match(/packages\s*=\s*PackageList\([^)]+\)\.packages/);
          if (packagesMatch) {
            mainApplication.contents = mainApplication.contents.replace(
              packagesMatch[0],
              packagesMatch[0] + '.apply { add(EMIDeviceAdminPackage()) }'
            );
          }
        }
      } else {
        // Java: Add to getPackages method
        const getPackagesMatch = mainApplication.contents.match(/protected\s+List<ReactPackage>\s+getPackages\(\)\s*\{[\s\S]*?return\s+packages;/);
        
        if (getPackagesMatch) {
          const matchText = getPackagesMatch[0];
          const insertPoint = matchText.lastIndexOf('return packages;');
          const newMatchText = 
            matchText.substring(0, insertPoint) + 
            'packages.add(new EMIDeviceAdminPackage());\n      ' +
            matchText.substring(insertPoint);
          
          mainApplication.contents = mainApplication.contents.replace(matchText, newMatchText);
        }
      }
    }
    
    console.log('withDeviceAdmin: MainApplication updated');
    
    return config;
  });

  return config;
}

module.exports = withDeviceAdmin;
