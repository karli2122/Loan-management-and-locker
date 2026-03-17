"""Audit logs routes - view and export audit logs."""
from fastapi import APIRouter, Query
from datetime import datetime, timedelta
from typing import Optional
import logging
import csv
import io

from database import db
from utils.auth import get_admin_id_from_token
from utils.exceptions import AuthorizationException
from utils.plan_gating import check_plan_access

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Audit Logs"])


@router.get("/audit-logs")
async def get_audit_logs(
    admin_token: str = Query(...),
    action_type: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    admin_id_filter: Optional[str] = Query(default=None),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0)
):
    """Get audit logs with optional filters. 
    Superadmin/Enterprise users see logs for themselves + enterprise members.
    """
    requester_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(requester_id, "audit_log")
    
    # Check if requester is superadmin
    admin = await db.admins.find_one({"id": requester_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    is_super_admin = is_super_admin or (admin and admin.get("role") in ("super_admin", "superadmin"))
    
    # Get enterprise_id for the requester
    enterprise_id = admin.get("enterprise_id") or requester_id if admin else requester_id
    
    # Get all enterprise members (use enterprise_id to find all related users)
    team_members = await db.admins.find(
        {"$or": [
            {"enterprise_id": enterprise_id},
            {"id": enterprise_id},
            {"created_by": requester_id},
            {"id": requester_id}
        ]},
        {"_id": 0, "id": 1}
    ).to_list(100)
    member_ids = list(set([m["id"] for m in team_members]))
    if requester_id not in member_ids:
        member_ids.append(requester_id)
    
    # Build query - show logs for the user + enterprise members
    query = {"admin_id": {"$in": member_ids}}
    
    # If specific admin filter requested
    if admin_id_filter and admin_id_filter != "all":
        if admin_id_filter in member_ids:  # Only allow filtering to users in their enterprise
            query["admin_id"] = admin_id_filter
    
    if action_type:
        query["action_type"] = action_type
    
    if target_type:
        query["target_type"] = target_type
    
    # Date filters
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query["created_at"] = {"$gte": start}
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if "created_at" in query:
                query["created_at"]["$lte"] = end
            else:
                query["created_at"] = {"$lte": end}
        except ValueError:
            pass
    
    # Get total count for pagination
    total_count = await db.audit_logs.count_documents(query)
    
    # Get logs
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    
    # Format timestamps
    for log in logs:
        if log.get("created_at"):
            log["created_at"] = log["created_at"].isoformat()
    
    return {
        "logs": logs,
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(logs) < total_count
    }


@router.get("/audit-logs/action-types")
async def get_audit_action_types(admin_token: str = Query(...)):
    """Get list of unique action types in the audit log."""
    await get_admin_id_from_token(admin_token)  # Just validate token
    
    action_types = await db.audit_logs.distinct("action_type")
    return {"action_types": sorted(action_types)}


@router.get("/audit-logs/summary")
async def get_audit_summary(
    admin_token: str = Query(...),
    days: int = Query(default=7, le=30)
):
    """Get summary statistics of audit logs for last N days."""
    requester_id = await get_admin_id_from_token(admin_token)
    
    # Check if requester is superadmin
    admin = await db.admins.find_one({"id": requester_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Build date filter
    start_date = datetime.utcnow() - timedelta(days=days)
    query = {"created_at": {"$gte": start_date}}
    
    if not is_super_admin:
        query["admin_id"] = requester_id
    
    # Get action counts
    pipeline = [
        {"$match": query},
        {"$group": {
            "_id": "$action_type",
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    
    action_counts = {}
    async for doc in db.audit_logs.aggregate(pipeline):
        action_counts[doc["_id"]] = doc["count"]
    
    # Get daily activity
    daily_pipeline = [
        {"$match": query},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    daily_activity = {}
    async for doc in db.audit_logs.aggregate(daily_pipeline):
        daily_activity[doc["_id"]] = doc["count"]
    
    # Get most active admins (superadmin only)
    top_admins = []
    if is_super_admin:
        admin_pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$admin_id",
                "username": {"$first": "$admin_username"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        async for doc in db.audit_logs.aggregate(admin_pipeline):
            top_admins.append({
                "admin_id": doc["_id"],
                "username": doc["username"],
                "action_count": doc["count"]
            })
    
    total_actions = await db.audit_logs.count_documents(query)
    
    return {
        "total_actions": total_actions,
        "period_days": days,
        "action_counts": action_counts,
        "daily_activity": daily_activity,
        "top_admins": top_admins
    }


@router.get("/audit-logs/export")
async def export_audit_logs(
    admin_token: str = Query(...),
    format: str = Query(default="json"),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None)
):
    """Export audit logs as JSON or CSV. Superadmin only."""
    requester_id = await get_admin_id_from_token(admin_token)
    
    # Check if requester is superadmin
    admin = await db.admins.find_one({"id": requester_id})
    if not admin or not admin.get("is_super_admin", False):
        raise AuthorizationException("Only superadmins can export audit logs")
    
    # Build query
    query = {}
    
    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query["created_at"] = {"$gte": start}
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if "created_at" in query:
                query["created_at"]["$lte"] = end
            else:
                query["created_at"] = {"$lte": end}
        except ValueError:
            pass
    
    # Get all logs (limit to last 10000)
    logs = await db.audit_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(10000).to_list(10000)
    
    # Format timestamps
    for log in logs:
        if log.get("created_at"):
            log["created_at"] = log["created_at"].isoformat()
    
    if format.lower() == "csv":
        if not logs:
            return {"csv": ""}
        
        output = io.StringIO()
        fieldnames = ["created_at", "admin_username", "action_type", "target_type", "target_id", "target_name", "details", "ip_address"]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for log in logs:
            writer.writerow(log)
        
        return {"csv": output.getvalue(), "total_records": len(logs)}
    
    return {"logs": logs, "total_records": len(logs)}
