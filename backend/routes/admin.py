"""Admin routes - authentication, profile, credits management."""
from fastapi import APIRouter, Query
from datetime import datetime, timedelta
import secrets
import logging

from database import db
from models.schemas import (
    Admin, AdminCreate, AdminLogin, AdminResponse,
    PasswordChange, ProfileUpdate, CreditAssignment
)
from utils.auth import (
    hash_password, verify_password,
    verify_admin_token_header, get_admin_id_from_token
)
from utils.exceptions import (
    ValidationException, AuthenticationException, AuthorizationException
)
from config import TOKEN_EXPIRY_HOURS

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Admin"])


@router.post("/admin/register", response_model=AdminResponse)
async def register_admin(admin_data: AdminCreate, admin_token: str = Query(default=None)):
    """Register a new admin. First admin requires no token, subsequent admins require super_admin token."""
    if len(admin_data.password) < 6:
        raise ValidationException("Password must be at least 6 characters")
    
    existing = await db.admins.find_one({"username": admin_data.username})
    if existing:
        raise ValidationException("Username already exists")
    
    admin_count = await db.admins.count_documents({})
    is_first_admin = admin_count == 0
    is_super_admin = is_first_admin
    
    if not is_first_admin:
        if not admin_token:
            raise AuthenticationException("Admin token required to register new admins")
        
        token_doc = await db.admin_tokens.find_one({"token": admin_token})
        if not token_doc:
            raise AuthenticationException("Invalid admin token")
        
        creator = await db.admins.find_one({"id": token_doc["admin_id"]})
        if not creator or not creator.get("is_super_admin", False):
            raise AuthorizationException("Only super admins can register new admins")
    
    admin = Admin(
        username=admin_data.username,
        password_hash=hash_password(admin_data.password),
        role=admin_data.role,
        is_super_admin=is_super_admin,
        credits=5 if not is_super_admin else 0,
        first_name=admin_data.first_name,
        last_name=admin_data.last_name
    )
    await db.admins.insert_one(admin.dict())
    
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    await db.admin_tokens.update_one(
        {"admin_id": admin.id},
        {"$set": {"token": token, "created_at": datetime.utcnow(), "expires_at": expires_at}},
        upsert=True
    )
    
    return AdminResponse(
        id=admin.id,
        username=admin.username,
        role=admin.role,
        is_super_admin=admin.is_super_admin,
        credits=admin.credits,
        token=token
    )


@router.post("/admin/login", response_model=AdminResponse)
async def login_admin(login_data: AdminLogin):
    """Authenticate admin and return token."""
    admin = await db.admins.find_one({"username": login_data.username})
    if not admin or not verify_password(login_data.password, admin["password_hash"]):
        raise AuthenticationException("Invalid credentials")
    
    # Check if password needs rehashing (for legacy SHA-256 hashes)
    if len(admin["password_hash"]) == 64:
        logger.info(f"Migrating password hash for user {admin['username']} to Argon2id")
        new_hash = hash_password(login_data.password)
        await db.admins.update_one(
            {"id": admin["id"]},
            {"$set": {"password_hash": new_hash}}
        )
    
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    await db.admin_tokens.update_one(
        {"admin_id": admin["id"]},
        {"$set": {"token": token, "created_at": datetime.utcnow(), "expires_at": expires_at}},
        upsert=True
    )
    
    return AdminResponse(
        id=admin["id"],
        username=admin["username"],
        role=admin.get("role", "user"),
        is_super_admin=admin.get("is_super_admin", False),
        credits=admin.get("credits", 5),
        token=token,
        first_name=admin.get("first_name"),
        last_name=admin.get("last_name")
    )


@router.get("/admin/verify/{token}")
async def verify_admin_token(token: str):
    """Verify if a token is valid and not expired."""
    is_valid = await verify_admin_token_header(token)
    if not is_valid:
        raise AuthenticationException("Invalid or expired token")
    
    token_doc = await db.admin_tokens.find_one({"token": token})
    return {
        "valid": True,
        "admin_id": token_doc["admin_id"],
        "expires_at": token_doc.get("expires_at").isoformat() if token_doc.get("expires_at") else None
    }


