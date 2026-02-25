"""Device routes - registration, status, location updates."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
import logging

from database import db
from models.schemas import (
    Client, ClientStatusResponse,
    DeviceRegistration, LocationUpdate, PushTokenUpdate
)
from utils.exceptions import ValidationException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Device"])


@router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    """Register a device with a registration code.
    8-digit code = Device Admin mode, 9-digit code = Device Owner mode.
    """
    client = await db.clients.find_one({"registration_code": registration.registration_code})
    if not client:
        raise ValidationException("Invalid registration code")
    
    if client.get("is_registered"):
        raise ValidationException("This device is already registered")
    
    # Determine lock mode from code length: 8 = device_admin, 9 = device_owner
    code = registration.registration_code.strip()
    lock_mode = "device_owner" if len(code) == 9 else "device_admin"
    
    await db.clients.update_one(
        {"id": client["id"]},
        {"$set": {
            "device_id": registration.device_id,
            "device_model": registration.device_model,
            "is_registered": True,
            "registered_at": datetime.utcnow(),
            "last_heartbeat": datetime.utcnow(),
            "uninstall_allowed": False,
            "admin_mode_active": False,
            "tamper_attempts": 0,
            "lock_mode": lock_mode,
        }}
    )
    
    updated_client = await db.clients.find_one({"id": client["id"]}, {"_id": 0})
    return updated_client


@router.get("/device/status/{client_id}", response_model=ClientStatusResponse)
async def get_device_status(client_id: str):
    """Get device status for a client."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Update heartbeat
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"last_heartbeat": datetime.utcnow()}}
    )
    
    # Calculate total amount due with interest
    loan_amount = client.get("loan_amount", 0)
    interest_rate = client.get("interest_rate", 0)
    total_amount_due = client.get("total_amount_due", 0)
    outstanding_balance = client.get("outstanding_balance", 0)
    
    # If total_amount_due was calculated by setup_loan, use it. Otherwise estimate.
    if total_amount_due and total_amount_due > loan_amount:
        amount_due = total_amount_due
    elif loan_amount > 0 and interest_rate > 0:
        # Simple interest estimate: principal + one month interest
        amount_due = loan_amount + (loan_amount * interest_rate / 100)
    else:
        amount_due = outstanding_balance or loan_amount
    
    # Parse due date properly
    raw_due = client.get("next_payment_due") or client.get("emi_due_date") or client.get("loan_due_date")
    if raw_due:
        if isinstance(raw_due, datetime):
            due_date_str = raw_due.strftime("%Y-%m-%d")
        else:
            due_date_str = str(raw_due)[:10]
    else:
        due_date_str = None
    
    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=client.get("is_locked", False),
        lock_message=client.get("lock_message", ""),
        warning_message=client.get("warning_message", ""),
        loan_amount=round(amount_due, 2),
        loan_due_date=due_date_str,
        outstanding_balance=round(client.get("outstanding_balance", 0), 2),
        monthly_emi=round(client.get("monthly_emi", 0), 2),
        uninstall_allowed=client.get("uninstall_allowed", False),
        is_deleted=client.get("is_deleted", False),
        lock_mode=client.get("lock_mode", "device_admin"),
    )


@router.post("/device/location")
async def update_location(location: LocationUpdate):
    """Update device location."""
    client = await db.clients.find_one({"id": location.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": location.client_id},
        {"$set": {
            "latitude": location.latitude,
            "longitude": location.longitude,
            "last_location_update": datetime.utcnow(),
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Location updated", "client_id": location.client_id}


@router.post("/device/push-token")
async def update_push_token(data: PushTokenUpdate):
    """Update Expo push notification token for a device."""
    client = await db.clients.find_one({"id": data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": data.client_id},
        {"$set": {
            "expo_push_token": data.push_token,
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Push token updated", "client_id": data.client_id}


@router.post("/device/clear-warning/{client_id}")
async def clear_warning(client_id: str):
    """Clear warning message after client acknowledgment."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": ""}})
    return {"message": "Warning cleared", "client_id": client_id}


@router.post("/device/report-admin-status")
async def report_admin_status(client_id: str = Query(...), admin_active: bool = Query(...)):
    """Report device admin mode status."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "admin_mode_active": admin_active,
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Admin status updated", "admin_active": admin_active}
