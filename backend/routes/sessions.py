"""Session management - track, view, and revoke admin login sessions."""
from fastapi import APIRouter, Query, Request
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from database import db
from utils.auth import get_admin_id_from_token
from utils.plan_gating import check_plan_access

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


async def create_session(admin_id: str, ip_address: str = "", user_agent: str = "", device_info: str = ""):
    """Create a new session record when admin logs in."""
    session = {
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "device_info": device_info,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_activity": datetime.now(timezone.utc),
    }
    await db.admin_sessions.insert_one(session)
    return session["id"]


async def update_session_activity(admin_id: str):
    """Update last activity timestamp for the most recent session."""
    await db.admin_sessions.update_one(
        {"admin_id": admin_id, "is_active": True},
        {"$set": {"last_activity": datetime.now(timezone.utc)}},
        sort=[("created_at", -1)],
    )


@router.get("")
async def list_sessions(admin_token: str = Query(...)):
    """List all active sessions for the current admin (or all enterprise sessions for super admins)."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "session_management")
    
    # Check if super admin
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    is_super = admin.get("is_super_admin", False) if admin else False
    
    if is_super:
        # Super admins see all sessions in the enterprise
        enterprise_id = admin.get("enterprise_id") or admin_id
        # Get all admin IDs in the enterprise
        enterprise_admins = await db.admins.find(
            {"$or": [{"enterprise_id": enterprise_id}, {"id": enterprise_id}]},
            {"_id": 0, "id": 1}
        ).to_list(100)
        admin_ids = [a["id"] for a in enterprise_admins]
        
        sessions = await db.admin_sessions.find(
            {"admin_id": {"$in": admin_ids}, "is_active": True},
            {"_id": 0}
        ).sort("last_activity", -1).to_list(100)
        
        # Add admin username to each session
        admin_map = {a["id"]: a.get("username", "Unknown") for a in await db.admins.find({"id": {"$in": admin_ids}}, {"_id": 0, "id": 1, "username": 1}).to_list(100)}
        for s in sessions:
            s["admin_username"] = admin_map.get(s["admin_id"], "Unknown")
    else:
        # Regular admins only see their own sessions
        sessions = await db.admin_sessions.find(
            {"admin_id": admin_id, "is_active": True},
            {"_id": 0}
        ).sort("last_activity", -1).to_list(50)
    
    for s in sessions:
        for field in ["created_at", "last_activity"]:
            if isinstance(s.get(field), datetime):
                s[field] = s[field].isoformat()
    
    return {"sessions": sessions, "total": len(sessions)}


@router.delete("/{session_id}")
async def revoke_session(session_id: str, admin_token: str = Query(...)):
    """Revoke a specific session."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "session_management")
    
    result = await db.admin_sessions.update_one(
        {"id": session_id, "admin_id": admin_id},
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        from utils.exceptions import ValidationException
        raise ValidationException("Session not found or already revoked")
    
    return {"message": "Session revoked", "session_id": session_id}


@router.delete("")
async def revoke_all_sessions(admin_token: str = Query(...), keep_current: bool = Query(default=True)):
    """Revoke all sessions (optionally keeping current one)."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "session_management")
    
    query = {"admin_id": admin_id, "is_active": True}
    
    result = await db.admin_sessions.update_many(
        query,
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": f"Revoked {result.modified_count} sessions"}
