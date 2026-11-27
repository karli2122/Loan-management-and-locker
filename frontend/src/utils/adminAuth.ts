import { Alert } from 'react-native';
import API_URL from '../constants/api';
import { getSecureItem, clearSecureAuth } from './secureStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared admin authentication utilities.
 * Centralises token retrieval, validation, and 401 handling
 * so every admin screen behaves consistently.
 *
 * Sensitive credentials (admin_token, admin_id) live in the device keystore via
 * secureStorage; non-sensitive preferences (e.g. admin_stay_signed_in) stay in
 * AsyncStorage.
 */

export interface AuthInfo {
  token: string;
  adminId: string;
}

/**
 * Build the Authorization header for admin requests.
 * Prefer this over appending ?admin_token= to URLs, which leaks tokens to logs.
 */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Retrieve the current admin token and id from secure storage.
 * Returns null if either value is missing.
 */
export async function getAuthInfo(): Promise<AuthInfo | null> {
  const token = await getSecureItem('admin_token');
  const adminId = await getSecureItem('admin_id');
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
  await clearSecureAuth();
  await AsyncStorage.removeItem('admin_stay_signed_in').catch(() => {});
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
    const token = await getSecureItem('admin_token');
    if (!token) return false;
    const res = await fetch(`${API_URL}/api/admin/verify/${token}`);
    return res.ok;
  } catch {
    // Network error — treat as "unknown", don't invalidate
    return true;
  }
}


/**
 * Remove admin_token from a URL so it is not logged in access/proxy logs.
 * Do not use this on the request itself: the currently deployed
 * api.paylock.pro (and many routes in this repo) still require the
 * legacy ?admin_token= query parameter and will 422 without it.
 */
export function stripAdminTokenParam(url: string): string {
  const cleaned = url
    .replace(/([?&])admin_token=[^&]*/g, '$1')
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]$/, '');
  return cleaned;
}

/**
 * Ensure the legacy admin_token query parameter is present.
 * Callers may already append it; do not duplicate or rewrite an existing value.
 */
export function withAdminTokenParam(url: string, token: string): string {
  if (!token) return url;
  if (/[?&]admin_token=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}admin_token=${encodeURIComponent(token)}`;
}

/**
 * Fetch helper for admin API calls.
 * Sends Authorization: Bearer (for newer require_admin routes) AND keeps
 * ?admin_token= (required by the live api.paylock.pro and by list_clients
 * in this repo, which still uses Query(...)).
 */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSecureItem('admin_token');
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const finalUrl = token ? withAdminTokenParam(url, token) : url;
  return fetch(finalUrl, { ...options, headers });
}
