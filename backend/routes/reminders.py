"""Reminders routes - payment reminders, push notifications, email, telegram."""
import os
import asyncio
from fastapi import APIRouter, Query, HTTPException, Body
from datetime import datetime, timedelta
from typing import Optional
import logging
import httpx
import resend

from database import db
from models.schemas import Reminder
from utils.auth import get_admin_id_from_token
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reminders"])

# Resend setup
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

# Telegram setup
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")


async def send_expo_push_notification(push_token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification via Expo."""
    if not push_token:
        return False
    
    action = (data or {}).get("action", "")
    payload = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {},
        "priority": "high",
        "channelId": "warnings" if action in ("lock", "unlock", "warning") else "default",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as http_client:
            response = await http_client.post("https://exp.host/--/api/v2/push/send", json=payload)
            if response.status_code >= httpx.codes.BAD_REQUEST:
                logger.warning(f"Expo push send failed ({response.status_code}): {response.text}")
                return False
            # Log the ticket response for debugging delivery issues
            try:
                resp_data = response.json()
                ticket = resp_data.get("data", {})
                if ticket.get("status") == "error":
                    logger.warning(f"Expo push ticket error: {ticket.get('message')} [{ticket.get('details', {}).get('error', '')}]")
                    return False
                logger.info(f"Expo push sent: status={ticket.get('status')}, id={ticket.get('id', 'n/a')}")
            except Exception:
                pass
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
        
        # Convert next_due to datetime if it's a string
        if isinstance(next_due, str):
            try:
                next_due = datetime.fromisoformat(next_due.replace("Z", "+00:00"))
            except ValueError:
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
        amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
        
        if days_overdue > 0:
            title = "Payment Overdue"
            body = f"Your payment of €{amount:.2f} is {days_overdue} days overdue. Please pay to avoid service interruption."
        elif next_due:
            days_until = (next_due - datetime.utcnow()).days
            if days_until <= 0:
                title = "Payment Due Today"
                body = f"Your payment of €{amount:.2f} is due today."
            else:
                title = "Payment Reminder"
                body = f"Your payment of €{amount:.2f} is due in {days_until} days."
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
    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
    
    if days_overdue > 0:
        title = "Payment Overdue"
        body = f"Your payment of €{amount:.2f} is {days_overdue} days overdue."
    else:
        title = "Payment Reminder"
        body = f"Your payment of €{amount:.2f} is due soon."
    
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


async def send_email_reminder(to_email: str, subject: str, html_content: str) -> bool:
    """Send email reminder via Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return False
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False


async def send_telegram_message(chat_id: str, message: str) -> bool:
    """Send Telegram message via Bot API."""
    if not TELEGRAM_TOKEN:
        logger.warning("TELEGRAM_TOKEN not configured, skipping Telegram")
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
            })
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"Telegram send failed: {e}")
        return False


# WhatsApp Cloud API setup
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID = os.environ.get("WHATSAPP_PHONE_ID")


async def send_whatsapp_message(phone: str, message: str) -> bool:
    """Send WhatsApp message via Cloud API."""
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        logger.warning("WHATSAPP_TOKEN/WHATSAPP_PHONE_ID not configured")
        return False
    try:
        url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_ID}/messages"
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, headers={
                "Authorization": f"Bearer {WHATSAPP_TOKEN}",
                "Content-Type": "application/json",
            }, json={
                "messaging_product": "whatsapp",
                "to": phone,
                "type": "text",
                "text": {"body": message},
            })
            return resp.status_code == 200
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return False


def build_whatsapp_reminder_text(client_name: str, amount: float, due_date: str, days_overdue: int = 0) -> str:
    """Build plain text message for WhatsApp reminder."""
    if days_overdue > 0:
        return f"*Payment Overdue*\n\nDear {client_name}, your payment of *€{amount:.2f}* is {days_overdue} days overdue.\n\nPlease pay promptly to avoid service interruption.\n\n— PayLock Pro"
    return f"*Payment Reminder*\n\nDear {client_name}, your payment of *€{amount:.2f}* is due on {due_date}.\n\nPlease ensure timely payment.\n\n— PayLock Pro"


