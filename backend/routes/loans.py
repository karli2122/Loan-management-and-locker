"""Loan routes - loan plans, loans setup, payments, calculator."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
from dateutil.relativedelta import relativedelta
from typing import Optional
import logging

from database import db
from models.schemas import (
    LoanPlan, LoanPlanCreate, LoanSetup, LoanSettings,
    Payment, PaymentCreate, LoanEdit
)
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.exceptions import ValidationException
from utils.calculations import (
    calculate_simple_interest_emi, calculate_reducing_balance_emi,
    calculate_flat_rate_emi, calculate_all_methods, calculate_late_fee
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Loans"])

# Credit score adjustment values
CREDIT_SCORE_ON_TIME_PAYMENT = 5     # +5 for on-time payment
CREDIT_SCORE_LATE_PAYMENT = -10      # -10 for late payment


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
    
    # Determine loan start date: use given_date if provided, otherwise use current date
    if loan_data.given_date:
        try:
            loan_start = datetime.fromisoformat(loan_data.given_date.replace('Z', '+00:00').split('T')[0])
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid given_date format. Use YYYY-MM-DD.")
    else:
        loan_start = datetime.utcnow()
    
    # Determine tenure: use due_date if provided, otherwise use loan_tenure_months
    tenure_months = loan_data.loan_tenure_months
    due_date_str = loan_data.due_date
    
    if due_date_str:
        try:
            due_date_parsed = datetime.fromisoformat(due_date_str.replace('Z', '+00:00').split('T')[0])
            # Calculate months between loan start and due date
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
    
    # Calculate EMI using reducing balance (interest_rate is now monthly)
    emi_data = calculate_reducing_balance_emi(
        loan_data.loan_amount - loan_data.down_payment,
        loan_data.interest_rate * 12,  # Convert monthly to yearly for the calculation
        tenure_months
    )
    
    next_due = loan_start + relativedelta(months=1)
    
    update_fields = {
        "loan_amount": loan_data.loan_amount,
        "down_payment": loan_data.down_payment,
        "interest_rate": loan_data.interest_rate,  # Store as monthly rate
        "loan_tenure_months": tenure_months,
        "monthly_emi": emi_data["monthly_emi"],
        "total_amount_due": emi_data["total_amount"],
        "outstanding_balance": emi_data["total_amount"],
        "loan_start_date": loan_start,
        "next_payment_due": next_due
    }
    
    if due_date_str:
        update_fields["loan_due_date"] = due_date_str
    
    if loan_data.given_date:
        update_fields["loan_given_date"] = loan_data.given_date
    
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


@router.put("/loans/{client_id}/edit")
async def edit_loan(client_id: str, loan_data: LoanEdit, admin_token: str = Query(...)):
    """Edit existing loan details for a client.
    
    Allows editing: loan_amount, interest_rate (monthly), loan_start_date, due_date.
    Automatically recalculates total_amount_due, monthly_emi, and outstanding_balance.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Get current values as defaults
    loan_amount = loan_data.loan_amount if loan_data.loan_amount is not None else client.get("loan_amount", 0)
    interest_rate = loan_data.interest_rate if loan_data.interest_rate is not None else client.get("interest_rate", 0)
    
    # Parse start date
    if loan_data.loan_start_date:
        try:
            loan_start = datetime.fromisoformat(loan_data.loan_start_date.replace('Z', '+00:00').split('T')[0])
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid loan_start_date format. Use YYYY-MM-DD.")
    else:
        loan_start = client.get("loan_start_date") or datetime.utcnow()
    
    # Parse due date and calculate tenure
    if loan_data.due_date:
        try:
            due_date_parsed = datetime.fromisoformat(loan_data.due_date.replace('Z', '+00:00').split('T')[0])
            # Calculate months between start date and due date
            diff = relativedelta(due_date_parsed, loan_start)
            tenure_months = diff.years * 12 + diff.months
            if diff.days > 0:
                tenure_months += 1  # Round up partial months
            if tenure_months < 1:
                tenure_months = 1
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid due_date format. Use YYYY-MM-DD.")
    else:
        # Use existing tenure or calculate from existing due date
        tenure_months = client.get("loan_tenure_months", 12)
    
    # Calculate down payment (keep existing)
    down_payment = client.get("down_payment", 0)
    
    # Calculate EMI using reducing balance method
    principal = loan_amount - down_payment
    if principal <= 0:
        raise HTTPException(status_code=400, detail="Loan amount must be greater than down payment")
    
    emi_data = calculate_reducing_balance_emi(principal, interest_rate, tenure_months)
    
    # Calculate next payment due date (from start date + 1 month)
    next_due = loan_start + relativedelta(months=1)
    
    # Calculate new outstanding balance (total amount - already paid)
    total_paid = client.get("total_paid", 0)
    new_outstanding = max(0, emi_data["total_amount"] - total_paid)
    
    update_fields = {
        "loan_amount": loan_amount,
        "interest_rate": interest_rate,
        "loan_tenure_months": tenure_months,
        "monthly_emi": emi_data["monthly_emi"],
        "total_amount_due": emi_data["total_amount"],
        "outstanding_balance": new_outstanding,
        "loan_start_date": loan_start,
        "next_payment_due": next_due
    }
    
    if loan_data.due_date:
        update_fields["loan_due_date"] = loan_data.due_date
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": update_fields}
    )
    
    return {
        "message": "Loan updated successfully",
        "client_id": client_id,
        "loan_details": {
            "loan_amount": loan_amount,
            "interest_rate": interest_rate,
            "tenure_months": tenure_months,
            "monthly_emi": emi_data["monthly_emi"],
            "total_amount_due": emi_data["total_amount"],
            "outstanding_balance": new_outstanding,
            "total_paid": total_paid,
            "loan_start_date": loan_start.isoformat(),
            "loan_due_date": loan_data.due_date,
            "next_payment_due": next_due.isoformat()
        }
    }


