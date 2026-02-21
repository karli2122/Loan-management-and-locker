"""Paid Loans routes - Archive and retrieve completed loans."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
from typing import Optional, List
import logging

from database import db
from models.schemas import Notification
from utils.auth import get_admin_id_from_token, enforce_client_scope

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Paid Loans"])


def calculate_interest_total(client: dict) -> float:
    loan_amount = client.get("loan_amount", 0) or 0
    total_due = client.get("total_amount_due", 0) or 0
    interest_total = max(total_due - loan_amount, 0)
    if interest_total == 0 and loan_amount > 0:
        rate = client.get("interest_rate", 0) or 0
        tenure = client.get("loan_tenure_months", 0) or 0
        if rate > 0:
            if tenure > 0:
                interest_total = loan_amount * rate / 100 * tenure
            else:
                interest_total = loan_amount * rate / 100
    return interest_total


async def perform_archive(client_id: str, admin_id: str) -> dict:
    """
    Core archive logic: moves a fully-paid loan to paid_loans collection.
    
    Returns the archive result dict. Raises HTTPException on validation failure.
    Called by both the manual archive endpoint and the auto-archive in record_payment.
    """
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if client has any loan data to archive
    loan_amount = client.get("loan_amount", 0) or client.get("total_amount_due", 0)
    if loan_amount <= 0:
        return {"message": "No loan data to archive", "archived": False}
    
    # Get payment history for this client
    payments = await db.payments.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("payment_date", 1).to_list(1000)
    
    # Calculate total paid and total interest
    total_paid = client.get("total_paid", 0)
    principal_amount = client.get("loan_amount", 0)
    total_interest = total_paid - principal_amount if total_paid > principal_amount else 0
    
    # Create the paid loan record
    paid_loan_record = {
        "id": f"pl_{client_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "client_id": client_id,
        "client_name": client.get("name", "Unknown"),
        "client_phone": client.get("phone", ""),
        "admin_id": admin_id,
        
        # Loan details
        "loan_amount": principal_amount,
        "interest_rate": client.get("interest_rate", 0),
        "loan_tenure_months": client.get("loan_tenure_months", 0),
        "total_amount_due": client.get("total_amount_due", 0),
        "total_paid": total_paid,
        "total_interest": total_interest,
        
        # Dates
        "loan_start_date": client.get("loan_start_date"),
        "loan_given_date": client.get("loan_given_date"),
        "loan_due_date": client.get("loan_due_date"),
        "paid_date": datetime.utcnow(),
        
        # Payment history
        "payment_count": len(payments),
        "payments_history": [
            {
                "id": p.get("id"),
                "amount": p.get("amount", 0),
                "payment_date": p.get("payment_date").isoformat() if isinstance(p.get("payment_date"), datetime) else p.get("payment_date"),
                "payment_method": p.get("payment_method", "cash"),
                "notes": p.get("notes", ""),
                "recorded_by": p.get("recorded_by", "")
            }
            for p in payments
        ],
        
        # Credit score at completion
        "final_credit_score": client.get("credit_score", 500),
        
        # Metadata
        "archived_at": datetime.utcnow(),
        "archived_by": admin_id
    }
    
    # Insert into paid_loans collection
    await db.paid_loans.insert_one(paid_loan_record)
    
    # Clear the loan fields on the client (but keep the client record)
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "loan_amount": 0,
            "total_amount_due": 0,
            "total_paid": 0,
            "outstanding_balance": 0,
            "monthly_emi": 0,
            "loan_start_date": None,
            "loan_given_date": None,
            "loan_due_date": None,
            "next_payment_due": None,
            "loan_tenure_months": 0,
            "interest_rate": 0,
            "days_overdue": 0,
            "is_late": False,
            "late_fees_accumulated": 0,
            "loan_plan_id": None
        }}
    )
    
    # Create notification for admin
    notification = Notification(
        admin_id=admin_id,
        type="loan_archived",
        title="Loan Archived",
        message=f"Loan for {client.get('name', 'Unknown')} has been archived. Amount: €{total_paid:.2f}",
        client_id=client_id,
        client_name=client.get("name", "Unknown")
    )
    await db.notifications.insert_one(notification.dict())
    
    logger.info(f"Archived loan for client {client_id}. Total paid: €{total_paid:.2f}")
    
    return {
        "message": "Loan archived successfully",
        "archived": True,
        "paid_loan_id": paid_loan_record["id"],
        "summary": {
            "client_name": client.get("name", "Unknown"),
            "loan_amount": principal_amount,
            "total_paid": total_paid,
            "total_interest": total_interest,
            "payment_count": len(payments)
        }
    }


@router.post("/loans/{client_id}/archive")
async def archive_loan(client_id: str, admin_token: str = Query(...)):
    """
    Archive a completed loan to the paid_loans collection.
    
    This moves the loan data to a separate collection for historical records
    while clearing the active loan fields on the client.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Verify client exists and belongs to admin
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Check if loan is actually paid off
    outstanding = client.get("outstanding_balance", 0)
    if outstanding > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot archive loan with outstanding balance of €{outstanding:.2f}"
        )
    
    return await perform_archive(client_id, admin_id)


