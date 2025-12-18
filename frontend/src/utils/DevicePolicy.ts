import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { DeviceAdmin, EMIDeviceAdmin } = NativeModules;

// Get the native module (DeviceAdmin is exported by the native Android DeviceAdminModule)
const nativeModule = DeviceAdmin || EMIDeviceAdmin;

// Storage keys for offline state management
const LOCK_STATE_KEY = 'device_lock_state';
const LOCK_MESSAGE_KEY = 'device_lock_message';
const REGISTRATION_KEY = 'device_is_registered';

export interface DeviceInfo {
  isAdminActive: boolean;
  packageName: string;
}

export interface CachedLockState {
  isLocked: boolean;
  lockMessage: string;
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
   * Opens the system dialog to grant Device Admin permissions
   */
  async requestAdmin(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      console.log('DevicePolicy: Requesting Device Admin permission...');
      console.log('DevicePolicy: Native module available:', !!nativeModule);
      console.log('DevicePolicy: requestDeviceAdmin method available:', !!nativeModule?.requestDeviceAdmin);
      
      if (!nativeModule || !nativeModule.requestDeviceAdmin) {
        console.log('DevicePolicy: Native module or method not available');
        return 'error_module_not_available';
      }
      
      const result = await nativeModule.requestDeviceAdmin();
      console.log('DevicePolicy: requestDeviceAdmin result:', result);
      return result || 'error';
    } catch (error) {
      console.log('DevicePolicy: Failed to request admin:', error);
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
   * Set the lock state in local storage for offline enforcement and autostart
   * This persists the lock state so it can be applied even when offline
   */
  async setLockState(locked: boolean, message?: string): Promise<string> {
    try {
      await AsyncStorage.setItem(LOCK_STATE_KEY, locked ? 'locked' : 'unlocked');
      // Always store message to avoid stale data - use default if not provided
      const messageToStore = message || (locked ? 'Device locked due to pending payment.' : '');
      await AsyncStorage.setItem(LOCK_MESSAGE_KEY, messageToStore);
      return 'success';
    } catch (error) {
      console.log('Failed to set lock state:', error);
      return 'error';
    }
  }

  /**
   * Get the cached lock state for offline enforcement
   * Returns the stored lock state to be used when device is offline or on startup
   */
  async getCachedLockState(): Promise<CachedLockState> {
    try {
      const lockState = await AsyncStorage.getItem(LOCK_STATE_KEY);
      const lockMessage = await AsyncStorage.getItem(LOCK_MESSAGE_KEY);
      return {
        isLocked: lockState === 'locked',
        lockMessage: lockMessage || 'Device locked due to pending payment.',
      };
    } catch (error) {
      console.log('Failed to get cached lock state:', error);
      return { isLocked: false, lockMessage: '' };
    }
  }

  /**
   * Mark device as registered for autostart on boot
   * This is used by the BootReceiver to know if it should start the app
   * Stores in both AsyncStorage (for JS) and SharedPreferences (for native BootReceiver)
   */
  async setRegistered(isRegistered: boolean): Promise<string> {
    try {
      await AsyncStorage.setItem(REGISTRATION_KEY, isRegistered ? 'true' : 'false');
      // Also store in native SharedPreferences for BootReceiver
      if (Platform.OS === 'android' && nativeModule?.setRegistered) {
        await nativeModule.setRegistered(isRegistered);
      }
      return 'success';
    } catch (error) {
      console.log('Failed to set registration state:', error);
      return 'error';
    }
  }

  /**
   * Check if device is registered (for autostart)
   */
  async isRegistered(): Promise<boolean> {
    try {
      const registered = await AsyncStorage.getItem(REGISTRATION_KEY);
      return registered === 'true';
    } catch (error) {
      console.log('Failed to check registration state:', error);
      return false;
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
