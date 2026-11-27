"""EMI, interest, and late-fee calculation utilities.

Canonical product rules (PayLockPro one-time / monthly loans):
- ``interest_rate`` on a loan is a **monthly** percent (the default plan is
  "One-Time Simple 50% Monthly").
- Principal is always ``loan_amount - down_payment``.
- Tenure in months is ``max(1, round(calendar_days / 30))``.
- Setup interest is ``principal * (rate/100) * tenure_months``.

The EMI "compare calculator" helpers take an **annual** rate and are labelled
as such. Under this definition, simple interest and flat rate are the same
formula; both are kept for API compatibility.

Late fees accrue in discrete periods: one charge of
``outstanding * (late_fee_percent/100)`` after the grace period, then again
every ``frequency_days`` (default 7). The same helper is used by the
background task and by the manual calculate-all endpoint.
"""
from typing import Optional

from utils.timeutils import as_utc, days_between, utc_now

DEFAULT_LATE_FEE_PERCENT = 5.0
DEFAULT_LATE_FEE_FREQUENCY_DAYS = 7
DEFAULT_AUTO_LOCK_GRACE_DAYS = 3


def money(value) -> float:
    """Round a monetary value to 2 decimal places.

    NOTE: balances are stored as floats throughout this codebase. Floats cannot
    represent all decimal cents exactly, so always pass amounts through money()
    before persisting or comparing, and treat values within 0.005 as equal. For
    a stricter ledger, migrate to integer minor units (cents) or Decimal.
    """
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def resolve_principal(loan_amount=0, down_payment=0) -> float:
    """Net principal: loan amount minus down payment, never negative."""
    return money(max(0.0, money(loan_amount) - money(down_payment)))


def _require_positive_months(months) -> int:
    try:
        months_int = int(months)
    except (TypeError, ValueError):
        months_int = 0
    if months_int < 1:
        raise ValueError("Loan tenure months must be at least 1")
    return months_int


def tenure_months_from_dates(start, due) -> int:
    """Canonical tenure: nearest month from day count, minimum 1."""
    days = days_between(start, due)
    if days is None:
        return 1
    return max(1, int(round(days / 30.0)))


def calculate_setup_interest(
    principal: float,
    monthly_rate: float,
    tenure_months: int,
) -> dict:
    """Month-based simple interest used by loan setup/edit/preview.

    Interest = Principal × (Monthly Rate / 100) × Months
    """
    months = _require_positive_months(tenure_months)
    principal = money(principal)
    rate = float(monthly_rate or 0)
    total_interest = money(principal * (rate / 100.0) * months)
    total_amount = money(principal + total_interest)
    return {
        "method": "Monthly Simple",
        "principal": principal,
        "interest_rate": rate,
        "tenure_months": months,
        "total_interest": total_interest,
        "total_amount": total_amount,
        "installment_amount": total_amount,  # one-time default; callers may override
    }


def calculate_setup_interest_for_dates(
    loan_amount,
    down_payment,
    monthly_rate,
    start,
    due,
) -> dict:
    principal = resolve_principal(loan_amount, down_payment)
    months = tenure_months_from_dates(start, due)
    result = calculate_setup_interest(principal, monthly_rate, months)
    result["given_date"] = None
    result["due_date"] = None
    return result


def amount_due_from_loan(loan: Optional[dict]) -> float:
    """Amount currently due for display / lock screen.

    Prefers the loan ledger's outstanding_balance. Falls back to
    total_amount / total_amount_due minus total_paid. Never invents a
    one-period interest guess.
    """
    if not loan:
        return 0.0
    if loan.get("outstanding_balance") is not None:
        return money(max(0.0, loan.get("outstanding_balance") or 0))
    total = loan.get("total_amount_due")
    if total is None:
        total = loan.get("total_amount")
    if total:
        paid = money(loan.get("total_paid") or 0)
        return money(max(0.0, money(total) - paid))
    principal = resolve_principal(loan.get("loan_amount"), loan.get("down_payment"))
    paid = money(loan.get("total_paid") or 0)
    return money(max(0.0, principal - paid))


def calculate_day_count_interest(principal: float, monthly_rate: float, loan_period_days: int) -> dict:
    """
    Calculate interest based on day count.
    Example: 200 loan, 50% monthly interest, 15 days:
      Interest = 200 * (50/100) * (15/30) = 50
    """
    principal = money(principal)
    total_interest = money(principal * (monthly_rate / 100) * (loan_period_days / 30))
    total_repayment = money(principal + total_interest)

    return {
        "method": "Day Count",
        "principal": principal,
        "monthly_interest_rate": monthly_rate,
        "loan_period_days": loan_period_days,
        "daily_rate": round(monthly_rate / 30, 4),
        "total_interest": total_interest,
        "total_repayment": total_repayment,
    }


def calculate_interest_total(client: dict) -> float:
    """Contract / accrued interest using the canonical monthly rate.

    Principal is net of down payment. When start/due dates exist, tenure is
    the same ``round(days/30)`` month count used at setup. Otherwise falls
    back to elapsed day-count since the start date (minimum 1 day).
    """
    principal = resolve_principal(
        client.get("loan_amount", 0),
        client.get("down_payment", 0),
    )
    rate = client.get("interest_rate", 0) or 0
    if not principal or not rate:
        return 0.0

    start = client.get("loan_start_date") or client.get("loan_given_date") or client.get("given_date") or client.get("created_at")
    due = client.get("loan_due_date") or client.get("due_date") or client.get("next_payment_due")
    if start and due:
        months = tenure_months_from_dates(start, due)
        return calculate_setup_interest(principal, rate, months)["total_interest"]

    loan_period_days = client.get("loan_period_days", 30)
    start_dt = as_utc(start)
    if start_dt:
        actual_days = days_between(start_dt, utc_now())
        if actual_days is not None:
            loan_period_days = max(actual_days, 1)

    interest = principal * (rate / 100) * (loan_period_days / 30)
    return money(interest)


