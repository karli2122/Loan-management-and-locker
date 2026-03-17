/**
 * Background Heartbeat Service
 * Sends heartbeat to server every 5 minutes even when app is in background or killed
 * Uses Foreground Service on Android to survive app closure
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as FileSystem from 'expo-file-system';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import API_URL from '../constants/api';

const HEARTBEAT_TASK = 'PAYLOCK_HEARTBEAT_TASK';
const HEARTBEAT_INTERVAL_SECONDS = 5 * 60; // 5 minutes

interface HeartbeatData {
  client_id: string;
  battery_level: number | null;
  storage_free_gb: number | null;
  storage_total_gb: number | null;
  android_version: string | null;
  device_model: string | null;
  imei: string | null;
}

/**
 * Collect comprehensive device information
 */
async function collectDeviceData(): Promise<Omit<HeartbeatData, 'client_id'>> {
  const data: Omit<HeartbeatData, 'client_id'> = {
    battery_level: null,
    storage_free_gb: null,
    storage_total_gb: null,
    android_version: null,
    device_model: null,
    imei: null,
  };

  try {
    // Battery level
    const batteryLevel = await Battery.getBatteryLevelAsync();
    if (batteryLevel >= 0) {
      data.battery_level = Math.round(batteryLevel * 100);
    }
  } catch (e) {
    console.log('[Heartbeat] Battery error:', e);
  }

  try {
    // Storage info
    if (Platform.OS === 'android') {
      const freeSpace = await FileSystem.getFreeDiskStorageAsync();
      const totalSpace = await FileSystem.getTotalDiskCapacityAsync();
      if (freeSpace > 0) {
        data.storage_free_gb = Math.round((freeSpace / (1024 * 1024 * 1024)) * 10) / 10;
      }
      if (totalSpace > 0) {
        data.storage_total_gb = Math.round((totalSpace / (1024 * 1024 * 1024)) * 10) / 10;
      }
    }
  } catch (e) {
    console.log('[Heartbeat] Storage error:', e);
  }

  try {
    // Android/iOS version
    if (Device.osVersion) {
      data.android_version = Platform.OS === 'android' 
        ? `Android ${Device.osVersion}` 
        : `iOS ${Device.osVersion}`;
    }
  } catch (e) {
    console.log('[Heartbeat] OS version error:', e);
  }

  try {
    // Device model
    const model = `${Device.brand || ''} ${Device.modelName || 'Unknown'}`.trim();
    if (model && model !== 'Unknown') {
      data.device_model = model;
    }
  } catch (e) {
    console.log('[Heartbeat] Device model error:', e);
  }

  try {
    // IMEI - try to get from native module or stored value
    if (Platform.OS === 'android') {
      // First check if we have it stored
      const storedImei = await AsyncStorage.getItem('device_imei');
      if (storedImei) {
        data.imei = storedImei;
      } else {
        // Try to get from device (requires READ_PHONE_STATE permission on older Android)
        // For newer Android versions (10+), IMEI is restricted
        // Use Android ID as fallback
        const androidId = Application.getAndroidId?.();
        if (androidId) {
          data.imei = `AID-${androidId}`;
          await AsyncStorage.setItem('device_imei', data.imei);
        }
      }
    }
  } catch (e) {
    console.log('[Heartbeat] IMEI error:', e);
  }

  return data;
}

/**
 * Send heartbeat to backend
 */
async function sendHeartbeat(): Promise<boolean> {
  try {
    const clientId = await AsyncStorage.getItem('clientId');
    if (!clientId) {
      console.log('[Heartbeat] No client ID, skipping');
      return false;
    }

    const deviceData = await collectDeviceData();
    
    const payload: HeartbeatData = {
      client_id: clientId,
      ...deviceData,
    };

    console.log('[Heartbeat] Sending:', {
      battery: payload.battery_level,
      storage: `${payload.storage_free_gb}/${payload.storage_total_gb} GB`,
      android: payload.android_version,
      imei: payload.imei?.substring(0, 10) + '...',
    });

    const response = await fetch(`${API_URL}/device/update-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('[Heartbeat] Sent successfully');
      await AsyncStorage.setItem('last_heartbeat', new Date().toISOString());
      return true;
    } else {
      console.log('[Heartbeat] Failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('[Heartbeat] Error:', error);
    return false;
  }
}

/**
 * Define the background task
 */
TaskManager.defineTask(HEARTBEAT_TASK, async () => {
  console.log('[Heartbeat] Background task executing');
  
  try {
    const success = await sendHeartbeat();
    return success 
      ? BackgroundFetch.BackgroundFetchResult.NewData 
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.log('[Heartbeat] Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background heartbeat task
 */
export async function registerHeartbeatTask(): Promise<boolean> {
  try {
    // Check if task is already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    
    if (!isRegistered) {
      console.log('[Heartbeat] Registering background task');
      
      await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK, {
        minimumInterval: HEARTBEAT_INTERVAL_SECONDS,
        stopOnTerminate: false, // Keep running when app is terminated
        startOnBoot: true, // Start on device boot
      });
      
      console.log('[Heartbeat] Background task registered');
    } else {
      console.log('[Heartbeat] Background task already registered');
    }
    
    return true;
  } catch (error) {
    console.log('[Heartbeat] Failed to register task:', error);
    return false;
  }
}

/**
 * Unregister the background heartbeat task
 */
export async function unregisterHeartbeatTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK);
      console.log('[Heartbeat] Background task unregistered');
    }
  } catch (error) {
    console.log('[Heartbeat] Failed to unregister task:', error);
  }
}

/**
 * Get background fetch status
 */
export async function getHeartbeatStatus(): Promise<{
  isRegistered: boolean;
  lastHeartbeat: string | null;
  status: BackgroundFetch.BackgroundFetchStatus;
}> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK);
  const lastHeartbeat = await AsyncStorage.getItem('last_heartbeat');
  const status = await BackgroundFetch.getStatusAsync();
  
  return { isRegistered, lastHeartbeat, status };
}

/**
 * Send immediate heartbeat (call from foreground)
 */
export { sendHeartbeat };
