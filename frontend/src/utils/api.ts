/**
 * API utility functions for consistent endpoint URL generation
 */

const FALLBACK_URL = 'https://apkdebug.preview.emergentagent.com';

export const getBaseUrl = (): string => {
  let url = process.env.EXPO_PUBLIC_BACKEND_URL || FALLBACK_URL;
  // Remove trailing slash
  url = url.replace(/\/$/, '');
  // Remove /api suffix if present (we'll add it in getApiUrl)
  url = url.replace(/\/api$/, '');
  return url;
};

export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getBaseUrl();
  // Remove leading slash from endpoint
  let cleanEndpoint = endpoint.replace(/^\//, '');
  // Ensure endpoint starts with 'api/' - if not, add it
  if (!cleanEndpoint.startsWith('api/')) {
    cleanEndpoint = 'api/' + cleanEndpoint;
  }
  // Remove double 'api/api/' if present
  cleanEndpoint = cleanEndpoint.replace(/^api\/api\//, 'api/');
  
  const finalUrl = `${baseUrl}/${cleanEndpoint}`;
  console.log('API URL:', finalUrl);
  return finalUrl;
};

// For use in template literals
export const API_BASE_URL = getBaseUrl();
