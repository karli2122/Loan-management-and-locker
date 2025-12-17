/**
 * API utility functions for consistent endpoint URL generation
 */

const FALLBACK_URL = 'https://loantrack-23.preview.emergentagent.com';

export const getBaseUrl = (): string => {
  const url = process.env.EXPO_PUBLIC_BACKEND_URL || FALLBACK_URL;
  return url.replace(/\/$/, ''); // Remove trailing slash
};

export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getBaseUrl();
  const cleanEndpoint = endpoint.replace(/^\//, ''); // Remove leading slash
  return `${baseUrl}/${cleanEndpoint}`;
};

// For use in fetch calls
export const API_BASE_URL = getBaseUrl();
