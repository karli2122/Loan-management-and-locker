import AsyncStorage from '@react-native-async-storage/async-storage';
import { redactText } from './redact';

const LOG_KEY = 'diagnostic_logs';
const API_ERROR_KEY = 'diagnostic_api_errors';

/**
 * Admin app only: makes sure nothing sensitive reaches logcat or the shared
 * diagnostics report. Wraps console.* so every argument is redacted before it is
 * logged (and therefore before the shared diagnostics wrapper stores it), and
 * scrubs any entries stored by earlier versions.
 */
export function installAdminLogRedaction() {
  const g: any = globalThis as any;
  if (g.__adminRedactionInstalled) return;
  g.__adminRedactionInstalled = true;
  (['log', 'warn', 'error', 'info'] as const).forEach((level) => {
    const original = (console as any)[level]?.bind(console);
    if (!original) return;
    (console as any)[level] = (...args: any[]) => {
      try {
        original(...args.map((a) => redactText(a)));
      } catch {
        // never break the app because of logging
      }
    };
  });
}

async function scrubKey(key: string) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  const cleaned = redactText(raw);
  if (cleaned !== raw) await AsyncStorage.setItem(key, cleaned);
}

export async function scrubStoredDiagnostics() {
  try {
    await scrubKey(LOG_KEY);
    await scrubKey(API_ERROR_KEY);
  } catch {}
}
