import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStorage';

const DEVICE_TOKEN_KEY = 'client_device_token';

export async function getDeviceToken(): Promise<string> {
  return (await getSecureItem(DEVICE_TOKEN_KEY)) || '';
}

export async function setDeviceToken(token: string): Promise<void> {
  await setSecureItem(DEVICE_TOKEN_KEY, token);
}

export async function clearDeviceToken(): Promise<void> {
  await deleteSecureItem(DEVICE_TOKEN_KEY);
}

/** Header used by device-facing API calls. Prefer this over a query string. */
export function deviceAuthHeaders(token?: string): Record<string, string> {
  const value = token || '';
  return value ? { 'X-Device-Token': value } : {};
}

export function lockModeFromRegistrationCode(code: string, stored?: string | null): 'device_admin' | 'device_owner' {
  if (stored === 'device_admin' || stored === 'device_owner') return stored;
  const n = (code || '').trim().length;
  if (n >= 17 || n === 9) return 'device_owner';
  return 'device_admin';
}
