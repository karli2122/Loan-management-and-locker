"""Deterministic statement scoring (twin of frontend/src/utils/statementScoring.ts).

score_statement(analysis, transactions) -> {affordability, flags, risk}
  analysis      dict: summary, income_categories, expense_categories, monthly_breakdown, period
  transactions  list of {date 'YYYY-MM-DD'|None, description, counterparty?, amount (signed: <0 = money out)}
The AI only categorises transactions; every number and rule here is plain code.
"""
import re
import math
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from utils.statement_scoring_config import (
    SCORING, LENDER_KEYWORDS, COLLECTOR_KEYWORDS, GAMBLING_KEYWORDS, CATEGORY_PATTERNS, NEW_ACCOUNT_WORDS,
    INTERNAL_CATEGORY,
)

_EDGE = "A-Za-z0-9\u00C0-\u024F"


def _kw_regex(words):
    parts = [re.escape(k.strip()).replace(r"\ ", r"\s+") for k in sorted(words, key=len, reverse=True)]
    return re.compile(rf"(?<![{_EDGE}])({'|'.join(parts)})(?![{_EDGE}])", re.I)


LENDER_RE = _kw_regex(LENDER_KEYWORDS)
COLLECTOR_RE = _kw_regex(COLLECTOR_KEYWORDS)
GAMBLING_RE = _kw_regex(GAMBLING_KEYWORDS)


def _r2(x: float) -> float:
    return round(x + 0.0, 2)


def _d(s) -> Optional[date]:
    try:
        return date.fromisoformat(str(s)[:10])
    except Exception:
        return None


def _find_dates(s: str) -> List[date]:
    out = []
    for m in re.finditer(r"(?<![0-9])(\d{1,2})[./](\d{1,2})[./](\d{4})(?![0-9])|(?<![0-9])(\d{4})-(\d{2})-(\d{2})(?![0-9])", s or ""):
        try:
            if m.group(1):
                out.append(date(int(m.group(3)), int(m.group(2)), int(m.group(1))))
            else:
                out.append(date(int(m.group(4)), int(m.group(5)), int(m.group(6))))
        except ValueError:
            pass
    return out


def _sum_cats(cats, pattern):
    return sum(float(c.get("total") or 0) for c in (cats or []) if c and pattern.search(str(c.get("category") or "")))


def _count_cats(cats, pattern):
    return sum(int(c.get("count") or 0) for c in (cats or []) if c and pattern.search(str(c.get("category") or "")))


def _ev(date_, desc, amount, direction, keyword):
    return {"date": date_.isoformat() if isinstance(date_, date) else date_, "description": (desc or "")[:140],
            "amount": amount, "direction": direction, "keyword": keyword}


def _match_tx(transactions, regex):
    out = []
    for t in transactions:
        text = f"{t.get('description') or ''} {t.get('counterparty') or ''}".strip()
        m = regex.search(text)
        if not m:
            continue
        amt = t.get("amount")
        out.append({
            "date": _d(t.get("date")) if t.get("date") else None,
            "description": text,
            "amount": abs(float(amt)) if amt not in (None, "") else None,
            "direction": "unknown" if amt in (None, 0, "") else ("out" if float(amt) < 0 else "in"),
            "keyword": m.group(1),
        })
    return out


