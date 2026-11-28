import { parseServerDate } from './heartbeat';

/**
 * The server (backend/utils/overdue.py, run hourly) locks a phone by itself when the client
 * still owes money, has no auto-lock opt-out, and is MORE days overdue than the grace period.
 * A manual unlock does not change any of those facts, so the next hourly run locks the phone
 * again. These helpers let the admin app say so instead of showing a silent "success".
 */
export interface AutoLockInfo {
  /** Unlocked now, but the server's auto-lock would lock it again at its next run. */
  atRisk: boolean;
  /** Locked right now, and the lock came from the server's auto-lock. */
  autoLocked: boolean;
  /** Locked by auto-lock AFTER the last manual unlock (= it was re-locked). */
  relocked: boolean;
  days: number;
  grace: number;
}

export function getAutoLockInfo(client: any): AutoLockInfo {
  const days = Math.max(0, Math.floor(Number(client?.days_overdue) || 0));
  const graceRaw = Number(client?.auto_lock_grace_days);
  const grace = Number.isFinite(graceRaw) && client?.auto_lock_grace_days != null ? graceRaw : 3;
  const owes = Number(client?.outstanding_balance ?? 0) > 0;
  // Per-client opt-out; the admin-wide switch is not visible here, so "at risk" means "may".
  const enabled = client?.auto_lock_enabled !== false;
  const locked = !!client?.is_locked;
  const autoLocked = locked && client?.lock_reason === 'auto_lock';
  const atRisk = !locked && enabled && owes && days > grace;

  let relocked = false;
  if (autoLocked) {
    const lockedAt = parseServerDate(client?.locked_at)?.getTime();
    const unlockedAt = parseServerDate(client?.unlocked_at)?.getTime();
    relocked = !!lockedAt && !!unlockedAt && lockedAt > unlockedAt;
  }
  return { atRisk, autoLocked, relocked, days, grace };
}
