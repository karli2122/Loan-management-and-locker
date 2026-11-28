"""Bank statement scoring: ALL tunable numbers and keyword lists live in this file.

Keep in step with frontend/src/config/statementScoringConfig.ts (the admin app runs the same
rules on the phone when the server is an older version).

Two separate things are produced from a statement:
  1. AFFORDABILITY - how much the customer can pay per month. Low income only makes this smaller.
  2. INTENT FLAGS  - rule-based yes/no checks for signs somebody takes a loan without meaning to pay it back.
The risk label comes ONLY from the intent flags. Income level never raises it.
"""
import re

SCORING = {
    # ---- affordability ----
    "REPAYMENT_SHARE": 0.30,            # share of monthly disposable income suggested as the monthly payment
    "DEFAULT_TERM_MONTHS": 12,
    "LONG_TERM_IF_PAYMENT_BELOW": 40,   # EUR/month: below this the term is stretched to LONG_TERM_MONTHS ...
    "LONG_TERM_MONTHS": 18,
    "MAX_TERM_IF_PAYMENT_BELOW": 20,    # ... and below this to MAX_TERM_MONTHS
    "MAX_TERM_MONTHS": 24,
    # ---- intent flags ----
    "QUICK_LOANS_MIN": 3,               # flag 1: this many loans received from other lenders ...
    "QUICK_LOANS_WINDOW_DAYS": 90,      # ... within this many days of the end of the statement
    "MIN_HISTORY_DAYS": 60,             # flag 3: history shorter than this (and looks like a new account)
    "INCOME_DROP_RATIO": 0.25,          # flag 4: latest month income below this share of the earlier average
    "INCOME_DROP_MIN_PRIOR": 100,       # flag 4 only if the earlier months averaged at least this (EUR/month)
    "GAMBLING_MAX_SHARE_OF_INCOME": 0.10,  # flag 5
    # ---- risk label (triggered, not dismissed flags only) ----
    "RISK_MEDIUM_AT": 1,
    "RISK_HIGH_AT": 2,
}

LENDER_KEYWORDS = [
    "Bigbank", "Bondora", "Creditstar", "Credit24", "Inbank", "IPF", "IPF Digital", "Provident",
    "Laenuabi", "Placet", "Ferratum", "Mokilizingas", "Moneyman", "Kreedix", "Monefit", "Lendermarket",
    "Esto", "Hyppelaen", "Kiirlaen", "Payday loan", "Minuraha", "Fast Credit",
]
COLLECTOR_KEYWORDS = [
    "Intrum", "Kaupmeeste Liit", "Julianus", "Julianus Inkasso", "Lindorff", "Hoist", "Creditreform",
    "Aktiva Finants", "Inkasso", "Sissenõudmine", "Võlgade sissenõudmine", "Debt collection", "Kohtutäitur",
]
GAMBLING_KEYWORDS = [
    "Olybet", "Optibet", "Coolbet", "Betsafe", "Betsson", "Bet365", "Unibet", "Paf", "Tipsport", "Pokerstars",
    "Casino", "Kasiino", "Kasino", "Betano", "Nordicbet", "Eesti Loto", "Bingo", "Jackpot", "Sportsbet", "Betting",
]

CATEGORY_PATTERNS = {
    "rent": re.compile(r"rent|housing|üür|elamu|korter", re.I),
    "utilities": re.compile(r"utilit|kommunaal|electric|elekter|heating|küte|gas\b|gaas|water|vesi|internet|phone|telefon", re.I),
    "loanPayments": re.compile(r"loan|laen|credit|debt|leasing|liising|mortgage|kodulaen|inkasso|collect", re.I),
    "loanIncome": re.compile(r"loan|laen|kiirlaen", re.I),
    "benefits": re.compile(r"pension|toetus|benefit|hüvitis|child|lapse|elatis|alimony|support|unemploy|töötu|sotsiaal|allowance|vanemahüvitis", re.I),
    "gambling": re.compile(r"gambl|betting|kasiino|casino|hasartm|lotto|bet\b", re.I),
    "collectors": re.compile(r"collect|inkasso|debt", re.I),
}

NEW_ACCOUNT_WORDS = ["konto avatud", "konto avamise", "account opened", "account opening", "opening date"]

# Categories the AI is asked to use (so the patterns above match). "Internal transfer" is ignored in totals.
INCOME_CATEGORIES = ["Salary", "Benefits/Pension", "Child support", "Loan received", "Transfers In", "Other income"]
EXPENSE_CATEGORIES = ["Rent/Housing", "Utilities", "Groceries", "Transport", "Loan repayment", "Gambling",
                      "Debt collection", "Subscriptions", "Entertainment", "Other"]
INTERNAL_CATEGORY = "Internal transfer"
