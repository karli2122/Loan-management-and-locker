import { Platform } from 'react-native';

let EMIDeviceAdminModule: any = null;

// Only try to load native module on Android
if (Platform.OS === 'android') {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    EMIDeviceAdminModule = requireNativeModule('EMIDeviceAdmin');
    console.log('EMIDeviceAdmin module loaded successfully');
  } catch (e) {
    console.log('EMIDeviceAdmin module not available (expected in dev builds):', e);
    EMIDeviceAdminModule = null;
  }
}

export function isModuleAvailable(): boolean {
  return Platform.OS === 'android' && EMIDeviceAdminModule !== null;
}

export interface DeviceInfo {
  manufacturer: string;
  model: string;
  brand: string;
  sdkVersion: number;
  androidVersion: string;
}

export function getDeviceInfo(): DeviceInfo {
  if (!isModuleAvailable()) {
    return { manufacturer: 'unknown', model: 'unknown', brand: 'unknown', sdkVersion: 0, androidVersion: '0' };
  }
  try {
    return EMIDeviceAdminModule.getDeviceInfo();
  } catch (e) {
    console.log('getDeviceInfo error:', e);
    return { manufacturer: 'unknown', model: 'unknown', brand: 'unknown', sdkVersion: 0, androidVersion: '0' };
  }
}

export async function isDeviceAdminActive(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isDeviceAdminActive();
  } catch (e) {
    console.log('isDeviceAdminActive error:', e);
    return false;
  }
}

export async function requestDeviceAdmin(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestDeviceAdmin();
  } catch (e) {
    console.log('requestDeviceAdmin error:', e);
    return 'error';
  }
}

export async function lockDevice(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.lockDevice();
  } catch (e) {
    console.log('lockDevice error:', e);
    return 'error';
  }
}

export async function preventUninstall(prevent: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.preventUninstall(prevent);
  } catch (e) {
    console.log('preventUninstall error:', e);
    return 'error';
  }
}

export async function allowUninstall(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.allowUninstall();
  } catch (e) {
    console.log('allowUninstall error:', e);
    return 'error';
  }
}

export async function isUninstallAllowed(): Promise<boolean> {
  if (!isModuleAvailable()) return true;
  try {
    return await EMIDeviceAdminModule.isUninstallAllowed();
  } catch (e) {
    console.log('isUninstallAllowed error:', e);
    return true;
  }
}

export async function isDeviceOwner(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isDeviceOwner();
  } catch (e) {
    console.log('isDeviceOwner error:', e);
    return false;
  }
}

export async function startKioskMode(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.startKioskMode();
  } catch (e) {
    console.log('startKioskMode error:', e);
    return 'error';
  }
}

export async function stopKioskMode(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.stopKioskMode();
  } catch (e) {
    console.log('stopKioskMode error:', e);
    return 'error';
  }
}

export async function isInKioskMode(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isInKioskMode();
  } catch (e) {
    console.log('isInKioskMode error:', e);
    return false;
  }
}

// ===================== ACCESSIBILITY SERVICE =====================

export async function isAccessibilityServiceEnabled(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isAccessibilityServiceEnabled();
  } catch (e) {
    console.log('isAccessibilityServiceEnabled error:', e);
    return false;
  }
}

export async function openAccessibilitySettings(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openAccessibilitySettings();
  } catch (e) {
    console.log('openAccessibilitySettings error:', e);
    return 'error';
  }
}

export async function openAppInfo(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openAppInfo();
  } catch (e) {
    console.log('openAppInfo error:', e);
    return 'error';
  }
}

// ===================== OVERLAY PERMISSION =====================

export async function canDrawOverlays(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.canDrawOverlays();
  } catch (e) {
    console.log('canDrawOverlays error:', e);
    return false;
  }
}

export async function requestOverlayPermission(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestOverlayPermission();
  } catch (e) {
    console.log('requestOverlayPermission error:', e);
    return 'error';
  }
}

export async function startOverlayBlocker(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.startOverlayBlocker();
  } catch (e) {
    console.log('startOverlayBlocker error:', e);
    return 'error';
  }
}

export async function stopOverlayBlocker(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.stopOverlayBlocker();
  } catch (e) {
    console.log('stopOverlayBlocker error:', e);
    return 'error';
  }
}

export async function isOverlayBlockerRunning(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isOverlayBlockerRunning();
  } catch (e) {
    console.log('isOverlayBlockerRunning error:', e);
    return false;
  }
}

export async function setProtectionComplete(complete: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setProtectionComplete(complete);
  } catch (e) {
    console.log('setProtectionComplete error:', e);
    return 'error';
  }
}

// ===================== BATTERY OPTIMIZATION =====================

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isIgnoringBatteryOptimizations();
  } catch (e) {
    console.log('isIgnoringBatteryOptimizations error:', e);
    return false;
  }
}

export async function requestBatteryOptimization(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestBatteryOptimization();
  } catch (e) {
    console.log('requestBatteryOptimization error:', e);
    return 'error';
  }
}

export async function openBatterySettings(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openBatterySettings();
  } catch (e) {
    console.log('openBatterySettings error:', e);
    return 'error';
  }
}

// ===================== AUTO START =====================

export async function openAutoStartSettings(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openAutoStartSettings();
  } catch (e) {
    console.log('openAutoStartSettings error:', e);
    return 'error';
  }
}

// ===================== NOTIFICATION / PLAY PROTECT =====================

export async function openNotificationSettings(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openNotificationSettings();
  } catch (e) {
    console.log('openNotificationSettings error:', e);
    return 'error';
  }
}

