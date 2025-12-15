import Constants from 'expo-constants';

function normalize(url: string) {
  let clean = url.trim();
  if (clean.endsWith('/')) clean = clean.slice(0, -1);
  while (clean.toLowerCase().endsWith('/api')) clean = clean.slice(0, -4);
  return clean;
}

const raw =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  'https://deviceloan-1.preview.emergentagent.com';

const API_URL = normalize(raw);

export default API_URL;