def score_statement(analysis: dict, transactions: Optional[list] = None, text: Optional[str] = None) -> dict:
    a = analysis or {}
    txs = [t for t in (transactions or []) if isinstance(t, dict) and str(t.get("category") or "") != INTERNAL_CATEGORY]
    has_tx = len(txs) > 0

    lender = _match_tx(txs, LENDER_RE)
    collector = _match_tx(txs, COLLECTOR_RE)
    gambling = _match_tx(txs, GAMBLING_RE)

    # ---- span
    period_dates = sorted(_find_dates(str(a.get("period") or "")))
    tx_dates = sorted(d for d in (_d(t.get("date")) for t in txs if t.get("date")) if d)
    if len(period_dates) >= 2:
        span = (period_dates[0], period_dates[-1])
    elif tx_dates:
        span = (tx_dates[0], tx_dates[-1])
    else:
        span = None
    span_days = (span[1] - span[0]).days + 1 if span else 0
    breakdown = [m for m in (a.get("monthly_breakdown") or []) if isinstance(m, dict) and m.get("month")]
    months = len(breakdown) or (max(1, round(span_days / 30.44)) if span_days else 1)
    months = max(1, months)

    # ---- affordability
    notes = []
    summary = a.get("summary") or {}
    income_raw = float(summary.get("total_income") or 0) or _sum_cats(a.get("income_categories"), re.compile("."))
    lender_in = sum(c["amount"] or 0 for c in lender if c["direction"] == "in" and c["amount"])
    loan_income_cat = _sum_cats(a.get("income_categories"), CATEGORY_PATTERNS["loanIncome"])
    excluded = min(income_raw, max(lender_in, loan_income_cat))
    income_counted = max(0.0, income_raw - excluded)
    monthly_income = income_counted / months
    benefits_m = _sum_cats(a.get("income_categories"), CATEGORY_PATTERNS["benefits"]) / months
    rent_m = _sum_cats(a.get("expense_categories"), CATEGORY_PATTERNS["rent"]) / months
    util_m = _sum_cats(a.get("expense_categories"), CATEGORY_PATTERNS["utilities"]) / months
    lender_out = sum(c["amount"] or 0 for c in lender if c["direction"] == "out" and c["amount"])
    collector_out = sum(c["amount"] or 0 for c in collector if c["direction"] != "in" and c["amount"])
    loan_cat = _sum_cats(a.get("expense_categories"), CATEGORY_PATTERNS["loanPayments"])
    loan_m = max(loan_cat, lender_out + collector_out) / months

    disposable = monthly_income - rent_m - util_m - loan_m
    payment = max(0, math.floor(disposable * SCORING["REPAYMENT_SHARE"]))
    term = 0
    if payment > 0:
        term = (SCORING["MAX_TERM_MONTHS"] if payment < SCORING["MAX_TERM_IF_PAYMENT_BELOW"]
                else SCORING["LONG_TERM_MONTHS"] if payment < SCORING["LONG_TERM_IF_PAYMENT_BELOW"]
                else SCORING["DEFAULT_TERM_MONTHS"])
    evaluable = income_raw > 0
    if not evaluable:
        notes.append("no_income_data")
    notes.append("interest_not_included")
    affordability = {
        "evaluable": evaluable, "months": months, "monthly_income": _r2(monthly_income),
        "excluded_loan_inflows": _r2(excluded), "benefits_income": _r2(benefits_m),
        "monthly_rent": _r2(rent_m), "monthly_utilities": _r2(util_m), "monthly_loan_payments": _r2(loan_m),
        "disposable": _r2(disposable), "repayment_share": SCORING["REPAYMENT_SHARE"],
        "suggested_monthly_payment": payment, "suggested_term_months": term,
        "max_loan": payment * term, "max_loan_at_max_term": payment * SCORING["MAX_TERM_MONTHS"], "notes": notes,
    }

    flags = []

    # 1. quick loans
    window_end = span[1] if span else None
    window_start = window_end - timedelta(days=SCORING["QUICK_LOANS_WINDOW_DAYS"] - 1) if window_end else None
    received = [c for c in lender if c["direction"] == "in" and (not c["date"] or not window_start or window_start <= c["date"] <= window_end)]
    unclear = len([c for c in lender if c["direction"] == "unknown"])
    cat_count = _count_cats(a.get("income_categories"), CATEGORY_PATTERNS["loanIncome"])
    count = len(received)
    evidence = [_ev(c["date"], c["description"], c["amount"], c["direction"], c["keyword"]) for c in received]
    total = sum(c["amount"] or 0 for c in received)
    reason = ""
    if cat_count > count:
        count = cat_count
        total = _sum_cats(a.get("income_categories"), CATEGORY_PATTERNS["loanIncome"])
        evidence = [_ev(None, f"{c.get('category')} ({c.get('count')}x)", float(c.get("total") or 0), "in", "category")
                    for c in (a.get("income_categories") or []) if CATEGORY_PATTERNS["loanIncome"].search(str(c.get("category") or "")) and (c.get("total") or 0) > 0]
        reason = "from_category"
    known = has_tx or cat_count > 0
    if not known:
        state, reason = "unknown", "no_transaction_data"
    else:
        state = "yes" if count >= SCORING["QUICK_LOANS_MIN"] else "no"
        if not reason and state == "no" and unclear > 0:
            reason = "unclear_direction"
    flags.append({"id": "quick_loans", "state": state, "count": count, "total": _r2(total), "evidence": evidence,
                  "reason": reason, "params": {"unclear": unclear, "min": SCORING["QUICK_LOANS_MIN"], "days": SCORING["QUICK_LOANS_WINDOW_DAYS"]}})

    # 2. collectors
    hits = [c for c in collector if c["direction"] != "in"]
    cat_total = _sum_cats(a.get("expense_categories"), CATEGORY_PATTERNS["collectors"])
    evidence = [_ev(c["date"], c["description"], c["amount"], c["direction"], c["keyword"]) for c in hits]
    count = len(hits)
    total = sum(c["amount"] or 0 for c in hits)
    reason = ""
    state = ("yes" if count > 0 else "no") if has_tx else "unknown"
    if not has_tx:
        if cat_total > 0:
            state, reason, count, total = "yes", "from_category", _count_cats(a.get("expense_categories"), CATEGORY_PATTERNS["collectors"]), cat_total
            evidence = [_ev(None, f"{c.get('category')} ({c.get('count')}x)", float(c.get("total") or 0), "out", "category")
                        for c in (a.get("expense_categories") or []) if CATEGORY_PATTERNS["collectors"].search(str(c.get("category") or "")) and (c.get("total") or 0) > 0]
        else:
            reason = "no_transaction_data"
    flags.append({"id": "collector", "state": state, "count": count, "total": _r2(total), "evidence": evidence, "reason": reason, "params": {}})

    # 3. new account / short history
    opening = summary.get("opening_balance")
    opened_line = None
    for t in txs:
        d = f"{t.get('description') or ''}".lower()
        if any(w in d for w in NEW_ACCOUNT_WORDS):
            opened_line = t
            break
    opened_recent = False
    opened_date = None
    if opened_line and span:
        ds = _find_dates(opened_line.get("description") or "") or ([_d(opened_line.get("date"))] if opened_line.get("date") else [])
        opened_date = ds[0] if ds else None
        opened_recent = bool(opened_date and 0 <= (span[1] - opened_date).days < SCORING["MIN_HISTORY_DAYS"])
    state, reason, evidence = "unknown", "no_dates", []
    if opened_recent:
        state, reason = "yes", "account_opened_recently"
        evidence = [_ev(opened_date, opened_line.get("description"), None, "unknown", "opened")]
    elif span_days >= SCORING["MIN_HISTORY_DAYS"]:
        state, reason = "no", ""
    elif span_days > 0:
        zero_start = opening is not None and abs(float(opening)) < 0.005
        if zero_start:
            state, reason = "yes", "short_zero_start"
            evidence = [_ev(span[0], "opening balance 0.00", 0, "unknown", "opening")]
        else:
            state, reason = "unknown", "short_statement"
    flags.append({"id": "new_history", "state": state, "count": 1 if state == "yes" else 0, "total": 0, "evidence": evidence,
                  "reason": reason, "params": {"days": span_days, "min": SCORING["MIN_HISTORY_DAYS"]}})

    # 4. income stopped / rerouted
    rows = sorted(breakdown, key=lambda r: str(r.get("month")))
    # a last month that is cut off before the 20th is incomplete (pay day may simply not have come yet): ignore it
    if rows and span and span[1].strftime("%Y-%m") == str(rows[-1].get("month"))[:7] and span[1].day < 20:
        rows = rows[:-1]
    state, reason, evidence, total = "unknown", "needs_months", [], 0.0
    if len(rows) >= 2:
        last, prev = rows[-1], rows[:-1]
        prev_avg = sum(float(r.get("income") or 0) for r in prev) / len(prev)
        last_income = float(last.get("income") or 0)
        if prev_avg >= SCORING["INCOME_DROP_MIN_PRIOR"]:
            dropped = last_income < prev_avg * SCORING["INCOME_DROP_RATIO"]
            state = "yes" if dropped else "no"
            reason = "income_dropped" if dropped else ""
            total = _r2(prev_avg - last_income)
            if dropped:
                evidence = [_ev(str(r.get("month")), f"income {r.get('month')}", float(r.get("income") or 0), "in", "month") for r in rows]
        else:
            state, reason = "no", "prior_income_low"
    flags.append({"id": "income_stopped", "state": state, "count": 1 if state == "yes" else 0, "total": total, "evidence": evidence,
                  "reason": reason, "params": {"ratio": SCORING["INCOME_DROP_RATIO"] * 100}})

    # 5. gambling above x% of income
    hits = [c for c in gambling if c["direction"] != "in"]
    with_amount = [c for c in hits if c["amount"]]
    total = sum(c["amount"] for c in with_amount)
    evidence = [_ev(c["date"], c["description"], c["amount"], c["direction"], c["keyword"]) for c in hits]
    count = len(hits)
    reason = ""
    cat_total = _sum_cats(a.get("expense_categories"), CATEGORY_PATTERNS["gambling"])
    if cat_total > total:
        total = cat_total
        count = max(count, _count_cats(a.get("expense_categories"), CATEGORY_PATTERNS["gambling"]))
        reason = "from_category"
        if not evidence:
            evidence = [_ev(None, f"{c.get('category')} ({c.get('count')}x)", float(c.get("total") or 0), "out", "category")
                        for c in (a.get("expense_categories") or []) if CATEGORY_PATTERNS["gambling"].search(str(c.get("category") or "")) and (c.get("total") or 0) > 0]
    limit = income_counted * SCORING["GAMBLING_MAX_SHARE_OF_INCOME"]
    if not has_tx and cat_total <= 0:
        state, reason = "unknown", "no_transaction_data"
    elif hits and total <= 0:
        state, reason = "unknown", "amount_unknown"
    else:
        state = "yes" if (total > 0 and total > limit) else "no"
    flags.append({"id": "gambling", "state": state, "count": count, "total": _r2(total), "evidence": evidence, "reason": reason,
                  "params": {"share": _r2(total / income_counted * 100) if income_counted > 0 else 0, "max": SCORING["GAMBLING_MAX_SHARE_OF_INCOME"] * 100}})

    return {"version": 1, "source": "server", "constants": dict(SCORING), "affordability": affordability,
            "flags": flags, "risk": risk_from_flags(flags, [])}


