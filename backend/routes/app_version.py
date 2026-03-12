"""App version management endpoints."""
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/api/app-version", tags=["app-version"])

client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
db = client[os.environ.get("DB_NAME")]

COLLECTION = "app_versions"


def _parse_version(v: str):
    """Parse a version string like '1.2.3' into a tuple of ints for comparison."""
    try:
        return tuple(int(x) for x in v.strip().split("."))
    except (ValueError, AttributeError):
        return (0, 0, 0)


async def _ensure_defaults():
    """Seed default version entries if they don't exist."""
    for app_type in ("admin", "client"):
        exists = await db[COLLECTION].find_one({"app_type": app_type})
        if not exists:
            await db[COLLECTION].insert_one({
                "app_type": app_type,
                "latest_version": "1.0.0",
                "version_code": 1,
                "min_version": "1.0.0",
                "download_url": "",
                "release_notes": "",
                "force_update": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })


@router.get("/check")
async def check_version(
    app_type: str = Query(..., description="admin or client"),
    current_version: str = Query("1.0.0"),
    current_code: int = Query(1),
):
    """Check if app update is available."""
    await _ensure_defaults()

    record = await db[COLLECTION].find_one({"app_type": app_type}, {"_id": 0})
    if not record:
        return {"update_available": False}

    latest_code = record.get("version_code", 1)
    latest_version = record.get("latest_version", "1.0.0")

    # Check both version code AND version string — either being newer triggers update
    code_newer = current_code < latest_code
    version_newer = _parse_version(current_version) < _parse_version(latest_version)
    update_available = code_newer or version_newer

    return {
        "update_available": update_available,
        "latest_version": latest_version,
        "latest_version_code": latest_code,
        "download_url": record.get("download_url", ""),
        "release_notes": record.get("release_notes", ""),
        "force_update": record.get("force_update", False) if update_available else False,
    }


@router.put("/set")
async def set_version(
    admin_token: str = Query(...),
    app_type: str = Query(..., description="admin or client"),
    latest_version: str = Query(...),
    version_code: int = Query(...),
    download_url: str = Query(""),
    release_notes: str = Query(""),
    force_update: bool = Query(False),
):
    """Set latest version info (superadmin only)."""
    from routes.admin import get_admin_id_from_token
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id})
    if not admin or not admin.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")

    await _ensure_defaults()

    await db[COLLECTION].update_one(
        {"app_type": app_type},
        {"$set": {
            "latest_version": latest_version,
            "version_code": version_code,
            "download_url": download_url,
            "release_notes": release_notes,
            "force_update": force_update,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"status": "updated", "app_type": app_type, "version": latest_version, "code": version_code}


@router.get("/list")
async def list_versions(admin_token: str = Query(...)):
    """List all app version configs."""
    from routes.admin import get_admin_id_from_token
    await get_admin_id_from_token(admin_token)
    await _ensure_defaults()

    records = await db[COLLECTION].find({}, {"_id": 0}).to_list(10)
    return records
