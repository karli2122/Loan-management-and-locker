import Constants from 'expo-constants';

function normalize(url: string) {
  let clean = url.trim();
  while (clean.endsWith('/')) clean = clean.slice(0, -1);
  while (clean.toLowerCase().endsWith('/api')) clean = clean.slice(0, -4);
  return clean;
}

export const FALLBACK_BACKEND = 'https://frontend-test-suite-3.preview.emergentagent.com';

const rawCandidate =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  FALLBACK_BACKEND;

const raw = rawCandidate && rawCandidate.trim() ? rawCandidate : FALLBACK_BACKEND;

export const API_BASE_URL = normalize(raw);
const API_URL = API_BASE_URL;

export default API_URL;

/**
 * Build an API endpoint URL under the /api prefix using the normalized backend base.
 * Accepts paths with or without a leading slash.
 */
export const buildApiUrl = (path: string) =>
  `${API_URL}/api/${path.replace(/^\/+/, '')}`;
