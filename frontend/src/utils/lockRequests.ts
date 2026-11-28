import AsyncStorage from '@react-native-async-storage/async-storage';
import { heartbeatAgeMs, parseServerDate } from './heartbeat';

/**
 * The live server has no lock acknowledgement. We remember when this admin app
 * asked for a lock/unlock and compare it to the phone's last check-in: the phone
 * fetches its lock state on every check-in, so a check-in after the request means
 * the phone has seen (and applied) it.
 */
export type LockAction = 'lock' | 'unlock' | 'warning';
export interface LockRequest { action: LockAction; at: number; hb?: string | null }

const key = (id: string) => `lock_req_${id}`;

/** Call only after the server accepted the request. `lastHeartbeat` = the phone's last check-in at that moment. */
export async function recordLockRequest(clientId: string, action: LockAction, lastHeartbeat?: string | null) {
  try {
    await AsyncStorage.setItem(key(clientId), JSON.stringify({ action, at: Date.now(), hb: lastHeartbeat ?? null }));
  } catch {}
}

export async function getLockRequest(clientId: string): Promise<LockRequest | null> {
  try {
    const raw = await AsyncStorage.getItem(key(clientId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}

export type LockSyncState = 'unlocked' | 'applied' | 'pending' | 'phone_offline' | 'unconfirmed';

export interface LockSync {
  state: LockSyncState;
  requestedAt: number | null;
  lastSeen: any;
}

/**
 * is_locked is what the server wants. Whether the phone follows it is inferred from
 * its last check-in versus the time the request was made.
 */
export function computeLockSync(client: any, req: LockRequest | null): LockSync {
  const lastSeen = client?.last_heartbeat ?? null;
  const hb = parseServerDate(lastSeen)?.getTime() ?? null;
  const age = heartbeatAgeMs(lastSeen);
  const wantsLock = !!client?.is_locked;
  const relevant = req && (wantsLock ? req.action === 'lock' : req.action === 'unlock') ? req : null;
  const base = { requestedAt: relevant?.at ?? null, lastSeen };

  if (!client?.is_registered) return { state: wantsLock ? 'unconfirmed' : 'unlocked', ...base };

  if (relevant) {
    // Applied = the phone checked in AFTER the request. With a recorded baseline heartbeat we need a
    // strictly newer one (immune to clock differences); otherwise fall back to the admin phone's clock.
    const baseline = relevant.hb ? parseServerDate(relevant.hb)?.getTime() ?? null : null;
    const seenAfter = baseline !== null ? hb !== null && hb > baseline : hb !== null && hb >= relevant.at;
    if (seenAfter) {
      return { state: wantsLock ? 'applied' : 'unlocked', ...base };
    }
    if (age === null || age > 30 * 60 * 1000) return { state: 'phone_offline', ...base };
    return { state: 'pending', ...base };
  }
  if (!wantsLock) return { state: 'unlocked', ...base };
  // Locked from somewhere else (or an older session): we only know when the phone was last seen.
  if (age === null || age > 24 * 60 * 60 * 1000) return { state: 'phone_offline', ...base };
  return { state: 'unconfirmed', ...base };
}