@router.get("/loans/{client_id}/preview")
async def preview_loan_calculation(
    client_id: str,
    loan_amount: float = Query(...),
    interest_rate: float = Query(...),
    loan_start_date: str = Query(...),
    due_date: str = Query(...),
    admin_token: str = Query(...)
):
    """Preview loan calculation without saving.
    
    Returns calculated monthly EMI and total amount based on provided values.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Parse dates
    try:
        loan_start = datetime.fromisoformat(loan_start_date.replace('Z', '+00:00').split('T')[0])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid loan_start_date format. Use YYYY-MM-DD.")
    
    try:
        due_date_parsed = datetime.fromisoformat(due_date.replace('Z', '+00:00').split('T')[0])
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid due_date format. Use YYYY-MM-DD.")
    
    # Calculate tenure in months
    diff = relativedelta(due_date_parsed, loan_start)
    tenure_months = diff.years * 12 + diff.months
    if diff.days > 0:
        tenure_months += 1
    if tenure_months < 1:
        tenure_months = 1
    
    # Get down payment
    down_payment = client.get("down_payment", 0)
    principal = loan_amount - down_payment
    
    if principal <= 0:
        raise HTTPException(status_code=400, detail="Loan amount must be greater than down payment")
    
    # Calculate EMI
    emi_data = calculate_reducing_balance_emi(principal, interest_rate, tenure_months)
    
    return {
        "preview": {
            "loan_amount": loan_amount,
            "interest_rate": interest_rate,
            "tenure_months": tenure_months,
            "monthly_emi": emi_data["monthly_emi"],
            "total_amount_due": emi_data["total_amount"],
            "total_interest": emi_data["total_interest"],
            "down_payment": down_payment,
            "principal": principal
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
    
    # Determine if payment is on-time or late for credit score adjustment
    days_overdue = client.get("days_overdue", 0)
    is_late = client.get("is_late", False)
    credit_score_change = 0
    credit_score_reason = ""
    
    if days_overdue > 0 or is_late:
        # Late payment: -10 credit score
        credit_score_change = CREDIT_SCORE_LATE_PAYMENT
        credit_score_reason = f"late_payment_{days_overdue}_days_overdue"
    else:
        # On-time payment: +5 credit score
        credit_score_change = CREDIT_SCORE_ON_TIME_PAYMENT
        credit_score_reason = "on_time_payment"
    
    # Apply credit score adjustment
    if credit_score_change != 0:
        from routes.credit_score import update_credit_score
        try:
            new_credit_score = await update_credit_score(
                client_id=client_id,
                change_amount=credit_score_change,
                reason=credit_score_reason,
                admin_id=admin_id
            )
            logger.info(f"Credit score updated for client {client_id}: {credit_score_change:+d} ({credit_score_reason})")
        except Exception as e:
            logger.error(f"Failed to update credit score for client {client_id}: {e}")
            new_credit_score = client.get("credit_score", 500)
    else:
        new_credit_score = client.get("credit_score", 500)
    
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
            "days_overdue": 0,
            "is_late": False,
            "late_fees_accumulated": 0
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
        },
        "credit_score": {
            "change": credit_score_change,
            "reason": credit_score_reason,
            "new_score": new_credit_score
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
async def calculate_all_late_fees(admin_token: str = Query(...), apply_auto_lock: bool = Query(default=True)):
    """Calculate and apply late fees for all overdue clients, optionally applying auto-lock."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get all clients with active loans for this admin
    clients = await db.clients.find({
        "admin_id": admin_id,
        "next_payment_due": {"$exists": True, "$ne": None},
        "outstanding_balance": {"$gt": 0}
    }).to_list(1000)
    
    updated_count = 0
    total_late_fees = 0.0
    auto_locked_count = 0
    
    now = datetime.utcnow()
    
    for client in clients:
        next_due = client.get("next_payment_due")
        if not next_due:
            continue
        
        # Handle both datetime and string formats
        if isinstance(next_due, str):
            try:
                next_due = datetime.fromisoformat(next_due.replace('Z', '+00:00').replace('+00:00', ''))
            except (ValueError, AttributeError):
                continue
        
        # Calculate days overdue
        days_overdue = (now - next_due).days
        
        if days_overdue <= 0:
            # Not overdue - ensure is_late is False
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {
                    "days_overdue": 0,
                    "is_late": False
                }}
            )
            continue
        
        # Get late fee percentage (default 2%)
        late_fee_percent = 2.0
        
        # Try to get from loan plan if client has one
        loan_plan_id = client.get("loan_plan_id")
        if loan_plan_id:
            loan_plan = await db.loan_plans.find_one({"id": loan_plan_id})
            if loan_plan:
                late_fee_percent = loan_plan.get("late_fee_percent", 2.0)
        
        # Calculate late fee
        monthly_emi = client.get("monthly_emi", 0)
        late_fee = calculate_late_fee(monthly_emi, late_fee_percent, days_overdue)
        
        # Prepare update
        update_data = {
            "days_overdue": days_overdue,
            "late_fees_accumulated": late_fee,
            "is_late": True
        }
        
        # Check if auto-lock should be applied
        if apply_auto_lock:
            auto_lock_enabled = client.get("auto_lock_enabled", True)
            grace_days = client.get("auto_lock_grace_days", 3)
            is_currently_locked = client.get("is_locked", False)
            
            if auto_lock_enabled and days_overdue > grace_days and not is_currently_locked:
                update_data["is_locked"] = True
                update_data["lock_message"] = f"Device auto-locked: Payment is {days_overdue} days overdue. Please contact your lender to unlock."
                auto_locked_count += 1
                
                # Create notification for admin
                from models.schemas import Notification
                notification = Notification(
                    admin_id=admin_id,
                    type="auto_lock",
                    title="Device Auto-Locked",
                    message=f"Client {client['name']}'s device was auto-locked ({days_overdue} days overdue)",
                    client_id=client["id"],
                    client_name=client["name"]
                )
                await db.notifications.insert_one(notification.dict())
        
        # Apply credit score penalty for late payments (only if transitioning to late)
        was_late = client.get("is_late", False)
        if not was_late and days_overdue > 0:
            # First time becoming late - apply penalty
            from routes.credit_score import update_credit_score
            try:
                await update_credit_score(
                    client_id=client["id"],
                    change_amount=CREDIT_SCORE_LATE_PAYMENT,
                    reason=f"late_payment_detected_{days_overdue}_days",
                    admin_id=admin_id
                )
                logger.info(f"Credit score penalty applied to client {client['id']}: {CREDIT_SCORE_LATE_PAYMENT} (late payment)")
            except Exception as e:
                logger.error(f"Failed to apply credit score penalty for client {client['id']}: {e}")
        
        # Update client
        await db.clients.update_one(
            {"id": client["id"]},
            {"$set": update_data}
        )
        
        updated_count += 1
        total_late_fees += late_fee
    
    return {
        "message": "Late fee calculation complete",
        "clients_processed": len(clients),
        "clients_with_late_fees": updated_count,
        "total_late_fees": round(total_late_fees, 2),
        "devices_auto_locked": auto_locked_count
    }


