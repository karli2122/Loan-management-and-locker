"""Client routes - CRUD, bulk operations, locations."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional, List
import secrets
import logging
import csv
import io

from database import db
from models.schemas import Client, ClientCreate, ClientUpdate, BulkOperationRequest
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.exceptions import ValidationException, AuthenticationException, AuthorizationException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Clients"])


@router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, admin_token: str = Query(...)):
    """Create a new client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = Client(
        name=client_data.name,
        phone=client_data.phone,
        email=client_data.email,
        address=client_data.address,
        birth_number=client_data.birth_number,
        emi_amount=client_data.emi_amount,
        emi_due_date=client_data.emi_due_date,
        lock_mode=client_data.lock_mode,
        admin_id=admin_id,
        loan_amount=client_data.loan_amount,
        down_payment=client_data.down_payment,
        interest_rate=client_data.interest_rate,
        loan_tenure_months=client_data.loan_tenure_months
    )
    
    await db.clients.insert_one(client.dict())
    return client


@router.get("/clients")
async def list_clients(admin_token: str = Query(...)):
    """List all clients for the authenticated admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    clients = await db.clients.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).to_list(1000)
    
    return clients


@router.get("/clients/silent")
async def list_silent_clients(admin_token: str = Query(...), minutes: int = Query(default=60)):
    """List clients that haven't sent heartbeat in specified minutes."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    
    clients = await db.clients.find({
        "admin_id": admin_id,
        "is_registered": True,
        "$or": [
            {"last_heartbeat": {"$lt": cutoff}},
            {"last_heartbeat": {"$exists": False}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    return clients


@router.get("/clients/export")
async def export_clients(admin_token: str = Query(...), format: str = Query(default="json")):
    """Export clients data as JSON or CSV."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    clients = await db.clients.find(
        {"admin_id": admin_id},
        {"_id": 0, "registration_code": 0}
    ).to_list(1000)
    
    if format.lower() == "csv":
        if not clients:
            return {"csv": ""}
        
        output = io.StringIO()
        fieldnames = clients[0].keys()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for client in clients:
            row = {k: str(v) if v is not None else "" for k, v in client.items()}
            writer.writerow(row)
        
        return {"csv": output.getvalue()}
    
    return clients


@router.get("/clients/locations")
async def get_client_locations(admin_token: str = Query(...)):
    """Get all client locations for map display."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    clients = await db.clients.find(
        {
            "admin_id": admin_id,
            "latitude": {"$exists": True, "$ne": None},
            "longitude": {"$exists": True, "$ne": None}
        },
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "phone": 1,
            "latitude": 1,
            "longitude": 1,
            "is_locked": 1,
            "last_location_update": 1,
            "outstanding_balance": 1
        }
    ).to_list(1000)
    
    return clients


@router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, admin_token: str = Query(...)):
    """Get a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    return client


@router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, client_data: ClientUpdate, admin_token: str = Query(...)):
    """Update a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    update_data = {k: v for k, v in client_data.dict().items() if v is not None}
    if update_data:
        await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return updated


@router.post("/clients/{client_id}/generate-code")
async def generate_registration_code(client_id: str, admin_token: str = Query(...)):
    """Generate new registration code for a client (uses 1 credit for non-superadmins)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise AuthenticationException("Admin not found")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    is_super_admin = admin.get("is_super_admin", False)
    credits = admin.get("credits", 0)
    
    if not is_super_admin and credits < 1:
        raise ValidationException("Insufficient credits. Please contact super admin to get more credits.")
    
    new_code = secrets.token_hex(4).upper()
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "registration_code": new_code,
            "is_registered": False,
            "registered_at": None
        }}
    )
    
    if not is_super_admin:
        await db.admins.update_one(
            {"id": admin_id},
            {"$inc": {"credits": -1}}
        )
    
    return {
        "registration_code": new_code,
        "credits_remaining": credits - 1 if not is_super_admin else "unlimited"
    }


@router.post("/clients/{client_id}/allow-uninstall")
async def allow_uninstall(client_id: str, admin_token: str = Query(...)):
    """Allow client to uninstall the app."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"uninstall_allowed": True}}
    )
    
    return {"message": "Uninstall allowed", "client_id": client_id}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, admin_token: str = Query(...)):
    """Delete a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.delete_one({"id": client_id})
    await db.payments.delete_many({"client_id": client_id})
    await db.reminders.delete_many({"client_id": client_id})
    
    return {"message": "Client deleted successfully"}


@router.post("/clients/{client_id}/lock")
async def lock_client(client_id: str, admin_token: str = Query(...), message: str = Query(default=None)):
    """Lock a client's device."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    update = {"is_locked": True}
    if message:
        update["lock_message"] = message
    
    await db.clients.update_one({"id": client_id}, {"$set": update})
    return {"message": "Device locked", "client_id": client_id}


