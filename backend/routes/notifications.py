"""Notification routes - notifications, mark read."""
from fastapi import APIRouter, Query
from datetime import datetime
import logging

from database import db
from models.schemas import Notification
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Notifications"])


@router.get("/notifications")
async def get_notifications(
    admin_token: str = Query(...),
    limit: int = Query(default=50)
):
    """Get notifications for the authenticated admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    notifications = await db.notifications.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    unread_count = await db.notifications.count_documents({
        "admin_id": admin_id,
        "is_read": False
    })
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


@router.post("/notifications/mark-read")
async def mark_notification_read(notification_id: str = Query(...), admin_token: str = Query(...)):
    """Mark a single notification as read."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    await db.notifications.update_one(
        {"id": notification_id, "admin_id": admin_id},
        {"$set": {"is_read": True}}
    )
    
    return {"message": "Notification marked as read"}


@router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(admin_token: str = Query(...)):
    """Mark all notifications as read for the authenticated admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    result = await db.notifications.update_many(
        {"admin_id": admin_id, "is_read": False},
        {"$set": {"is_read": True}}
    )
    
    return {
        "message": "All notifications marked as read",
        "count": result.modified_count
    }
