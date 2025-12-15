import Constants from 'expo-constants';

function normalize(url: string) {
  let clean = url.trim();
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  if (clean.toLowerCase().endsWith('/api')) clean = clean.slice(0, -4);
  return clean;
}

const raw =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  'https://deviceloan-1.preview.emergentagent.com';

const API_URL = normalize(raw);

/**
 * Build a fully qualified API URL from a relative path.
 * Trims leading/trailing slashes to avoid duplicate separators and supports empty paths.
 */
export const buildApiUrl = (path: string) => {
  const cleanPath = path.replace(/^\/+|\/+$/g, '');
  return cleanPath ? `${API_URL}/api/${cleanPath}` : `${API_URL}/api`;
};

export default API_URL;
