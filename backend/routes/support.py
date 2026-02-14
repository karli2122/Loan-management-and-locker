"""Support routes - chat messages, payment history."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
import logging

from database import db
from models.schemas import SupportMessage, SupportMessageCreate, Notification
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Support"])


@router.get("/support/messages/{client_id}")
async def get_support_messages(client_id: str):
    """Get support chat messages for a client."""
    messages = await db.support_messages.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    return messages


@router.post("/support/messages/{client_id}")
async def send_support_message(
    client_id: str,
    message_data: SupportMessageCreate,
    sender: str = Query(...)
):
    """Send a support message."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    message = SupportMessage(
        client_id=client_id,
        sender=sender,
        message=message_data.message
    )
    
    await db.support_messages.insert_one(message.dict())
    
    # Create notification for admin if message is from client
    if sender == "client" and client.get("admin_id"):
        notification = Notification(
            admin_id=client["admin_id"],
            type="support_message",
            title="New Support Message",
            message=f"New message from {client['name']}: {message_data.message[:50]}...",
            client_id=client_id,
            client_name=client["name"]
        )
        await db.notifications.insert_one(notification.dict())
    
    return {"message": "Message sent", "id": message.id}


@router.post("/support/messages/{client_id}/mark-read")
async def mark_messages_read(client_id: str, admin_token: str = Query(...)):
    """Mark all support messages from a client as read."""
    await get_admin_id_from_token(admin_token)
    
    await db.support_messages.update_many(
        {"client_id": client_id, "sender": "client", "is_read": False},
        {"$set": {"is_read": True}}
    )
    
    return {"message": "Messages marked as read"}


@router.get("/payments/history/{client_id}")
async def get_payment_history(client_id: str):
    """Get payment history for a client."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    payments = await db.payments.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return {
        "payments": payments,
        "loan_info": {
            "loan_amount": client.get("loan_amount", 0),
            "total_paid": client.get("total_paid", 0),
            "outstanding_balance": client.get("outstanding_balance", 0),
            "monthly_emi": client.get("monthly_emi", 0),
            "next_payment_due": client.get("next_payment_due")
        }
    }
