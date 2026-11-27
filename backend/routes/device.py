"""Device routes - registration, status, location updates."""
from fastapi import APIRouter, Query, HTTPException, Depends
from datetime import datetime, timedelta
import logging

from database import db
from models.schemas import (
    ClientStatusResponse,
    DeviceRegistration, LocationUpdate, PushTokenUpdate, DeviceInfoUpdate
)
from utils.exceptions import ValidationException
from utils.auth import verify_device, enforce_client_scope, sign_lock_state
from utils.dependencies import require_admin
from utils.calculations import amount_due_from_loan, money
from utils.timeutils import date_only, utc_now
from utils.registration_codes import lock_mode_from_registration_code

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Device"])


@router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    """Register a device with a registration code.

    8-char code = Device Admin mode, 9-char code = Device Owner mode.
    Existing 16/17-character codes are still accepted.
    """
    import uuid
    client = await db.clients.find_one({"registration_code": registration.registration_code})
    if not client:
        raise ValidationException("Invalid registration code")
    
    if client.get("is_registered"):
        raise ValidationException("This device is already registered")
    
    code = registration.registration_code.strip()
    lock_mode = lock_mode_from_registration_code(code, client.get("lock_mode"))
    
    # Generate a device_token for client-side auth (messaging, etc.)
    device_token = str(uuid.uuid4())
    
    # Build update with device info
    update_data = {
        "device_id": registration.device_id,
        "device_model": registration.device_model,
        "device_token": device_token,
        "is_registered": True,
        "registered_at": datetime.utcnow(),
        "last_heartbeat": datetime.utcnow(),
        "uninstall_allowed": False,
        "admin_mode_active": False,
        "tamper_attempts": 0,
        "lock_mode": lock_mode,
    }
    
    # Add optional device info if provided
    if registration.android_version:
        update_data["android_version"] = registration.android_version
    if registration.battery_level is not None:
        update_data["battery_level"] = registration.battery_level
    if registration.storage_free_gb is not None:
        update_data["storage_free_gb"] = registration.storage_free_gb
    if registration.storage_total_gb is not None:
        update_data["storage_total_gb"] = registration.storage_total_gb
    if registration.imei:
        update_data["imei"] = registration.imei
    if registration.serial:
        update_data["serial"] = registration.serial
    
    await db.clients.update_one(
        {"id": client["id"]},
        {"$set": update_data}
    )
    
    updated_client = await db.clients.find_one({"id": client["id"]}, {"_id": 0})
    return updated_client


@router.get("/device/status/{client_id}", response_model=ClientStatusResponse)
async def get_device_status(client_id: str, device_token: str = Query(default="")):
    """Get device status for a client.

    Requires the per-device token issued at registration. This endpoint drives
    the lock/unlock decision on the device, so it must not be callable (or
    spoofable) by anyone who merely knows the client_id.
    """
    client = await verify_device(client_id, device_token)
    
    # Update heartbeat
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"last_heartbeat": datetime.utcnow()}}
    )
    
    # Check loans collection for active loan (single source of truth)
    active_loan = await db.loans.find_one(
        {"client_id": client_id, "status": "active"},
        {"_id": 0, "loan_amount": 1, "interest_rate": 1, "total_amount_due": 1,
         "outstanding_balance": 1, "total_paid": 1, "due_date": 1, "monthly_emi": 1}
    )
    
    late_fees = float(client.get("late_fees_accumulated") or 0)
    if active_loan:
        amount_due = amount_due_from_loan(active_loan)
        outstanding_balance = money(active_loan.get("outstanding_balance") if active_loan.get("outstanding_balance") is not None else amount_due)
        monthly_emi = money(
            active_loan.get("installment_amount")
            or active_loan.get("monthly_emi")
            or active_loan.get("next_payment_amount")
            or 0
        )
        late_fees = money(active_loan.get("late_fees_accumulated") or late_fees)
        due_date_str = date_only(active_loan.get("due_date") or active_loan.get("next_payment_date"))
    else:
        # Fall back to the client ledger when no loan row exists.
        amount_due = amount_due_from_loan(client)
        due_date_str = date_only(client.get("next_payment_due") or client.get("loan_due_date"))
        monthly_emi = money(client.get("installment_amount") or client.get("monthly_emi") or 0)
        outstanding_balance = money(client.get("outstanding_balance") if client.get("outstanding_balance") is not None else amount_due)
    
    # Get admin's plan and name for client-side feature gating
    admin_plan = None
    admin_firstname = None
    admin_phone = None
    admin_email = None
    payment_instructions = client.get("payment_instructions") or ""
    admin_id = client.get("admin_id")
    if admin_id:
        admin = await db.admins.find_one(
            {"id": admin_id},
            {"_id": 0, "plan": 1, "first_name": 1, "phone": 1, "email": 1, "payment_instructions": 1},
        )
        if admin:
            admin_plan = admin.get("plan")
            admin_firstname = admin.get("first_name")
            admin_phone = admin.get("phone")
            admin_email = admin.get("email")
            payment_instructions = payment_instructions or admin.get("payment_instructions") or ""
    
    from utils.lock_levels import normalize_allowlist, normalize_lock_level, is_effectively_locked
    lock_level_val = normalize_lock_level(
        client.get("lock_level"),
        "full" if client.get("is_locked") else "none",
    )
    is_locked_val = bool(client.get("is_locked")) or is_effectively_locked(lock_level_val)
    if lock_level_val == "warning":
        is_locked_val = False
    issued_at = int(utc_now().timestamp())
    lock_sig = sign_lock_state(client_id, is_locked_val, device_token, issued_at, lock_level=lock_level_val)
    lock_allowlist_val = normalize_allowlist(client.get("lock_allowlist"))
    warning_message = client.get("warning_message", "") or (
        client.get("lock_message", "") if lock_level_val == "warning" else ""
    )

    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=is_locked_val,
        lock_message=client.get("lock_message", ""),
        warning_message=warning_message,
        loan_amount=round(amount_due, 2),
        loan_due_date=due_date_str,
        outstanding_balance=round(outstanding_balance, 2),
        monthly_emi=round(monthly_emi, 2),
        uninstall_allowed=client.get("uninstall_allowed", False),
        is_deleted=client.get("is_deleted", False),
        lock_mode=client.get("lock_mode", "device_admin"),
        admin_plan=admin_plan,
        admin_firstname=admin_firstname,
        admin_phone=admin_phone,
        admin_email=admin_email,
        payment_instructions=payment_instructions or None,
        late_fees_accumulated=round(late_fees, 2),
        lock_signature=lock_sig,
        lock_issued_at=issued_at,
        lock_level=lock_level_val,
        lock_allowlist=lock_allowlist_val,
    )


