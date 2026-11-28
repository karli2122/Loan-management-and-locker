/**
 * Admin app only: strip the borrower-phone lock machinery that the shared native module
 * (modules/emi-device-admin) contributes to the merged Android manifest.
 * The admin app is a back-office tool and must not request overlay / call / usage-stats /
 * boot / accessibility style capabilities, nor register the device-admin services.
 * Native code stays compiled (shared module); only manifest entries are removed.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

// NOTE: DETECT_SCREEN_CAPTURE must NOT be removed. expo-screen-capture registers a screen-capture
// observer when its JS module loads (the router loads every screen at startup) and Android 14+
// throws a SecurityException without it -> the app died on the splash (1.5.8 - 1.5.10).
const PERMISSIONS = [
  'SYSTEM_ALERT_WINDOW', 'CALL_PHONE', 'READ_PHONE_STATE', 'PACKAGE_USAGE_STATS',
  'KILL_BACKGROUND_PROCESSES', 'EXPAND_STATUS_BAR', 'USE_FULL_SCREEN_INTENT',
  'SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED',
  'BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_CONNECT',
  'FOREGROUND_SERVICE_SPECIAL_USE', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'CAMERA',
];

const PKG = 'expo.modules.emideviceadmin';
const RECEIVERS = ['EMIDeviceAdminReceiver', 'EMIBootReceiver', 'EMIRestartReceiver'];
const SERVICES = [
  'EMIAccessibilityService', 'EMIOverlayService', 'EMILockSyncService',
  'EMIForegroundMonitorService', 'EMINotificationListenerService',
];

module.exports = function withAdminSlim(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const p of PERMISSIONS) {
      const name = `android.permission.${p}`;
      manifest['uses-permission'] = manifest['uses-permission'].filter((e) => e.$['android:name'] !== name);
      manifest['uses-permission'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }

    const app = manifest.application[0];
    app.receiver = app.receiver || [];
    app.service = app.service || [];
    for (const r of RECEIVERS) app.receiver.push({ $: { 'android:name': `${PKG}.${r}`, 'tools:node': 'remove' } });
    for (const s of SERVICES) app.service.push({ $: { 'android:name': `${PKG}.${s}`, 'tools:node': 'remove' } });
    return cfg;
  });
};
