import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { DeviceAdmin, EMIDeviceAdmin } = NativeModules;

// Get the native module (DeviceAdmin is exported by DeviceAdminModule.java)
const nativeModule = DeviceAdmin || EMIDeviceAdmin;

export interface DeviceInfo {
  isAdminActive: boolean;
  packageName: string;
}

class DevicePolicyManager {
  /**
   * Check if Device Admin is active
   */
  async isAdminActive(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await nativeModule?.isDeviceAdminActive?.()) || false;
    } catch (error) {
      console.log('DevicePolicy not available:', error);
      return false;
    }
  }

  /**
   * Request Device Admin permission
   */
  async requestAdmin(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.requestDeviceAdmin?.()) || 'error';
    } catch (error) {
      console.log('Failed to request admin:', error);
      return 'error';
    }
  }

  /**
   * Lock the device screen
   */
  async lockDevice(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.lockDevice?.()) || 'error';
    } catch (error) {
      console.log('Failed to lock device:', error);
      return 'error';
    }
  }

  /**
   * Prevent uninstall - enables Device Admin protection
   */
  async preventUninstall(prevent: boolean): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.preventUninstall?.(prevent)) || 'error';
    } catch (error) {
      console.log('Failed to prevent uninstall:', error);
      return 'error';
    }
  }

  /**
   * Allow uninstall - disables Device Admin protection (called by admin)
   */
  async allowUninstall(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.allowUninstall?.()) || 'error';
    } catch (error) {
      console.log('Failed to allow uninstall:', error);
      return 'error';
    }
  }

  /**
   * Check if uninstall is allowed
   */
  async isUninstallAllowed(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await nativeModule?.isUninstallAllowed?.()) || false;
    } catch (error) {
      console.log('Failed to check uninstall status:', error);
      return false;
    }
  }

  /**
   * Set the lock state in preferences (for boot receiver)
   * Stores locally in AsyncStorage and is used for offline state tracking
   */
  async setLockState(locked: boolean): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      // Store lock state in AsyncStorage for persistence across app restarts
      await AsyncStorage.setItem('device_lock_state', locked ? 'locked' : 'unlocked');
      return 'success';
    } catch (error) {
      console.log('Failed to set lock state:', error);
      return 'error';
    }
  }

  /**
   * Start tamper detection service
   */
  async startTamperDetection(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.startTamperDetection?.()) || 'error';
    } catch (error) {
      console.log('Failed to start tamper detection:', error);
      return 'error';
    }
  }

  /**
   * Stop tamper detection service
   */
  async stopTamperDetection(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.stopTamperDetection?.()) || 'error';
    } catch (error) {
      console.log('Failed to stop tamper detection:', error);
      return 'error';
    }
  }
}

export const devicePolicy = new DevicePolicyManager();
export default devicePolicy;
