"""Credit score routes - view and manage client credit scores."""
from fastapi import APIRouter, Query, Body
from datetime import datetime
from typing import Optional
import logging

from database import db
from utils.auth import get_admin_id_from_token
from utils.audit import log_audit, AuditAction
from utils.exceptions import ValidationException, NotFoundException
from models.schemas import CreditScoreHistory, CreditScoreUpdate

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Credit Score"])


async def update_credit_score(
    client_id: str,
    change_amount: int,
    reason: str,
    admin_id: Optional[str] = None
) -> int:
    """Update client credit score and log history. Returns new score."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise NotFoundException("Client not found")
    
    previous_score = client.get("credit_score", 0)
    new_score = max(0, previous_score + change_amount)
    
    # Update client
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "credit_score": new_score,
            "credit_score_updated_at": datetime.utcnow()
        }}
    )
    
    # Log history
    history_entry = CreditScoreHistory(
        client_id=client_id,
        previous_score=previous_score,
        new_score=new_score,
        change_amount=change_amount,
        reason=reason,
        admin_id=admin_id,
        created_at=datetime.utcnow()
    )
    await db.credit_score_history.insert_one(history_entry.dict())
    
    return new_score


@router.get("/clients/{client_id}/credit-score")
async def get_client_credit_score(
    client_id: str,
    admin_token: str = Query(...)
):
    """Get client's current credit score and rating."""
    await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise NotFoundException("Client not found")
    
    score = client.get("credit_score", 0)
    
    # Calculate rating based on score
    if score >= 800:
        rating = "excellent"
        rating_label = "Suurepärane" if True else "Excellent"
    elif score >= 650:
        rating = "good"
        rating_label = "Hea" if True else "Good"
    elif score >= 500:
        rating = "fair"
        rating_label = "Rahuldav" if True else "Fair"
    elif score >= 350:
        rating = "poor"
        rating_label = "Halb" if True else "Poor"
    else:
        rating = "very_poor"
        rating_label = "Väga halb" if True else "Very Poor"
    
    # Get last update
    last_history = await db.credit_score_history.find_one(
        {"client_id": client_id},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    
    return {
        "client_id": client_id,
        "score": score,
        "rating": rating,
        "rating_label": rating_label,
        "max_score": 1000,
        "updated_at": client.get("credit_score_updated_at"),
        "last_change": {
            "amount": last_history.get("change_amount") if last_history else None,
            "reason": last_history.get("reason") if last_history else None,
            "date": last_history.get("created_at").isoformat() if last_history and last_history.get("created_at") else None
        } if last_history else None
    }


@router.put("/clients/{client_id}/credit-score")
async def update_client_credit_score(
    client_id: str,
    admin_token: str = Query(...),
    update: CreditScoreUpdate = Body(...)
):
    """Manually update client's credit score (admin only)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise NotFoundException("Client not found")
    
    previous_score = client.get("credit_score", 0)
    new_score = max(0, update.score)
    change_amount = new_score - previous_score
    
    if change_amount == 0:
        return {"message": "No change to credit score", "score": new_score}
    
    # Update client
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "credit_score": new_score,
            "credit_score_updated_at": datetime.utcnow()
        }}
    )
    
    # Log history
    reason = update.reason or "manual_adjustment"
    history_entry = CreditScoreHistory(
        client_id=client_id,
        previous_score=previous_score,
        new_score=new_score,
        change_amount=change_amount,
        reason=f"manual: {reason}",
        admin_id=admin_id,
        created_at=datetime.utcnow()
    )
    await db.credit_score_history.insert_one(history_entry.dict())
    
    # Audit log
    await log_audit(
        admin_id=admin_id,
        action_type=AuditAction.CREDIT_SCORE_ADJUST,
        target_type="client",
        target_id=client_id,
        target_name=client.get("name"),
        details=f"Score: {previous_score} -> {new_score} ({change_amount:+d}). Reason: {reason}"
    )
    
    return {
        "client_id": client_id,
        "previous_score": previous_score,
        "new_score": new_score,
        "change_amount": change_amount,
        "reason": reason
    }


@router.get("/clients/{client_id}/credit-history")
async def get_credit_score_history(
    client_id: str,
    admin_token: str = Query(...),
    limit: int = Query(default=50, le=200)
):
    """Get client's credit score history."""
    await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise NotFoundException("Client not found")
    
    history = await db.credit_score_history.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Format timestamps
    for h in history:
        if h.get("created_at"):
            h["created_at"] = h["created_at"].isoformat()
    
    return {
        "client_id": client_id,
        "current_score": client.get("credit_score", 500),
        "history_count": len(history),
        "history": history
    }


@router.get("/credit-scores/overview")
async def get_credit_scores_overview(
    admin_token: str = Query(...)
):
    """Get overview of all clients' credit scores for the admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Check if superadmin
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    query = {} if is_super_admin else {"admin_id": admin_id}
    
    clients = await db.clients.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "credit_score": 1}
    ).to_list(1000)
    
    # Calculate distribution
    excellent = sum(1 for c in clients if c.get("credit_score", 500) >= 800)
    good = sum(1 for c in clients if 650 <= c.get("credit_score", 500) < 800)
    fair = sum(1 for c in clients if 500 <= c.get("credit_score", 500) < 650)
    poor = sum(1 for c in clients if 350 <= c.get("credit_score", 500) < 500)
    very_poor = sum(1 for c in clients if c.get("credit_score", 500) < 350)
    
    # Average score
    scores = [c.get("credit_score", 500) for c in clients]
    avg_score = sum(scores) / len(scores) if scores else 500
    
    # Sort by score
    sorted_clients = sorted(clients, key=lambda c: c.get("credit_score", 500), reverse=True)
    
    return {
        "total_clients": len(clients),
        "average_score": round(avg_score, 1),
        "distribution": {
            "excellent": excellent,
            "good": good,
            "fair": fair,
            "poor": poor,
            "very_poor": very_poor
        },
        "top_clients": sorted_clients[:5],
        "low_score_clients": sorted_clients[-5:] if len(sorted_clients) >= 5 else sorted_clients
    }


# Credit score change amounts for different events
# Score starts from 0, adjusts based on payment behavior
CREDIT_SCORE_CHANGES = {
    "payment_on_time": 5,              # Payment made on time
    "payment_early": 10,               # Payment 1 week+ before due date
    "payment_late_1_5": 0,             # 1-5 days late (no penalty)
    "payment_late_5_7": -5,            # More than 5 days late
    "payment_late_1_7": -5,            # 1-7 days late (alias)
    "payment_late_7_14": -7,           # More than 1 week late
    "payment_late_8_30": -7,           # 8-30 days late (alias)
    "payment_late_14_21": -10,         # More than 2 weeks late
    "payment_late_21_plus": -15,       # 3+ weeks late
    "payment_late_30_plus": -15,       # 30+ days late (alias)
    "loan_completed": 20,              # Loan fully paid off
    "loan_setup": 0,                   # New loan setup (neutral start)
    "device_lock": -5,                 # Device locked for non-payment
    "device_unlock_payment": 5,        # Device unlocked after payment
}
