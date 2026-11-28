/**
 * Tamper policy for revoked protection permissions.
 *
 * The phone is NEVER wiped. The scary "your data will be erased" warning stays as a
 * deterrent, but the actual response is: report to the lender, then a local full
 * lock that is released when the permissions are re-granted (or by the lender).
 */

/** Permissions whose revocation counts as tampering. Battery optimisation and
 *  autostart are excluded: OEMs reset them on their own (false positives). */
export const TAMPER_PERMS = [
  'accessibility',
  'overlay',
  'location',
  'notification',
  'usageStats',
  'notificationListener',
] as const;

/** Must-have permissions (plus Device Admin) for the protection to count as complete. */
export const REQUIRED_PERMS = ['overlay', 'batteryOptimization', 'notification'] as const;

/** Time between the first warning and the tamper lock. */
export const TAMPER_GRACE_MS = 15 * 60 * 1000;

/** How long the borrower may leave the lock screen to re-grant permissions. */
export const TAMPER_FIX_WINDOW_MS = 3 * 60 * 1000;

/** Cooldown after the borrower postpones / cancels the Device Admin prompt. */
export const ADMIN_PROMPT_COOLDOWN_MS = 10 * 60 * 1000;

export type PermState = Record<string, boolean>;

/** Sticky baseline: a permission that was granted once stays "expected". */
export function mergeBaseline(prev: PermState | null, real: PermState): PermState {
  const out: PermState = { ...(prev || {}) };
  for (const k of Object.keys(real)) out[k] = !!(out[k] || real[k]);
  return out;
}

/** Tamper-relevant permissions that are expected (baseline) but currently missing. */
export function revokedTamperPerms(baseline: PermState | null, real: PermState): string[] {
  if (!baseline) return [];
  return TAMPER_PERMS.filter((p) => baseline[p] && !real[p]);
}

export function requiredGranted(real: PermState): boolean {
  return REQUIRED_PERMS.every((p) => !!real[p]);
}
