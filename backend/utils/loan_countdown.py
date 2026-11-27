"""Repayment countdown fields for the client app home screen.

Computes percent paid, days until the next payment (negative if overdue),
the next amount due, and remaining balance from a loan or client ledger
document. Used by GET /device/status and covered by unit tests.
"""
from datetime import date, datetime
from typing import Any, Optional

from utils.calculations import money
from utils.timeutils import date_only, utc_now


def _as_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = date_only(value)
    if not text:
        return None
    try:
        return date.fromisoformat(str(text)[:10])
    except ValueError:
        return None


def loan_countdown(source: Optional[dict] = None, today: Optional[date] = None) -> dict:
    """Return countdown fields from a loan or client document.

    ``today`` is injectable for tests. ``days_until_due`` is negative when the
    due date is in the past. Percent paid is 0 when the original total cannot
    be determined.
    """
    source = source or {}
    today = today or utc_now().date()

    paid = money(source.get("total_paid") or 0)
    total = money(
        source.get("total_amount")
        or source.get("total_amount_due")
        or 0
    )
    outstanding_raw = source.get("outstanding_balance")
    outstanding = money(outstanding_raw if outstanding_raw is not None else 0)

    if total <= 0:
        # On a loan row, loan_amount is principal. Do not treat a client-status
        # "loan_amount" (which is amount due) as the original total unless
        # other loan-shaped fields are present.
        principalish = money(source.get("loan_amount") or 0)
        looks_like_loan = any(
            source.get(k) is not None
            for k in ("total_paid", "duration_months", "tenure_months", "interest_rate", "interest_amount")
        )
        if looks_like_loan and principalish > 0:
            total = money(
                principalish
                + money(source.get("interest_amount") or 0)
                + money(source.get("late_fees_accumulated") or 0)
            )
        if total <= 0 and (paid > 0 or outstanding > 0):
            total = money(paid + outstanding)

    if outstanding <= 0 and total > paid:
        outstanding = money(max(0.0, total - paid))

    percent = 0.0 if total <= 0 else min(100.0, round(100.0 * paid / total, 1))

    due = _as_date(
        source.get("next_payment_date")
        or source.get("due_date")
        or source.get("next_payment_due")
        or source.get("loan_due_date")
    )
    days_until = (due - today).days if due is not None else None

    next_amount = money(
        source.get("next_payment_amount")
        or source.get("monthly_emi")
        or source.get("installment_amount")
        or 0
    )
    if next_amount <= 0 and outstanding > 0:
        next_amount = outstanding

    return {
        "percent_paid": percent,
        "total_paid": paid,
        "total_amount": total,
        "outstanding_balance": outstanding,
        "next_payment_due": due.isoformat() if due else None,
        "days_until_due": days_until,
        "next_payment_amount": next_amount,
    }
