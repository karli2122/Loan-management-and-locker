import { NativeModule, requireNativeModule } from 'expo-modules-core';

declare class EMIDeviceAdminModuleType extends NativeModule {
  isAdminActive(): Promise<boolean>;
  requestAdmin(): Promise<string>;
  lockDevice(): Promise<string>;
  isDeviceOwner(): Promise<boolean>;
}

let EMIDeviceAdminModule: EMIDeviceAdminModuleType | null = null;

try {
  EMIDeviceAdminModule = requireNativeModule('EMIDeviceAdmin');
} catch (e) {
  console.log('EMIDeviceAdmin module not available:', e);
}

export async function isAdminActive(): Promise<boolean> {
  if (!EMIDeviceAdminModule) return false;
  try {
    return await EMIDeviceAdminModule.isAdminActive();
  } catch (e) {
    console.log('isAdminActive error:', e);
    return false;
  }
}

export async function requestAdmin(): Promise<string> {
  if (!EMIDeviceAdminModule) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.requestAdmin();
  } catch (e) {
    console.log('requestAdmin error:', e);
    return 'error';
  }
}

export async function lockDevice(): Promise<string> {
  if (!EMIDeviceAdminModule) return 'module_not_available';
  try {
    return await EMIDeviceAdminModule.lockDevice();
  } catch (e) {
    console.log('lockDevice error:', e);
    return 'error';
  }
}

export async function isDeviceOwner(): Promise<boolean> {
  if (!EMIDeviceAdminModule) return false;
  try {
    return await EMIDeviceAdminModule.isDeviceOwner();
  } catch (e) {
    console.log('isDeviceOwner error:', e);
    return false;
  }
}

export function isModuleAvailable(): boolean {
  return EMIDeviceAdminModule !== null;
}
