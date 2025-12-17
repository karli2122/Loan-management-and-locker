import { NativeModules, Platform, Alert } from 'react-native';

// The unified native module for Device Admin
const { EMIDeviceAdmin } = NativeModules;

// Log module availability
console.log('EMIDeviceAdmin module available:', !!EMIDeviceAdmin);

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
    const available = Platform.OS === 'android' && !!EMIDeviceAdmin;
    console.log('isNativeModuleAvailable:', available);
    return available;
  }

  /**
   * Check if app is Device Owner (requires ADB provisioning)
   */
  async isDeviceOwner(): Promise<boolean> {
    if (Platform.OS !== 'android' || !EMIDeviceAdmin) {
      console.log('isDeviceOwner: Not available');
      return false;
    }
    try {
      const result = await EMIDeviceAdmin.isDeviceOwner();
      console.log('isDeviceOwner result:', result);
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
    if (Platform.OS !== 'android' || !EMIDeviceAdmin) {
      console.log('isAdminActive: Module not available');
      return false;
    }
    try {
      const result = await EMIDeviceAdmin.isAdminActive();
      console.log('isAdminActive result:', result);
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
      console.log('requestAdmin: Not Android');
      return 'not_android';
    }
    
    if (!EMIDeviceAdmin) {
      console.log('requestAdmin: Native module not available');
      Alert.alert(
        'Module Not Available',
        'Device Admin module is not available. Make sure you are using a production APK build.',
        [{ text: 'OK' }]
      );
      return 'module_not_available';
    }
    
    try {
      console.log('requestAdmin: Calling native module...');
      const result = await EMIDeviceAdmin.requestAdmin();
      console.log('requestAdmin result:', result);
      return result;
    } catch (error: any) {
      console.log('requestAdmin error:', error);
      Alert.alert('Error', `Failed to request Device Admin: ${error.message || error}`);
      return 'error';
    }
  }

  /**
   * Lock the device screen (requires Device Admin to be active)
   */
  async lockDevice(): Promise<boolean> {
    if (Platform.OS !== 'android' || !EMIDeviceAdmin) {
      console.log('lockDevice: Not available');
      return false;
    }
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
    // This requires Device Owner which needs ADB provisioning
    console.log('setKioskMode: Requires Device Owner (ADB provisioning)');
    return false;
  }

  /**
   * Block/unblock app uninstallation (requires Device Owner)
   */
  async disableUninstall(disable: boolean): Promise<boolean> {
    // This requires Device Owner which needs ADB provisioning
    console.log('disableUninstall: Requires Device Owner (ADB provisioning)');
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
