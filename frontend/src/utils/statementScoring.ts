/**
 * Statement scoring engine (runs on the phone; the backend has a Python twin with the same rules).
 *
 *   scoreStatement(analysis, text)  ->  { affordability, flags, risk }
 *
 * `analysis` is what /api/bank-statements/analyze returns (categories, summary, monthly breakdown;
 * the OLD server has no transactions). `text` is the statement text re-read on the phone
 * (statementBytesToText). Transaction-level checks use that text on a best-effort basis: every
 * flag lists the lines that triggered it so a human can verify them.
 */
import {
  SCORING, LENDER_KEYWORDS, COLLECTOR_KEYWORDS, GAMBLING_KEYWORDS, LOAN_DISBURSEMENT_WORDS,
  REPAYMENT_WORDS, CATEGORY_PATTERNS, NEW_ACCOUNT_WORDS,
} from '../config/statementScoringConfig';

export type Direction = 'in' | 'out' | 'unknown';
export type FlagId = 'quick_loans' | 'collector' | 'new_history' | 'income_stopped' | 'gambling';
export type FlagState = 'yes' | 'no' | 'unknown';
export type RiskLabel = 'low' | 'medium' | 'high';

export interface Evidence {
  date: string | null; // ISO yyyy-mm-dd
  description: string;
  amount: number | null; // always positive
  direction: Direction;
  keyword: string;
}
export interface Flag {
  id: FlagId;
  state: FlagState;
  count: number;
  total: number;
  evidence: Evidence[];
  /** machine readable reason / note, translated in the UI */
  reason: string;
  params: Record<string, string | number>;
}
export interface Affordability {
  evaluable: boolean;
  months: number;
  monthly_income: number;
  excluded_loan_inflows: number; // total over the statement
  benefits_income: number; // informational: part of the income that looks like benefits/pension/child support (monthly)
  monthly_rent: number;
  monthly_utilities: number;
  monthly_loan_payments: number;
  disposable: number;
  repayment_share: number;
  suggested_monthly_payment: number;
  suggested_term_months: number;
  max_loan: number;
  max_loan_at_max_term: number;
  notes: string[];
}
export interface Scoring {
  version: 1;
  source: 'device' | 'server';
  constants: Record<string, number>;
  affordability: Affordability;
  flags: Flag[];
  risk: { label: RiskLabel; triggered: number; unknown: number };
}

// ---------------------------------------------------------------- helpers

const round2 = (n: number) => Math.round(n * 100) / 100;
const WORD_EDGE = 'A-Za-z0-9\u00C0-\u024F';

function keywordRegex(list: string[]): RegExp {
  const parts = list
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp(`(^|[^${WORD_EDGE}])(${parts.join('|')})(?![${WORD_EDGE}])`, 'i');
}
const LENDER_RE = keywordRegex(LENDER_KEYWORDS);
const COLLECTOR_RE = keywordRegex(COLLECTOR_KEYWORDS);
const GAMBLING_RE = keywordRegex(GAMBLING_KEYWORDS);

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// No lookbehind (older JS engines): the leading (^|[^0-9]) group does that job.
const DATE_RE = /(^|[^0-9])(?:(\d{1,2})[./](\d{1,2})[./](\d{4})|(\d{4})-(\d{2})-(\d{2}))(?![0-9])/g;
export function findDates(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(DATE_RE)) {
    const d = m[2] ? iso(+m[4], +m[3], +m[2]) : iso(+m[5], +m[6], +m[7]);
    if (d) out.push(d);
  }
  return out;
}
const stripDates = (line: string) => line.replace(DATE_RE, '$1 ');

const AMOUNT_RE = /([+\-\u2212\u2013]?)\s?(\d{1,3}(?:[ \u00a0.]\d{3})+|\d+)([.,]\d{2})(?!\d)/g;
export function findAmounts(line: string): { value: number; sign: '+' | '-' | '' }[] {
  const out: { value: number; sign: '+' | '-' | '' }[] = [];
  for (const m of stripDates(line).matchAll(AMOUNT_RE)) {
    const whole = m[2].replace(/[ \u00a0.]/g, '');
    const value = parseFloat(`${whole}.${m[3].slice(1)}`);
    if (!isFinite(value)) continue;
    out.push({ value, sign: m[1] === '+' ? '+' : m[1] ? '-' : '' });
  }
  return out;
}

const DAY = 86400000;
const toMs = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const addDays = (isoDate: string, n: number) => new Date(toMs(isoDate) + n * DAY).toISOString().slice(0, 10);

