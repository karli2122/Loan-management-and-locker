import { deviceAuthHeaders, getDeviceToken } from '../utils/deviceAuth';
/**
 * Device Info Service - Collects and sends device information to backend
 * Sends battery, storage, and device info during registration and periodically
 */
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../constants/api';

export interface DeviceInfo {
  battery_level: number | null;
  storage_free_gb: number | null;
  storage_total_gb: number | null;
  android_version: string | null;
  device_model: string | null;
  app_version: string | null;
  device_owner_active?: boolean | null;
  admin_mode_active?: boolean | null;
}

/**
 * Collect current device information
 */
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const info: DeviceInfo = {
    battery_level: null,
    storage_free_gb: null,
    storage_total_gb: null,
    android_version: null,
    device_model: null,
    app_version: null,
    device_owner_active: null,
    admin_mode_active: null,
  };
  try {
    info.app_version = Application.nativeApplicationVersion || Application.nativeBuildVersion || null;
  } catch (e) {
    console.log('[DeviceInfo] App version error:', e);
  }
  try {
    if (Platform.OS === 'android') {
      const { devicePolicy } = require('../utils/DevicePolicy');
      info.admin_mode_active = await devicePolicy.isAdminActive();
      info.device_owner_active = await devicePolicy.isDeviceOwner();
    }
  } catch (e) {
    console.log('[DeviceInfo] Admin/owner status error:', e);
  }

  try {
    // Get battery level
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      if (batteryLevel >= 0) {
        info.battery_level = Math.round(batteryLevel * 100);
      }
    }
  } catch (e) {
    console.log('[DeviceInfo] Battery level error:', e);
  }

  try {
    // Get storage info (Android only has reliable free space API)
    if (Platform.OS === 'android') {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
      
      if (freeSpace > 0) {
        info.storage_free_gb = Math.round((freeSpace / (1024 * 1024 * 1024)) * 10) / 10;
      }
      if (totalSpace > 0) {
        info.storage_total_gb = Math.round((totalSpace / (1024 * 1024 * 1024)) * 10) / 10;
      }
    }
  } catch (e) {
    console.log('[DeviceInfo] Storage info error:', e);
  }

  try {
    // Get Android version
    if (Platform.OS === 'android' && Device.osVersion) {
      info.android_version = `Android ${Device.osVersion}`;
    } else if (Platform.OS === 'ios' && Device.osVersion) {
      info.android_version = `iOS ${Device.osVersion}`;
    }
  } catch (e) {
    console.log('[DeviceInfo] OS version error:', e);
  }

  try {
    // Get device model
    const model = `${Device.brand || ''} ${Device.modelName || 'Unknown'}`.trim();
    if (model && model !== 'Unknown') {
      info.device_model = model;
    }
  } catch (e) {
    console.log('[DeviceInfo] Device model error:', e);
  }

  return info;
}

/**
 * Get device info for registration payload
 */
export async function getRegistrationDeviceInfo(): Promise<{
  device_id: string;
  device_model: string;
  android_version?: string;
  battery_level?: number;
  storage_free_gb?: number;
  storage_total_gb?: number;
}> {
  // Android ID is unique per device + app signing key. osBuildId is the firmware build
  // string and is identical on every phone of the same model/firmware.
  let androidId: string | null = null;
  try {
    androidId = Platform.OS === 'android' ? Application.getAndroidId() : null;
  } catch {
    androidId = null;
  }
  const deviceId = androidId || Device.osBuildId || Device.osInternalBuildId || 'unknown';
  const deviceModel = `${Device.brand || ''} ${Device.modelName || 'Unknown Device'}`.trim();
  
  const info = await collectDeviceInfo();
  
  const payload: any = {
    device_id: deviceId,
    device_model: deviceModel,
  };
  
  if (info.android_version) {
    payload.android_version = info.android_version;
  }
  if (info.battery_level !== null) {
    payload.battery_level = info.battery_level;
  }
  if (info.storage_free_gb !== null) {
    payload.storage_free_gb = info.storage_free_gb;
  }
  if (info.storage_total_gb !== null) {
    payload.storage_total_gb = info.storage_total_gb;
  }
  
  return payload;
}

/**
 * Send device info update to backend
 */
export async function sendDeviceInfoUpdate(clientId: string): Promise<boolean> {
  if (!clientId) return false;
  
  try {
    const info = await collectDeviceInfo();
    
    // Only send if we have meaningful data
    if (info.battery_level === null && info.storage_free_gb === null && !info.android_version) {
      return false;
    }
    
    const deviceToken = await getDeviceToken();
    const payload: any = { client_id: clientId, device_token: deviceToken || '' };
    
    if (info.battery_level !== null) {
      payload.battery_level = info.battery_level;
    }
    if (info.storage_free_gb !== null) {
      payload.storage_free_gb = info.storage_free_gb;
    }
    if (info.storage_total_gb !== null) {
      payload.storage_total_gb = info.storage_total_gb;
    }
    if (info.android_version) {
      payload.android_version = info.android_version;
    }
    if (info.device_model) {
      payload.device_model = info.device_model;
    }
    if (info.app_version) {
      payload.app_version = info.app_version;
    }
    if (info.admin_mode_active != null) {
      payload.admin_mode_active = info.admin_mode_active;
    }
    if (info.device_owner_active != null) {
      payload.device_owner_active = info.device_owner_active;
    }
    
    const response = await fetch(`${API_URL}/api/device/update-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...deviceAuthHeaders(deviceToken || undefined),
      },
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      console.log('[DeviceInfo] Sent update successfully:', {
        battery: info.battery_level,
        storage: `${info.storage_free_gb}/${info.storage_total_gb} GB`,
        android: info.android_version,
      });
      return true;
    } else {
      console.log('[DeviceInfo] Update failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('[DeviceInfo] Error sending update:', error);
    return false;
  }
}

// Track last update time to throttle updates
let lastUpdateTime = 0;
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Send device info update if enough time has passed since last update
 * @param clientId - Client ID
 * @param force - Force update regardless of interval
 */
export async function sendDeviceInfoUpdateThrottled(clientId: string, force: boolean = false): Promise<boolean> {
  const now = Date.now();
  
  if (!force && (now - lastUpdateTime) < UPDATE_INTERVAL_MS) {
    return false; // Not enough time has passed
  }
  
  const result = await sendDeviceInfoUpdate(clientId);
  if (result) {
    lastUpdateTime = now;
  }
  return result;
}
