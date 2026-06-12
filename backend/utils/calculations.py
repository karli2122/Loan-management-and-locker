"""EMI and loan calculation utilities"""
from datetime import datetime


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


def calculate_day_count_interest(principal: float, monthly_rate: float, loan_period_days: int) -> dict:
    """
    Calculate interest based on day count.
    Example: 200 loan, 50% monthly interest, 15 days:
      Interest = 200 * (50/100) * (15/30) = 50
    """
    total_interest = principal * (monthly_rate / 100) * (loan_period_days / 30)
    total_repayment = principal + total_interest

    return {
        "method": "Day Count",
        "principal": round(principal, 2),
        "monthly_interest_rate": monthly_rate,
        "loan_period_days": loan_period_days,
        "daily_rate": round(monthly_rate / 30, 4),
        "total_interest": round(total_interest, 2),
        "total_repayment": round(total_repayment, 2),
    }


def calculate_interest_total(client: dict) -> float:
    """Calculate total interest for a client based on day-count method."""
    principal = client.get("loan_amount", 0)
    rate = client.get("interest_rate", 0)
    if not principal or not rate:
        return 0.0
    
    loan_period_days = client.get("loan_period_days", 30)
    
    loan_start = client.get("loan_start_date") or client.get("created_at")
    if loan_start:
        if isinstance(loan_start, str):
            try:
                loan_start = datetime.fromisoformat(loan_start.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                loan_start = None
        if loan_start:
            now = datetime.utcnow()
            if hasattr(loan_start, 'replace') and loan_start.tzinfo:
                loan_start = loan_start.replace(tzinfo=None)
            actual_days = (now - loan_start).days
            loan_period_days = max(actual_days, 1)
    
    interest = principal * (rate / 100) * (loan_period_days / 30)
    return round(interest, 2)


def calculate_simple_interest_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using simple interest formula"""
    years = months / 12
    interest = (principal * annual_rate * years) / 100
    total_amount = principal + interest
    monthly_emi = total_amount / months
    
    return {
        "method": "Simple Interest",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(interest, 2),
        "principal": round(principal, 2)
    }


def calculate_reducing_balance_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using reducing balance method (industry standard)"""
    monthly_rate = (annual_rate / 12) / 100
    
    if monthly_rate == 0:
        monthly_emi = principal / months
        total_interest = 0
    else:
        power = (1 + monthly_rate) ** months
        monthly_emi = (principal * monthly_rate * power) / (power - 1)
        total_interest = (monthly_emi * months) - principal
    
    total_amount = principal + total_interest
    
    return {
        "method": "Reducing Balance",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(total_interest, 2),
        "principal": round(principal, 2)
    }


def calculate_flat_rate_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using flat rate method"""
    years = months / 12
    total_interest = (principal * annual_rate * years) / 100
    total_amount = principal + total_interest
    monthly_emi = total_amount / months
    
    return {
        "method": "Flat Rate",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(total_interest, 2),
        "principal": round(principal, 2)
    }


def calculate_all_methods(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using all three methods for comparison"""
    return {
        "simple_interest": calculate_simple_interest_emi(principal, annual_rate, months),
        "reducing_balance": calculate_reducing_balance_emi(principal, annual_rate, months),
        "flat_rate": calculate_flat_rate_emi(principal, annual_rate, months)
    }


def calculate_late_fee(principal_due: float, late_fee_percent: float, days_overdue: int) -> float:
    """Calculate late fee based on days overdue"""
    if days_overdue <= 0:
        return 0.0
    
    months_overdue = days_overdue / 30
    late_fee = (principal_due * late_fee_percent * months_overdue) / 100
    
    return round(late_fee, 2)
