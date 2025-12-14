import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  'https://deviceloan-1.preview.emergentagent.com/api';

export default API_URL;
