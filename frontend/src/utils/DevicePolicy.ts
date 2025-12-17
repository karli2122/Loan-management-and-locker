import { NativeModules, Platform, Alert } from 'react-native';

// Try both native modules - DevicePolicyModule from withDeviceOwner, DeviceAdmin from withDeviceAdmin
const { DevicePolicyModule, DeviceAdmin } = NativeModules;

// Log available native modules for debugging
console.log('DevicePolicyModule available:', !!DevicePolicyModule);
console.log('DeviceAdmin available:', !!DeviceAdmin);

export interface DeviceInfo {
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName: string;
}

class DevicePolicyManager {
  private module: any;
  
  constructor() {
    // Use whichever module is available
    this.module = DevicePolicyModule || DeviceAdmin;
    console.log('Using native module:', this.module ? 'Available' : 'NOT AVAILABLE');
  }

  /**
   * Check if any native module is available
   */
  isNativeModuleAvailable(): boolean {
    return Platform.OS === 'android' && !!this.module;
  }

  /**
   * Check if app is Device Owner
   */
  async isDeviceOwner(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (DevicePolicyModule?.isDeviceOwner) {
        return await DevicePolicyModule.isDeviceOwner();
      }
      return false;
    } catch (error) {
      console.log('isDeviceOwner error:', error);
      return false;
    }
  }

  /**
   * Check if Device Admin is active
   */
  async isAdminActive(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      // Try DevicePolicyModule first
      if (DevicePolicyModule?.isAdminActive) {
        return await DevicePolicyModule.isAdminActive();
      }
      // Fallback to DeviceAdmin module
      if (DeviceAdmin?.isDeviceAdminActive) {
        return await DeviceAdmin.isDeviceAdminActive();
      }
      console.log('No native module found for isAdminActive');
      return false;
    } catch (error) {
      console.log('isAdminActive error:', error);
      return false;
    }
  }

  /**
   * Request Device Admin permission
   */
  async requestAdmin(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('requestAdmin: Not Android');
      return false;
    }
    
    try {
      console.log('Attempting to request Device Admin...');
      
      // Try DevicePolicyModule first
      if (DevicePolicyModule?.requestAdmin) {
        console.log('Using DevicePolicyModule.requestAdmin');
        const result = await DevicePolicyModule.requestAdmin();
        console.log('DevicePolicyModule.requestAdmin result:', result);
        return result;
      }
      
      // Fallback to DeviceAdmin module
      if (DeviceAdmin?.requestDeviceAdmin) {
        console.log('Using DeviceAdmin.requestDeviceAdmin');
        const result = await DeviceAdmin.requestDeviceAdmin();
        console.log('DeviceAdmin.requestDeviceAdmin result:', result);
        return result === 'requested' || result === 'already_active';
      }
      
      console.log('No native module available for requestAdmin');
      Alert.alert(
        'Setup Required',
        'Device Admin module is not available. Please ensure you are using a properly built APK, not Expo Go.',
        [{ text: 'OK' }]
      );
      return false;
    } catch (error) {
      console.log('requestAdmin error:', error);
      Alert.alert('Error', `Failed to request admin: ${error}`);
      return false;
    }
  }

  /**
   * Lock the device screen
   */
  async lockDevice(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (DevicePolicyModule?.lockDevice) {
        return await DevicePolicyModule.lockDevice();
      }
      if (DeviceAdmin?.lockDevice) {
        const result = await DeviceAdmin.lockDevice();
        return result === 'locked';
      }
      return false;
    } catch (error) {
      console.log('lockDevice error:', error);
      return false;
    }
  }

  /**
   * Enable/disable Kiosk mode (locks to this app only)
   * Requires Device Owner
   */
  async setKioskMode(enable: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (DevicePolicyModule?.setKioskMode) {
        return await DevicePolicyModule.setKioskMode(enable);
      }
      return false;
    } catch (error) {
      console.log('setKioskMode error:', error);
      return false;
    }
  }

  /**
   * Block/unblock app uninstallation
   * Requires Device Owner
   */
  async disableUninstall(disable: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (DevicePolicyModule?.disableUninstall) {
        return await DevicePolicyModule.disableUninstall(disable);
      }
      return false;
    } catch (error) {
      console.log('disableUninstall error:', error);
      return false;
    }
  }

  /**
   * Get device security info
   */
  async getDeviceInfo(): Promise<DeviceInfo | null> {
    if (Platform.OS !== 'android') return null;
    try {
      if (DevicePolicyModule?.getDeviceInfo) {
        return await DevicePolicyModule.getDeviceInfo();
      }
      // Build from individual calls
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
   * Set the lock state in preferences (for boot receiver)
   */
  async setLockState(locked: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      if (DevicePolicyModule?.setLockState) {
        return await DevicePolicyModule.setLockState(locked);
      }
      return false;
    } catch (error) {
      console.log('setLockState error:', error);
      return false;
    }
  }
}

export const devicePolicy = new DevicePolicyManager();
export default devicePolicy;
