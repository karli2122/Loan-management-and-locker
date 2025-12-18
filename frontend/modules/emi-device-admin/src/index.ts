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

export async function isAdminActive(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isAdminActive();
  } catch (e) {
    console.log('isAdminActive error:', e);
    return false;
  }
}

export async function requestAdmin(): Promise<string> {
  if (!isModuleAvailable()) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestAdmin();
  } catch (e) {
    console.log('requestAdmin error:', e);
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

export async function isDeviceOwner(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return await EMIDeviceAdminModule.isDeviceOwner();
  } catch (e) {
    console.log('isDeviceOwner error:', e);
    return false;
  }
}
