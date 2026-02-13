/**
 * Tests for errorHandler utility
 */

import { getErrorMessage } from '../errorHandler';

describe('getErrorMessage', () => {
  test('handles Error instances', () => {
    const error = new Error('Test error message');
    expect(getErrorMessage(error)).toBe('Test error message');
  });

  test('handles string errors', () => {
    expect(getErrorMessage('Simple error string')).toBe('Simple error string');
  });

  test('handles objects with message property', () => {
    const error = { message: 'Object error message' };
    expect(getErrorMessage(error)).toBe('Object error message');
  });

  test('handles objects with detail property', () => {
    const error = { detail: 'Error detail message' };
    expect(getErrorMessage(error)).toBe('Error detail message');
  });

  test('handles objects with non-string message', () => {
    const error = { message: { nested: 'error' } };
    const result = getErrorMessage(error);
    expect(result).toContain('nested');
    expect(result).toContain('error');
  });

  test('handles plain objects by stringifying', () => {
    const error = { code: 500, status: 'error' };
    const result = getErrorMessage(error);
    expect(result).toContain('500');
    expect(result).toContain('error');
  });

  test('returns default message for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
  });

  test('uses custom default message', () => {
    expect(getErrorMessage(null, 'Custom default')).toBe('Custom default');
  });

  test('handles empty objects', () => {
    expect(getErrorMessage({})).toBe('An unexpected error occurred');
  });

  test('prevents Object Object display', () => {
    const complexError = { nested: { data: { value: 'test' } } };
    const result = getErrorMessage(complexError);
    expect(result).not.toBe('[Object Object]');
    expect(result).not.toBe('[object Object]');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
