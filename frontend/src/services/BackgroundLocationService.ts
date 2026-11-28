import { deviceAuthHeaders, getDeviceToken } from '../utils/deviceAuth';
/**
 * Background Location Tracking Service
 * 
 * Uses expo-location and expo-task-manager to send device location
 * updates every 5 minutes, regardless of app state (foreground, background, killed).
 * 
 * NOTE: expo-task-manager must be installed:
 *   npx expo install expo-task-manager
 * 
 * And the following must be added to app.config.js plugins:
 *   "expo-location" (with background permission config)
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
const LOCATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// v2: no foreground service. The old one showed a permanent
// "PayLock Client — Device management active" notification.
const LOCATION_OPTIONS_VERSION = '2';
const LOCATION_OPTIONS_KEY = 'background_location_options_version';

// Define the background task handler
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundLocation] Error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations && locations.length > 0) {
      const location = locations[0];
      try {
        const clientId = await AsyncStorage.getItem('client_id');
        const apiUrl = await AsyncStorage.getItem('api_url');
        const deviceToken = await getDeviceToken();

        if (!clientId || !apiUrl) {
          console.log('[BackgroundLocation] No client ID or API URL stored');
          return;
        }

        const response = await fetch(`${apiUrl}/api/device/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...deviceAuthHeaders((await getDeviceToken()) || '') },
          body: JSON.stringify({
            client_id: clientId,
            device_token: deviceToken || '',
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            source: 'background',
          }),
        });

        if (response.ok) {
          console.log('[BackgroundLocation] Location sent successfully');
        } else {
          console.log('[BackgroundLocation] Failed to send:', response.status);
        }
      } catch (e) {
        console.log('[BackgroundLocation] Send error:', e);
      }
    }
  }
});

/**
 * Start background location tracking.
 * Requests foreground + background permissions, then starts the background task.
 */
export async function startBackgroundLocationTracking(
  apiUrl: string,
  options: { requestPermissions?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  // Default: never pop permission dialogs from here. The Location card in the
  // protection setup asks for them; app start only starts tracking when granted.
  const request = options.requestPermissions === true;

  try {
    // Store API URL for the background task to use
    await AsyncStorage.setItem('api_url', apiUrl);

    const fg = request
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.log('[BackgroundLocation] Foreground permission not granted');
      return false;
    }

    const bg = request
      ? await Location.requestBackgroundPermissionsAsync()
      : await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      console.log('[BackgroundLocation] Background permission not granted');
      return false;
    }

    // Check if already tracking
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    const optionsVersion = await AsyncStorage.getItem(LOCATION_OPTIONS_KEY);
    if (isTracking && optionsVersion === LOCATION_OPTIONS_VERSION) {
      console.log('[BackgroundLocation] Already tracking');
      return true;
    }
    if (isTracking) {
      // Restart once without the foreground service so its notification goes away.
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: 50, // meters - also trigger on significant movement
      deferredUpdatesInterval: LOCATION_INTERVAL_MS,
      showsBackgroundLocationIndicator: false,
      // No foregroundService: Android then delivers background location only a few times
      // per hour (background location limits), but there is no permanent notification.
      // Android-specific
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
    });

    await AsyncStorage.setItem('background_location_enabled', 'true');
    await AsyncStorage.setItem(LOCATION_OPTIONS_KEY, LOCATION_OPTIONS_VERSION);
    console.log('[BackgroundLocation] Started tracking');
    return true;
  } catch (error) {
    console.error('[BackgroundLocation] Start error:', error);
    return false;
  }
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundLocationTracking(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[BackgroundLocation] Stopped tracking');
    }
    await AsyncStorage.setItem('background_location_enabled', 'false');
  } catch (error) {
    console.error('[BackgroundLocation] Stop error:', error);
  }
}

/**
 * Check if background location is currently active.
 */
export async function isBackgroundLocationActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

export { BACKGROUND_LOCATION_TASK };
