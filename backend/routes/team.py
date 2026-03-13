"""Admin Team Management - Enterprise plan feature.
Superuser creates sub-users under their enterprise. Data sharing model:
- Superuser sees all enterprise clients + revenue/profits
- Normal team members see only their own clients
"""
import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Body
from starlette.responses import JSONResponse
from database import db
from utils.auth import get_admin_id_from_token
from utils.plan_gating import check_plan_access

router = APIRouter(prefix="/api/team", tags=["team"])

ROLES = {
    "super_admin": {"label": "Super Admin", "permissions": ["all"]},
    "full_admin": {"label": "Full Admin", "permissions": ["clients", "loans", "payments", "reminders", "reports", "devices", "contracts", "schedules", "documents", "import", "settings", "team"]},
    "collections": {"label": "Collections", "permissions": ["clients", "loans", "payments", "reminders", "contracts"]},
    "viewer": {"label": "View Only", "permissions": ["clients_read", "reports_read", "loans_read"]},
}


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def check_enterprise_plan(admin_id: str) -> bool:
    """Check if admin has enterprise or custom plan."""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        return False
    plan = admin.get("subscription_plan") or admin.get("plan", "starter")
    return plan in ("enterprise", "custom")


async def get_enterprise_id(admin_id: str) -> str:
    """Get enterprise_id for an admin. Superusers use their own id, team members use their enterprise_id."""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        return admin_id
    return admin.get("enterprise_id") or admin_id


async def get_enterprise_member_ids(enterprise_id: str) -> list:
    """Get all admin IDs belonging to an enterprise."""
    members = await db.admins.find(
        {"enterprise_id": enterprise_id},
        {"_id": 0, "id": 1}
    ).to_list(100)
    ids = [m["id"] for m in members]
    if enterprise_id not in ids:
        ids.append(enterprise_id)
    return ids


@router.get("/roles")
async def get_roles(admin_token: str = Query(...)):
    """Get available roles and permissions."""
    await get_admin_id_from_token(admin_token)
    return {"roles": {k: v for k, v in ROLES.items()}}


@router.get("/enterprise-check")
async def enterprise_check(admin_token: str = Query(...)):
    """Check if current admin has enterprise plan and team management access."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password": 0, "password_hash": 0})
    if not admin:
        return {"has_enterprise": False, "is_super_admin": False}
    is_super = admin.get("is_super_admin", False)
    has_enterprise = await check_enterprise_plan(admin_id)
    # Team members whose superuser has enterprise also count
    if not has_enterprise and admin.get("enterprise_id"):
        has_enterprise = await check_enterprise_plan(admin.get("enterprise_id"))
    return {
        "has_enterprise": has_enterprise or is_super,
        "is_super_admin": is_super,
        "enterprise_id": admin.get("enterprise_id") or admin_id,
        "role": admin.get("role", "viewer"),
        "permissions": admin.get("permissions", []),
    }


@router.post("/members")
async def add_team_member(admin_token: str = Query(...), data: dict = Body(...)):
    """Add a new team member (sub-admin). Enterprise plan required."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "role_permissions")
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

    enterprise_id = admin.get("enterprise_id") or admin_id

    member = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hash_password(password),
        "role": role,
        "is_super_admin": False,
        "permissions": ROLES[role]["permissions"],
        "first_name": data.get("first_name", ""),
        "last_name": data.get("last_name", ""),
        "email": data.get("email", ""),
        "is_active": True,
        "enterprise_id": enterprise_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": admin_id,
        "credits": 0,
    }
    await db.admins.insert_one(member)
    safe = {k: v for k, v in member.items() if k not in ("_id", "password_hash")}
    return safe


@router.get("/members")
async def list_team_members(admin_token: str = Query(...)):
    """List all team members in the enterprise."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        return JSONResponse(status_code=404, content={"error": "Admin not found"})

    enterprise_id = admin.get("enterprise_id") or admin_id
    query = {"$or": [{"enterprise_id": enterprise_id}, {"id": enterprise_id}]}
    members = await db.admins.find(query, {"_id": 0, "password_hash": 0, "password": 0}).sort("created_at", -1).to_list(100)
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
        updates["password_hash"] = hash_password(data["password"])

    if updates:
        await db.admins.update_one({"id": member_id}, {"$set": updates})

    member = await db.admins.find_one({"id": member_id}, {"_id": 0, "password_hash": 0})
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
