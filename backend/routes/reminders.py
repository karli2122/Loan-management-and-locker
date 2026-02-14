"""Reminders routes - payment reminders, push notifications."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional
import logging
import httpx

from database import db
from models.schemas import Reminder
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reminders"])


async def send_expo_push_notification(push_token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification via Expo."""
    if not push_token:
        return False
    
    payload = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {}
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as http_client:
            response = await http_client.post("https://exp.host/--/api/v2/push/send", json=payload)
            if response.status_code >= httpx.codes.BAD_REQUEST:
                logger.warning(f"Expo push send failed ({response.status_code})")
                return False
        return True
    except Exception as exc:
        logger.error(f"Expo push error: {exc}")
        return False


@router.get("/reminders")
async def list_reminders(admin_token: str = Query(...)):
    """List all reminders for the authenticated admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    reminders = await db.reminders.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).sort("scheduled_date", -1).to_list(100)
    
    return reminders


@router.get("/clients/{client_id}/reminders")
async def get_client_reminders(client_id: str, admin_token: str = Query(...)):
    """Get reminders for a specific client."""
    await get_admin_id_from_token(admin_token)
    
    reminders = await db.reminders.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("scheduled_date", -1).to_list(50)
    
    return reminders


@router.post("/reminders/create-all")
async def create_all_reminders(admin_token: str = Query(...)):
    """Manually trigger reminder creation for all clients."""
    await get_admin_id_from_token(admin_token)
    return {"message": "Reminder creation triggered"}


@router.post("/reminders/{reminder_id}/mark-sent")
async def mark_reminder_sent(reminder_id: str, admin_token: str = Query(...)):
    """Mark a reminder as sent."""
    await get_admin_id_from_token(admin_token)
    
    await db.reminders.update_one(
        {"id": reminder_id},
        {"$set": {"sent": True, "sent_at": datetime.utcnow()}}
    )
    
    return {"message": "Reminder marked as sent"}


@router.get("/reminders/pending")
async def get_pending_reminders(admin_token: str = Query(...)):
    """Get all pending payment reminders with summary stats."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)
    
    clients = await db.clients.find(
        {
            "admin_id": admin_id,
            "outstanding_balance": {"$gt": 0},
            "next_payment_due": {"$exists": True}
        },
        {"_id": 0}
    ).to_list(1000)
    
    overdue = []
    due_today = []
    due_soon = []  # 1-3 days
    upcoming = []  # 4-7 days
    
    for client in clients:
        next_due = client.get("next_payment_due")
        if not next_due:
            continue
        
        reminder_data = {
            "client_id": client["id"],
            "client_name": client["name"],
            "phone": client.get("phone", ""),
            "monthly_emi": client.get("monthly_emi", 0),
            "outstanding_balance": client.get("outstanding_balance", 0),
            "next_payment_due": next_due.isoformat() if isinstance(next_due, datetime) else next_due,
            "days_overdue": client.get("days_overdue", 0),
            "has_push_token": bool(client.get("expo_push_token"))
        }
        
        if next_due < today_start:
            reminder_data["days_overdue"] = (now - next_due).days
            overdue.append(reminder_data)
        elif today_start <= next_due < today_end:
            due_today.append(reminder_data)
        elif today_end <= next_due < today_start + timedelta(days=4):
            due_soon.append(reminder_data)
        elif today_start + timedelta(days=4) <= next_due < week_end:
            upcoming.append(reminder_data)
    
    return {
        "summary": {
            "overdue_count": len(overdue),
            "due_today_count": len(due_today),
            "due_soon_count": len(due_soon),
            "upcoming_count": len(upcoming)
        },
        "overdue": sorted(overdue, key=lambda x: x.get("days_overdue", 0), reverse=True),
        "due_today": due_today,
        "due_soon": due_soon,
        "upcoming": upcoming
    }


@router.post("/reminders/send-push")
async def send_bulk_push_reminders(admin_token: str = Query(...)):
    """Send push notification reminders to all clients with pending payments."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    clients = await db.clients.find({
        "admin_id": admin_id,
        "outstanding_balance": {"$gt": 0},
        "expo_push_token": {"$exists": True, "$ne": None, "$ne": ""}
    }).to_list(1000)
    
    sent_count = 0
    failed_count = 0
    
    for client in clients:
        push_token = client.get("expo_push_token")
        if not push_token:
            continue
        
        next_due = client.get("next_payment_due")
        days_overdue = client.get("days_overdue", 0)
        
        if days_overdue > 0:
            title = "Payment Overdue"
            body = f"Your payment of €{client.get('monthly_emi', 0):.2f} is {days_overdue} days overdue. Please pay to avoid service interruption."
        elif next_due:
            days_until = (next_due - datetime.utcnow()).days
            if days_until <= 0:
                title = "Payment Due Today"
                body = f"Your payment of €{client.get('monthly_emi', 0):.2f} is due today."
            else:
                title = "Payment Reminder"
                body = f"Your payment of €{client.get('monthly_emi', 0):.2f} is due in {days_until} days."
        else:
            continue
        
        success = await send_expo_push_notification(
            push_token,
            title,
            body,
            {"client_id": client["id"], "type": "payment_reminder"}
        )
        
        if success:
            sent_count += 1
            
            # Create reminder record
            reminder = Reminder(
                client_id=client["id"],
                reminder_type="push_notification",
                scheduled_date=datetime.utcnow(),
                sent=True,
                sent_at=datetime.utcnow(),
                message=body,
                admin_id=admin_id
            )
            await db.reminders.insert_one(reminder.dict())
        else:
            failed_count += 1
    
    return {
        "message": f"Sent {sent_count} reminders, {failed_count} failed",
        "sent_count": sent_count,
        "failed_count": failed_count
    }


@router.post("/reminders/send-single/{client_id}")
async def send_single_reminder(client_id: str, admin_token: str = Query(...)):
    """Send a push notification reminder to a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if client.get("admin_id") != admin_id:
        raise HTTPException(status_code=403, detail="Client not accessible")
    
    push_token = client.get("expo_push_token")
    if not push_token:
        return {"success": False, "message": "Client has no push token"}
    
    days_overdue = client.get("days_overdue", 0)
    monthly_emi = client.get("monthly_emi", 0)
    
    if days_overdue > 0:
        title = "Payment Overdue"
        body = f"Your payment of €{monthly_emi:.2f} is {days_overdue} days overdue."
    else:
        title = "Payment Reminder"
        body = f"Your payment of €{monthly_emi:.2f} is due soon."
    
    success = await send_expo_push_notification(
        push_token,
        title,
        body,
        {"client_id": client_id, "type": "payment_reminder"}
    )
    
    if success:
        reminder = Reminder(
            client_id=client_id,
            reminder_type="push_notification",
            scheduled_date=datetime.utcnow(),
            sent=True,
            sent_at=datetime.utcnow(),
            message=body,
            admin_id=admin_id
        )
        await db.reminders.insert_one(reminder.dict())
    
    return {"success": success, "message": body if success else "Failed to send notification"}
