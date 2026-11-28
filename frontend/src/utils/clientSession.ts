import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { devicePolicy } from './DevicePolicy';
import { clearDeviceToken, getDeviceToken } from './deviceAuth';

/**
 * Every local key that belongs to one device registration. Cleared when the server
 * no longer knows the device (deleted) and before a new registration is stored, so
 * stale state (protection_complete, tamper flags, lock mode...) never leaks into a
 * new registration.
 */
export const REGISTRATION_KEYS = [
  'client_id',
  'registration_code',
  'client_data',
  'lock_mode',
  'lock_mode_requested',
  'fresh_registration',
  'protection_complete',
  'permission_states',
  'pending_tamper_check',
  'pending_admin_tamper',
  'pending_tamper_report',
  'admin_was_active',
  'accessibility_enabled',
  'autostart_enabled',
  'battery_optimization_done',
  'last_app_start',
  'last_boot_count',
  'last_boot_time',
  'admin_prompt_declined_at',
  'push_token',
  'device_lock_state',
  'device_lock_message',
];

/** Remove all local registration state (JS + native). */
export async function clearLocalRegistration(): Promise<void> {
  try {
    await AsyncStorage.multiRemove(REGISTRATION_KEYS);
  } catch (e) {
    console.log('[clientSession] multiRemove failed:', e);
  }
  await clearDeviceToken().catch(() => {});
  if (Platform.OS === 'android') {
    await devicePolicy.clearClientInfo().catch(() => 'error');
    await devicePolicy.setProtectionComplete(false).catch(() => 'error');
  }
}

/**
 * Hand the registration to the native side so locks apply while the app is closed:
 * client id + backend for the native poll, the device token, and the persistent
 * lock-sync foreground service. Each step is isolated; none may throw.
 */
export async function startNativeSync(clientId: string, apiUrl: string): Promise<string> {
  if (Platform.OS !== 'android' || !clientId) return 'skipped';
  try { await devicePolicy.setClientInfo(clientId, apiUrl); } catch (e) { console.log('setClientInfo error:', e); }
  try { await devicePolicy.setDeviceAuthToken(await getDeviceToken()); } catch (e) { console.log('setDeviceAuthToken error:', e); }
  try { await devicePolicy.setRegistered(true); } catch (e) { console.log('setRegistered error:', e); }
  try {
    const r = await devicePolicy.startLockSync();
    console.log('[LockSync] start:', r);
    return r;
  } catch (e) {
    console.log('startLockSync error:', e);
    return 'error';
  }
}
