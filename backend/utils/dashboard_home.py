"""Pure helpers for the admin home-dashboard aggregate."""
from datetime import date, datetime
from typing import Iterable, Optional

from utils.timeutils import as_utc, date_only, utc_now
from utils.calculations import money
from utils.lock_levels import normalize_lock_level, is_effectively_locked

STALE_AFTER_SECONDS = 15 * 60  # heartbeat is every 5 minutes


def _as_date(value) -> Optional[date]:
    parsed = as_utc(value)
    return parsed.date() if parsed else None


def classify_heartbeat(last_heartbeat, now=None) -> str:
    """online / stale / offline based on last check-in."""
    now = now or utc_now()
    hb = as_utc(last_heartbeat)
    if not hb:
        return "offline"
    age = (now - hb).total_seconds()
    if age <= STALE_AFTER_SECONDS:
        return "online"
    if age <= STALE_AFTER_SECONDS * 8:  # ~2 hours
        return "stale"
    return "offline"


def summarize_home(
    clients: Iterable[dict],
    payments: Iterable[dict],
    today: Optional[date] = None,
    now=None,
) -> dict:
    """Build the home dashboard payload from already-scoped documents."""
    today = today or utc_now().date()
    now = now or utc_now()
    due_today = []
    overdue = []
    locked = []
    collected = 0.0

    month_start = date(today.year, today.month, 1)
    for pay in payments or []:
        pay_date = _as_date(pay.get("payment_date"))
        if pay_date and pay_date >= month_start and pay_date <= today:
            collected += money(pay.get("amount") or 0)

    for client in clients or []:
        if client.get("is_deleted"):
            continue
        cid = client.get("id")
        name = client.get("name") or ""
        due = _as_date(client.get("next_payment_due") or client.get("loan_due_date"))
        outstanding = money(client.get("outstanding_balance") or 0)
        level = normalize_lock_level(client.get("lock_level"), "full" if client.get("is_locked") else "none")
        row = {
            "id": cid,
            "name": name,
            "phone": client.get("phone"),
            "outstanding_balance": outstanding,
            "next_payment_due": date_only(due) if due else None,
            "days_overdue": int(client.get("days_overdue") or 0),
            "is_locked": bool(client.get("is_locked")) or is_effectively_locked(level),
            "lock_level": level,
            "heartbeat_status": classify_heartbeat(client.get("last_heartbeat"), now),
        }
        if outstanding > 0 and due == today:
            due_today.append(row)
        if outstanding > 0 and (row["days_overdue"] > 0 or (due and due < today)):
            overdue.append(row)
        if row["is_locked"]:
            locked.append(row)

    return {
        "today": date_only(today),
        "due_today": due_today,
        "overdue": overdue,
        "locked_devices": locked,
        "collected_this_month": money(collected),
        "counts": {
            "due_today": len(due_today),
            "overdue": len(overdue),
            "locked_devices": len(locked),
        },
    }