@router.post("/auto-lock/process")
async def process_auto_locks(admin_token: str = Query(...)):
    """Process auto-locks for all overdue clients exceeding their grace period."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get all clients with active loans that are overdue and not yet locked
    clients = await db.clients.find({
        "admin_id": admin_id,
        "is_late": True,
        "is_locked": False,
        "auto_lock_enabled": True,
        "days_overdue": {"$gt": 0}
    }).to_list(1000)
    
    locked_count = 0
    locked_clients = []
    
    for client in clients:
        days_overdue = client.get("days_overdue", 0)
        grace_days = client.get("auto_lock_grace_days", 3)
        
        if days_overdue > grace_days:
            # Lock the device
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {
                    "is_locked": True,
                    "lock_message": f"Device auto-locked: Payment is {days_overdue} days overdue. Please contact your lender to unlock."
                }}
            )
            
            # Create notification for admin
            from models.schemas import Notification
            notification = Notification(
                admin_id=admin_id,
                type="auto_lock",
                title="Device Auto-Locked",
                message=f"Client {client['name']}'s device was auto-locked ({days_overdue} days overdue)",
                client_id=client["id"],
                client_name=client["name"]
            )
            await db.notifications.insert_one(notification.dict())
            
            locked_count += 1
            locked_clients.append({
                "id": client["id"],
                "name": client["name"],
                "days_overdue": days_overdue,
                "grace_days": grace_days
            })
    
    return {
        "message": "Auto-lock processing complete",
        "devices_locked": locked_count,
        "locked_clients": locked_clients
    }


@router.get("/auto-lock/pending")
async def get_pending_auto_locks(admin_token: str = Query(...)):
    """Get list of clients approaching or past their auto-lock threshold."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get all overdue clients with auto-lock enabled
    clients = await db.clients.find({
        "admin_id": admin_id,
        "is_late": True,
        "auto_lock_enabled": True,
        "days_overdue": {"$gt": 0}
    }, {"_id": 0}).to_list(1000)
    
    pending_locks = []
    already_locked = []
    approaching_lock = []
    
    for client in clients:
        days_overdue = client.get("days_overdue", 0)
        grace_days = client.get("auto_lock_grace_days", 3)
        is_locked = client.get("is_locked", False)
        days_until_lock = grace_days - days_overdue
        
        client_info = {
            "id": client["id"],
            "name": client["name"],
            "phone": client.get("phone", ""),
            "days_overdue": days_overdue,
            "grace_days": grace_days,
            "days_until_lock": max(0, days_until_lock),
            "outstanding_balance": client.get("outstanding_balance", 0),
            "late_fee": client.get("late_fees_accumulated", 0)
        }
        
        if is_locked:
            client_info["status"] = "locked"
            already_locked.append(client_info)
        elif days_overdue > grace_days:
            client_info["status"] = "pending_lock"
            pending_locks.append(client_info)
        else:
            client_info["status"] = "approaching"
            approaching_lock.append(client_info)
    
    return {
        "summary": {
            "total_overdue": len(clients),
            "pending_lock": len(pending_locks),
            "already_locked": len(already_locked),
            "approaching_lock": len(approaching_lock)
        },
        "pending_locks": sorted(pending_locks, key=lambda x: x["days_overdue"], reverse=True),
        "already_locked": already_locked,
        "approaching_lock": sorted(approaching_lock, key=lambda x: x["days_until_lock"])
    }


