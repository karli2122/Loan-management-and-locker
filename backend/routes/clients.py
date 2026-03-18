"""Client routes - CRUD, bulk operations, locations."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional, List
import secrets
import uuid
import logging
import csv
import io

from database import db
from models.schemas import Client, ClientCreate, ClientUpdate, BulkOperationRequest
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.exceptions import ValidationException, AuthenticationException, AuthorizationException
from utils.audit import log_audit, AuditAction
from utils.permissions import check_permission
from routes.reminders import send_expo_push_notification

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Clients"])


@router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, admin_token: str = Query(...)):
    """Create a new client (without registration key - must be generated manually)."""
    admin_id = await check_permission(admin_token, "clients")
    
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
    )
    
    # Exclude registration_code when None so sparse unique index works
    client_dict = {k: v for k, v in client.dict().items() if not (k == "registration_code" and v is None)}
    # Set outstanding_balance to loan_amount on creation
    if client_data.loan_amount and client_data.loan_amount > 0:
        client_dict["outstanding_balance"] = client_data.loan_amount
        client_dict["total_amount_due"] = client_data.loan_amount
        # Set loan_start_date so Active Loan section shows in client details
        if client_data.loan_start_date:
            client_dict["loan_start_date"] = client_data.loan_start_date
        else:
            client_dict["loan_start_date"] = datetime.utcnow().strftime("%Y-%m-%d")
    # Also map emi_due_date to loan_due_date and next_payment_due for the Active Loan display
    if client_data.emi_due_date:
        client_dict["loan_due_date"] = client_data.emi_due_date
        client_dict["next_payment_due"] = client_data.emi_due_date
    await db.clients.insert_one(client_dict)
    # Set initial credit score
    client_dict.pop("_id", None)
    if not client_dict.get("credit_score"):
        await db.clients.update_one(
            {"id": client.id},
            {"$set": {"credit_score": 500}}
        )
    await log_audit(admin_id, AuditAction.CLIENT_CREATE, "client", client.id, client.name, f"Created client with phone {client.phone}")
    return client


@router.get("/clients")
async def list_clients(admin_token: str = Query(...)):
    """List all clients for the authenticated admin.
    All users see clients belonging to themselves + users they created (hierarchical scoping).
    Aggregates loan data from both clients collection and loans collection.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    
    # Hierarchical scoping: all users see their own clients + clients from users they created
    team_members = await db.admins.find(
        {"$or": [{"created_by": admin_id}, {"id": admin_id}]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    member_ids = [m["id"] for m in team_members]
    if admin_id not in member_ids:
        member_ids.append(admin_id)
    
    query = {"admin_id": {"$in": member_ids}, "is_deleted": {"$ne": True}}
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
    # Get all client IDs
    client_ids = [c["id"] for c in clients]
    
    # Fetch all loans for these clients from loans collection
    loans_by_client = {}
    if client_ids:
        all_loans = await db.loans.find(
            {"client_id": {"$in": client_ids}, "status": "active"},
            {"_id": 0}
        ).to_list(5000)
        
        for loan in all_loans:
            cid = loan.get("client_id")
            if cid not in loans_by_client:
                loans_by_client[cid] = []
            loans_by_client[cid].append(loan)
    
    # Aggregate loan data for each client
    for client in clients:
        cid = client["id"]
        client_loans = loans_by_client.get(cid, [])
        
        if client_loans:
            # Calculate totals from loans collection
            total_loan_amount = sum(l.get("loan_amount", 0) or l.get("amount", 0) for l in client_loans)
            total_outstanding = sum(l.get("outstanding_balance", 0) or (l.get("loan_amount", 0) - l.get("total_paid", 0)) for l in client_loans)
            total_paid_loans = sum(l.get("total_paid", 0) for l in client_loans)
            
            # Get earliest due date and interest rate from active loans
            # Normalize all dates to datetime objects for comparison
            due_dates = []
            for l in client_loans:
                due = l.get("due_date")
                if due:
                    if isinstance(due, str):
                        try:
                            due = datetime.fromisoformat(due.replace('Z', '+00:00'))
                        except (ValueError, TypeError):
                            continue
                    due_dates.append(due)
            
            interest_rates = [l.get("interest_rate", 0) for l in client_loans if l.get("interest_rate")]
            
            # Update client with aggregated data if loans collection has data
            if total_loan_amount > 0:
                client["loan_amount"] = total_loan_amount
                client["outstanding_balance"] = max(0, total_outstanding)
                client["total_paid"] = (client.get("total_paid", 0) or 0) + total_paid_loans
            
            if due_dates:
                # Use earliest due date
                earliest_due = min(due_dates)
                client["loan_due_date"] = earliest_due.isoformat() if isinstance(earliest_due, datetime) else earliest_due
                client["next_payment_due"] = earliest_due
            
            if interest_rates:
                client["interest_rate"] = interest_rates[0]  # Use first loan's rate
            
            # Calculate total amount due with interest
            if client.get("loan_amount") and client.get("interest_rate"):
                months = 1  # Default
                interest_amount = client["loan_amount"] * (client["interest_rate"] / 100) * months
                client["total_amount_due"] = client["loan_amount"] + interest_amount
                client["interest_amount"] = interest_amount
            
            # Store loans for multi-loan display
            client["loans"] = client_loans
        
        # Ensure loan fields are properly mapped for frontend compatibility
        if client.get("loan_amount") and not client.get("principal_amount"):
            client["principal_amount"] = client["loan_amount"]
        
        # Calculate interest amount if not set
        if not client.get("interest_amount") and client.get("total_amount_due") and client.get("loan_amount"):
            client["interest_amount"] = max(0, client["total_amount_due"] - client["loan_amount"])
    
    return {"clients": clients}


@router.get("/clients/silent")
async def list_silent_clients(admin_token: str = Query(...), minutes: int = Query(default=60)):
    """List clients that haven't sent heartbeat in specified minutes."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    
    clients = await db.clients.find({
        "admin_id": admin_id,
        "is_registered": True,
        "is_deleted": {"$ne": True},
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
    
    # Hierarchical scoping: all users see their own clients + clients from users they created
    team_members = await db.admins.find(
        {"$or": [{"created_by": admin_id}, {"id": admin_id}]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    member_ids = [m["id"] for m in team_members]
    if admin_id not in member_ids:
        member_ids.append(admin_id)
    
    query = {"admin_id": {"$in": member_ids}, "is_deleted": {"$ne": True}}
    
    clients = await db.clients.find(query, {"_id": 0, "registration_code": 0}).to_list(1000)
    
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
            "is_deleted": {"$ne": True},
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
    
    # Check if this was an imported client and if required fields are now complete
    updated = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if updated.get("import_needs_review"):
        # Required fields for imported client to be considered complete
        has_phone = bool(updated.get("phone"))
        has_interest = (updated.get("interest_rate") or 0) > 0
        has_loan_setup = (updated.get("monthly_emi") or 0) > 0
        
        if has_phone and has_interest and has_loan_setup:
            # All required fields are complete, clear the review flag
            await db.clients.update_one({"id": client_id}, {"$set": {"import_needs_review": False}})
            updated["import_needs_review"] = False
    
    return updated


@router.post("/clients/{client_id}/generate-code")
async def generate_registration_code(
    client_id: str,
    admin_token: str = Query(...),
    lock_mode: str = Query("device_admin", regex="^(device_admin|device_owner)$"),
):
    """Generate new registration code for a client (uses 1 credit for non-superadmins).
    8-char code = device_admin, 9-char code = device_owner.
    """
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
    
    # 8-char hex for device_admin, 9-char for device_owner (extra nibble)
    if lock_mode == "device_owner":
        new_code = (secrets.token_hex(4) + secrets.token_hex(1)[0]).upper()[:9]
    else:
        new_code = secrets.token_hex(4).upper()
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "registration_code": new_code,
            "lock_mode": lock_mode,
            "is_registered": False,
            "registered_at": None,
            "uninstall_allowed": False,
        }}
    )
    
    if not is_super_admin:
        await db.admins.update_one(
            {"id": admin_id},
            {"$inc": {"credits": -1}}
        )
    
    return {
        "registration_code": new_code,
        "lock_mode": lock_mode,
        "credits_remaining": credits - 1 if not is_super_admin else "unlimited"
    }


@router.post("/clients/{client_id}/send-warning")
async def send_warning_to_client(
    client_id: str,
    admin_token: str = Query(...),
    message: str = Query("Payment overdue. Please make your payment immediately to avoid device lock."),
):
    """Send a warning message to a client via in-app messaging and push notification."""
    from datetime import timezone as tz
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    await enforce_client_scope(client, admin_id)

    # Save in-app message
    msg = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "sender_type": "admin",
        "sender_id": admin_id,
        "text": f"WARNING: {message}",
        "created_at": datetime.now(tz.utc).isoformat(),
        "read": False,
        "is_warning": True,
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)

    # Send push notification to client device
    push_token = client.get("expo_push_token")
    push_sent = False
    if push_token:
        push_sent = await send_expo_push_notification(
            push_token,
            "Payment Warning",
            message,
            {"action": "warning", "client_id": client_id, "is_warning": True},
        )

    await log_audit(admin_id, AuditAction.CLIENT_WARNING, "client", client_id, client.get("name", ""), f"Warning: {message[:100]}")

    return {
        "status": "sent",
        "message_id": msg["id"],
        "push_sent": push_sent,
        "client_name": client.get("name", ""),
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
    await log_audit(admin_id, AuditAction.CLIENT_ALLOW_UNINSTALL, "client", client_id, client.get("name", ""), "Allowed uninstall")
    
    return {"message": "Uninstall allowed", "client_id": client_id}


@router.delete("/clients/{client_id}")
async def delete_client(client_id: str, admin_token: str = Query(...)):
    """Soft-delete a client: marks as deleted and allows uninstall so the device can clean up."""
    admin_id = await check_permission(admin_token, "clients")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Soft-delete: mark as deleted and allow uninstall so device gets the signal
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.utcnow(),
            "uninstall_allowed": True,
            "is_locked": False,
        }}
    )
    await log_audit(admin_id, AuditAction.CLIENT_DELETE, "client", client_id, client.get("name", ""), "Soft-deleted client")
    
    return {"message": "Client deleted successfully"}


@router.delete("/clients/{client_id}/purge")
async def purge_client(client_id: str, admin_token: str = Query(...)):
    """Hard-delete a soft-deleted client and all associated data."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.delete_one({"id": client_id})
    await db.payments.delete_many({"client_id": client_id})
    await db.reminders.delete_many({"client_id": client_id})
    
    return {"message": "Client purged successfully"}


@router.post("/clients/{client_id}/lock")
async def lock_client(
    client_id: str,
    admin_token: str = Query(...),
    message: str = Query(default=None),
    reason: str = Query(default="manual", regex="^(manual|overdue_payment|policy_violation|suspicious_activity|auto_lock)$"),
    temporary: bool = Query(default=False),
    unlock_after_hours: int = Query(default=None, ge=1, le=720),
):
    """Lock a client's device with granular reason tracking and optional temporary lock."""
    admin_id = await check_permission(admin_token, "clients")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    now = datetime.utcnow()
    update = {
        "is_locked": True,
        "lock_reason": reason,
        "locked_at": now.isoformat(),
        "locked_by": admin_id,
    }
    if message:
        update["lock_message"] = message
    if temporary and unlock_after_hours:
        unlock_at = now + timedelta(hours=unlock_after_hours)
        update["auto_unlock_at"] = unlock_at.isoformat()
        update["is_temporary_lock"] = True
    
    await db.clients.update_one({"id": client_id}, {"$set": update})
    
    # Record in audit trail
    await db.lock_audit_log.insert_one({
        "client_id": client_id,
        "admin_id": admin_id,
        "action": "lock",
        "reason": reason,
        "message": message,
        "temporary": temporary,
        "unlock_after_hours": unlock_after_hours,
        "timestamp": now.isoformat(),
    })
    await log_audit(admin_id, AuditAction.CLIENT_LOCK, "client", client_id, client.get("name", ""), f"Locked: {reason}")
    
    # Send push notification for instant lock enforcement
    push_token = client.get("expo_push_token")
    if push_token:
        notif_msg = message or f"Your device has been locked ({reason.replace('_', ' ')})."
        await send_expo_push_notification(
            push_token,
            "Device Locked",
            notif_msg,
            {"action": "lock", "is_locked": True, "reason": reason}
        )
    
    return {
        "message": "Device locked",
        "client_id": client_id,
        "reason": reason,
        "temporary": temporary,
        "auto_unlock_at": update.get("auto_unlock_at"),
    }


@router.post("/clients/{client_id}/unlock")
async def unlock_client(client_id: str, admin_token: str = Query(...)):
    """Unlock a client's device and record in audit trail."""
    admin_id = await check_permission(admin_token, "clients")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    now = datetime.utcnow()
    await db.clients.update_one({"id": client_id}, {"$set": {
        "is_locked": False,
        "lock_reason": None,
        "lock_message": "",  # Empty string instead of None to match Client model
        "locked_at": None,
        "locked_by": None,
        "auto_unlock_at": None,
        "is_temporary_lock": False,
        "unlocked_at": now.isoformat(),
    }})
    
    # Record in audit trail
    await db.lock_audit_log.insert_one({
        "client_id": client_id,
        "admin_id": admin_id,
        "action": "unlock",
        "reason": "manual_unlock",
        "timestamp": now.isoformat(),
    })
    await log_audit(admin_id, AuditAction.CLIENT_UNLOCK, "client", client_id, client.get("name", ""), "Manual unlock")
    
    # Send push notification for instant unlock
    push_token = client.get("expo_push_token")
    if push_token:
        await send_expo_push_notification(
            push_token,
            "Device Unlocked",
            "Your device has been unlocked.",
            {"action": "unlock", "is_locked": False}
        )
    
    return {"message": "Device unlocked", "client_id": client_id}


@router.get("/clients/{client_id}/lock-history")
async def get_lock_history(client_id: str, admin_token: str = Query(...), limit: int = Query(default=50, le=200)):
    """Get the lock/unlock audit trail for a client."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    history = await db.lock_audit_log.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return {
        "client_id": client_id,
        "history": history,
        "count": len(history),
    }



@router.post("/clients/{client_id}/warning")
async def send_warning(client_id: str, message: str = Query(...), admin_token: str = Query(...)):
    """Send a warning message to client's device."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": message}})
    
    # Send push notification for instant warning delivery
    push_token = client.get("expo_push_token")
    if push_token:
        await send_expo_push_notification(
            push_token,
            "Warning from Administrator",
            message,
            {"action": "warning", "warning_message": message}
        )
    
    return {"message": "Warning sent", "client_id": client_id}


@router.get("/clients/{client_id}/fetch-price")
async def fetch_device_price(client_id: str, admin_token: str = Query(...), force: bool = Query(False)):
    """Fetch estimated used price for a client's device from eBay.de."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    device_model = client.get("device_model", "").strip()
    device_make = client.get("device_make", "").strip()
    
    if not device_model or device_model.lower() == "unknown device":
        raise HTTPException(status_code=400, detail="Device model not available. Please register the device first.")
    
    # Check if we have a recent cached price (within 7 days)
    if not force:
        price_fetched_at = client.get("price_fetched_at")
        if price_fetched_at and client.get("used_price_eur"):
            age = (datetime.utcnow() - price_fetched_at).days
            if age < 7:
                return {
                    "client_id": client_id,
                    "device_model": device_model,
                    "device_make": device_make,
                    "used_price_eur": client["used_price_eur"],
                    "price_range": {
                        "min": client.get("price_min_eur"),
                        "max": client.get("price_max_eur"),
                        "avg": client.get("price_avg_eur"),
                    },
                    "listing_count": client.get("price_listing_count", 0),
                    "search_query": client.get("price_search_query", ""),
                    "source": "swappa.com (cached)",
                    "cached_days_ago": age,
                    "sample_listings": client.get("price_sample_listings", []),
                }
    
    # Fetch real price from eBay
    from services.ebay_scraper import fetch_used_phone_price
    
    result = fetch_used_phone_price(device_model, device_make)
    
    if result.get("price_eur"):
        estimated_price = result["price_eur"]
        
        # Update client with fetched price and metadata
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {
                "used_price_eur": estimated_price,
                "price_avg_eur": result.get("avg_price_eur"),
                "price_min_eur": result.get("min_price_eur"),
                "price_max_eur": result.get("max_price_eur"),
                "price_listing_count": result.get("listing_count", 0),
                "price_search_query": result.get("search_query", ""),
                "price_source": result.get("source", "swappa.com"),
                "price_sample_listings": result.get("sample_listings", []),
                "price_fetched_at": datetime.utcnow(),
            }}
        )
        
        return {
            "client_id": client_id,
            "device_model": device_model,
            "device_make": device_make,
            "used_price_eur": estimated_price,
            "price_range": {
                "min": result.get("min_price_eur"),
                "max": result.get("max_price_eur"),
                "avg": result.get("avg_price_eur"),
            },
            "listing_count": result.get("listing_count", 0),
            "search_query": result.get("search_query", ""),
            "source": result.get("source", "swappa.com"),
            "sample_listings": result.get("sample_listings", []),
        }
    else:
        raise HTTPException(
            status_code=404,
            detail=f"No listings found for '{result.get('search_query', device_model)}'. {result.get('error', '')}"
        )


@router.post("/clients/{client_id}/report-tamper")
async def report_tamper(client_id: str, tamper_type: str = Query(default="unknown")):
    """Report a tamper attempt from client device."""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {
            "$inc": {"tamper_attempts": 1},
            "$set": {
                "last_tamper_attempt": datetime.utcnow(),
                "last_tamper_type": tamper_type,
            }
        }
    )
    
    # Create notification for admin
    if client.get("admin_id"):
        from models.schemas import Notification
        notification = Notification(
            admin_id=client["admin_id"],
            type="tamper_attempt",
            title="Tamper Attempt Detected",
            message=f"Client {client['name']} tampered: {tamper_type}",
            client_id=client_id,
            client_name=client["name"]
        )
        await db.notifications.insert_one(notification.dict())
        
        # Send push notification to admin
        admin_tokens = await db.push_tokens.find(
            {"admin_id": client["admin_id"]}, {"_id": 0, "token": 1}
        ).to_list(10)
        for tk in admin_tokens:
            push_token = tk.get("token", "")
            if push_token.startswith("ExponentPushToken"):
                from routes.reminders import send_expo_push_notification
                await send_expo_push_notification(
                    push_token,
                    "Tamper Alert",
                    f"{client['name']}: {tamper_type.replace('_', ' ').replace(':', ' - ')}",
                    {"action": "tamper", "client_id": client_id}
                )
    
    return {"message": "Tamper reported", "client_id": client_id, "tamper_type": tamper_type}


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
