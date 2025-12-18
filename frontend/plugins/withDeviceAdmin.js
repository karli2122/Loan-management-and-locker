const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Shared preferences name - must match DeviceAdminModule.java PREFS_NAME
const PREFS_NAME = 'EMILockPrefs';

function getPackageName(config) {
  return (
    config?.android?.package ||
    config?.expo?.android?.package ||
    config?.modResults?.android?.package ||
    'com.emi.client'
  );
}

function ensurePermissions(manifest, permissions) {
  if (!manifest['uses-permission']) manifest['uses-permission'] = [];
  permissions.forEach((perm) => {
    const exists = manifest['uses-permission'].some((p) => p.$['android:name'] === perm);
    if (!exists) {
      manifest['uses-permission'].push({ $: { 'android:name': perm } });
    }
  });
}

function withDeviceAdminManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];
    const packageName = getPackageName(config);

    ensurePermissions(manifest, [
      'android.permission.BIND_DEVICE_ADMIN',
      'android.permission.REQUEST_DELETE_PACKAGES',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ]);

    if (!application.receiver) application.receiver = [];

    const adminReceiver = `${packageName}.EmiDeviceAdminReceiver`;
    const bootReceiver = `${packageName}.BootReceiver`;
    // Also register the inner class receiver from DeviceAdminModule for compatibility
    const moduleAdminReceiver = 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver';

    const hasAdmin = application.receiver.some((r) => r.$['android:name'] === adminReceiver);
    if (!hasAdmin) {
      application.receiver.push({
        $: {
          'android:name': adminReceiver,
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
                $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' },
              },
            ],
          },
        ],
      });
    }

    // Add the module's inner class receiver as well
    const hasModuleAdmin = application.receiver.some((r) => r.$['android:name'] === moduleAdminReceiver);
    if (!hasModuleAdmin) {
      application.receiver.push({
        $: {
          'android:name': moduleAdminReceiver,
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
                $: { 'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED' },
              },
            ],
          },
        ],
      });
    }

    const hasBoot = application.receiver.some((r) => r.$['android:name'] === bootReceiver);
    if (!hasBoot) {
      application.receiver.push({
        $: {
          'android:name': bootReceiver,
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
}

function writeNativeFiles(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const packageName = getPackageName(config);
    const packagePath = packageName.replace(/\./g, '/');

    const javaDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', ...packagePath.split('/'));
    const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');

    fs.mkdirSync(javaDir, { recursive: true });
    fs.mkdirSync(resDir, { recursive: true });

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

    const adminReceiver = `package ${packageName};

import android.content.Context;
import android.content.Intent;

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
        return "Device protection is active. Deactivation is not allowed.";
    }
}`;
    fs.writeFileSync(path.join(javaDir, 'EmiDeviceAdminReceiver.java'), adminReceiver);

    // BootReceiver - Autostart the app on device boot
    const bootReceiver = `package ${packageName};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "EMIBootReceiver";
    // Must match PREFS_NAME in DeviceAdminModule.java
    private static final String PREFS_NAME = "${PREFS_NAME}";
    
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Boot completed - checking if app should autostart");
            
            // Check if device is registered (has client_id stored)
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isRegistered = prefs.getBoolean("is_registered", false);
            
            // Always start the app on boot if registered - this ensures:
            // 1. Lock state can be enforced offline
            // 2. App can sync with server when online
            // 3. User cannot avoid app by rebooting
            if (isRegistered) {
                Log.d(TAG, "Device is registered - starting app");
                Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    context.startActivity(launchIntent);
                }
            } else {
                Log.d(TAG, "Device not registered - skipping autostart");
            }
        }
    }
}`;
    fs.writeFileSync(path.join(javaDir, 'BootReceiver.java'), bootReceiver);

    // DevicePolicyModule remains as the native entry point
    // (existing DevicePolicyModule.java already generated by earlier plugin if present)

    return config;
  }]);
}

function stripLegacyPackages(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    // Remove legacy imports
    contents = contents.replace(/^import .*DevicePolicyPackage.*\n/gm, '');
    contents = contents.replace(/^import .*DeviceAdminPackage.*\n/gm, '');
    // Remove legacy package additions (Kotlin/Java)
    contents = contents.replace(/^\s*add\(DevicePolicyPackage\(\)\);\s*$/gm, '');
    contents = contents.replace(/^\s*add\(DeviceAdminPackage\(\)\);\s*$/gm, '');
    contents = contents.replace(/^\s*packages\.add\(DevicePolicyPackage\(\)\);?\s*$/gm, '');
    contents = contents.replace(/^\s*packages\.add\(DeviceAdminPackage\(\)\);?\s*$/gm, '');
    contents = contents.replace(/packages\.add\(new DevicePolicyPackage\(\)\);\s*\n/gm, '');
    contents = contents.replace(/packages\.add\(new DeviceAdminPackage\(\)\);\s*\n/gm, '');
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withDeviceAdmin(config) {
  config = withDeviceAdminManifest(config);
  config = writeNativeFiles(config);
  config = stripLegacyPackages(config);
  return config;
};