@router.get("/late-fees/summary")
async def get_late_fees_summary(admin_token: str = Query(...)):
    """Get summary of all late fees for admin's clients."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get all clients with late fees
    late_clients = await db.clients.find({
        "admin_id": admin_id,
        "is_late": True,
        "days_overdue": {"$gt": 0}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate summary
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in late_clients)
    total_overdue_balance = sum(c.get("outstanding_balance", 0) for c in late_clients)
    
    # Categorize by severity
    mild_overdue = [c for c in late_clients if c.get("days_overdue", 0) <= 7]
    moderate_overdue = [c for c in late_clients if 7 < c.get("days_overdue", 0) <= 30]
    severe_overdue = [c for c in late_clients if c.get("days_overdue", 0) > 30]
    
    return {
        "total_late_clients": len(late_clients),
        "total_late_fees": round(total_late_fees, 2),
        "total_overdue_balance": round(total_overdue_balance, 2),
        "breakdown": {
            "mild_1_7_days": len(mild_overdue),
            "moderate_8_30_days": len(moderate_overdue),
            "severe_over_30_days": len(severe_overdue)
        },
        "late_clients": [
            {
                "id": c["id"],
                "name": c["name"],
                "phone": c.get("phone", ""),
                "days_overdue": c.get("days_overdue", 0),
                "late_fee": c.get("late_fees_accumulated", 0),
                "outstanding_balance": c.get("outstanding_balance", 0),
                "monthly_emi": c.get("monthly_emi", 0)
            }
            for c in sorted(late_clients, key=lambda x: x.get("days_overdue", 0), reverse=True)
        ]
    }


@router.get("/clients/{client_id}/late-status")
async def get_client_late_status(client_id: str, admin_token: str = Query(...)):
    """Get late fee status for a specific client with real-time calculation."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Calculate real-time late status
    next_due = client.get("next_payment_due")
    if not next_due:
        return {
            "client_id": client_id,
            "is_late": False,
            "days_overdue": 0,
            "late_fee": 0,
            "message": "No payment due date set"
        }
    
    # Handle both datetime and string formats
    if isinstance(next_due, str):
        try:
            next_due = datetime.fromisoformat(next_due.replace('Z', '+00:00').replace('+00:00', ''))
        except (ValueError, AttributeError):
            return {
                "client_id": client_id,
                "is_late": False,
                "days_overdue": 0,
                "late_fee": 0,
                "message": "Invalid due date format"
            }
    
    now = datetime.utcnow()
    days_overdue = (now - next_due).days
    
    if days_overdue <= 0:
        return {
            "client_id": client_id,
            "is_late": False,
            "days_overdue": 0,
            "late_fee": 0,
            "next_payment_due": next_due.isoformat() if hasattr(next_due, 'isoformat') else str(next_due),
            "message": "Payment not yet due"
        }
    
    # Get late fee percentage
    late_fee_percent = 2.0
    loan_plan_id = client.get("loan_plan_id")
    if loan_plan_id:
        loan_plan = await db.loan_plans.find_one({"id": loan_plan_id})
        if loan_plan:
            late_fee_percent = loan_plan.get("late_fee_percent", 2.0)
    
    # Calculate late fee
    monthly_emi = client.get("monthly_emi", 0)
    late_fee = calculate_late_fee(monthly_emi, late_fee_percent, days_overdue)
    
    # Update client record with current late status
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "days_overdue": days_overdue,
            "late_fees_accumulated": late_fee,
            "is_late": True
        }}
    )
    
    return {
        "client_id": client_id,
        "is_late": True,
        "days_overdue": days_overdue,
        "late_fee": round(late_fee, 2),
        "late_fee_percent": late_fee_percent,
        "monthly_emi": monthly_emi,
        "outstanding_balance": client.get("outstanding_balance", 0),
        "total_with_late_fee": round(client.get("outstanding_balance", 0) + late_fee, 2),
        "next_payment_due": next_due.isoformat() if hasattr(next_due, 'isoformat') else str(next_due),
        "auto_lock_enabled": client.get("auto_lock_enabled", True),
        "auto_lock_grace_days": client.get("auto_lock_grace_days", 3)
    }
