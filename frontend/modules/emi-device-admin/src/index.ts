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
