/**
 * Background Notification Service
 * 
 * Configures expo-notifications for receiving push notifications
 * even when the app is closed/killed from recents.
 * 
 * Key features:
 * - Foreground notification display (already configured in _layout.tsx)
 * - Background notification handling via TaskManager
 * - Response handling when user taps a notification
 * - Channel configuration for Android
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

// Define background notification handler task
// This runs when a notification is received while the app is killed/closed
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundNotif] Error:', error.message);
    return;
  }

  if (data) {
    const notificationData = data as any;
    console.log('[BackgroundNotif] Received in background:', notificationData);

    // If it's a lock/unlock action, update cached state immediately
    const action = notificationData?.notification?.request?.content?.data?.action;
    if (action === 'lock') {
      await AsyncStorage.setItem('cached_lock_state', JSON.stringify({
        isLocked: true,
        lockMessage: notificationData?.notification?.request?.content?.data?.message || 'Device locked',
      }));
    } else if (action === 'unlock') {
      await AsyncStorage.setItem('cached_lock_state', JSON.stringify({
        isLocked: false,
        lockMessage: '',
      }));
    }
  }
});

/**
 * Set up Android notification channels for proper categorization.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // High priority channel for warnings and lock notifications
    await Notifications.setNotificationChannelAsync('warnings', {
      name: 'Warnings',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#FF0000',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: 'default',
    });

    // Default channel for general notifications
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });

    // Payment reminders
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Payment Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });

    console.log('[BackgroundNotif] Notification channels configured');
  } catch (error) {
    console.error('[BackgroundNotif] Channel setup error:', error);
  }
}

/**
 * Register the background notification task.
 */
export async function registerBackgroundNotificationTask(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    console.log('[BackgroundNotif] Background task registered');
  } catch (error) {
    // Task might already be registered
    console.log('[BackgroundNotif] Task registration:', error);
  }
}

/**
 * Initialize the full notification system.
 */
export async function initializeNotifications(): Promise<void> {
  // Set up channels
  await setupNotificationChannels();

  // Register background handler
  await registerBackgroundNotificationTask();
}

export { BACKGROUND_NOTIFICATION_TASK };
