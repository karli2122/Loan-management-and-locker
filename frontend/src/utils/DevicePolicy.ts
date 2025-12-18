import { Platform, Alert, NativeModules } from 'react-native';

// Get native module if available
const EMIDeviceAdmin = Platform.OS === 'android' ? NativeModules.EMIDeviceAdmin : null;

console.log('DevicePolicy: Platform:', Platform.OS);
console.log('DevicePolicy: EMIDeviceAdmin available:', !!EMIDeviceAdmin);

export interface DeviceInfo {
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName: string;
}

class DevicePolicyManager {
  /**
   * Check if native module is available
   */
  isNativeModuleAvailable(): boolean {
    return Platform.OS === 'android' && !!EMIDeviceAdmin;
  }

  /**
   * Check if app is Device Owner (requires ADB provisioning)
   */
  async isDeviceOwner(): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) return false;
    try {
      const result = await EMIDeviceAdmin.isDeviceOwner();
      console.log('isDeviceOwner:', result);
      return result;
    } catch (error) {
      console.log('isDeviceOwner error:', error);
      return false;
    }
  }

  /**
   * Check if Device Admin is active
   */
  async isAdminActive(): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) return false;
    try {
      const result = await EMIDeviceAdmin.isAdminActive();
      console.log('isAdminActive:', result);
      return result;
    } catch (error) {
      console.log('isAdminActive error:', error);
      return false;
    }
  }

  /**
   * Request Device Admin permission - shows system dialog
   */
  async requestAdmin(): Promise<string> {
    if (Platform.OS !== 'android') {
      return 'not_android';
    }
    
    if (!EMIDeviceAdmin) {
      console.log('requestAdmin: Native module not available');
      return 'module_not_available';
    }
    
    try {
      console.log('Calling EMIDeviceAdmin.requestAdmin()...');
      const result = await EMIDeviceAdmin.requestAdmin();
      console.log('requestAdmin result:', result);
      return result;
    } catch (error: any) {
      console.log('requestAdmin error:', error);
      return 'error';
    }
  }

  /**
   * Lock the device screen (requires Device Admin to be active)
   */
  async lockDevice(): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) return false;
    try {
      const result = await EMIDeviceAdmin.lockDevice();
      console.log('lockDevice result:', result);
      return result === 'locked';
    } catch (error) {
      console.log('lockDevice error:', error);
      return false;
    }
  }

  /**
   * Enable/disable Kiosk mode (requires Device Owner)
   */
  async setKioskMode(enable: boolean): Promise<boolean> {
    console.log('setKioskMode: Requires Device Owner');
    return false;
  }

  /**
   * Block/unblock app uninstallation (requires Device Owner)
   */
  async disableUninstall(disable: boolean): Promise<boolean> {
    console.log('disableUninstall: Requires Device Owner');
    return false;
  }

  /**
   * Get device security info
   */
  async getDeviceInfo(): Promise<DeviceInfo | null> {
    if (Platform.OS !== 'android') return null;
    try {
      return {
        isDeviceOwner: await this.isDeviceOwner(),
        isAdminActive: await this.isAdminActive(),
        packageName: 'com.emi.client'
      };
    } catch (error) {
      console.log('getDeviceInfo error:', error);
      return null;
    }
  }

  /**
   * Set lock state for boot receiver
   */
  async setLockState(locked: boolean): Promise<boolean> {
    console.log('setLockState:', locked);
    return true;
  }
}

export const devicePolicy = new DevicePolicyManager();
export default devicePolicy;
