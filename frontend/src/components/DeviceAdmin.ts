import { NativeModules, Platform } from 'react-native';

const { DeviceAdmin } = NativeModules;

export interface DeviceAdminAPI {
  isDeviceAdminActive(): Promise<boolean>;
  requestDeviceAdmin(): Promise<string>;
  lockDevice(): Promise<string>;
  disableOtherApps(disable: boolean): Promise<string>;
  resetPassword(newPassword: string): Promise<string>;
  startTamperDetection(): Promise<string>;
  stopTamperDetection(): Promise<string>;
  preventUninstall(prevent: boolean): Promise<string>;
  allowUninstall(): Promise<string>;
  isUninstallAllowed(): Promise<boolean>;
}

// Mock implementation for non-Android platforms
const MockDeviceAdmin: DeviceAdminAPI = {
  isDeviceAdminActive: async () => false,
  requestDeviceAdmin: async () => 'not_supported',
  lockDevice: async () => 'not_supported',
  disableOtherApps: async () => 'not_supported',
  resetPassword: async () => 'not_supported',
  startTamperDetection: async () => 'not_supported',
  stopTamperDetection: async () => 'not_supported',
  preventUninstall: async () => 'not_supported',
  allowUninstall: async () => 'not_supported',
  isUninstallAllowed: async () => false,
};

// Use real module on Android, mock on other platforms
export default (Platform.OS === 'android' && DeviceAdmin ? DeviceAdmin : MockDeviceAdmin) as DeviceAdminAPI;