def build_reminder_email(client_name: str, amount: float, due_date: str, days_overdue: int = 0) -> str:
    """Build HTML email for payment reminder."""
    if days_overdue > 0:
        subject_line = f"Payment Overdue - {days_overdue} days"
        status_color = "#EF4444"
        status_text = f"Your payment is <strong>{days_overdue} days overdue</strong>."
    else:
        subject_line = "Payment Reminder"
        status_color = "#F59E0B"
        status_text = f"Your payment is due on <strong>{due_date}</strong>."

    return f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1E3A5F, #2563EB); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">PayLock Pro</h1>
      </div>
      <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0;">
        <p style="font-size: 16px; color: #334155;">Dear {client_name},</p>
        <div style="background: white; border-left: 4px solid {status_color}; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; color: #334155;">{status_text}</p>
          <p style="margin: 8px 0 0; font-size: 24px; font-weight: bold; color: #1E3A5F;">Amount: €{amount:.2f}</p>
        </div>
        <p style="color: #64748b; font-size: 14px;">Please make your payment promptly to avoid service interruption.</p>
      </div>
      <div style="background: #1E3A5F; padding: 16px; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">PayLock Pro - Loan Management</p>
      </div>
    </div>
    """


@router.post("/reminders/send-email/{client_id}")
async def send_email_to_client(
    client_id: str,
    admin_token: str = Query(...),
    custom_message: str = Body(default=""),
):
    """Send email reminder to a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if client.get("admin_id") != admin_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    email = client.get("email")
    if not email:
        return {"success": False, "message": "Client has no email address"}

    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
    due_date = ""
    npd = client.get("next_payment_due")
    if isinstance(npd, datetime):
        due_date = npd.strftime("%d.%m.%Y")
    elif npd:
        due_date = str(npd)

    days_overdue = client.get("days_overdue", 0)
    html = build_reminder_email(client.get("name", "Client"), amount, due_date, days_overdue)
    subject = f"Payment {'Overdue' if days_overdue > 0 else 'Reminder'} - PayLock Pro"

    success = await send_email_reminder(email, subject, html)

    if success:
        reminder = Reminder(
            client_id=client_id,
            reminder_type="email",
            scheduled_date=datetime.utcnow(),
            sent=True,
            sent_at=datetime.utcnow(),
            message=f"Email sent to {email}",
            admin_id=admin_id,
        )
        await db.reminders.insert_one(reminder.dict())

    return {"success": success, "message": f"Email {'sent to ' + email if success else 'failed'}"}