function parsePeriod(period?: string | null): { start: string; end: string } | null {
  if (!period) return null;
  const ds = findDates(String(period));
  if (ds.length >= 2) {
    const s = ds.slice().sort();
    return { start: s[0], end: s[s.length - 1] };
  }
  return null;
}

// ---------------------------------------------------------------- transaction-ish lines

interface Candidate extends Evidence {
  lineIndex: number;
}

const TOKEN_D = /(^|\s)(D|DEEBET|DEBIT)(\s|$)/;
const TOKEN_K = /(^|\s)(K|KREEDIT|CREDIT)(\s|$)/;

function classify(ctxLines: string[], sign: '+' | '-' | ''): Direction {
  if (sign === '-') return 'out';
  if (sign === '+') return 'in';
  const joined = ctxLines.join(' ').toLowerCase();
  if (REPAYMENT_WORDS.some((w) => joined.includes(w))) return 'out';
  if (LOAN_DISBURSEMENT_WORDS.some((w) => joined.includes(w))) return 'in';
  const upper = ctxLines.join(' ').toUpperCase();
  if (TOKEN_D.test(upper) && !TOKEN_K.test(upper)) return 'out';
  if (TOKEN_K.test(upper) && !TOKEN_D.test(upper)) return 'in';
  return 'unknown';
}

