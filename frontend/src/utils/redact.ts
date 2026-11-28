/**
 * Redaction helpers for anything that is logged, stored as diagnostics or shared
 * in a report. Removes auth tokens, passwords, registration codes and common PII
 * (emails, phone numbers, long ID numbers).
 */

const KEY_VALUE = /\b(admin_token|access_token|device_token|token|password|passwd|authorization|api_key|secret|registration_code|birth_number)=([^&\s"'`]+)/gi;
const JSON_FIELD = /("(?:admin_token|access_token|device_token|token|password|registration_code|birth_number|email|phone|address|name|first_name|last_name)"\s*:\s*")[^"]*(")/gi;
const BEARER = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g;
const VERIFY_PATH = /(\/admin\/verify\/)[^/\s?"'`]+/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const INTL_PHONE = /\+\d[\d\s-]{6,}\d/g;
const LONG_NUMBER = /\b\d{9,}\b/g;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;

export function redactText(input: any): string {
  let s = typeof input === 'string' ? input : safeStringify(input);
  s = s.replace(KEY_VALUE, '$1=[redacted]');
  s = s.replace(JSON_FIELD, '$1[redacted]$2');
  s = s.replace(BEARER, 'Bearer [redacted]');
  s = s.replace(VERIFY_PATH, '$1[redacted]');
  s = s.replace(EMAIL, '[email]');
  s = s.replace(INTL_PHONE, '[phone]');
  s = s.replace(LONG_HEX, '[hex]');
  s = s.replace(LONG_NUMBER, '[number]');
  return s;
}

function safeStringify(v: any): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Redact an URL: keeps the path, drops token values and masks id-like path parts. */
export function redactUrl(url: any): string {
  return redactText(String(url ?? ''));
}