export async function openPlayProtectSettings(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openPlayProtectSettings();
  } catch (e) {
    console.log('openPlayProtectSettings error:', e);
    return 'error';
  }
}

// ===================== LOCK STATE (NATIVE) =====================

export async function setNativeLockState(locked: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setNativeLockState(locked);
  } catch (e) {
    console.log('setNativeLockState error:', e);
    return 'error';
  }
}

// ===================== IMMERSIVE MODE =====================

export async function enableImmersiveMode(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.enableImmersiveMode();
  } catch (e) {
    console.log('enableImmersiveMode error:', e);
    return 'error';
  }
}

export async function disableImmersiveMode(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.disableImmersiveMode();
  } catch (e) {
    console.log('disableImmersiveMode error:', e);
    return 'error';
  }
}

// ===================== CLIENT INFO (for background lock checking) =====================

export async function setClientInfo(clientId: string, backendUrl: string): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setClientInfo(clientId, backendUrl);
  } catch (e) {
    console.log('setClientInfo error:', e);
    return 'error';
  }
}

// ===================== REGISTRATION =====================

export async function setRegistered(isRegistered: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setRegistered(isRegistered);
  } catch (e) {
    console.log('setRegistered error:', e);
    return 'error';
  }
}

// ===================== BACKUP / RESTORE =====================

export async function backupClientData(clientId: string): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.backupClientData(clientId);
  } catch (e) {
    console.log('backupClientData error:', e);
    return 'error';
  }
}

export async function restoreClientData(): Promise<string> {
  if (!isModuleAvailable()) return '';
  try {
    return await EMIDeviceAdminModule.restoreClientData();
  } catch (e) {
    console.log('restoreClientData error:', e);
    return '';
  }
}

export async function clearBackupData(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.clearBackupData();
  } catch (e) {
    console.log('clearBackupData error:', e);
    return 'error';
  }
}

// ===================== TAMPER DETECTION =====================

export async function wasAdminDisabled(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.wasAdminDisabled();
  } catch (e) {
    console.log('wasAdminDisabled error:', e);
    return false;
  }
}

export async function clearTamperFlags(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.clearTamperFlags();
  } catch (e) {
    console.log('clearTamperFlags error:', e);
    return 'error';
  }
}

export async function startTamperDetection(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.startTamperDetection();
  } catch (e) {
    console.log('startTamperDetection error:', e);
    return 'error';
  }
}

export async function stopTamperDetection(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.stopTamperDetection();
  } catch (e) {
    console.log('stopTamperDetection error:', e);
    return 'error';
  }
}

// ===================== APP SETTINGS LOCK =====================

export async function lockAppSettings(lock: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.lockAppSettings(lock);
  } catch (e) {
    console.log('lockAppSettings error:', e);
    return 'error';
  }
}

// ===================== COLLAPSE / DISABLE STATUS BAR =====================

export async function collapseStatusBar(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.collapseStatusBar();
  } catch (e) {
    console.log('collapseStatusBar error:', e);
    return 'error';
  }
}

/**
 * Disable/enable the status bar via DevicePolicyManager.
 * Only works when app is Device Owner (set via ADB).
 * This is the most reliable way to completely block the status bar on modern Android.
 */
export async function setStatusBarDisabled(disabled: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setStatusBarDisabled(disabled);
  } catch (e) {
    console.log('setStatusBarDisabled error:', e);
    return 'error';
  }
}

// ===================== FOREGROUND APP MONITOR =====================

export async function startForegroundMonitor(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.startForegroundMonitor();
  } catch (e) {
    console.log('startForegroundMonitor error:', e);
    return 'error';
  }
}

export async function stopForegroundMonitor(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.stopForegroundMonitor();
  } catch (e) {
    console.log('stopForegroundMonitor error:', e);
    return 'error';
  }
}

export async function hasUsageStatsPermission(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.hasUsageStatsPermission();
  } catch (e) {
    console.log('hasUsageStatsPermission error:', e);
    return false;
  }
}

export async function requestUsageStatsPermission(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestUsageStatsPermission();
  } catch (e) {
    console.log('requestUsageStatsPermission error:', e);
    return 'error';
  }
}

// ===================== NOTIFICATION LISTENER =====================

export async function hasNotificationListenerPermission(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.hasNotificationListenerPermission();
  } catch (e) {
    console.log('hasNotificationListenerPermission error:', e);
    return false;
  }
}

export async function requestNotificationListenerPermission(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestNotificationListenerPermission();
  } catch (e) {
    console.log('requestNotificationListenerPermission error:', e);
    return 'error';
  }
}

// ===================== CAMERA / BLUETOOTH DISABLE =====================

export async function setCameraDisabled(disabled: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setCameraDisabled(disabled);
  } catch (e) {
    console.log('setCameraDisabled error:', e);
    return 'error';
  }
}

export async function setBluetoothDisabled(disabled: boolean): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.setBluetoothDisabled(disabled);
  } catch (e) {
    console.log('setBluetoothDisabled error:', e);
    return 'error';
  }
}

// ===================== AUTO-RESTART ON KILL =====================

export async function scheduleAutoRestart(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.scheduleAutoRestart();
  } catch (e) {
    console.log('scheduleAutoRestart error:', e);
    return 'error';
  }
}

export async function cancelAutoRestart(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.cancelAutoRestart();
  } catch (e) {
    console.log('cancelAutoRestart error:', e);
    return 'error';
  }
}

// ===================== ACCESSIBILITY (DIRECT) =====================

export async function openAccessibilitySettingsDirect(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.openAccessibilitySettingsDirect();
  } catch (e) {
    console.log('openAccessibilitySettingsDirect error:', e);
    return 'error';
  }
}
