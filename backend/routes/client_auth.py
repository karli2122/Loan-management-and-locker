"""Client authentication routes - login, status, payment history for self-service portal."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
from typing import Optional
import logging

from database import db
from utils.exceptions import ValidationException, AuthenticationException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Client Auth"])


@router.post("/client/login")
async def client_login(phone: str, registration_code: str):
    """Authenticate a client using phone number and registration code."""
    if not phone or not registration_code:
        raise ValidationException("Phone number and registration code are required")
    
    # Find client by phone and registration code
    client = await db.clients.find_one({
        "phone": phone,
        "registration_code": registration_code.upper()
    }, {"_id": 0})
    
    if not client:
        raise AuthenticationException("Invalid phone number or registration code")
    
    return {
        "success": True,
        "client_id": client["id"],
        "name": client.get("name", ""),
        "is_registered": client.get("is_registered", False)
    }


@router.get("/client/portal/status")
async def get_client_portal_status(client_id: str = Query(...), registration_code: str = Query(...)):
    """Get client's loan status for the self-service portal."""
    # Verify client credentials
    client = await db.clients.find_one({
        "id": client_id,
        "registration_code": registration_code.upper()
    }, {"_id": 0})
    
    if not client:
        raise AuthenticationException("Invalid credentials")
    
    # Calculate loan progress
    loan_amount = client.get("loan_amount", 0) or client.get("total_amount_due", 0)
    total_paid = client.get("total_paid", 0)
    outstanding = client.get("outstanding_balance", 0)
    
    progress_percent = 0
    if loan_amount > 0:
        progress_percent = min(100, (total_paid / loan_amount) * 100)
    
    # Get next payment info
    next_payment_due = client.get("next_payment_due")
    monthly_emi = client.get("monthly_emi", 0) or client.get("emi_amount", 0)
    
    # Calculate days until due / days overdue
    days_until_due = None
    days_overdue = client.get("days_overdue", 0)
    
    if next_payment_due:
        if isinstance(next_payment_due, str):
            try:
                next_payment_due = datetime.fromisoformat(next_payment_due.replace("Z", "+00:00"))
            except:
                next_payment_due = None
        
        if next_payment_due:
            delta = (next_payment_due - datetime.utcnow()).days
            if delta >= 0:
                days_until_due = delta
                days_overdue = 0
            else:
                days_overdue = abs(delta)
    
    return {
        "client_id": client["id"],
        "name": client.get("name", ""),
        "phone": client.get("phone", ""),
        "loan_summary": {
            "loan_amount": loan_amount,
            "total_paid": total_paid,
            "outstanding_balance": outstanding,
            "progress_percent": round(progress_percent, 1),
            "monthly_emi": monthly_emi,
            "interest_rate": client.get("interest_rate", 0),
            "loan_tenure_months": client.get("loan_tenure_months", 0),
            "loan_start_date": client.get("loan_start_date").isoformat() if client.get("loan_start_date") else None,
        },
        "payment_status": {
            "next_payment_due": next_payment_due.isoformat() if next_payment_due else None,
            "days_until_due": days_until_due,
            "days_overdue": days_overdue,
            "is_overdue": days_overdue > 0,
            "late_fees_accumulated": client.get("late_fees_accumulated", 0),
        },
        "device_status": {
            "is_locked": client.get("is_locked", False),
            "is_registered": client.get("is_registered", False),
            "device_model": client.get("device_model", ""),
        }
    }


@router.get("/client/portal/payments")
async def get_client_payment_history(client_id: str = Query(...), registration_code: str = Query(...)):
    """Get client's payment history for the self-service portal."""
    # Verify client credentials
    client = await db.clients.find_one({
        "id": client_id,
        "registration_code": registration_code.upper()
    })
    
    if not client:
        raise AuthenticationException("Invalid credentials")
    
    # Get payment history
    payments = await db.payments.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    # Format payments for response
    formatted_payments = []
    for payment in payments:
        formatted_payments.append({
            "id": payment.get("id", ""),
            "amount": payment.get("amount", 0),
            "payment_date": payment.get("payment_date").isoformat() if payment.get("payment_date") else None,
            "payment_method": payment.get("payment_method", "cash"),
            "notes": payment.get("notes", ""),
        })
    
    return {
        "client_id": client_id,
        "total_payments": len(formatted_payments),
        "total_amount_paid": sum(p.get("amount", 0) for p in formatted_payments),
        "payments": formatted_payments
    }
