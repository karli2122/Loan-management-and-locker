/**
 * Compatibility helpers for the lock protocol.
 *
 * The live api.paylock.pro still runs the older API: /api/device/status returns
 * only is_locked / lock_message (no lock_signature, lock_issued_at or lock_level),
 * and POST /clients/{id}/lock ignores lock_level. These helpers let the apps work
 * against both the legacy and the newer backend.
 */

/** Invisible marker the admin app appends to lock_message to request restricted mode on the legacy API. */
export const RESTRICTED_MARKER = '\u2063R\u2063';

export function stripLockMarker(message?: string | null): string {
  if (!message) return '';
  return String(message).split(RESTRICTED_MARKER).join('').trim();
}

export function withRestrictedMarker(message: string): string {
  return `${stripLockMarker(message)}${RESTRICTED_MARKER}`;
}

/** True when the response comes from the legacy API that never signs lock decisions. */
export function isLegacyUnsignedStatus(status: any): boolean {
  if (!status || typeof status !== 'object') return false;
  return status.lock_signature == null && status.lock_issued_at == null;
}

/**
 * Fill lock_level from the restricted marker (legacy API) and strip the marker from
 * the message so it never shows on screen.
 */
export function normalizeLockStatus<T extends Record<string, any>>(status: T): T {
  if (!status || typeof status !== 'object') return status;
  const out: any = { ...status };
  const raw = typeof out.lock_message === 'string' ? out.lock_message : '';
  const hasMarker = raw.includes(RESTRICTED_MARKER);
  if (hasMarker) out.lock_message = stripLockMarker(raw);
  if (!out.lock_level) {
    if (!out.is_locked) out.lock_level = 'none';
    else out.lock_level = hasMarker ? 'restricted' : 'full';
  }
  return out;
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Whole days from today to the given date (negative = overdue). */
export function daysUntil(dateValue?: string | null): number | null {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - today.getTime()) / 86400000);
}

/**
 * Loan figures for the client "loan progress" card. The legacy status endpoint has
 * loan_amount, outstanding_balance, monthly_emi and loan_due_date only, so derive
 * percent paid / days until due / next amount from those when the newer fields are absent.
 */
export function deriveLoanFigures(status: any) {
  const outstanding = Math.max(0, toNumber(status?.outstanding_balance) ?? 0);
  const totalCandidates = [
    toNumber(status?.total_amount),
    toNumber(status?.total_amount_due),
    toNumber(status?.loan_amount),
  ].filter((n): n is number => n !== null && n > 0);
  let total = totalCandidates.length ? totalCandidates[0] : 0;
  const totalPaid = toNumber(status?.total_paid);
  if (totalPaid !== null && totalPaid > 0 && total < totalPaid + outstanding) {
    total = totalPaid + outstanding;
  }
  if (total < outstanding) total = outstanding; // interest/fees pushed balance above principal

  let percentPaid = toNumber(status?.percent_paid);
  if (percentPaid === null) {
    if (totalPaid !== null && total > 0) percentPaid = (totalPaid / total) * 100;
    else if (total > 0) percentPaid = ((total - outstanding) / total) * 100;
    else percentPaid = 0;
  }
  percentPaid = Math.min(100, Math.max(0, percentPaid));

  const dueDate = status?.next_payment_due || status?.loan_due_date || status?.emi_due_date || null;
  const rawDays = status?.days_until_due;
  const daysUntilDue = typeof rawDays === 'number' && Number.isFinite(rawDays) ? rawDays : daysUntil(dueDate);

  const nextCandidates = [
    toNumber(status?.next_payment_amount),
    toNumber(status?.monthly_emi),
    toNumber(status?.emi_amount),
  ].filter((n): n is number => n !== null && n > 0);
  let nextPaymentAmount = nextCandidates.length ? nextCandidates[0] : outstanding;
  if (outstanding > 0 && nextPaymentAmount > outstanding) nextPaymentAmount = outstanding;
  if (outstanding <= 0) nextPaymentAmount = 0;

  return { outstanding, total, percentPaid, daysUntilDue, dueDate, nextPaymentAmount };
}
