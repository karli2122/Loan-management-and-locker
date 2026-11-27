/**
 * Shared loan-status color system for the admin and client apps.
 *
 * Green  = paid up / current
 * Yellow = due soon (within DUE_SOON_DAYS)
 * Orange = overdue or warning lock level
 * Red    = locked (full or restricted)
 */
export const DUE_SOON_DAYS = 3;

export const LOAN_STATUS = {
  paid: {
    key: 'paid' as const,
    color: '#10B981',
    background: 'rgba(16, 185, 129, 0.15)',
    label: 'Paid up',
  },
  current: {
    key: 'current' as const,
    color: '#10B981',
    background: 'rgba(16, 185, 129, 0.15)',
    label: 'On track',
  },
  noLoan: {
    key: 'noLoan' as const,
    color: '#64748B',
    background: 'rgba(100, 116, 139, 0.15)',
    label: 'No loan',
  },
  dueSoon: {
    key: 'dueSoon' as const,
    color: '#EAB308',
    background: 'rgba(234, 179, 8, 0.15)',
    label: 'Due soon',
  },
  overdue: {
    key: 'overdue' as const,
    color: '#F97316',
    background: 'rgba(249, 115, 22, 0.15)',
    label: 'Overdue',
  },
  locked: {
    key: 'locked' as const,
    color: '#EF4444',
    background: 'rgba(239, 68, 68, 0.15)',
    label: 'Locked',
  },
} as const;

export type LoanStatusKey = keyof typeof LOAN_STATUS;
export type LoanStatusStyle = (typeof LOAN_STATUS)[LoanStatusKey];

export type LoanStatusInput = {
  is_locked?: boolean | null;
  lock_level?: string | null;
  outstanding_balance?: number | null;
  days_overdue?: number | null;
  days_until_due?: number | null;
  loan_due_date?: string | null;
  next_payment_due?: string | null;
  loan_amount?: number | null;
  total_amount_due?: number | null;
  total_paid?: number | null;
};

function daysUntilDue(input: LoanStatusInput): number | null {
  if (typeof input.days_until_due === 'number' && !Number.isNaN(input.days_until_due)) {
    return input.days_until_due;
  }
  if (typeof input.days_overdue === 'number' && input.days_overdue > 0) {
    return -input.days_overdue;
  }
  const due = input.loan_due_date || input.next_payment_due;
  if (!due) return null;
  const parsed = new Date(due);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return Math.round((parsed.getTime() - today.getTime()) / 86400000);
}

export function resolveLoanStatus(input: LoanStatusInput): LoanStatusStyle {
  const level = (input.lock_level || '').toLowerCase();
  if (input.is_locked || level === 'full' || level === 'restricted') {
    return LOAN_STATUS.locked;
  }
  const outstanding = Number(input.outstanding_balance || 0);
  if (outstanding <= 0) {
    // "Paid up" only when there actually was a loan; a client with no loan data yet
    // (or an API that does not send loan totals) must not show as paid.
    const hadLoan = Number(input.loan_amount || 0) > 0 || Number(input.total_amount_due || 0) > 0 ||
      Number(input.total_paid || 0) > 0;
    return hadLoan ? LOAN_STATUS.paid : LOAN_STATUS.noLoan;
  }
  if (level === 'warning') {
    return LOAN_STATUS.overdue;
  }
  const days = daysUntilDue(input);
  if (typeof days === 'number' && days < 0) {
    return LOAN_STATUS.overdue;
  }
  if (typeof days === 'number' && days <= DUE_SOON_DAYS) {
    return LOAN_STATUS.dueSoon;
  }
  // Outstanding but not due soon and not overdue: on track (NOT "paid up").
  return LOAN_STATUS.current;
}
