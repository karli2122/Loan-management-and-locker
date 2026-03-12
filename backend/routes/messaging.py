"""In-app messaging between admins and clients with push notifications."""
from fastapi import APIRouter, Query
from datetime import datetime, timezone
from database import db
from utils.auth import get_admin_id_from_token
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/messages", tags=["messages"])


async def _send_push(token: str, title: str, body: str, data: dict = None):
    """Send Expo push notification."""
    import httpx
    if not token or not token.startswith("ExponentPushToken"):
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": title, "body": body, "sound": "default",
                       "priority": "high", "data": data or {}},
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Push send failed: {e}")
        return False


@router.get("")
async def get_messages(client_id: str = Query(...), admin_token: str = Query(None), client_token: str = Query(None), limit: int = 50):
    """Get messages between admin and client."""
    if admin_token:
        await get_admin_id_from_token(admin_token)
    elif client_token:
        client = await db.clients.find_one({"device_token": client_token}, {"_id": 0, "id": 1})
        if not client or client["id"] != client_id:
            return {"error": "Unauthorized"}
    else:
        return {"error": "Token required"}

    messages = await db.messages.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()
    return {"messages": messages}


@router.post("")
async def send_message(client_id: str = Query(...), text: str = Query(...), admin_token: str = Query(None), client_token: str = Query(None)):
    """Send a message and trigger push notification to recipient."""
    sender_type = None
    sender_id = None

    if admin_token:
        sender_id = await get_admin_id_from_token(admin_token)
        sender_type = "admin"
    elif client_token:
        client = await db.clients.find_one({"device_token": client_token}, {"_id": 0, "id": 1})
        if not client or client["id"] != client_id:
            return {"error": "Unauthorized"}
        sender_type = "client"
        sender_id = client_id
    else:
        return {"error": "Token required"}

    msg = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "sender_type": sender_type,
        "sender_id": sender_id,
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)

    # Send push notification to the OTHER party
    push_sent = False
    if sender_type == "admin":
        # Admin sent message -> push to client device
        target = await db.clients.find_one({"id": client_id}, {"_id": 0, "expo_push_token": 1, "name": 1})
        if target and target.get("expo_push_token"):
            push_sent = await _send_push(
                target["expo_push_token"],
                "New Message from Admin",
                text[:200],
                {"action": "message", "client_id": client_id},
            )
    elif sender_type == "client":
        # Client sent message -> push to all admin devices
        client_doc = await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1, "admin_id": 1})
        client_name = client_doc.get("name", "Client") if client_doc else "Client"
        admin_id = client_doc.get("admin_id") if client_doc else None
        # Find admin push tokens
        query = {"admin_id": admin_id} if admin_id else {}
        admin_tokens = await db.push_tokens.find(query, {"_id": 0, "token": 1}).to_list(20)
        for at in admin_tokens:
            if at.get("token"):
                sent = await _send_push(
                    at["token"],
                    f"Message from {client_name}",
                    text[:200],
                    {"action": "message", "client_id": client_id},
                )
                if sent:
                    push_sent = True

    msg["push_sent"] = push_sent
    return msg


@router.post("/mark-read")
async def mark_messages_read(client_id: str = Query(...), admin_token: str = Query(None), client_token: str = Query(None)):
    """Mark all messages as read for a conversation."""
    reader_type = None
    if admin_token:
        await get_admin_id_from_token(admin_token)
        reader_type = "client"
    elif client_token:
        reader_type = "admin"

    if reader_type:
        await db.messages.update_many(
            {"client_id": client_id, "sender_type": reader_type, "read": False},
            {"$set": {"read": True}}
        )
    return {"status": "ok"}


@router.get("/unread-counts")
async def get_unread_counts(admin_token: str = Query(...)):
    """Get unread message counts per client for admin."""
    await get_admin_id_from_token(admin_token)
    pipeline = [
        {"$match": {"sender_type": "client", "read": False}},
        {"$group": {"_id": "$client_id", "count": {"$sum": 1}}}
    ]
    results = await db.messages.aggregate(pipeline).to_list(1000)
    return {r["_id"]: r["count"] for r in results}
