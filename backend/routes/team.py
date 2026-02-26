"""Admin Team Management - Sub-admin accounts with role-based permissions."""
import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Body
from starlette.responses import JSONResponse
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/team", tags=["team"])

ROLES = {
    "super_admin": {"label": "Super Admin", "permissions": ["all"]},
    "manager": {"label": "Manager", "permissions": ["clients", "loans", "reminders", "reports", "devices", "contracts", "schedules"]},
    "collection_agent": {"label": "Collection Agent", "permissions": ["clients", "loans", "reminders", "contracts"]},
    "accountant": {"label": "Accountant", "permissions": ["reports", "loans", "clients"]},
    "viewer": {"label": "Viewer", "permissions": ["clients", "reports"]},
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@router.get("/roles")
async def get_roles(admin_token: str = Query(...)):
    """Get available roles and permissions."""
    await get_admin_id_from_token(admin_token)
    return {"roles": {k: v for k, v in ROLES.items()}}


@router.post("/members")
async def add_team_member(admin_token: str = Query(...), data: dict = Body(...)):
    """Add a new team member (sub-admin)."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin or not admin.get("is_super_admin"):
        return JSONResponse(status_code=403, content={"error": "Only super admins can manage team"})

    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    role = data.get("role", "viewer")
    if not username or not password:
        return JSONResponse(status_code=400, content={"error": "Username and password required"})
    if role not in ROLES:
        return JSONResponse(status_code=400, content={"error": f"Invalid role. Choose from: {list(ROLES.keys())}"})

    existing = await db.admins.find_one({"username": username})
    if existing:
        return JSONResponse(status_code=409, content={"error": "Username already exists"})

    member = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password": hash_password(password),
        "role": role,
        "is_super_admin": role == "super_admin",
        "permissions": ROLES[role]["permissions"],
        "first_name": data.get("first_name", ""),
        "last_name": data.get("last_name", ""),
        "email": data.get("email", ""),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin_id,
        "credits": 0,
    }
    await db.admins.insert_one(member)
    safe = {k: v for k, v in member.items() if k not in ("_id", "password")}
    return safe


@router.get("/members")
async def list_team_members(admin_token: str = Query(...)):
    """List all team members."""
    await get_admin_id_from_token(admin_token)
    members = await db.admins.find({}, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(100)
    for m in members:
        m["role_label"] = ROLES.get(m.get("role", "viewer"), {}).get("label", m.get("role", "Unknown"))
    return {"members": members, "total": len(members)}


@router.put("/members/{member_id}")
async def update_team_member(member_id: str, admin_token: str = Query(...), data: dict = Body(...)):
    """Update a team member's role or info."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin or not admin.get("is_super_admin"):
        return JSONResponse(status_code=403, content={"error": "Only super admins can manage team"})

    updates = {}
    if "role" in data and data["role"] in ROLES:
        updates["role"] = data["role"]
        updates["permissions"] = ROLES[data["role"]]["permissions"]
        updates["is_super_admin"] = data["role"] == "super_admin"
    for field in ("first_name", "last_name", "email", "is_active"):
        if field in data:
            updates[field] = data[field]
    if "password" in data and data["password"]:
        updates["password"] = hash_password(data["password"])

    if updates:
        await db.admins.update_one({"id": member_id}, {"$set": updates})

    member = await db.admins.find_one({"id": member_id}, {"_id": 0, "password": 0})
    return member or {"error": "Member not found"}


@router.delete("/members/{member_id}")
async def remove_team_member(member_id: str, admin_token: str = Query(...)):
    """Remove a team member."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin or not admin.get("is_super_admin"):
        return JSONResponse(status_code=403, content={"error": "Only super admins can manage team"})
    if member_id == admin_id:
        return JSONResponse(status_code=400, content={"error": "Cannot remove yourself"})

    r = await db.admins.delete_one({"id": member_id})
    return {"deleted": r.deleted_count > 0}
