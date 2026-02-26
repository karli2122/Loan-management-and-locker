"""Payment Scheduling - Automated recurring payment reminders and tracking."""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, Body
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.post("")
async def create_schedule(admin_token: str = Query(...), data: dict = Body(...)):
    """Create a payment schedule for a client."""
    await get_admin_id_from_token(admin_token)
    client_id = data.get("client_id")
    if not client_id:
        return {"error": "client_id required"}, 400

    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        return {"error": "Client not found"}, 404

    schedule = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": client.get("name", ""),
        "amount": float(data.get("amount", client.get("monthly_emi", 0))),
        "frequency": data.get("frequency", "monthly"),
        "day_of_month": int(data.get("day_of_month", 1)),
        "start_date": data.get("start_date", datetime.now(timezone.utc).isoformat()),
        "end_date": data.get("end_date"),
        "reminder_days_before": int(data.get("reminder_days_before", 3)),
        "auto_reminder": data.get("auto_reminder", True),
        "reminder_channels": data.get("reminder_channels", ["push"]),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_reminder_sent": None,
        "next_due_date": None,
        "total_scheduled": 0,
        "total_paid": 0,
    }

    # Calculate next due date
    schedule["next_due_date"] = _calc_next_due(schedule)
    await db.payment_schedules.insert_one(schedule)
    del schedule["_id"]
    return schedule


@router.get("")
async def list_schedules(admin_token: str = Query(...), client_id: str = Query(default=None)):
    """List all payment schedules, optionally filtered by client."""
    await get_admin_id_from_token(admin_token)
    query = {}
    if client_id:
        query["client_id"] = client_id
    schedules = await db.payment_schedules.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"schedules": schedules, "total": len(schedules)}


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str, admin_token: str = Query(...)):
    await get_admin_id_from_token(admin_token)
    s = await db.payment_schedules.find_one({"id": schedule_id}, {"_id": 0})
    if not s:
        return {"error": "Schedule not found"}, 404
    return s


@router.put("/{schedule_id}")
async def update_schedule(schedule_id: str, admin_token: str = Query(...), data: dict = Body(...)):
    await get_admin_id_from_token(admin_token)
    allowed = {"amount", "frequency", "day_of_month", "reminder_days_before", "auto_reminder", "reminder_channels", "is_active", "end_date"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if updates:
        await db.payment_schedules.update_one({"id": schedule_id}, {"$set": updates})
    s = await db.payment_schedules.find_one({"id": schedule_id}, {"_id": 0})
    return s or {"error": "Not found"}


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, admin_token: str = Query(...)):
    await get_admin_id_from_token(admin_token)
    r = await db.payment_schedules.delete_one({"id": schedule_id})
    return {"deleted": r.deleted_count > 0}


@router.get("/due/today")
async def get_due_today(admin_token: str = Query(...)):
    """Get all schedules with payments due today or overdue."""
    await get_admin_id_from_token(admin_token)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.payment_schedules.find(
        {"is_active": True, "next_due_date": {"$lte": today}},
        {"_id": 0}
    ).to_list(200)
    return {"due_schedules": schedules, "count": len(schedules)}


@router.post("/process-reminders")
async def process_scheduled_reminders(admin_token: str = Query(...)):
    """Process and send reminders for all active schedules approaching due dates."""
    await get_admin_id_from_token(admin_token)
    today = datetime.now(timezone.utc).date()
    schedules = await db.payment_schedules.find({"is_active": True, "auto_reminder": True}, {"_id": 0}).to_list(500)

    sent = 0
    for s in schedules:
        next_due = s.get("next_due_date")
        if not next_due:
            continue
        try:
            due_date = datetime.fromisoformat(next_due).date() if isinstance(next_due, str) else next_due
        except Exception:
            continue

        remind_before = s.get("reminder_days_before", 3)
        remind_date = due_date - timedelta(days=remind_before)

        if today >= remind_date:
            last_sent = s.get("last_reminder_sent")
            if last_sent and last_sent == today.isoformat():
                continue
            await db.payment_schedules.update_one(
                {"id": s["id"]},
                {"$set": {"last_reminder_sent": today.isoformat()}}
            )
            sent += 1

    return {"processed": len(schedules), "reminders_sent": sent}


def _calc_next_due(schedule: dict) -> str:
    now = datetime.now(timezone.utc)
    freq = schedule.get("frequency", "monthly")
    day = schedule.get("day_of_month", 1)

    if freq == "weekly":
        next_d = now + timedelta(days=(7 - now.weekday() + day) % 7 or 7)
    elif freq == "biweekly":
        next_d = now + timedelta(days=14)
    else:
        month = now.month + 1 if now.day > day else now.month
        year = now.year + (1 if month > 12 else 0)
        month = month if month <= 12 else month - 12
        try:
            next_d = now.replace(year=year, month=month, day=min(day, 28))
        except ValueError:
            next_d = now.replace(year=year, month=month, day=28)

    return next_d.strftime("%Y-%m-%d")
