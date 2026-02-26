"""Telegram Bot - Send payment reminders via Telegram."""
import os
import logging
import aiohttp
from fastapi import APIRouter, Query, Body
from starlette.responses import JSONResponse
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/telegram", tags=["telegram"])
logger = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


async def send_telegram_message(chat_id: str, text: str) -> dict:
    """Send a message via Telegram Bot API."""
    if not BOT_TOKEN:
        return {"ok": False, "error": "Telegram bot token not configured"}
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{API_BASE}/sendMessage", json={
            "chat_id": chat_id, "text": text, "parse_mode": "HTML"
        }) as resp:
            return await resp.json()


@router.get("/bot-info")
async def get_bot_info(admin_token: str = Query(...)):
    """Get bot information to verify configuration."""
    await get_admin_id_from_token(admin_token)
    if not BOT_TOKEN:
        return {"configured": False, "error": "Bot token not set"}
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_BASE}/getMe") as resp:
            data = await resp.json()
            if data.get("ok"):
                bot = data["result"]
                return {"configured": True, "bot_name": bot.get("first_name"), "bot_username": bot.get("username")}
            return {"configured": False, "error": data.get("description")}


@router.post("/link-client")
async def link_telegram_to_client(admin_token: str = Query(...), data: dict = Body(...)):
    """Link a Telegram chat ID to a client for sending reminders."""
    await get_admin_id_from_token(admin_token)
    client_id = data.get("client_id")
    chat_id = data.get("chat_id", "").strip()
    if not client_id or not chat_id:
        return JSONResponse(status_code=400, content={"error": "client_id and chat_id required"})

    r = await db.clients.update_one(
        {"id": client_id},
        {"$set": {"telegram_chat_id": chat_id}}
    )
    if r.matched_count == 0:
        return JSONResponse(status_code=404, content={"error": "Client not found"})
    return {"success": True, "client_id": client_id, "chat_id": chat_id}


@router.post("/send/{client_id}")
async def send_telegram_reminder(client_id: str, admin_token: str = Query(...)):
    """Send a payment reminder to a client via Telegram."""
    await get_admin_id_from_token(admin_token)
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        return JSONResponse(status_code=404, content={"error": "Client not found"})

    chat_id = client.get("telegram_chat_id")
    if not chat_id:
        return JSONResponse(status_code=400, content={"error": "Client has no linked Telegram chat ID"})

    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0)
    name = client.get("name", "Client")
    due = client.get("next_payment_due", "N/A")
    days_overdue = client.get("days_overdue", 0)

    if days_overdue > 0:
        text = (f"<b>Payment Overdue</b>\n\n"
                f"Dear {name},\n"
                f"Your payment of <b>\u20ac{amount:.2f}</b> is <b>{days_overdue} days overdue</b>.\n"
                f"Please make the payment immediately to avoid service interruption.\n\n"
                f"- PayLock Pro")
    else:
        text = (f"<b>Payment Reminder</b>\n\n"
                f"Dear {name},\n"
                f"Your payment of <b>\u20ac{amount:.2f}</b> is due on <b>{due}</b>.\n"
                f"Please ensure timely payment.\n\n"
                f"- PayLock Pro")

    result = await send_telegram_message(chat_id, text)
    if result.get("ok"):
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"last_telegram_reminder": {"sent_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(), "amount": amount}}}
        )
        return {"success": True, "message": "Telegram reminder sent"}
    return JSONResponse(status_code=500, content={"error": result.get("description", "Failed to send")})


@router.post("/send-bulk")
async def send_bulk_telegram_reminders(admin_token: str = Query(...)):
    """Send reminders to all clients with linked Telegram and outstanding balance."""
    await get_admin_id_from_token(admin_token)
    clients = await db.clients.find(
        {"telegram_chat_id": {"$exists": True, "$ne": ""}, "outstanding_balance": {"$gt": 0}},
        {"_id": 0}
    ).to_list(500)

    sent, failed = 0, 0
    for c in clients:
        chat_id = c.get("telegram_chat_id")
        amount = c.get("outstanding_balance", 0)
        name = c.get("name", "Client")
        due = c.get("next_payment_due", "N/A")
        text = f"<b>Payment Reminder</b>\nDear {name}, your payment of \u20ac{amount:.2f} is due {due}.\n- PayLock Pro"
        result = await send_telegram_message(chat_id, text)
        if result.get("ok"):
            sent += 1
        else:
            failed += 1

    return {"sent": sent, "failed": failed, "total_eligible": len(clients)}
