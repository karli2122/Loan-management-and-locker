/**
 * Bank statement scoring: ALL tunable numbers and keyword lists live in this file.
 * (The backend has the same values in backend/utils/statement_scoring_config.py - keep them in step.)
 *
 * Two separate things are produced from a statement:
 *   1. AFFORDABILITY - how much the customer can pay per month. Low income only makes this smaller.
 *   2. INTENT FLAGS  - rule-based yes/no checks for signs somebody takes a loan without meaning to pay it back.
 * The risk label comes ONLY from the intent flags. Income level never raises it.
 */

export const SCORING = {
  // ---- affordability ----
  /** Share of monthly disposable income we suggest as the monthly payment (0.30 = 30%). */
  REPAYMENT_SHARE: 0.3,
  /** Term suggested by default (months). */
  DEFAULT_TERM_MONTHS: 12,
  /** If the suggested payment is below this (EUR/month) the term is stretched to LONG_TERM_MONTHS ... */
  LONG_TERM_IF_PAYMENT_BELOW: 40,
  LONG_TERM_MONTHS: 18,
  /** ... and below this to MAX_TERM_MONTHS, so a small payment can still carry a useful loan. */
  MAX_TERM_IF_PAYMENT_BELOW: 20,
  MAX_TERM_MONTHS: 24,

  // ---- intent flags ----
  /** Flag 1: this many loans received from other lenders ... */
  QUICK_LOANS_MIN: 3,
  /** ... within this many days of the end of the statement. */
  QUICK_LOANS_WINDOW_DAYS: 90,
  /** Flag 3: a statement/account history shorter than this (days) counts as "too new" (only when it also looks like a new account). */
  MIN_HISTORY_DAYS: 60,
  /** Flag 4: income of the latest month below this share of the earlier months' average = income stopped. */
  INCOME_DROP_RATIO: 0.25,
  /** Flag 4 only applies if the earlier months averaged at least this much (EUR/month). */
  INCOME_DROP_MIN_PRIOR: 100,
  /** Flag 5: gambling spending above this share of income. */
  GAMBLING_MAX_SHARE_OF_INCOME: 0.1,

  // ---- risk label (from triggered, not dismissed flags only) ----
  RISK_MEDIUM_AT: 1,
  RISK_HIGH_AT: 2,
};

/** Other lenders / quick-loan companies. Matched case-insensitively as whole words in transaction text. */
export const LENDER_KEYWORDS: string[] = [
  'Bigbank', 'Bondora', 'Creditstar', 'Credit24', 'Inbank', 'IPF', 'IPF Digital', 'Provident',
  'Laenuabi', 'Placet', 'Ferratum', 'Mokilizingas', 'Moneyman', 'Kreedix', 'Monefit', 'Lendermarket',
  'Esto', 'Hyppelaen', 'Kiirlaen', 'Payday loan', 'Minuraha', 'Fast Credit',
];

/** Debt collectors / enforcement. */
export const COLLECTOR_KEYWORDS: string[] = [
  'Intrum', 'Kaupmeeste Liit', 'Julianus', 'Julianus Inkasso', 'Lindorff', 'Hoist', 'Creditreform',
  'Aktiva Finants', 'Inkasso', 'Sissenõudmine', 'Võlgade sissenõudmine', 'Debt collection', 'Kohtutäitur',
];

/** Gambling operators / words. */
export const GAMBLING_KEYWORDS: string[] = [
  'Olybet', 'Optibet', 'Coolbet', 'Betsafe', 'Betsson', 'Bet365', 'Unibet', 'Paf', 'Tipsport', 'Pokerstars',
  'Casino', 'Kasiino', 'Kasino', 'Betano', 'Nordicbet', 'Eesti Loto', 'Bingo', 'Jackpot', 'Sportsbet', 'Betting',
];

/** Words that say a lender transaction is money coming IN (loan paid out to the customer). */
export const LOAN_DISBURSEMENT_WORDS: string[] = ['laenu väljamakse', 'laenusumma', 'väljamakse', 'loan disbursement', 'loan payout', 'loan paid out'];
/** Words that say a lender transaction is a repayment (money going out). */
export const REPAYMENT_WORDS: string[] = ['tagasimakse', 'osamakse', 'laenumakse', 'repayment', 'instalment', 'installment', 'intress'];

/** Category-name patterns (the category labels come from the analysis: GPT on the old server). */
export const CATEGORY_PATTERNS = {
  rent: /rent|housing|üür|elamu|korter/i,
  utilities: /utilit|kommunaal|electric|elekter|heating|küte|gas\b|gaas|water|vesi|internet|phone|telefon/i,
  loanPayments: /loan|laen|credit|debt|leasing|liising|mortgage|kodulaen|inkasso|collect/i,
  loanIncome: /loan|laen|kiirlaen/i,
  benefits: /pension|toetus|benefit|hüvitis|child|lapse|elatis|alimony|support|unemploy|töötu|sotsiaal|allowance|vanemahüvitis/i,
  gambling: /gambl|betting|kasiino|casino|hasartm|lotto|bet\b/i,
  collectors: /collect|inkasso|debt/i,
};

/** Statement text hints that the account was only just opened. */
export const NEW_ACCOUNT_WORDS: string[] = ['konto avatud', 'konto avamise', 'account opened', 'account opening', 'opening date'];
