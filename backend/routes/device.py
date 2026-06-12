"""Device routes - registration, status, location updates."""
from fastapi import APIRouter, Query, HTTPException, Depends
from datetime import datetime, timedelta
import logging

from database import db
from models.schemas import (
    Client, ClientStatusResponse,
    DeviceRegistration, LocationUpdate, PushTokenUpdate, DeviceInfoUpdate
)
from utils.exceptions import ValidationException
from utils.auth import verify_device, enforce_client_scope, sign_lock_state
from utils.dependencies import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Device"])


@router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    """Register a device with a registration code.
    8-digit code = Device Admin mode, 9-digit code = Device Owner mode.
    """
    import uuid
    client = await db.clients.find_one({"registration_code": registration.registration_code})
    if not client:
        raise ValidationException("Invalid registration code")
    
    if client.get("is_registered"):
        raise ValidationException("This device is already registered")
    
    # Determine lock mode from code length: 8 = device_admin, 9 = device_owner
    code = registration.registration_code.strip()
    lock_mode = "device_owner" if len(code) == 9 else "device_admin"
    
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
    
    if active_loan:
        loan_amount = active_loan.get("loan_amount", 0)
        interest_rate = active_loan.get("interest_rate", 0)
        total_amount_due = active_loan.get("total_amount_due", 0)
        outstanding_balance = active_loan.get("outstanding_balance", 0)
        total_paid = active_loan.get("total_paid", 0) or 0
        monthly_emi = active_loan.get("monthly_emi", 0) or 0
        
        # Calculate amount due
        if outstanding_balance and outstanding_balance > 0:
            amount_due = outstanding_balance
        elif total_amount_due and total_amount_due > loan_amount:
            amount_due = total_amount_due - total_paid
        elif loan_amount > 0 and interest_rate > 0:
            amount_due = loan_amount + (loan_amount * interest_rate / 100) - total_paid
        else:
            amount_due = max(0, loan_amount - total_paid)
        
        # Parse due date from active loan
        raw_due = active_loan.get("due_date")
        if raw_due:
            if isinstance(raw_due, datetime):
                due_date_str = raw_due.strftime("%Y-%m-%d")
            else:
                due_date_str = str(raw_due)[:10]
        else:
            due_date_str = None
    else:
        # No active loan — show zero
        amount_due = 0
        due_date_str = None
        monthly_emi = 0
        outstanding_balance = 0
    
    # Get admin's plan and name for client-side feature gating
    admin_plan = None
    admin_firstname = None
    admin_id = client.get("admin_id")
    if admin_id:
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "plan": 1, "first_name": 1})
        if admin:
            admin_plan = admin.get("plan")
            admin_firstname = admin.get("first_name")
    
    is_locked_val = client.get("is_locked", False)
    issued_at = int(datetime.utcnow().timestamp())
    lock_sig = sign_lock_state(client_id, is_locked_val, device_token, issued_at)

    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=is_locked_val,
        lock_message=client.get("lock_message", ""),
        warning_message=client.get("warning_message", ""),
        loan_amount=round(amount_due, 2),
        loan_due_date=due_date_str,
        outstanding_balance=round(outstanding_balance, 2),
        monthly_emi=round(monthly_emi, 2),
        uninstall_allowed=client.get("uninstall_allowed", False),
        is_deleted=client.get("is_deleted", False),
        lock_mode=client.get("lock_mode", "device_admin"),
        admin_plan=admin_plan,
        admin_firstname=admin_firstname,
        lock_signature=lock_sig,
        lock_issued_at=issued_at,
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
    
    await db.clients.update_one(
        {"id": data.client_id},
        {"$set": update_data}
    )
    
    return {"message": "Device info updated", "client_id": data.client_id}
