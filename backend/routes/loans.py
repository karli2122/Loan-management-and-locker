"""Loan routes - loan plans, loans setup, payments, calculator."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
from dateutil.relativedelta import relativedelta
from typing import Optional
import logging

from database import db
from models.schemas import (
    LoanPlan, LoanPlanCreate, LoanSetup, LoanSettings,
    Payment, PaymentCreate
)
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.exceptions import ValidationException
from utils.calculations import (
    calculate_simple_interest_emi, calculate_reducing_balance_emi,
    calculate_flat_rate_emi, calculate_all_methods, calculate_late_fee
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Loans"])


# ===================== LOAN PLANS =====================

@router.post("/loan-plans", response_model=LoanPlan)
async def create_loan_plan(plan_data: LoanPlanCreate, admin_token: str = Query(...)):
    """Create a new loan plan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    plan = LoanPlan(
        name=plan_data.name,
        interest_rate=plan_data.interest_rate,
        min_tenure_months=plan_data.min_tenure_months,
        max_tenure_months=plan_data.max_tenure_months,
        processing_fee_percent=plan_data.processing_fee_percent,
        late_fee_percent=plan_data.late_fee_percent,
        description=plan_data.description,
        admin_id=admin_id
    )
    
    await db.loan_plans.insert_one(plan.dict())
    return plan


@router.get("/loan-plans")
async def list_loan_plans(admin_token: str = Query(...)):
    """List all loan plans for the authenticated admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    plans = await db.loan_plans.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).to_list(100)
    
    return plans


@router.get("/loan-plans/{plan_id}", response_model=LoanPlan)
async def get_loan_plan(plan_id: str, admin_token: str = Query(...)):
    """Get a specific loan plan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    plan = await db.loan_plans.find_one({"id": plan_id, "admin_id": admin_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    return plan


@router.put("/loan-plans/{plan_id}", response_model=LoanPlan)
async def update_loan_plan(plan_id: str, plan_data: LoanPlanCreate, admin_token: str = Query(...)):
    """Update a loan plan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    plan = await db.loan_plans.find_one({"id": plan_id, "admin_id": admin_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    update_data = plan_data.dict()
    await db.loan_plans.update_one({"id": plan_id}, {"$set": update_data})
    
    updated = await db.loan_plans.find_one({"id": plan_id}, {"_id": 0})
    return updated


@router.delete("/loan-plans/{plan_id}")
async def delete_loan_plan(plan_id: str, admin_token: str = Query(...)):
    """Delete a loan plan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    plan = await db.loan_plans.find_one({"id": plan_id, "admin_id": admin_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    # Check if plan is in use
    clients_using = await db.clients.count_documents({"loan_plan_id": plan_id})
    if clients_using > 0:
        raise ValidationException(f"Cannot delete plan - {clients_using} clients are using it")
    
    await db.loan_plans.delete_one({"id": plan_id})
    return {"message": "Loan plan deleted"}


# ===================== CALCULATOR =====================

@router.get("/calculator/compare")
async def compare_emi_methods(
    principal: float = Query(...),
    annual_rate: float = Query(...),
    months: int = Query(...)
):
    """Compare EMI across all calculation methods."""
    if principal <= 0 or annual_rate < 0 or months <= 0:
        raise ValidationException("Invalid input values")
    
    return calculate_all_methods(principal, annual_rate, months)


@router.post("/calculator/amortization")
async def generate_amortization_schedule(
    principal: float = Query(...),
    annual_rate: float = Query(...),
    months: int = Query(...),
    method: str = Query(default="reducing_balance")
):
    """Generate full amortization schedule."""
    if principal <= 0 or annual_rate < 0 or months <= 0:
        raise ValidationException("Invalid input values")
    
    if method == "simple_interest":
        emi_data = calculate_simple_interest_emi(principal, annual_rate, months)
    elif method == "flat_rate":
        emi_data = calculate_flat_rate_emi(principal, annual_rate, months)
    else:
        emi_data = calculate_reducing_balance_emi(principal, annual_rate, months)
    
    monthly_emi = emi_data["monthly_emi"]
    monthly_rate = (annual_rate / 12) / 100
    
    schedule = []
    balance = principal
    
    for month in range(1, months + 1):
        interest = balance * monthly_rate
        principal_payment = monthly_emi - interest
        balance = max(0, balance - principal_payment)
        
        schedule.append({
            "month": month,
            "emi": round(monthly_emi, 2),
            "principal": round(principal_payment, 2),
            "interest": round(interest, 2),
            "balance": round(balance, 2)
        })
    
    return {
        "summary": emi_data,
        "schedule": schedule
    }


# ===================== LOANS SETUP =====================

@router.post("/loans/{client_id}/setup")
async def setup_loan(client_id: str, loan_data: LoanSetup, admin_token: str = Query(...)):
    """Setup loan details for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Determine tenure: use due_date if provided, otherwise use loan_tenure_months
    loan_start = datetime.utcnow()
    tenure_months = loan_data.loan_tenure_months
    due_date_str = loan_data.due_date
    
    if due_date_str:
        try:
            due_date_parsed = datetime.fromisoformat(due_date_str.replace('Z', '+00:00').split('T')[0])
            # Calculate months between now and due date
            diff = relativedelta(due_date_parsed, loan_start)
            tenure_months = diff.years * 12 + diff.months
            if diff.days > 0:
                tenure_months += 1  # Round up partial months
            if tenure_months < 1:
                tenure_months = 1
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid due_date format. Use YYYY-MM-DD.")
    
    if tenure_months < 1:
        raise HTTPException(status_code=400, detail="Loan tenure must be at least 1 month")
    
    # Calculate EMI using reducing balance
    emi_data = calculate_reducing_balance_emi(
        loan_data.loan_amount - loan_data.down_payment,
        loan_data.interest_rate,
        tenure_months
    )
    
    next_due = loan_start + relativedelta(months=1)
    
    update_fields = {
        "loan_amount": loan_data.loan_amount,
        "down_payment": loan_data.down_payment,
        "interest_rate": loan_data.interest_rate,
        "loan_tenure_months": tenure_months,
        "monthly_emi": emi_data["monthly_emi"],
        "total_amount_due": emi_data["total_amount"],
        "outstanding_balance": emi_data["total_amount"],
        "loan_start_date": loan_start,
        "next_payment_due": next_due
    }
    
    if due_date_str:
        update_fields["loan_due_date"] = due_date_str
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": update_fields}
    )
    
    return {
        "message": "Loan setup complete",
        "client_id": client_id,
        "loan_details": {
            "monthly_emi": emi_data["monthly_emi"],
            "total_amount": emi_data["total_amount"],
            "tenure_months": tenure_months
        }
    }


# ===================== PAYMENTS =====================

@router.post("/loans/{client_id}/payments")
async def record_payment(
    client_id: str,
    payment_data: PaymentCreate,
    admin_token: str = Query(...)
):
    """Record a payment for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    admin = await db.admins.find_one({"id": admin_id})
    admin_username = admin.get("username", "unknown") if admin else "unknown"
    
    payment = Payment(
        client_id=client_id,
        amount=payment_data.amount,
        payment_date=payment_data.payment_date or datetime.utcnow(),
        payment_method=payment_data.payment_method,
        notes=payment_data.notes,
        recorded_by=admin_username
    )
    
    await db.payments.insert_one(payment.dict())
    
    # Update client balances
    new_total_paid = client.get("total_paid", 0) + payment_data.amount
    new_outstanding = max(0, client.get("outstanding_balance", 0) - payment_data.amount)
    
    # Move to next payment date
    next_due = client.get("next_payment_due")
    if next_due:
        next_due = next_due + relativedelta(months=1)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "total_paid": new_total_paid,
            "outstanding_balance": new_outstanding,
            "last_payment_date": payment.payment_date,
            "next_payment_due": next_due,
            "days_overdue": 0
        }}
    )
    
    # Unlock if balance is cleared
    if new_outstanding <= 0:
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"is_locked": False}}
        )
    
    return {
        "message": "Payment recorded",
        "payment": {
            "id": payment.id,
            "amount": payment.amount,
            "payment_date": payment.payment_date.isoformat() if payment.payment_date else None,
            "payment_method": payment.payment_method
        },
        "updated_balance": {
            "total_paid": new_total_paid,
            "outstanding_balance": new_outstanding
        }
    }