@router.get("/admin/list")
async def list_admins(admin_token: str = Query(...)):
    """List all admins (super admin only)."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    
    if not admin or not admin.get("is_super_admin", False):
        raise AuthorizationException("Only super admins can list all admins")
    
    admins = await db.admins.find({}, {"password_hash": 0, "_id": 0}).to_list(1000)
    return admins


@router.post("/admin/change-password")
async def change_password(data: PasswordChange, admin_token: str = Query(...)):
    """Change admin password."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    
    if not admin:
        raise AuthenticationException("Admin not found")
    
    if not verify_password(data.current_password, admin["password_hash"]):
        raise AuthenticationException("Current password is incorrect")
    
    if len(data.new_password) < 6:
        raise ValidationException("New password must be at least 6 characters")
    
    new_hash = hash_password(data.new_password)
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password changed successfully"}


@router.put("/admin/update-profile")
async def update_profile(data: ProfileUpdate, admin_token: str = Query(...)):
    """Update admin profile."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    update_data = {}
    if data.first_name is not None:
        update_data["first_name"] = data.first_name
    if data.last_name is not None:
        update_data["last_name"] = data.last_name
    if data.email is not None:
        update_data["email"] = data.email
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.address is not None:
        update_data["address"] = data.address
    
    if update_data:
        await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    admin = await db.admins.find_one({"id": admin_id}, {"password_hash": 0, "_id": 0})
    return admin


@router.put("/admin/profile")
async def update_profile_alias(data: ProfileUpdate, admin_token: str = Query(...)):
    """Alias for update-profile endpoint."""
    return await update_profile(data, admin_token)


@router.delete("/admin/{admin_id}")
async def delete_admin(admin_id: str, admin_token: str = Query(...)):
    """Delete an admin (super admin only)."""
    requester_id = await get_admin_id_from_token(admin_token)
    requester = await db.admins.find_one({"id": requester_id})
    
    if not requester or not requester.get("is_super_admin", False):
        raise AuthorizationException("Only super admins can delete admins")
    
    if admin_id == requester_id:
        raise ValidationException("Cannot delete your own account")
    
    target = await db.admins.find_one({"id": admin_id})
    if not target:
        raise ValidationException("Admin not found")
    
    if target.get("is_super_admin", False):
        raise ValidationException("Cannot delete a super admin")
    
    await db.admin_tokens.delete_many({"admin_id": admin_id})
    await db.admins.delete_one({"id": admin_id})
    
    return {"message": "Admin deleted successfully"}


@router.get("/admin/credits")
async def get_admin_credits(admin_token: str = Query(...)):
    """Get current admin's credit balance."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    
    if not admin:
        raise AuthenticationException("Admin not found")
    
    return {
        "credits": admin.get("credits", 5),
        "is_super_admin": admin.get("is_super_admin", False)
    }


@router.post("/admin/credits/assign")
async def assign_credits(data: CreditAssignment, admin_token: str = Query(...)):
    """Assign credits to an admin (super admin only). Credits are ADDED to existing balance."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    
    if not admin or not admin.get("is_super_admin", False):
        raise AuthorizationException("Only super admins can assign credits")
    
    target_admin = await db.admins.find_one({"id": data.target_admin_id})
    if not target_admin:
        raise ValidationException("Target admin not found")
    
    if data.credits < 0:
        raise ValidationException("Credits cannot be negative")
    
    # Use $inc to ADD credits to existing balance (additive)
    current_credits = target_admin.get("credits", 0)
    new_balance = current_credits + data.credits
    
    await db.admins.update_one(
        {"id": data.target_admin_id},
        {"$set": {"credits": new_balance}}
    )
    
    return {
        "message": f"Added {data.credits} credits to {target_admin['username']}",
        "target_admin_id": data.target_admin_id,
        "previous_balance": current_credits,
        "added": data.credits,
        "new_balance": new_balance
    }


@router.get("/admin/list-with-credits")
async def list_admins_with_credits(admin_token: str = Query(...)):
    """List all admins with credit balances (super admin only)."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    
    if not admin or not admin.get("is_super_admin", False):
        raise AuthorizationException("Only super admins can view this list")
    
    admins = await db.admins.find(
        {},
        {"password_hash": 0, "_id": 0}
    ).to_list(1000)
    
    return admins
