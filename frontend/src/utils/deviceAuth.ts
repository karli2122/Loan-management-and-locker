import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStorage';

const DEVICE_TOKEN_KEY = 'client_device_token';

export async function getDeviceToken(): Promise<string> {
  try {
    return (await getSecureItem(DEVICE_TOKEN_KEY)) || '';
  } catch {
    // Never let storage problems break status polling; the legacy API needs no token.
    return '';
  }
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
  // New codes: 8 = device_admin, 9 = device_owner.
  // Existing 16/17-character codes are still accepted.
  if (stored === 'device_admin' || stored === 'device_owner') return stored;
  const n = (code || '').trim().length;
  if (n === 9 || n === 17 || n >= 17) return 'device_owner';
  return 'device_admin';
}

/** Accepted registration code lengths: 8 (Device Admin), 9 (Device Owner), legacy 16/17. */
export const VALID_CODE_LENGTHS = [8, 9, 16, 17];
export const MAX_CODE_LENGTH = 17;

/** Upper-case and strip whitespace / separators a keyboard or paste may add. */
export function normalizeRegistrationCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[\s\-_.]/g, '');
}

export function isValidRegistrationCodeLength(code: string): boolean {
  return VALID_CODE_LENGTHS.includes((code || '').length);
}
