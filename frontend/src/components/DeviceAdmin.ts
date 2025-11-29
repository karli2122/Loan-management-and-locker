import { NativeModules, Platform } from 'react-native';

const { DeviceAdmin } = NativeModules;

export interface DeviceAdminAPI {
  isDeviceAdminActive(): Promise<boolean>;
  requestDeviceAdmin(): Promise<string>;
  lockDevice(): Promise<string>;
  disableOtherApps(disable: boolean): Promise<string>;
  resetPassword(newPassword: string): Promise<string>;
}

// Mock implementation for non-Android platforms
const MockDeviceAdmin: DeviceAdminAPI = {
  isDeviceAdminActive: async () => false,
  requestDeviceAdmin: async () => 'not_supported',
  lockDevice: async () => 'not_supported',
  disableOtherApps: async () => 'not_supported',
  resetPassword: async () => 'not_supported',
};

// Use real module on Android, mock on other platforms
export default (Platform.OS === 'android' && DeviceAdmin ? DeviceAdmin : MockDeviceAdmin) as DeviceAdminAPI;