def calculate_simple_interest_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using simple interest on an **annual** rate.

    Mathematically identical to :func:`calculate_flat_rate_emi` for this
    definition of simple interest. Do not pass the product's monthly loan
    rate into this helper.
    """
    months = _require_positive_months(months)
    principal = money(principal)
    years = months / 12
    interest = money((principal * annual_rate * years) / 100)
    total_amount = money(principal + interest)
    monthly_emi = money(total_amount / months)

    return {
        "method": "Simple Interest",
        "rate_basis": "annual",
        "monthly_emi": monthly_emi,
        "total_amount": total_amount,
        "total_interest": interest,
        "principal": principal,
    }


def calculate_reducing_balance_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using reducing balance method (industry standard, annual rate)."""
    months = _require_positive_months(months)
    principal = money(principal)
    monthly_rate = (annual_rate / 12) / 100

    if monthly_rate == 0:
        monthly_emi = money(principal / months)
        total_interest = 0.0
    else:
        power = (1 + monthly_rate) ** months
        monthly_emi = money((principal * monthly_rate * power) / (power - 1))
        total_interest = money((monthly_emi * months) - principal)

    total_amount = money(principal + total_interest)

    return {
        "method": "Reducing Balance",
        "rate_basis": "annual",
        "monthly_emi": monthly_emi,
        "total_amount": total_amount,
        "total_interest": total_interest,
        "principal": principal,
    }


def calculate_flat_rate_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using flat rate method on an **annual** rate.

    Identical to :func:`calculate_simple_interest_emi` for this definition.
    """
    result = calculate_simple_interest_emi(principal, annual_rate, months)
    result["method"] = "Flat Rate"
    return result


def calculate_all_methods(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using all three methods for comparison (annual rates)."""
    return {
        "simple_interest": calculate_simple_interest_emi(principal, annual_rate, months),
        "reducing_balance": calculate_reducing_balance_emi(principal, annual_rate, months),
        "flat_rate": calculate_flat_rate_emi(principal, annual_rate, months),
    }


def calculate_period_late_fee(outstanding: float, late_fee_percent: float) -> float:
    """One late-fee period: a percent of current outstanding, or 0."""
    outstanding = money(outstanding)
    percent = float(late_fee_percent or 0)
    if outstanding <= 0 or percent <= 0:
        return 0.0
    return money(outstanding * percent / 100.0)


def resolve_late_fee_percent(client: dict = None, plan: dict = None) -> float:
    """Plan percent, else client override, else the product default (5%)."""
    if plan and plan.get("late_fee_percent") is not None:
        return float(plan.get("late_fee_percent"))
    if client and client.get("late_fee_percent") is not None:
        return float(client.get("late_fee_percent"))
    return DEFAULT_LATE_FEE_PERCENT


def should_apply_late_fee(
    days_overdue: int,
    grace_days: int = DEFAULT_AUTO_LOCK_GRACE_DAYS,
    last_late_fee_date=None,
    frequency_days: int = DEFAULT_LATE_FEE_FREQUENCY_DAYS,
    today=None,
) -> bool:
    """Whether a new late-fee period should be charged today."""
    if days_overdue is None or days_overdue <= 0:
        return False
    if days_overdue <= (grace_days or 0):
        return False
    if last_late_fee_date:
        elapsed = days_between(last_late_fee_date, today or utc_now())
        if elapsed is not None and elapsed < (frequency_days or DEFAULT_LATE_FEE_FREQUENCY_DAYS):
            return False
    return True


def calculate_late_fee(principal_due: float, late_fee_percent: float, days_overdue: int) -> float:
    """Display helper: period fee × months overdue (days/30).

    Do **not** use this to persist late fees — those accrue in discrete
    periods via :func:`calculate_period_late_fee` and
    :func:`should_apply_late_fee`. Kept so existing callers that only need a
    projected figure continue to work.
    """
    if days_overdue <= 0:
        return 0.0
    months_overdue = days_overdue / 30
    # At least one period once past due (after the caller has applied grace).
    periods = max(months_overdue, 1.0 / 30 * days_overdue)
    return money(calculate_period_late_fee(principal_due, late_fee_percent) * periods)


def should_advance_due_date(
    payment_type: str,
    payment_amount: float,
    outstanding_after: float,
    installment_amount: float = None,
) -> bool:
    """Advance the due date only when the current period is actually paid.

    One-time (``single``) loans keep their original due date until the
    balance is cleared. Partial payments never move the date.
    """
    outstanding_after = money(outstanding_after)
    payment_amount = money(payment_amount)
    if outstanding_after <= 0:
        return False  # loan is done; caller should clear the date, not bump it
    ptype = (payment_type or "single").lower()
    if ptype in ("single", "one-time", "onetime", "one_time"):
        return False
    if payment_amount <= 0:
        return False
    installment = money(installment_amount or 0)
    if installment > 0 and payment_amount + 0.005 >= installment:
        return True
    return False
