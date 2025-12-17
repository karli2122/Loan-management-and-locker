import Constants from 'expo-constants';

function normalize(url: string) {
  let clean = url.trim();
  while (clean.endsWith('/')) clean = clean.slice(0, -1);
  while (clean.toLowerCase().endsWith('/api')) clean = clean.slice(0, -4);
  return clean;
}

const raw =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  'https://loantrack-23.preview.emergentagent.com';

const API_URL = normalize(raw);

export default API_URL;

/**
 * Build an API endpoint URL under the /api prefix using the normalized backend base.
 * Accepts paths with or without a leading slash.
 */
export const buildApiUrl = (path: string) =>
  `${API_URL}/api/${path.replace(/^\/+/, '')}`;
