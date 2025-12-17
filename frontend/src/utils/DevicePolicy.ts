import { NativeModules, Platform } from 'react-native';

const { EMIDeviceAdmin, DevicePolicyModule } = NativeModules;

export interface DeviceInfo {
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName: string;
}

class DevicePolicyManager {
  /**
   * Check if app is Device Owner
   */
  async isDeviceOwner(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await (EMIDeviceAdmin?.isDeviceOwner?.() ?? DevicePolicyModule?.isDeviceOwner?.())) || false;
    } catch (error) {
      console.log('DevicePolicy not available:', error);
      return false;
    }
  }

  /**
   * Check if Device Admin is active
   */
  async isAdminActive(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await (EMIDeviceAdmin?.isAdminActive?.() ?? DevicePolicyModule?.isAdminActive?.())) || false;
    } catch (error) {
      console.log('DevicePolicy not available:', error);
      return false;
    }
  }

  /**
   * Request Device Admin permission
   */
  async requestAdmin(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await (EMIDeviceAdmin?.requestAdmin?.() ?? DevicePolicyModule?.requestAdmin?.())) || false;
    } catch (error) {
      console.log('Failed to request admin:', error);
      return false;
    }
  }

  /**
   * Lock the device screen
   */
  async lockDevice(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await (EMIDeviceAdmin?.lockDevice?.() ?? DevicePolicyModule?.lockDevice?.())) || false;
    } catch (error) {
      console.log('Failed to lock device:', error);
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
      return (await (EMIDeviceAdmin?.setKioskMode?.(enable) ?? DevicePolicyModule?.setKioskMode?.(enable))) || false;
    } catch (error) {
      console.log('Failed to set kiosk mode:', error);
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
      return (
        await (EMIDeviceAdmin?.disableUninstall?.(disable) ?? DevicePolicyModule?.disableUninstall?.(disable))
      ) || false;
    } catch (error) {
      console.log('Failed to set uninstall block:', error);
      return false;
    }
  }

  /**
   * Get device security info
   */
  async getDeviceInfo(): Promise<DeviceInfo | null> {
    if (Platform.OS !== 'android') return null;
    try {
      return (await (EMIDeviceAdmin?.getDeviceInfo?.() ?? DevicePolicyModule?.getDeviceInfo?.())) || null;
    } catch (error) {
      console.log('Failed to get device info:', error);
      return null;
    }
  }

  /**
   * Set the lock state in preferences (for boot receiver)
   */
  async setLockState(locked: boolean): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await (EMIDeviceAdmin?.setLockState?.(locked) ?? DevicePolicyModule?.setLockState?.(locked))) || false;
    } catch (error) {
      console.log('Failed to set lock state:', error);
      return false;
    }
  }
}

export const devicePolicy = new DevicePolicyManager();
export default devicePolicy;