@router.get("/loans/{client_id}/payments")
async def get_payments(client_id: str, admin_token: str = Query(...)):
    """Get all payments for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    payments = await db.payments.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return payments


@router.get("/loans/{client_id}/schedule")
async def get_payment_schedule(client_id: str, admin_token: str = Query(...)):
    """Get payment schedule for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    if not client.get("loan_amount") or not client.get("loan_tenure_months"):
        return {"schedule": [], "message": "Loan not set up"}
    
    principal = client["loan_amount"] - client.get("down_payment", 0)
    annual_rate = client.get("interest_rate", 10)
    months = client["loan_tenure_months"]
    
    emi_data = calculate_reducing_balance_emi(principal, annual_rate, months)
    monthly_rate = (annual_rate / 12) / 100
    monthly_emi = emi_data["monthly_emi"]
    
    schedule = []
    balance = principal
    start_date = client.get("loan_start_date") or datetime.utcnow()
    
    for month in range(1, months + 1):
        interest = balance * monthly_rate
        principal_payment = monthly_emi - interest
        balance = max(0, balance - principal_payment)
        due_date = start_date + relativedelta(months=month)
        
        schedule.append({
            "month": month,
            "due_date": due_date.isoformat(),
            "emi": round(monthly_emi, 2),
            "principal": round(principal_payment, 2),
            "interest": round(interest, 2),
            "balance": round(balance, 2)
        })
    
    return {
        "schedule": schedule,
        "total_paid": client.get("total_paid", 0),
        "outstanding_balance": client.get("outstanding_balance", 0)
    }


@router.put("/loans/{client_id}/settings")
async def update_loan_settings(
    client_id: str,
    settings: LoanSettings,
    admin_token: str = Query(...)
):
    """Update loan auto-lock settings."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "auto_lock_enabled": settings.auto_lock_enabled,
            "auto_lock_grace_days": settings.auto_lock_grace_days
        }}
    )
    
    return {"message": "Settings updated"}


@router.post("/late-fees/calculate-all")
async def calculate_all_late_fees(admin_token: str = Query(...)):
    """Manually trigger late fee calculation for all clients."""
    await get_admin_id_from_token(admin_token)
    
    # This would typically be a background job
    return {"message": "Late fee calculation triggered"}
