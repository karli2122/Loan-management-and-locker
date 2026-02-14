"""EMI and loan calculation utilities"""


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