@router.get("/paid-loans")
async def get_paid_loans(
    admin_token: str = Query(...),
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0)
):
    """Get list of all archived/paid loans for the admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get total count
    total = await db.paid_loans.count_documents({"admin_id": admin_id})
    
    # Get paid loans with pagination
    paid_loans = await db.paid_loans.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).sort("archived_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return {
        "paid_loans": paid_loans,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/paid-loans/summary")
async def get_paid_loans_summary(admin_token: str = Query(...)):
    """Get summary statistics for all archived loans, including current month breakdown and 6-month trend."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get all paid loans for this admin
    paid_loans = await db.paid_loans.find(
        {"admin_id": admin_id},
        {"_id": 0, "loan_amount": 1, "total_paid": 1, "total_interest": 1, "payment_count": 1, "archived_at": 1}
    ).to_list(10000)
    
    # Build 6-month trend (always return 6 entries, even with no data)
    now = datetime.utcnow()
    monthly_trend = []
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        monthly_trend.append({"year": year, "month": month, "interest": 0.0})

    total_principal = sum(pl.get("loan_amount", 0) for pl in paid_loans)
    total_collected = sum(pl.get("total_paid", 0) for pl in paid_loans)
    total_payments = sum(pl.get("payment_count", 0) for pl in paid_loans)

    # Interest calculations from payments (active + archived)
    clients = await db.clients.find({"admin_id": admin_id}, {"_id": 0}).to_list(1000)
    client_ids = [c.get("id") for c in clients]
    payments_all = await db.payments.find({"client_id": {"$in": client_ids}}, {"_id": 0}).to_list(10000)

    paid_loans_map = {}
    for pl in paid_loans:
        client_id = pl.get("client_id")
        if not client_id:
            continue
        current = paid_loans_map.get(client_id)
        if not current:
            paid_loans_map[client_id] = pl
            continue
        current_date = current.get("archived_at") or datetime.min
        pl_date = pl.get("archived_at") or datetime.min
        if pl_date > current_date:
            paid_loans_map[client_id] = pl

    interest_remaining = {}
    for client in clients:
        interest_total = calculate_interest_total(client)
        if interest_total == 0:
            paid = paid_loans_map.get(client.get("id"))
            if paid:
                interest_total = paid.get("total_interest", 0) or 0
        interest_remaining[client.get("id")] = interest_total

    month_start = datetime(now.year, now.month, 1)
    current_month_interest = 0
    total_interest_earned = 0
    current_month_count = 0

    # Build a lookup for quick trend population
    trend_lookup = { (entry["year"], entry["month"]): entry for entry in monthly_trend }

    payments_sorted = sorted(payments_all, key=lambda p: p.get("payment_date") or datetime.min)
    for payment in payments_sorted:
        payment_date = payment.get("payment_date")
        if not payment_date:
            continue
        amount = payment.get("amount", 0)
        client_id = payment.get("client_id")
        remaining_interest = interest_remaining.get(client_id, 0)
        interest_component = min(remaining_interest, amount)
        if client_id in interest_remaining:
            interest_remaining[client_id] = max(remaining_interest - interest_component, 0)

        total_interest_earned += interest_component
        if payment_date >= month_start:
            current_month_interest += interest_component
        key = (payment_date.year, payment_date.month)
        if key in trend_lookup:
            trend_lookup[key]["interest"] += interest_component

    for entry in monthly_trend:
        entry["interest"] = round(entry["interest"], 2)

    for pl in paid_loans:
        archived_at = pl.get("archived_at")
        if isinstance(archived_at, datetime) and archived_at >= month_start:
            current_month_count += 1

    return {
        "total_loans_archived": len(paid_loans),
        "total_principal_disbursed": round(total_principal, 2),
        "total_amount_collected": round(total_collected, 2),
        "total_interest_earned": round(total_interest_earned, 2),
        "total_payments_received": total_payments,
        "current_month_interest": round(current_month_interest, 2),
        "current_month_loans_archived": current_month_count,
        "monthly_interest_trend": monthly_trend
    }


@router.get("/paid-loans/{client_id}/latest")
async def get_latest_paid_loan(client_id: str, admin_token: str = Query(...)):
    """Get the most recent archived loan for a client, used for loan renewal pre-fill."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    paid_loan = await db.paid_loans.find_one(
        {"client_id": client_id, "admin_id": admin_id},
        {"_id": 0},
        sort=[("archived_at", -1)]
    )
    
    if not paid_loan:
        raise HTTPException(status_code=404, detail="No archived loans found for this client")
    
    return paid_loan



@router.get("/paid-loans/{paid_loan_id}")
async def get_paid_loan_details(paid_loan_id: str, admin_token: str = Query(...)):
    """Get detailed information about a specific archived loan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    paid_loan = await db.paid_loans.find_one(
        {"id": paid_loan_id, "admin_id": admin_id},
        {"_id": 0}
    )
    
    if not paid_loan:
        raise HTTPException(status_code=404, detail="Paid loan not found")
    
    return paid_loan


@router.get("/clients/{client_id}/loan-history")
async def get_client_loan_history(
    client_id: str,
    admin_token: str = Query(...)
):
    """Get all archived loans for a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Verify the client exists and belongs to this admin
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Get all paid loans for this client
    paid_loans = await db.paid_loans.find(
        {"client_id": client_id, "admin_id": admin_id},
        {"_id": 0}
    ).sort("archived_at", -1).to_list(100)
    
    return {
        "client_id": client_id,
        "client_name": client.get("name", "Unknown"),
        "loan_history": paid_loans,
        "total_loans": len(paid_loans)
    }


@router.delete("/paid-loans/{paid_loan_id}")
async def delete_paid_loan(paid_loan_id: str, admin_token: str = Query(...)):
    """
    Delete a paid loan record (superadmin only).
    This is a permanent deletion and should be used with caution.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Check if user is superadmin
    admin = await db.admins.find_one({"id": admin_id})
    if not admin or not admin.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Only superadmins can delete archived loans")
    
    paid_loan = await db.paid_loans.find_one({"id": paid_loan_id, "admin_id": admin_id})
    if not paid_loan:
        raise HTTPException(status_code=404, detail="Paid loan not found")
    
    await db.paid_loans.delete_one({"id": paid_loan_id})
    
    return {"message": "Paid loan record deleted"}
