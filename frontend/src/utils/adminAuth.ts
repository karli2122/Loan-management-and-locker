import { getSecureItem, clearSecureAuth } from './secureStorage';
import API_URL from '../constants/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Shared admin authentication utilities.
 *
 * Every admin request goes through authedFetch. When the server answers 401 for a
 * request made with the CURRENT token, the session is considered expired: the stored
 * credentials are cleared and every listener (the admin layout) is told to show the
 * "Session expired" screen. Screens must never treat a failed request as "no data":
 * they keep what they already show and let this flow take over.
 *
 * Sensitive credentials (admin_token, admin_id) live in the device keystore via
 * secureStorage; non-sensitive preferences stay in AsyncStorage.
 */

export interface AuthInfo {
  token: string;
  adminId: string;
}

// ─── Session-expired event ──────────────────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();
let sessionExpired = false;

/** Subscribe to "session expired". Returns an unsubscribe function. */
export function onSessionExpired(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Call after a successful login so a new expiry can be reported again. */
export function resetSessionExpired() {
  sessionExpired = false;
}

export function isSessionExpired() {
  return sessionExpired;
}

/** Clear credentials and notify listeners (once per session). */
export async function expireSession() {
  if (sessionExpired) return;
  sessionExpired = true;
  try {
    await clearSecureAuth();
    await AsyncStorage.removeItem('admin_stay_signed_in').catch(() => {});
  } catch {}
  listeners.forEach((l) => {
    try {
      l();
    } catch {}
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build the Authorization header for admin requests. */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Retrieve the current admin token and id from secure storage (null when missing). */
export async function getAuthInfo(): Promise<AuthInfo | null> {
  const token = await getSecureItem('admin_token');
  const adminId = await getSecureItem('admin_id');
  if (!token || !adminId) return null;
  return { token, adminId };
}

/**
 * Kept for older call sites: treat as "the session is no longer valid".
 * The router/language arguments are no longer needed; the layout shows the screen.
 */
export async function handleAuthFailure(_router?: unknown, _language?: string) {
  await expireSession();
}

/**
 * Legacy wrapper: returns null when the session expired.
 */
export async function authFetch(
  url: string,
  options: RequestInit,
  _router?: unknown,
  _language?: string,
): Promise<Response | null> {
  const response = await authedFetch(url, options);
  if (response.status === 401) return null;
  return response;
}

/** Silently verify the stored token. Network errors count as "unknown" (valid). */
export async function verifyTokenSilent(): Promise<boolean> {
  try {
    const token = await getSecureItem('admin_token');
    if (!token) return false;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(`${API_URL}/api/admin/verify/${encodeURIComponent(token)}`, { signal: ctl.signal });
      // Only an explicit rejection means the token is bad; 5xx / 429 are "unknown".
      return !(res.status === 401 || res.status === 403 || res.status === 404);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return true;
  }
}

/** Remove admin_token from a URL (for display or logging only). */
export function stripAdminTokenParam(url: string): string {
  return url
    .replace(/([?&])admin_token=[^&]*/g, '$1')
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]$/, '');
}

/**
 * Ensure the legacy admin_token query parameter is present. The deployed
 * api.paylock.pro requires it on every admin route.
 */
export function withAdminTokenParam(url: string, token: string): string {
  if (!token) return url;
  // Always use the CURRENT token: a stale admin_token already in the URL must not win.
  url = stripAdminTokenParam(url);
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}admin_token=${encodeURIComponent(token)}`;
}

const DEFAULT_TIMEOUT_MS = 30000;
const UPLOAD_TIMEOUT_MS = 120000;

/**
 * Fetch helper for admin API calls.
 * Sends Authorization: Bearer AND keeps ?admin_token= (needed by the live server),
 * applies a timeout, and reports an expired session centrally on 401.
 * Always resolves with the Response (callers keep their own !ok handling).
 */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSecureItem('admin_token');
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const finalUrl = token ? withAdminTokenParam(url, token) : url;

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const init: RequestInit = { ...options, headers };
  if (!options.signal) {
    controller = new AbortController();
    init.signal = controller.signal;
    const isUpload = typeof FormData !== 'undefined' && options.body instanceof FormData;
    timer = setTimeout(() => controller?.abort(), isUpload ? UPLOAD_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  }

  try {
    const res = await fetch(finalUrl, init);
    if (res.status === 401 && token) {
      // Only react if the token we used is still the current one (a request that was
      // in flight during a re-login must not log the new session out).
      const current = await getSecureItem('admin_token');
      if (current === token) {
        await expireSession();
      }
    }
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Best-effort message from an error response body. */
export async function responseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.clone().json();
    const d = data?.detail ?? data?.error ?? data?.message;
    if (typeof d === 'string' && d) return d;
    if (Array.isArray(d)) return d.map((x: any) => x?.msg || x?.message).filter(Boolean).join(', ') || fallback;
  } catch {}
  return `${fallback} (${res.status})`;
}
