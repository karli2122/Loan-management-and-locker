"""Loan restructuring/rescheduling - modify EMI, extend tenure, track history."""
from fastapi import APIRouter, Query, Body
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from database import db
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.audit import log_audit, AuditAction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Loan Restructuring"])


@router.post("/loans/{client_id}/restructure")
async def restructure_loan(
    client_id: str,
    admin_token: str = Query(...),
    data: dict = Body(...),
):
    """Restructure a loan - modify EMI, extend tenure, change interest rate.
    
    Body: {
        "new_emi": 150.0,           # optional
        "new_tenure_months": 12,     # optional
        "new_interest_rate": 5.0,    # optional
        "reason": "Client hardship",  # required
        "effective_date": "2026-04-01" # optional, defaults to today
    }
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    reason = data.get("reason", "")
    if not reason:
        from utils.exceptions import ValidationException
        raise ValidationException("Restructuring reason is required")
    
    now = datetime.now(timezone.utc)
    effective_date = data.get("effective_date", now.strftime("%Y-%m-%d"))
    
    # Capture original terms
    original_terms = {
        "emi_amount": client.get("monthly_emi") or client.get("emi_amount", 0),
        "interest_rate": client.get("interest_rate", 0),
        "loan_amount": client.get("loan_amount", 0),
        "outstanding_balance": client.get("outstanding_balance", 0),
        "loan_due_date": client.get("loan_due_date"),
        "next_payment_due": client.get("next_payment_due"),
        "total_amount_due": client.get("total_amount_due", 0),
    }
    
    # Build update with new terms
    update = {}
    new_terms = {}
    
    if "new_emi" in data and data["new_emi"] is not None:
        new_emi = float(data["new_emi"])
        update["monthly_emi"] = new_emi
        update["emi_amount"] = new_emi
        new_terms["emi_amount"] = new_emi
    
    if "new_interest_rate" in data and data["new_interest_rate"] is not None:
        new_rate = float(data["new_interest_rate"])
        update["interest_rate"] = new_rate
        new_terms["interest_rate"] = new_rate
    
    if "new_tenure_months" in data and data["new_tenure_months"] is not None:
        new_tenure = int(data["new_tenure_months"])
        new_terms["tenure_months"] = new_tenure
        # Recalculate total amount due based on new tenure and EMI
        emi = new_terms.get("emi_amount", original_terms["emi_amount"])
        update["total_amount_due"] = emi * new_tenure
        new_terms["total_amount_due"] = emi * new_tenure
    
    if "new_due_date" in data and data["new_due_date"]:
        update["next_payment_due"] = data["new_due_date"]
        update["loan_due_date"] = data["new_due_date"]
        new_terms["next_payment_due"] = data["new_due_date"]
    
    if not update:
        from utils.exceptions import ValidationException
        raise ValidationException("No changes specified")
    
    update["restructured_at"] = now
    update["restructure_count"] = (client.get("restructure_count", 0) or 0) + 1
    
    # Save restructuring history
    history_entry = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "admin_id": admin_id,
        "original_terms": original_terms,
        "new_terms": new_terms,
        "reason": reason,
        "effective_date": effective_date,
        "created_at": now,
    }
    await db.loan_restructure_history.insert_one(history_entry)
    history_entry.pop("_id", None)
    
    # Apply changes to client
    await db.clients.update_one({"id": client_id}, {"$set": update})
    
    await log_audit(admin_id, AuditAction.LOAN_EDIT, "loan", client_id,
                    client.get("name", ""), f"Restructured: {reason}")
    
    return {
        "message": "Loan restructured successfully",
        "restructure_id": history_entry["id"],
        "original_terms": original_terms,
        "new_terms": new_terms,
        "effective_date": effective_date,
    }


@router.get("/loans/{client_id}/restructure-history")
async def get_restructure_history(
    client_id: str,
    admin_token: str = Query(...),
):
    """Get full restructuring history for a client's loan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)
    
    history = await db.loan_restructure_history.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Convert datetime objects to ISO strings
    for entry in history:
        if isinstance(entry.get("created_at"), datetime):
            entry["created_at"] = entry["created_at"].isoformat()
    
    return {
        "client_id": client_id,
        "total_restructurings": len(history),
        "history": history,
    }
