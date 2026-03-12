"""Push notifications via Expo and bulk Telegram messaging."""
from fastapi import APIRouter, Query
from database import db
from utils.auth import get_admin_id_from_token
from datetime import datetime, timezone
import httpx
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/push", tags=["push"])

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")


@router.post("/send-expo")
async def send_expo_push(admin_token: str = Query(...), title: str = Query(...), body: str = Query(...), client_ids: str = Query(None)):
    """Send Expo push notifications to admin devices."""
    await get_admin_id_from_token(admin_token)

    # Get push tokens from admin devices
    query = {}
    if client_ids:
        query["id"] = {"$in": client_ids.split(",")}
    tokens = await db.push_tokens.find(query, {"_id": 0, "token": 1}).to_list(1000)

    if not tokens:
        return {"sent": 0, "message": "No push tokens registered"}

    expo_tokens = [t["token"] for t in tokens if t.get("token", "").startswith("ExponentPushToken")]
    if not expo_tokens:
        return {"sent": 0, "message": "No Expo push tokens found"}

    messages = [{"to": t, "title": title, "body": body, "sound": "default"} for t in expo_tokens]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://exp.host/--/api/v2/push/send",
            json=messages,
            headers={"Content-Type": "application/json"}
        )
        data = resp.json()

    return {"sent": len(expo_tokens), "response": data}


@router.post("/register-token")
async def register_push_token(token: str = Query(...), device_id: str = Query(None), admin_token: str = Query(None)):
    """Register an Expo push token."""
    admin_id = None
    if admin_token:
        admin_id = await get_admin_id_from_token(admin_token)

    await db.push_tokens.update_one(
        {"token": token},
        {"$set": {"token": token, "device_id": device_id, "admin_id": admin_id, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    return {"status": "registered"}


@router.get("/due-today")
async def get_payments_due_today(admin_token: str = Query(...)):
    """Get payments due today for push notification."""
    admin_id = await get_admin_id_from_token(admin_token)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    clients = await db.clients.find({"admin_id": admin_id}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
    client_map = {c["id"]: c["name"] for c in clients}
    client_ids = list(client_map.keys())

    loans = await db.loans.find({
        "client_id": {"$in": client_ids},
        "status": "active"
    }, {"_id": 0}).to_list(5000)

    due_today = []
    for loan in loans:
        schedule = loan.get("payment_schedule", [])
        for p in schedule:
            due_date = p.get("due_date", "")
            if due_date.startswith(today) and p.get("status") != "paid":
                due_today.append({
                    "client_name": client_map.get(loan["client_id"], "Unknown"),
                    "client_id": loan["client_id"],
                    "loan_id": loan.get("id"),
                    "amount": p.get("amount", 0),
                    "due_date": due_date,
                })
    return {"due_today": due_today, "count": len(due_today)}


@router.post("/bulk-telegram")
async def send_bulk_telegram(admin_token: str = Query(...), message: str = Query(...), client_ids: str = Query(None), overdue_only: bool = Query(False)):
    """Send bulk Telegram messages to clients."""
    admin_id = await get_admin_id_from_token(admin_token)

    query = {"admin_id": admin_id}
    if client_ids:
        query["id"] = {"$in": client_ids.split(",")}

    clients = await db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "telegram_chat_id": 1}).to_list(1000)

    if overdue_only:
        overdue_ids = set()
        loans = await db.loans.find({"status": "active", "client_id": {"$in": [c["id"] for c in clients]}}, {"_id": 0, "client_id": 1, "days_overdue": 1}).to_list(5000)
        for l in loans:
            if l.get("days_overdue", 0) > 0:
                overdue_ids.add(l["client_id"])
        clients = [c for c in clients if c["id"] in overdue_ids]

    sent = 0
    failed = 0
    if TELEGRAM_BOT_TOKEN:
        async with httpx.AsyncClient() as http_client:
            for c in clients:
                chat_id = c.get("telegram_chat_id")
                if not chat_id:
                    continue
                personalized = message.replace("{name}", c.get("name", "Client"))
                try:
                    resp = await http_client.post(
                        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                        json={"chat_id": chat_id, "text": personalized, "parse_mode": "HTML"}
                    )
                    if resp.status_code == 200:
                        sent += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

    return {"sent": sent, "failed": failed, "total_targeted": len(clients)}
