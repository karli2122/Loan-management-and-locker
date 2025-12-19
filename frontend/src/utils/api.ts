/**
 * API utility functions for consistent endpoint URL generation
 * HARDCODED URL to fix APK build issues with environment variables
 */

// Hardcoded base URL - environment variables are unreliable in EAS builds
const BASE_URL = 'https://loantrack-23.preview.emergentagent.com';

export const getBaseUrl = (): string => {
  return BASE_URL;
};

export const getApiUrl = (endpoint: string): string => {
  // Remove leading slash from endpoint
  let cleanEndpoint = endpoint.replace(/^\//, '');
  // Ensure endpoint starts with 'api/' - if not, add it
  if (!cleanEndpoint.startsWith('api/')) {
    cleanEndpoint = 'api/' + cleanEndpoint;
  }
  // Remove double 'api/api/' if present
  cleanEndpoint = cleanEndpoint.replace(/^api\/api\//, 'api/');
  
  const finalUrl = `${BASE_URL}/${cleanEndpoint}`;
  return finalUrl;
};

// For use in template literals
export const API_BASE_URL = BASE_URL;
