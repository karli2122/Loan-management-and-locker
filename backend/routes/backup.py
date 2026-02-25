"""Backup routes - Create, list, download, and restore backups."""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from database import db
from routes.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.post("/create")
async def create_backup(admin_token: str = Query(...)):
    """Create a backup of all admin's data (clients, loans, payments)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Fetch all clients for this admin
    clients = []
    async for c in db.clients.find(
        {"admin_id": admin_id, "is_deleted": {"$ne": True}},
        {"_id": 0}
    ):
        clients.append(c)
    
    # Fetch all loans
    loans = []
    async for l in db.loans.find({"admin_id": admin_id}, {"_id": 0}):
        loans.append(l)
    
    # Fetch all payments
    payments = []
    async for p in db.payments.find({"admin_id": admin_id}, {"_id": 0}):
        payments.append(p)
    
    # Fetch loan history
    loan_history = []
    async for lh in db.loan_history.find({"admin_id": admin_id}, {"_id": 0}):
        loan_history.append(lh)
    
    backup_data = {
        "version": "1.0",
        "app": "PayLock Pro",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "admin_id": admin_id,
        "admin_username": admin.get("username", ""),
        "stats": {
            "clients": len(clients),
            "loans": len(loans),
            "payments": len(payments),
            "loan_history": len(loan_history),
        },
        "data": {
            "clients": clients,
            "loans": loans,
            "payments": payments,
            "loan_history": loan_history,
        }
    }
    
    # Store backup in database
    import uuid
    backup_id = str(uuid.uuid4())
    await db.backups.insert_one({
        "_id": backup_id,
        "backup_id": backup_id,
        "admin_id": admin_id,
        "google_email": admin.get("google_email"),
        "created_at": datetime.now(timezone.utc),
        "size_bytes": len(json.dumps(backup_data, default=str)),
        "stats": backup_data["stats"],
        "data": backup_data["data"],
    })
    
    return {
        "backup_id": backup_id,
        "created_at": backup_data["created_at"],
        "stats": backup_data["stats"],
        "size_bytes": len(json.dumps(backup_data, default=str)),
    }


@router.get("/list")
async def list_backups(admin_token: str = Query(...)):
    """List all backups for the admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    backups = []
    async for b in db.backups.find(
        {"admin_id": admin_id},
        {"_id": 0, "data": 0}
    ).sort("created_at", -1).limit(20):
        backups.append({
            "backup_id": b["backup_id"],
            "created_at": b["created_at"].isoformat() if isinstance(b["created_at"], datetime) else str(b["created_at"]),
            "stats": b.get("stats", {}),
            "size_bytes": b.get("size_bytes", 0),
            "google_email": b.get("google_email"),
        })
    
    return {"backups": backups}


@router.get("/{backup_id}")
async def get_backup(backup_id: str, admin_token: str = Query(...)):
    """Download a specific backup."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    backup = await db.backups.find_one(
        {"backup_id": backup_id, "admin_id": admin_id},
        {"_id": 0}
    )
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    
    return {
        "backup_id": backup["backup_id"],
        "created_at": backup["created_at"].isoformat() if isinstance(backup["created_at"], datetime) else str(backup["created_at"]),
        "stats": backup.get("stats", {}),
        "data": backup.get("data", {}),
    }


@router.post("/restore/{backup_id}")
async def restore_backup(backup_id: str, admin_token: str = Query(...)):
    """Restore data from a backup. WARNING: This replaces current data."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    backup = await db.backups.find_one(
        {"backup_id": backup_id, "admin_id": admin_id},
        {"_id": 0}
    )
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    
    data = backup.get("data", {})
    
    restored = {"clients": 0, "loans": 0, "payments": 0, "loan_history": 0}
    
    # Restore clients
    for client in data.get("clients", []):
        client_id = client.get("id")
        if client_id:
            await db.clients.replace_one(
                {"id": client_id, "admin_id": admin_id},
                {**client, "admin_id": admin_id},
                upsert=True
            )
            restored["clients"] += 1
    
    # Restore loans
    for loan in data.get("loans", []):
        loan_id = loan.get("id")
        if loan_id:
            await db.loans.replace_one(
                {"id": loan_id, "admin_id": admin_id},
                {**loan, "admin_id": admin_id},
                upsert=True
            )
            restored["loans"] += 1
    
    # Restore payments
    for payment in data.get("payments", []):
        payment_id = payment.get("id")
        if payment_id:
            await db.payments.replace_one(
                {"id": payment_id, "admin_id": admin_id},
                {**payment, "admin_id": admin_id},
                upsert=True
            )
            restored["payments"] += 1
    
    # Restore loan history
    for lh in data.get("loan_history", []):
        lh_id = lh.get("id")
        if lh_id:
            await db.loan_history.replace_one(
                {"id": lh_id, "admin_id": admin_id},
                {**lh, "admin_id": admin_id},
                upsert=True
            )
            restored["loan_history"] += 1
    
    return {
        "message": "Backup restored successfully",
        "restored": restored,
    }


@router.delete("/{backup_id}")
async def delete_backup(backup_id: str, admin_token: str = Query(...)):
    """Delete a backup."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    result = await db.backups.delete_one(
        {"backup_id": backup_id, "admin_id": admin_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Backup not found")
    
    return {"message": "Backup deleted"}
