import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Load native module using Expo module system (required for Expo 54+ with new architecture)
let nativeModule: any = null;
if (Platform.OS === 'android') {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    nativeModule = requireNativeModule('EMIDeviceAdmin');
  } catch (e) {
    console.log('EMIDeviceAdmin module not available:', e);
  }
}

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
      const result = await nativeModule?.isDeviceAdminActive?.();
      console.log('DevicePolicy: isAdminActive =', result);
      return result || false;
    } catch (error) {
      console.log('DevicePolicy: isAdminActive error:', error);
      return false;
    }
  }

  /**
   * Request Device Admin permission
   * Now returns the actual result from native side (granted/denied/already_active)
   * or throws an error if no activity is available or request is in progress
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
    } catch (error: unknown) {
      console.log('DevicePolicy: Failed to request admin:', error);
      // Handle specific error codes from native module
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as { code: string }).code;
        if (errorCode === 'NO_ACTIVITY') {
          return 'error_no_activity';
        }
        if (errorCode === 'IN_PROGRESS') {
          return 'error_in_progress';
        }
      }
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

  /**
   * Backup client data to external storage (survives Clear Data/Cache)
   */
  async backupClientData(clientId: string): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.backupClientData?.(clientId)) || 'error';
    } catch (error) {
      console.log('Failed to backup client data:', error);
      return 'error';
    }
  }

  /**
   * Restore client data from external storage backup
   * Returns the backed-up client_id or empty string if not found
   */
  async restoreClientData(): Promise<string> {
    if (Platform.OS !== 'android') return '';
    try {
      return (await nativeModule?.restoreClientData?.()) || '';
    } catch (error) {
      console.log('Failed to restore client data:', error);
      return '';
    }
  }

  /**
   * Clear the external backup data
   */
  async clearBackupData(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.clearBackupData?.()) || 'error';
    } catch (error) {
      console.log('Failed to clear backup data:', error);
      return 'error';
    }
  }

  /**
   * Check if admin was forcefully disabled (tamper attempt)
   */
  async wasAdminDisabled(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await nativeModule?.wasAdminDisabled?.()) || false;
    } catch (error) {
      console.log('Failed to check admin disabled flag:', error);
      return false;
    }
  }

  /**
   * Clear tamper flags after they've been handled
   */
  async clearTamperFlags(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.clearTamperFlags?.()) || 'error';
    } catch (error) {
      console.log('Failed to clear tamper flags:', error);
      return 'error';
    }
  }

  // ===================== FOREGROUND SERVICE =====================

  /**
   * Start the persistent foreground protection service.
   * Shows a permanent "Device Protected" notification and monitors Device Admin status.
   */
  async startForegroundProtection(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.startForegroundProtection?.()) || 'error';
    } catch (error) {
      console.log('Failed to start foreground protection:', error);
      return 'error';
    }
  }

  /**
   * Stop the foreground protection service.
   */
  async stopForegroundProtection(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.stopForegroundProtection?.()) || 'error';
    } catch (error) {
      console.log('Failed to stop foreground protection:', error);
      return 'error';
    }
  }

  // ===================== ACCESSIBILITY SERVICE =====================

  /**
   * Check if the EMI Accessibility Service is enabled in system settings.
   */
  async isAccessibilityEnabled(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return (await nativeModule?.isAccessibilityServiceEnabled?.()) || false;
    } catch (error) {
      console.log('Failed to check accessibility service:', error);
      return false;
    }
  }

  /**
   * Open the system Accessibility Settings screen so the user can enable the service.
   */
  async openAccessibilitySettings(): Promise<string> {
    if (Platform.OS !== 'android') return 'not_supported';
    try {
      return (await nativeModule?.openAccessibilitySettings?.()) || 'error';
    } catch (error) {
      console.log('Failed to open accessibility settings:', error);
      return 'error';
    }
  }
}

export const devicePolicy = new DevicePolicyManager();
export default devicePolicy;