@router.post("/reminders/send-telegram/{client_id}")
async def send_telegram_to_client(
    client_id: str,
    admin_token: str = Query(...),
):
    """Send Telegram reminder to a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if client.get("admin_id") != admin_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    telegram_id = client.get("telegram_chat_id")
    if not telegram_id:
        return {"success": False, "message": "Client has no Telegram chat ID"}

    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
    days_overdue = client.get("days_overdue", 0)
    name = client.get("name", "Client")

    if days_overdue > 0:
        msg = f"<b>Payment Overdue</b>\n\nDear {name}, your payment of <b>€{amount:.2f}</b> is {days_overdue} days overdue.\n\nPlease pay promptly to avoid service interruption.\n\n— PayLock Pro"
    else:
        msg = f"<b>Payment Reminder</b>\n\nDear {name}, your payment of <b>€{amount:.2f}</b> is due soon.\n\nPlease ensure timely payment.\n\n— PayLock Pro"

    success = await send_telegram_message(telegram_id, msg)

    if success:
        reminder = Reminder(
            client_id=client_id,
            reminder_type="telegram",
            scheduled_date=datetime.utcnow(),
            sent=True,
            sent_at=datetime.utcnow(),
            message=f"Telegram sent to {telegram_id}",
            admin_id=admin_id,
        )
        await db.reminders.insert_one(reminder.dict())

    return {"success": success, "message": "Telegram message sent" if success else "Failed"}


@router.post("/reminders/send-bulk-email")
async def send_bulk_email_reminders(admin_token: str = Query(...)):
    """Send email reminders to all clients with email and pending payments."""
    admin_id = await get_admin_id_from_token(admin_token)

    clients = await db.clients.find({
        "admin_id": admin_id,
        "outstanding_balance": {"$gt": 0},
        "email": {"$exists": True, "$ne": None, "$ne": ""},
        "is_deleted": {"$ne": True},
    }, {"_id": 0}).to_list(1000)

    sent = 0
    failed = 0
    for client in clients:
        amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
        due_date = ""
        npd = client.get("next_payment_due")
        if isinstance(npd, datetime):
            due_date = npd.strftime("%d.%m.%Y")
        days_overdue = client.get("days_overdue", 0)
        html = build_reminder_email(client.get("name", "Client"), amount, due_date, days_overdue)
        subject = f"Payment {'Overdue' if days_overdue > 0 else 'Reminder'} - PayLock Pro"

        ok = await send_email_reminder(client["email"], subject, html)
        if ok:
            sent += 1
        else:
            failed += 1

    return {"sent": sent, "failed": failed, "total": len(clients)}


@router.post("/reminders/send-bulk-telegram")
async def send_bulk_telegram_reminders(admin_token: str = Query(...)):
    """Send Telegram reminders to all clients with Telegram IDs and pending payments."""
    admin_id = await get_admin_id_from_token(admin_token)

    clients = await db.clients.find({
        "admin_id": admin_id,
        "outstanding_balance": {"$gt": 0},
        "telegram_chat_id": {"$exists": True, "$ne": None, "$ne": ""},
        "is_deleted": {"$ne": True},
    }, {"_id": 0}).to_list(1000)

    sent = 0
    failed = 0
    for client in clients:
        amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
        days_overdue = client.get("days_overdue", 0)
        name = client.get("name", "Client")
        msg = f"<b>Payment {'Overdue' if days_overdue > 0 else 'Reminder'}</b>\n\nDear {name}, your payment of <b>€{amount:.2f}</b> is {'%d days overdue' % days_overdue if days_overdue > 0 else 'due soon'}.\n\n— PayLock Pro"
        ok = await send_telegram_message(client["telegram_chat_id"], msg)
        if ok:
            sent += 1
        else:
            failed += 1

    return {"sent": sent, "failed": failed, "total": len(clients)}


@router.get("/reminders/config")
async def get_reminder_config(admin_token: str = Query(...)):
    """Get reminder configuration status."""
    await get_admin_id_from_token(admin_token)
    return {
        "email_configured": bool(RESEND_API_KEY),
        "telegram_configured": bool(TELEGRAM_TOKEN),
        "whatsapp_configured": bool(WHATSAPP_TOKEN and WHATSAPP_PHONE_ID),
        "push_configured": True,
        "sender_email": SENDER_EMAIL if RESEND_API_KEY else None,
    }


@router.post("/reminders/send-whatsapp/{client_id}")
async def send_whatsapp_to_client(
    client_id: str,
    admin_token: str = Query(...),
):
    """Send WhatsApp reminder to a specific client. Falls back to deep link URL."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if client.get("admin_id") != admin_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    phone = client.get("phone") or client.get("phone_number", "")
    if not phone:
        return {"success": False, "message": "Client has no phone number"}

    # Clean phone number
    clean_phone = phone.replace(" ", "").replace("-", "").replace("+", "")

    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
    due_date = ""
    npd = client.get("next_payment_due")
    if isinstance(npd, datetime):
        due_date = npd.strftime("%d.%m.%Y")
    elif npd:
        due_date = str(npd)

    days_overdue = client.get("days_overdue", 0)
    message = build_whatsapp_reminder_text(client.get("name", "Client"), amount, due_date, days_overdue)

    # Try Cloud API first
    if WHATSAPP_TOKEN and WHATSAPP_PHONE_ID:
        success = await send_whatsapp_message(clean_phone, message)
        if success:
            reminder = Reminder(
                client_id=client_id,
                reminder_type="whatsapp",
                scheduled_date=datetime.utcnow(),
                sent=True,
                sent_at=datetime.utcnow(),
                message=f"WhatsApp sent to {phone}",
                admin_id=admin_id,
            )
            await db.reminders.insert_one(reminder.dict())
            return {"success": True, "message": f"WhatsApp sent to {phone}"}

    # Return deep link for manual send
    import urllib.parse
    encoded_msg = urllib.parse.quote(message)
    deep_link = f"https://wa.me/{clean_phone}?text={encoded_msg}"

    return {
        "success": False,
        "use_deep_link": True,
        "deep_link": deep_link,
        "phone": clean_phone,
        "message": message,
    }


@router.get("/reminders/whatsapp-link/{client_id}")
async def get_whatsapp_link(
    client_id: str,
    admin_token: str = Query(...),
):
    """Generate a WhatsApp deep link for a client reminder."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if client.get("admin_id") != admin_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    phone = client.get("phone") or client.get("phone_number", "")
    if not phone:
        return {"deep_link": None, "message": "Client has no phone number"}

    clean_phone = phone.replace(" ", "").replace("-", "").replace("+", "")

    amount = client.get("outstanding_balance", 0) or client.get("monthly_emi", 0) or client.get("loan_amount", 0)
    due_date = ""
    npd = client.get("next_payment_due")
    if isinstance(npd, datetime):
        due_date = npd.strftime("%d.%m.%Y")
    elif npd:
        due_date = str(npd)

    days_overdue = client.get("days_overdue", 0)
    message = build_whatsapp_reminder_text(client.get("name", "Client"), amount, due_date, days_overdue)

    import urllib.parse
    encoded_msg = urllib.parse.quote(message)
    deep_link = f"https://wa.me/{clean_phone}?text={encoded_msg}"

    return {"deep_link": deep_link, "phone": clean_phone, "message": message}