/** Finds lines mentioning one of `re`'s keywords and tries to attach a date/amount from the neighbouring lines. */
function findKeywordLines(lines: string[], re: RegExp, anyKeywordRe: RegExp): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const usable = (off: number) => {
      const j = i + off;
      if (j < 0 || j >= lines.length) return false;
      return off === 0 || !anyKeywordRe.test(lines[j]); // never borrow from another keyword row
    };
    let amount: { value: number; sign: '+' | '-' | '' } | null = null;
    let amountLine = i;
    for (const off of [0, 1, -1, 2, -2]) {
      if (!usable(off)) continue;
      const found = findAmounts(lines[i + off]);
      if (found.length) {
        amount = found[0];
        amountLine = i + off;
        break;
      }
    }
    let date: string | null = null;
    for (const off of [0, -1, -2, 1, 2]) {
      if (!usable(off)) continue;
      const ds = findDates(lines[i + off]);
      if (ds.length) {
        date = ds[0];
        break;
      }
    }
    // every line between the keyword line and the amount line belongs to this row (wrapped descriptions)
    const lo = Math.min(i, amountLine);
    const hi = Math.max(i, amountLine);
    const ctx = lines.slice(lo, hi + 1);
    const direction = classify(ctx, amount?.sign ?? '');
    // two keyword lines that resolve to the same amount line are the same transaction
    const key = amount ? `amt@${amountLine}` : `line@${i}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      lineIndex: i,
      date,
      description: lines[i].slice(0, 140),
      amount: amount ? amount.value : null,
      direction,
      keyword: m[2],
    });
  }
  return out;
}

// ---------------------------------------------------------------- scoring

const sumCats = (cats: any[] | undefined, re: RegExp) =>
  (cats || []).filter((c) => c && re.test(String(c.category || ''))).reduce((s, c) => s + (Number(c.total) || 0), 0);
const countCats = (cats: any[] | undefined, re: RegExp) =>
  (cats || []).filter((c) => c && re.test(String(c.category || ''))).reduce((s, c) => s + (Number(c.count) || 0), 0);

const toEvidence = (c: Candidate): Evidence => ({
  date: c.date, description: c.description, amount: c.amount, direction: c.direction, keyword: c.keyword,
});

export function scoreStatement(analysis: any, text?: string | null): Scoring {
  const a = analysis || {};
  const lines = (text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const hasText = lines.join('').length > 200;
  const anyKw = new RegExp(`${LENDER_RE.source}|${COLLECTOR_RE.source}|${GAMBLING_RE.source}`, 'i');

  const lenderLines = hasText ? findKeywordLines(lines, LENDER_RE, anyKw) : [];
  const collectorLines = hasText ? findKeywordLines(lines, COLLECTOR_RE, anyKw) : [];
  const gamblingLines = hasText ? findKeywordLines(lines, GAMBLING_RE, anyKw) : [];

  // ---- statement span
  const period = parsePeriod(a.period);
  const textDates = hasText ? lines.flatMap((l) => findDates(l)).sort() : [];
  const span = period || (textDates.length ? { start: textDates[0], end: textDates[textDates.length - 1] } : null);
  const spanDays = span ? daysBetween(span.start, span.end) + 1 : 0;
  const breakdown: { month: string; income: number; expenses: number }[] = Array.isArray(a.monthly_breakdown)
    ? a.monthly_breakdown.filter((m: any) => m && m.month)
    : [];
  let months = breakdown.length || (spanDays ? Math.max(1, Math.round(spanDays / 30.44)) : 1);
  if (!(months >= 1)) months = 1;

  // ---- affordability
  const notes: string[] = [];
  const incomeRaw = Number(a.summary?.total_income) || sumCats(a.income_categories, /./);
  const lenderIn = lenderLines.filter((c) => c.direction === 'in' && c.amount).reduce((s, c) => s + (c.amount || 0), 0);
  const loanIncomeCat = sumCats(a.income_categories, CATEGORY_PATTERNS.loanIncome);
  const excluded = Math.min(incomeRaw, Math.max(lenderIn, loanIncomeCat));
  const incomeCounted = Math.max(0, incomeRaw - excluded);
  const monthlyIncome = incomeCounted / months;
  const benefitsM = sumCats(a.income_categories, CATEGORY_PATTERNS.benefits) / months;

  const rentM = sumCats(a.expense_categories, CATEGORY_PATTERNS.rent) / months;
  const utilM = sumCats(a.expense_categories, CATEGORY_PATTERNS.utilities) / months;
  const lenderOut = lenderLines.filter((c) => c.direction === 'out' && c.amount).reduce((s, c) => s + (c.amount || 0), 0);
  const collectorOut = collectorLines.filter((c) => c.direction !== 'in' && c.amount).reduce((s, c) => s + (c.amount || 0), 0);
  const loanCat = sumCats(a.expense_categories, CATEGORY_PATTERNS.loanPayments);
  const loanM = Math.max(loanCat, lenderOut + collectorOut) / months;

  const disposable = monthlyIncome - rentM - utilM - loanM;
  const payment = Math.max(0, Math.floor(disposable * SCORING.REPAYMENT_SHARE));
  let term = 0;
  if (payment > 0) {
    term = payment < SCORING.MAX_TERM_IF_PAYMENT_BELOW ? SCORING.MAX_TERM_MONTHS
      : payment < SCORING.LONG_TERM_IF_PAYMENT_BELOW ? SCORING.LONG_TERM_MONTHS
      : SCORING.DEFAULT_TERM_MONTHS;
  }
  const evaluable = incomeRaw > 0;
  if (!evaluable) notes.push('no_income_data');
  if (months > 0 && !breakdown.length && !spanDays) notes.push('months_assumed');
  notes.push('interest_not_included');

  const affordability: Affordability = {
    evaluable,
    months,
    monthly_income: round2(monthlyIncome),
    excluded_loan_inflows: round2(excluded),
    benefits_income: round2(benefitsM),
    monthly_rent: round2(rentM),
    monthly_utilities: round2(utilM),
    monthly_loan_payments: round2(loanM),
    disposable: round2(disposable),
    repayment_share: SCORING.REPAYMENT_SHARE,
    suggested_monthly_payment: payment,
    suggested_term_months: term,
    max_loan: payment * term,
    max_loan_at_max_term: payment * SCORING.MAX_TERM_MONTHS,
    notes,
  };

  // ---- flags
  const flags: Flag[] = [];

  // 1. quick loans: loans RECEIVED from other lenders within the window
  {
    const windowEnd = span?.end || null;
    const windowStart = windowEnd ? addDays(windowEnd, -SCORING.QUICK_LOANS_WINDOW_DAYS + 1) : null;
    const received = lenderLines.filter(
      (c) => c.direction === 'in' && (!c.date || !windowStart || (c.date >= windowStart && (!windowEnd || c.date <= windowEnd))),
    );
    const unclear = lenderLines.filter((c) => c.direction === 'unknown').length;
    const catCount = countCats(a.income_categories, CATEGORY_PATTERNS.loanIncome);
    let count = received.length;
    let evidence = received.map(toEvidence);
    let total = received.reduce((s, c) => s + (c.amount || 0), 0);
    let reason = '';
    if (catCount > count) {
      count = catCount;
      total = sumCats(a.income_categories, CATEGORY_PATTERNS.loanIncome);
      evidence = (a.income_categories || [])
        .filter((c: any) => CATEGORY_PATTERNS.loanIncome.test(String(c.category || '')) && c.total > 0)
        .map((c: any) => ({ date: null, description: `${c.category} (${c.count}x)`, amount: Number(c.total) || 0, direction: 'in' as Direction, keyword: 'category' }));
      reason = 'from_category';
    }
    const known = hasText || catCount > 0;
    let state: FlagState = !known ? 'unknown' : count >= SCORING.QUICK_LOANS_MIN ? 'yes' : 'no';
    if (!known) reason = 'no_transaction_data';
    else if (!reason && state === 'no' && unclear > 0) reason = 'unclear_direction';
    flags.push({ id: 'quick_loans', state, count, total: round2(total), evidence, reason, params: { unclear, min: SCORING.QUICK_LOANS_MIN, days: SCORING.QUICK_LOANS_WINDOW_DAYS } });
  }

  // 2. debt collectors
  {
    const hits = collectorLines.filter((c) => c.direction !== 'in');
    const catTotal = sumCats(a.expense_categories, CATEGORY_PATTERNS.collectors);
    const catCountN = countCats(a.expense_categories, CATEGORY_PATTERNS.collectors);
    let evidence = hits.map(toEvidence);
    let count = hits.length;
    let total = hits.reduce((s, c) => s + (c.amount || 0), 0);
    let reason = '';
    let state: FlagState = hasText ? (count > 0 ? 'yes' : 'no') : 'unknown';
    if (!hasText) {
      if (catTotal > 0) {
        state = 'yes';
        count = catCountN;
        total = catTotal;
        reason = 'from_category';
        evidence = (a.expense_categories || [])
          .filter((c: any) => CATEGORY_PATTERNS.collectors.test(String(c.category || '')) && c.total > 0)
          .map((c: any) => ({ date: null, description: `${c.category} (${c.count}x)`, amount: Number(c.total) || 0, direction: 'out' as Direction, keyword: 'category' }));
      } else reason = 'no_transaction_data';
    }
    flags.push({ id: 'collector', state, count, total: round2(total), evidence, reason, params: {} });
  }

  // 3. new account / short history
  {
    const opening = a.summary?.opening_balance;
    const lowerText = lines.join('\n').toLowerCase();
    const openedLine = NEW_ACCOUNT_WORDS.map((w) => lines.find((l) => l.toLowerCase().includes(w))).find(Boolean);
    const openedDate = openedLine && span ? findDates(openedLine)[0] : null;
    const openedRecently = !!(openedDate && span && daysBetween(openedDate, span.end) < SCORING.MIN_HISTORY_DAYS && daysBetween(openedDate, span.end) >= 0);
    void lowerText;
    let state: FlagState = 'unknown';
    let reason = 'no_dates';
    let evidence: Evidence[] = [];
    if (openedRecently && openedLine) {
      state = 'yes';
      reason = 'account_opened_recently';
      evidence = [{ date: openedDate, description: openedLine.slice(0, 140), amount: null, direction: 'unknown', keyword: 'opened' }];
    } else if (spanDays >= SCORING.MIN_HISTORY_DAYS) {
      state = 'no';
      reason = '';
    } else if (spanDays > 0) {
      const zeroStart = opening !== undefined && opening !== null && Math.abs(Number(opening)) < 0.005;
      if (zeroStart) {
        state = 'yes';
        reason = 'short_zero_start';
        evidence = [{ date: span?.start || null, description: `opening balance 0.00`, amount: 0, direction: 'unknown', keyword: 'opening' }];
      } else {
        state = 'unknown';
        reason = 'short_statement';
      }
    }
    flags.push({ id: 'new_history', state, count: state === 'yes' ? 1 : 0, total: 0, evidence, reason, params: { days: spanDays, min: SCORING.MIN_HISTORY_DAYS } });
  }

  // 4. income stopped / rerouted (needs several months)
  {
    let rows = breakdown.slice().sort((x, y) => String(x.month).localeCompare(String(y.month)));
    // a last month that is cut off before the 20th is incomplete (pay day may simply not have come yet): ignore it
    if (rows.length && span && span.end.slice(0, 7) === String(rows[rows.length - 1].month).slice(0, 7) && Number(span.end.slice(8, 10)) < 20) {
      rows = rows.slice(0, -1);
    }
    let state: FlagState = 'unknown';
    let reason = 'needs_months';
    let evidence: Evidence[] = [];
    let total = 0;
    if (rows.length >= 2) {
      const last = rows[rows.length - 1];
      const prev = rows.slice(0, -1);
      const prevAvg = prev.reduce((s, r) => s + (Number(r.income) || 0), 0) / prev.length;
      const lastIncome = Number(last.income) || 0;
      if (prevAvg >= SCORING.INCOME_DROP_MIN_PRIOR) {
        const dropped = lastIncome < prevAvg * SCORING.INCOME_DROP_RATIO;
        state = dropped ? 'yes' : 'no';
        reason = dropped ? 'income_dropped' : '';
        total = round2(prevAvg - lastIncome);
        if (dropped) {
          evidence = rows.map((r) => ({ date: `${r.month}`, description: `income ${r.month}`, amount: Number(r.income) || 0, direction: 'in' as Direction, keyword: 'month' }));
        }
      } else {
        state = 'no';
        reason = 'prior_income_low';
      }
    }
    flags.push({ id: 'income_stopped', state, count: state === 'yes' ? 1 : 0, total, evidence, reason, params: { ratio: SCORING.INCOME_DROP_RATIO * 100 } });
  }

  // 5. gambling above x% of income
  {
    const hits = gamblingLines.filter((c) => c.direction !== 'in');
    const withAmount = hits.filter((c) => c.amount);
    let total = withAmount.reduce((s, c) => s + (c.amount || 0), 0);
    let evidence = hits.map(toEvidence);
    let count = hits.length;
    let reason = '';
    const catTotal = sumCats(a.expense_categories, CATEGORY_PATTERNS.gambling);
    if (catTotal > total) {
      total = catTotal;
      count = Math.max(count, countCats(a.expense_categories, CATEGORY_PATTERNS.gambling));
      reason = 'from_category';
      if (!evidence.length) {
        evidence = (a.expense_categories || [])
          .filter((c: any) => CATEGORY_PATTERNS.gambling.test(String(c.category || '')) && c.total > 0)
          .map((c: any) => ({ date: null, description: `${c.category} (${c.count}x)`, amount: Number(c.total) || 0, direction: 'out' as Direction, keyword: 'category' }));
      }
    }
    const limit = incomeCounted * SCORING.GAMBLING_MAX_SHARE_OF_INCOME;
    let state: FlagState;
    if (!hasText && catTotal <= 0) {
      state = 'unknown';
      reason = 'no_transaction_data';
    } else if (hits.length > 0 && total <= 0) {
      state = 'unknown';
      reason = 'amount_unknown';
    } else {
      state = total > 0 && total > limit ? 'yes' : 'no';
    }
    flags.push({
      id: 'gambling', state, count, total: round2(total), evidence, reason,
      params: { share: incomeCounted > 0 ? round2((total / incomeCounted) * 100) : 0, max: SCORING.GAMBLING_MAX_SHARE_OF_INCOME * 100 },
    });
  }

  return {
    version: 1,
    source: 'device',
    constants: { ...SCORING },
    affordability,
    flags,
    risk: riskFromFlags(flags, []),
  };
}

/** Risk label from the intent flags ONLY. `dismissed` = flag ids the admin decided to ignore. */
export function riskFromFlags(flags: Flag[], dismissed: string[]): { label: RiskLabel; triggered: number; unknown: number } {
  const triggered = flags.filter((f) => f.state === 'yes' && !dismissed.includes(f.id)).length;
  const unknown = flags.filter((f) => f.state === 'unknown').length;
  const label: RiskLabel = triggered >= SCORING.RISK_HIGH_AT ? 'high' : triggered >= SCORING.RISK_MEDIUM_AT ? 'medium' : 'low';
  return { label, triggered, unknown };
}

/**
 * What the customer needs for a given item price: stretch the term first (up to MAX_TERM_MONTHS),
 * then ask for a down payment for what is left.
 */
export function suggestForPrice(aff: Affordability, price: number): { term: number; down_payment: number; financed: number; monthly: number } {
  const monthly = aff.suggested_monthly_payment;
  if (!(price > 0)) return { term: aff.suggested_term_months, down_payment: 0, financed: 0, monthly };
  if (monthly <= 0) return { term: 0, down_payment: price, financed: 0, monthly: 0 };
  for (let t = Math.max(1, aff.suggested_term_months); t <= SCORING.MAX_TERM_MONTHS; t++) {
    if (monthly * t >= price) return { term: t, down_payment: 0, financed: price, monthly: Math.ceil(price / t) };
  }
  const financed = monthly * SCORING.MAX_TERM_MONTHS;
  return { term: SCORING.MAX_TERM_MONTHS, down_payment: round2(price - financed), financed, monthly };
}