@router.post("/clients/{client_id}/unlock")
async def unlock_client(client_id: str, admin_token: str = Query(...)):
    """Unlock a client's device."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one({"id": client_id}, {"$set": {"is_locked": False}})
    return {"message": "Device unlocked", "client_id": client_id}


@router.post("/clients/{client_id}/warning")
async def send_warning(client_id: str, message: str = Query(...), admin_token: str = Query(...)):
    """Send a warning message to client's device."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": message}})
    return {"message": "Warning sent", "client_id": client_id}


@router.post("/clients/{client_id}/report-tamper")
async def report_tamper(client_id: str):
    """Report a tamper attempt from client device."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {
            "$inc": {"tamper_attempts": 1},
            "$set": {"last_tamper_attempt": datetime.utcnow()}
        }
    )
    
    # Create notification for admin
    if client.get("admin_id"):
        from models.schemas import Notification
        notification = Notification(
            admin_id=client["admin_id"],
            type="tamper_attempt",
            title="Tamper Attempt Detected",
            message=f"Client {client['name']} attempted to tamper with the app",
            client_id=client_id,
            client_name=client["name"]
        )
        await db.notifications.insert_one(notification.dict())
    
    return {"message": "Tamper reported", "client_id": client_id}


@router.post("/clients/{client_id}/report-reboot")
async def report_reboot(client_id: str):
    """Report device reboot from client."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"last_reboot": datetime.utcnow()}}
    )
    
    return {"message": "Reboot reported", "client_id": client_id}


@router.post("/clients/bulk-operation")
async def bulk_operation(data: BulkOperationRequest, admin_token: str = Query(...)):
    """Perform bulk operations on multiple clients."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    if data.action not in ["lock", "unlock", "warning"]:
        raise ValidationException(f"Invalid action: {data.action}")
    
    success_count = 0
    failed_count = 0
    
    for client_id in data.client_ids:
        client = await db.clients.find_one({"id": client_id})
        if not client or client.get("admin_id") != admin_id:
            failed_count += 1
            continue
        
        try:
            if data.action == "lock":
                update = {"is_locked": True}
                if data.message:
                    update["lock_message"] = data.message
                await db.clients.update_one({"id": client_id}, {"$set": update})
            elif data.action == "unlock":
                await db.clients.update_one({"id": client_id}, {"$set": {"is_locked": False}})
            elif data.action == "warning":
                if data.message:
                    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": data.message}})
            
            success_count += 1
        except Exception as e:
            logger.error(f"Bulk operation failed for client {client_id}: {e}")
            failed_count += 1
    
    return {
        "action": data.action,
        "success_count": success_count,
        "failed_count": failed_count,
        "total": len(data.client_ids)
    }


@router.get("/clients/{client_id}/late-fees")
async def get_client_late_fees(client_id: str, admin_token: str = Query(...)):
    """Get late fee details for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    return {
        "client_id": client_id,
        "late_fees_accumulated": client.get("late_fees_accumulated", 0),
        "days_overdue": client.get("days_overdue", 0),
        "next_payment_due": client.get("next_payment_due"),
        "monthly_emi": client.get("monthly_emi", 0)
    }
