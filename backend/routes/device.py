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
    """Register a device with a registration code."""
    client = await db.clients.find_one({"registration_code": registration.registration_code})
    if not client:
        raise ValidationException("Invalid registration code")
    
    if client.get("is_registered"):
        raise ValidationException("This device is already registered")
    
    await db.clients.update_one(
        {"id": client["id"]},
        {"$set": {
            "device_id": registration.device_id,
            "device_model": registration.device_model,
            "is_registered": True,
            "registered_at": datetime.utcnow(),
            "last_heartbeat": datetime.utcnow()
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
    
    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=client.get("is_locked", False),
        lock_message=client.get("lock_message", ""),
        warning_message=client.get("warning_message", ""),
        emi_amount=client.get("emi_amount", 0),
        emi_due_date=client.get("emi_due_date"),
        uninstall_allowed=client.get("uninstall_allowed", False)
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
async def report_admin_status(client_id: str = Query(...), admin_mode_active: bool = Query(...)):
    """Report device admin mode status."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "admin_mode_active": admin_mode_active,
            "last_heartbeat": datetime.utcnow()
        }}
    )
    
    return {"message": "Admin status updated", "admin_mode_active": admin_mode_active}
