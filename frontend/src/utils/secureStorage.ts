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

const SECURE_KEYS = ['admin_token', 'admin_id'];

// SecureStore keys must be alphanumeric, '.', '-', or '_'. Our keys already are.
function secureAvailable(): boolean {
  return !!SecureStore && typeof SecureStore.getItemAsync === 'function';
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (secureAvailable()) {
    await SecureStore.setItemAsync(key, value);
    // Ensure no stale plaintext copy remains.
    await AsyncStorage.removeItem(key).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (secureAvailable()) {
    const fromSecure = await SecureStore.getItemAsync(key);
    if (fromSecure != null) return fromSecure;
    // Migrate any legacy AsyncStorage value into SecureStore.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key).catch(() => {});
      return legacy;
    }
    return null;
  }
  return AsyncStorage.getItem(key);
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
