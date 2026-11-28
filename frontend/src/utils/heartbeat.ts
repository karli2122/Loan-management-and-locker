/**
 * One definition of "how recently did the phone check in", used by every admin screen.
 *   online  : seen within 30 minutes
 *   stale   : seen within 24 hours
 *   offline : not seen for more than 24 hours
 *   never   : never connected
 */
export const HB_ONLINE_MS = 30 * 60 * 1000;
export const HB_STALE_MS = 24 * 60 * 60 * 1000;

export type HeartbeatStatus = 'online' | 'stale' | 'offline' | 'never';

/**
 * The server stores UTC timestamps without a timezone suffix ("2026-11-28T06:00:00").
 * JavaScript would read those as local time, which skews every "x minutes ago" by the
 * phone's UTC offset. Treat suffix-less timestamps as UTC.
 */
export function parseServerDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function heartbeatAgeMs(ts: any): number | null {
  const d = parseServerDate(ts);
  return d ? Math.max(0, Date.now() - d.getTime()) : null;
}

export function heartbeatStatus(ts: any): HeartbeatStatus {
  const age = heartbeatAgeMs(ts);
  if (age === null) return 'never';
  if (age <= HB_ONLINE_MS) return 'online';
  if (age <= HB_STALE_MS) return 'stale';
  return 'offline';
}

export const HB_COLORS: Record<HeartbeatStatus, string> = {
  online: '#10B981',
  stale: '#F59E0B',
  offline: '#EF4444',
  never: '#64748B',
};

export function formatAgo(ts: any, language: string = 'en'): string {
  const age = heartbeatAgeMs(ts);
  const et = language === 'et';
  if (age === null) return et ? 'pole ühendunud' : 'never';
  const mins = Math.floor(age / 60000);
  if (mins < 2) return et ? 'just praegu' : 'just now';
  if (mins < 60) return et ? `${mins} min tagasi` : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return et ? `${hrs} h tagasi` : `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return et ? `${days} p tagasi` : `${days} d ago`;
}
