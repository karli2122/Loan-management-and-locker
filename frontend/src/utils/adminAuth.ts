import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import API_URL from '../constants/api';

/**
 * Shared admin authentication utilities.
 * Centralises token retrieval, validation, and 401 handling
 * so every admin screen behaves consistently.
 */

export interface AuthInfo {
  token: string;
  adminId: string;
}

/**
 * Retrieve the current admin token and id from storage.
 * Returns null if either value is missing.
 */
export async function getAuthInfo(): Promise<AuthInfo | null> {
  const token = await AsyncStorage.getItem('admin_token');
  const adminId = await AsyncStorage.getItem('admin_id');
  if (!token || !adminId) return null;
  return { token, adminId };
}

/**
 * Handles a 401/auth error by clearing stored credentials and navigating to login.
 * @param router  expo-router instance
 * @param language current language code ('et' | 'en')
 */
export async function handleAuthFailure(
  router: { replace: (path: string) => void },
  language: string = 'en',
) {
  await AsyncStorage.multiRemove([
    'admin_token',
    'admin_id',
    'admin_stay_signed_in',
  ]);
  Alert.alert(
    language === 'et' ? 'Seanss aegunud' : 'Session Expired',
    language === 'et'
      ? 'Palun logige uuesti sisse'
      : 'Please log in again',
    [{ text: 'OK', onPress: () => router.replace('/admin/login') }],
  );
}

/**
 * Wrapper around fetch that automatically handles 401 responses.
 * Returns the Response object on success, or null when a 401 triggers re-login.
 */
export async function authFetch(
  url: string,
  options: RequestInit,
  router: { replace: (path: string) => void },
  language: string = 'en',
): Promise<Response | null> {
  const response = await fetch(url, options);
  if (response.status === 401) {
    await handleAuthFailure(router, language);
    return null;
  }
  return response;
}

/**
 * Silently verify the stored token against the backend.
 * Returns true if valid, false otherwise. Does NOT redirect.
 */
export async function verifyTokenSilent(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem('admin_token');
    if (!token) return false;
    const res = await fetch(`${API_URL}/api/admin/verify/${token}`);
    return res.ok;
  } catch {
    // Network error — treat as "unknown", don't invalidate
    return true;
  }
}