def risk_from_flags(flags: list, dismissed: list) -> dict:
    triggered = len([f for f in flags if f["state"] == "yes" and f["id"] not in dismissed])
    unknown = len([f for f in flags if f["state"] == "unknown"])
    label = "high" if triggered >= SCORING["RISK_HIGH_AT"] else "medium" if triggered >= SCORING["RISK_MEDIUM_AT"] else "low"
    return {"label": label, "triggered": triggered, "unknown": unknown}


def build_analysis_from_transactions(parsed: dict) -> dict:
    """Totals, categories and monthly breakdown computed in code from the AI's categorised transactions."""
    txs = []
    for t in parsed.get("transactions") or []:
        try:
            amt = float(t.get("amount"))
        except (TypeError, ValueError):
            continue
        txs.append({**t, "amount": amt})
    inc, exp, monthly = {}, {}, {}
    total_in = total_out = 0.0
    for t in txs:
        if str(t.get("category") or "") == INTERNAL_CATEGORY:
            continue
        cat = str(t.get("category") or ("Other income" if t["amount"] > 0 else "Other"))
        bucket = inc if t["amount"] > 0 else exp
        e = bucket.setdefault(cat, {"category": cat, "total": 0.0, "count": 0})
        e["total"] = _r2(e["total"] + abs(t["amount"]))
        e["count"] += 1
        if t["amount"] > 0:
            total_in += t["amount"]
        else:
            total_out += -t["amount"]
        dt = _d(t.get("date")) if t.get("date") else None
        if dt:
            mk = f"{dt.year:04d}-{dt.month:02d}"
            m = monthly.setdefault(mk, {"month": mk, "income": 0.0, "expenses": 0.0})
            m["income" if t["amount"] > 0 else "expenses"] = _r2(m["income" if t["amount"] > 0 else "expenses"] + abs(t["amount"]))
    out = {k: v for k, v in parsed.items() if k not in ("transactions", "risk_indicators", "credit_recommendation")}
    summ = dict(parsed.get("summary") or {})
    if txs:
        summ["total_income"] = _r2(total_in)
        summ["total_expenses"] = _r2(total_out)
        summ["net_balance"] = _r2(total_in - total_out)
        out["income_categories"] = sorted(inc.values(), key=lambda c: -c["total"])
        out["expense_categories"] = sorted(exp.values(), key=lambda c: -c["total"])
        out["monthly_breakdown"] = [monthly[k] for k in sorted(monthly)]
    out["summary"] = summ
    return out