@router.post("/device/location")
async def update_location(location: LocationUpdate):
    """Update device location and store in location history."""
    # Authenticate the device — a bare client_id is not enough to read/write
    # a borrower's location.
    await verify_device(location.client_id, location.device_token)

    now = datetime.utcnow()
    
    # Update current location on client
    await db.clients.update_one(
        {"id": location.client_id},
        {"$set": {
            "latitude": location.latitude,
            "longitude": location.longitude,
            "last_location_update": now,
            "last_heartbeat": now
        }}
    )
    
    # Store in location history collection for tracking over time
    await db.location_history.insert_one({
        "client_id": location.client_id,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "timestamp": now.isoformat(),
        "source": location.source,
    })
    
    return {"message": "Location updated", "client_id": location.client_id}


@router.get("/device/location-history/{client_id}")
async def get_location_history(
    client_id: str,
    admin_id: str = Depends(require_admin),
    limit: int = Query(default=100, le=500),
    days: int = Query(default=7, le=30),
):
    """Get location history for a client over the last N days."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Location history is sensitive — restrict to the owning admin.
    await enforce_client_scope(client, admin_id)
    
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    
    history = await db.location_history.find(
        {"client_id": client_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "client_id": client_id,
        "locations": history,
        "count": len(history),
    }


@router.post("/device/push-token")
async def update_push_token(data: PushTokenUpdate):
    """Update Expo push notification token for a device."""
    await verify_device(data.client_id, data.device_token)

    await db.clients.update_one(
        {"id": data.client_id},
        {"$set": {
            "expo_push_token": data.push_token,
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Push token updated", "client_id": data.client_id}


@router.post("/device/clear-warning/{client_id}")
async def clear_warning(client_id: str, device_token: str = Query(default="")):
    """Clear warning message after client acknowledgment."""
    await verify_device(client_id, device_token)

    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": ""}})
    return {"message": "Warning cleared", "client_id": client_id}


@router.post("/device/report-admin-status")
async def report_admin_status(
    client_id: str = Query(...),
    admin_active: bool = Query(...),
    device_token: str = Query(default=""),
):
    """Report device admin mode status."""
    await verify_device(client_id, device_token)

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "admin_mode_active": admin_active,
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Admin status updated", "admin_active": admin_active}



@router.post("/device/update-info")
async def update_device_info(data: DeviceInfoUpdate):
    """Update device information (battery, storage, etc.) during heartbeat.
    This should be called by the client app periodically to keep device info updated.
    """
    client = await verify_device(data.client_id, data.device_token)

    update_data = {"last_heartbeat": datetime.utcnow()}
    
    if data.battery_level is not None:
        update_data["battery_level"] = data.battery_level
    if data.storage_free_gb is not None:
        update_data["storage_free_gb"] = data.storage_free_gb
    if data.storage_total_gb is not None:
        update_data["storage_total_gb"] = data.storage_total_gb
    if data.android_version:
        update_data["android_version"] = data.android_version
    if data.device_model:
        update_data["device_model"] = data.device_model
    if data.app_version:
        update_data["app_version"] = data.app_version
    if data.device_owner_active is not None:
        update_data["device_owner_active"] = bool(data.device_owner_active)
    if data.admin_mode_active is not None:
        update_data["admin_mode_active"] = bool(data.admin_mode_active)
    if data.last_reboot is not None:
        update_data["last_reboot"] = data.last_reboot
    
    await db.clients.update_one(
        {"id": data.client_id},
        {"$set": update_data}
    )
    
    return {"message": "Device info updated", "client_id": data.client_id}
