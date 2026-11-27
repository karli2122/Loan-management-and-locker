"""Admin home dashboard, device health, and bulk plan assignment."""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db
from routes.reports import _get_enterprise_client_query
from utils.auth import enforce_client_scope
from utils.dashboard_home import classify_heartbeat, summarize_home, STALE_AFTER_SECONDS
from utils.dependencies import require_admin
from utils.lock_levels import (
    DEFAULT_RESTRICTED_ALLOWLIST,
    DEFAULT_RESTRICTED_BLOCKLIST,
    normalize_allowlist,
    normalize_lock_level,
)
from utils.timeutils import date_only, utc_now

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Dashboard"])


class BulkAssignPlanRequest(BaseModel):
    client_ids: List[str] = Field(default_factory=list)
    loan_plan_id: str


def _scope_admin_ids(query: dict) -> List[str]:
    admin_filter = query.get("admin_id")
    if isinstance(admin_filter, dict) and "$in" in admin_filter:
        return list(admin_filter["$in"])
    if isinstance(admin_filter, str):
        return [admin_filter]
    return []


@router.get("/dashboard/home")
async def dashboard_home(admin_id: str = Depends(require_admin)):
    """Tenant-scoped operations home: due today, overdue, locked, collected this month."""
    query = await _get_enterprise_client_query(admin_id)
    clients = await db.clients.find(query, {"_id": 0}).to_list(5000)
    client_ids = [c.get("id") for c in clients if c.get("id")]
    payments = []
    if client_ids:
        today = utc_now()
        month_start = datetime(today.year, today.month, 1)
        payments = await db.payments.find(
            {"client_id": {"$in": client_ids}, "payment_date": {"$gte": month_start}},
            {"_id": 0, "client_id": 1, "amount": 1, "payment_date": 1},
        ).to_list(20000)
    payload = summarize_home(clients, payments)
    payload["lock_defaults"] = {
        "allowlist": DEFAULT_RESTRICTED_ALLOWLIST,
        "blocklist": DEFAULT_RESTRICTED_BLOCKLIST,
    }
    return payload


@router.get("/clients/{client_id}/device-health")
async def device_health(client_id: str, admin_id: str = Depends(require_admin)):
    """Per-client device health for the admin console."""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)

    last_hb = client.get("last_heartbeat")
    status = classify_heartbeat(last_hb)
    return {
        "client_id": client_id,
        "name": client.get("name"),
        "heartbeat_status": status,
        "stale_after_seconds": STALE_AFTER_SECONDS,
        "last_check_in": date_only(last_hb) and (last_hb.isoformat() if hasattr(last_hb, "isoformat") else str(last_hb)),
        "battery_level": client.get("battery_level"),
        "storage_free_gb": client.get("storage_free_gb"),
        "storage_total_gb": client.get("storage_total_gb"),
        "location": {
            "latitude": client.get("latitude"),
            "longitude": client.get("longitude"),
            "updated_at": client.get("last_location_update").isoformat()
            if hasattr(client.get("last_location_update"), "isoformat")
            else client.get("last_location_update"),
        },
        "tamper": {
            "attempts": int(client.get("tamper_attempts") or 0),
            "last_attempt": client.get("last_tamper_attempt").isoformat()
            if hasattr(client.get("last_tamper_attempt"), "isoformat")
            else client.get("last_tamper_attempt"),
            "last_type": client.get("last_tamper_type"),
        },
        "last_reboot": client.get("last_reboot").isoformat()
        if hasattr(client.get("last_reboot"), "isoformat")
        else client.get("last_reboot"),
        "device_admin_active": bool(client.get("admin_mode_active")),
        "device_owner_active": bool(client.get("device_owner_active")),
        "lock_mode": client.get("lock_mode") or "device_admin",
        "lock_level": normalize_lock_level(
            client.get("lock_level"),
            "full" if client.get("is_locked") else "none",
        ),
        "app_version": client.get("app_version"),
        "android_version": client.get("android_version"),
        "device_model": client.get("device_model"),
        "is_registered": bool(client.get("is_registered")),
    }


@router.post("/clients/bulk-assign-plan")
async def bulk_assign_plan(body: BulkAssignPlanRequest, admin_id: str = Depends(require_admin)):
    """Assign a loan plan to many clients in the current tenant."""
    if not body.client_ids:
        raise HTTPException(status_code=400, detail="client_ids is required")
    if len(body.client_ids) > 1000:
        raise HTTPException(status_code=400, detail="Too many clients (max 1000)")

    query = await _get_enterprise_client_query(admin_id)
    scope_ids = _scope_admin_ids(query)
    plan = await db.loan_plans.find_one({"id": body.loan_plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    if scope_ids and plan.get("admin_id") and plan.get("admin_id") not in scope_ids:
        raise HTTPException(status_code=404, detail="Loan plan not found")

    updated, skipped, errors = 0, 0, []
    for cid in body.client_ids:
        client = await db.clients.find_one({"id": cid}, {"_id": 0, "id": 1, "admin_id": 1, "name": 1, "is_deleted": 1})
        if not client or client.get("is_deleted"):
            skipped += 1
            errors.append({"client_id": cid, "error": "Client not found"})
            continue
        try:
            await enforce_client_scope(client, admin_id)
        except Exception:
            skipped += 1
            errors.append({"client_id": cid, "error": "Out of scope"})
            continue
        await db.clients.update_one(
            {"id": cid},
            {"$set": {"loan_plan_id": body.loan_plan_id, "updated_at": utc_now()}},
        )
        updated += 1
    return {
        "message": "Plan assignment complete",
        "loan_plan_id": body.loan_plan_id,
        "plan_name": plan.get("name"),
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
    }


@router.get("/lock-levels")
async def list_lock_levels(admin_id: str = Depends(require_admin)):
    """Document lock levels and the default restricted-mode allowlist."""
    _ = admin_id
    return {
        "levels": ["none", "warning", "restricted", "full"],
        "default_allowlist": normalize_allowlist([]),
        "default_blocklist": DEFAULT_RESTRICTED_BLOCKLIST,
    }
