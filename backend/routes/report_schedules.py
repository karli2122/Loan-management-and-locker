"""Report scheduling routes - configure automated email reports."""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Body
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/report-schedules", tags=["report-schedules"])


@router.post("")
async def create_report_schedule(admin_token: str = Query(...), data: dict = Body(...)):
    """Create a scheduled report email."""
    admin_id = await get_admin_id_from_token(admin_token)
    schedule = {
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "email": data.get("email", ""),
        "report_type": data.get("report_type", "financial"),
        "frequency": data.get("frequency", "weekly"),
        "send_day": int(data.get("send_day", 1)),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_sent": None,
    }
    await db.report_schedules.insert_one(schedule)
    del schedule["_id"]
    return schedule


@router.get("")
async def list_report_schedules(admin_token: str = Query(...)):
    admin_id = await get_admin_id_from_token(admin_token)
    schedules = await db.report_schedules.find({"admin_id": admin_id}, {"_id": 0}).to_list(50)
    return {"schedules": schedules}


@router.put("/{schedule_id}")
async def update_report_schedule(schedule_id: str, admin_token: str = Query(...), data: dict = Body(...)):
    await get_admin_id_from_token(admin_token)
    allowed = {"email", "report_type", "frequency", "send_day", "is_active"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if updates:
        await db.report_schedules.update_one({"id": schedule_id}, {"$set": updates})
    s = await db.report_schedules.find_one({"id": schedule_id}, {"_id": 0})
    return s or {"error": "Not found"}


@router.delete("/{schedule_id}")
async def delete_report_schedule(schedule_id: str, admin_token: str = Query(...)):
    await get_admin_id_from_token(admin_token)
    r = await db.report_schedules.delete_one({"id": schedule_id})
    return {"deleted": r.deleted_count > 0}


@router.post("/send-now")
async def send_report_now(admin_token: str = Query(...), data: dict = Body(...)):
    """Send a one-time report email immediately."""
    import asyncio
    import os
    import resend

    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    if not resend.api_key:
        return {"success": False, "error": "Email service not configured"}

    admin_id = await get_admin_id_from_token(admin_token)
    email = data.get("email", "")
    report_type = data.get("report_type", "financial")

    if not email:
        return {"success": False, "error": "Email address required"}

    from routes.exports import _get_clients_data
    from tasks import _build_report_html

    clients = await _get_clients_data(admin_id)
    now = datetime.now(timezone.utc)
    html = _build_report_html(report_type, clients, now)

    try:
        result = await asyncio.to_thread(resend.Emails.send, {
            "from": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev"),
            "to": [email],
            "subject": f"PayLock Pro - {report_type.title()} Report ({now.strftime('%Y-%m-%d')})",
            "html": html,
        })
        return {"success": True, "message": f"Report sent to {email}"}
    except Exception as e:
        return {"success": False, "error": str(e)}
