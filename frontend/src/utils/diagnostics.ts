import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = 'diagnostic_logs';
const API_ERROR_KEY = 'diagnostic_api_errors';
const MAX_ENTRIES = 50;

const safeParse = (raw: string | null): any[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const formatArgs = (args: any[]) => {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
};

const appendEntry = async (key: string, entry: any) => {
  const raw = await AsyncStorage.getItem(key);
  const entries = safeParse(raw);
  entries.push(entry);
  const trimmed = entries.slice(-MAX_ENTRIES);
  await AsyncStorage.setItem(key, JSON.stringify(trimmed));
};

export const initializeDiagnostics = () => {
  const globalAny: any = globalThis as any;
  if (globalAny.__diagnosticsInitialized) return;
  globalAny.__diagnosticsInitialized = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  const logWrapper = (level: string, original: (...args: any[]) => void) => {
    return (...args: any[]) => {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        message: formatArgs(args),
      };
      appendEntry(LOG_KEY, entry).catch(() => {});
      original(...args);
    };
  };

  console.log = logWrapper('log', originalLog);
  console.warn = logWrapper('warn', originalWarn);
  console.error = logWrapper('error', originalError);

  const originalFetch = globalAny.fetch;
  if (typeof originalFetch === 'function') {
    globalAny.fetch = async (...args: any[]) => {
      const request = args[0];
      const options = args[1] || {};
      const url = typeof request === 'string' ? request : request?.url;
      const method = (options.method || 'GET').toUpperCase();
      try {
        const response = await originalFetch(...args);
        if (!response.ok) {
          const entry = {
            timestamp: new Date().toISOString(),
            url,
            method,
            status: response.status,
            statusText: response.statusText,
          };
          appendEntry(API_ERROR_KEY, entry).catch(() => {});
        }
        return response;
      } catch (error: any) {
        const entry = {
          timestamp: new Date().toISOString(),
          url,
          method,
          error: error?.message || String(error),
        };
        appendEntry(API_ERROR_KEY, entry).catch(() => {});
        throw error;
      }
    };
  }
};

export const getDiagnosticLogs = async () => {
  const raw = await AsyncStorage.getItem(LOG_KEY);
  return safeParse(raw);
};

export const getApiErrors = async () => {
  const raw = await AsyncStorage.getItem(API_ERROR_KEY);
  return safeParse(raw);
};
