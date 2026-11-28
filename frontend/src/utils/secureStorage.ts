import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Secure storage for sensitive credentials (admin token, admin id).
 *
 * Auth tokens stored in plain AsyncStorage are readable on a rooted/compromised
 * device. expo-secure-store keeps them in the platform keystore/keychain. This
 * wrapper prefers SecureStore and transparently migrates any existing values
 * out of AsyncStorage on first read. It degrades to AsyncStorage if
 * expo-secure-store is not installed so the app still runs.
 */

let SecureStore: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = null;
}

const SECURE_KEYS = ['admin_token', 'admin_id', 'client_device_token'];

// SecureStore keys must be alphanumeric, '.', '-', or '_'. Our keys already are.
function secureAvailable(): boolean {
  return !!SecureStore && typeof SecureStore.getItemAsync === 'function';
}

// SecureStore can throw at runtime (Keystore unavailable, or a key that no longer
// decrypts after a backup restore / device migration). Never let that break the
// caller: fall back to AsyncStorage so a device is not stranded without its token.
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (secureAvailable()) {
    try {
      await SecureStore.setItemAsync(key, value);
      // Ensure no stale plaintext copy remains.
      await AsyncStorage.removeItem(key).catch(() => {});
      return;
    } catch (e) {
      console.log(`[secureStorage] SecureStore write failed for ${key}, using AsyncStorage`, e);
    }
  }
  await AsyncStorage.setItem(key, value);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (secureAvailable()) {
    let fromSecure: string | null = null;
    let secureBroken = false;
    try {
      fromSecure = await SecureStore.getItemAsync(key);
    } catch (e) {
      secureBroken = true;
      console.log(`[secureStorage] SecureStore read failed for ${key}`, e);
      // Unreadable entry (e.g. restored without its Keystore key): drop it.
      try { await SecureStore.deleteItemAsync(key); } catch {}
    }
    if (fromSecure != null) return fromSecure;
    // Legacy / fallback AsyncStorage value.
    const legacy = await AsyncStorage.getItem(key).catch(() => null);
    if (legacy != null) {
      if (!secureBroken) {
        try {
          await SecureStore.setItemAsync(key, legacy);
          await AsyncStorage.removeItem(key).catch(() => {});
        } catch {
          // keep the AsyncStorage copy
        }
      }
      return legacy;
    }
    return null;
  }
  return AsyncStorage.getItem(key).catch(() => null);
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (secureAvailable()) {
    await SecureStore.deleteItemAsync(key).catch(() => {});
  }
  await AsyncStorage.removeItem(key).catch(() => {});
}

export async function clearSecureAuth(): Promise<void> {
  await Promise.all(SECURE_KEYS.map((k) => deleteSecureItem(k)));
}
