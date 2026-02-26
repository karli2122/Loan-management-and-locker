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

        if (!clientId || !apiUrl) {
          console.log('[BackgroundLocation] No client ID or API URL stored');
          return;
        }

        const response = await fetch(`${apiUrl}/api/device/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
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
export async function startBackgroundLocationTracking(apiUrl: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    // Store API URL for the background task to use
    await AsyncStorage.setItem('api_url', apiUrl);

    // Request foreground permission first
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      console.log('[BackgroundLocation] Foreground permission denied');
      return false;
    }

    // Request background permission
    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.log('[BackgroundLocation] Background permission denied');
      return false;
    }

    // Check if already tracking
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isTracking) {
      console.log('[BackgroundLocation] Already tracking');
      return true;
    }

    // Start background location updates
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_INTERVAL_MS,
      distanceInterval: 50, // meters - also trigger on significant movement
      deferredUpdatesInterval: LOCATION_INTERVAL_MS,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'PayLock Client',
        notificationBody: 'Location tracking active',
        notificationColor: '#10B981',
      },
      // Android-specific
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
    });

    await AsyncStorage.setItem('background_location_enabled', 'true');
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
