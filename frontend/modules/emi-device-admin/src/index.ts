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
