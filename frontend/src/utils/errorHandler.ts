/**
 * Utility functions for handling and displaying errors
 */

/**
 * Extracts a meaningful error message from various error types
 * @param error - The error object/string to extract a message from
 * @param defaultMessage - Default message if extraction fails
 * @returns A string error message suitable for display
 */
export function getErrorMessage(error: any, defaultMessage: string = 'An unexpected error occurred'): string {
  // Handle Error instances
  if (error instanceof Error) {
    return error.message;
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  
  // Try to extract message from error object
  if (error && typeof error === 'object') {
    // Check for common error properties
    if (error.message) {
      if (typeof error.message === 'string') {
        return error.message;
      }
      // If message is an object, try to stringify it
      try {
        return JSON.stringify(error.message);
      } catch {
        // Fall through to next checks
      }
    }
    
    if (error.detail) {
      if (typeof error.detail === 'string') {
        return error.detail;
      }
      try {
        return JSON.stringify(error.detail);
      } catch {
        // Fall through to next checks
      }
    }
    
    // If error is a plain object, try to stringify it
    try {
      const stringified = JSON.stringify(error);
      // Only return stringified version if it's not empty/default
      if (stringified && stringified !== '{}' && stringified !== 'null') {
        return stringified;
      }
    } catch {
      // Ignore stringify errors
    }
  }
  
  // Return default message if all else fails
  return defaultMessage;
}

/**
 * Safe error message extraction with console logging
 * @param error - The error to process
 * @param context - Context string for logging (e.g., 'Add loan', 'Delete client')
 * @param defaultMessage - Default message if extraction fails
 * @returns A string error message suitable for display
 */
export function handleError(error: any, context: string, defaultMessage?: string): string {
  console.error(`${context} error:`, error);
  return getErrorMessage(error, defaultMessage);
}
