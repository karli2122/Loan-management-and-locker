"""Analytics routes - collection trends, risk history, portfolio health, comparative."""
from fastapi import APIRouter, Query
from datetime import datetime, timezone, timedelta
import logging

from database import db
from utils.auth import get_admin_id_from_token
from utils.plan_gating import check_plan_access
from routes.reports import _get_enterprise_client_query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/collection-trends")
async def get_collection_trends(
    admin_token: str = Query(...),
    period: str = Query(default="monthly", regex="^(weekly|monthly)$"),
    months: int = Query(default=6, le=24),
):
    """Collection efficiency trends - weekly or monthly aggregated."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "collection_trends")
    base_query = await _get_enterprise_client_query(admin_id)
    
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=months * 30)
    
    # Get all payments in the period
    client_ids = [c["id"] for c in await db.clients.find(base_query, {"_id": 0, "id": 1}).to_list(1000)]
    
    payments = await db.payments.find(
        {"client_id": {"$in": client_ids}, "created_at": {"$gte": start_date}},
        {"_id": 0, "amount": 1, "created_at": 1, "status": 1}
    ).to_list(10000)
    
    # Also get from paid_loans for historical data
    paid_payments = await db.paid_loans.find(
        {"client_id": {"$in": client_ids}},
        {"_id": 0, "total_paid": 1, "loan_amount": 1, "paid_date": 1, "created_at": 1}
    ).to_list(5000)
    
    # Build time buckets
    buckets = {}
    if period == "weekly":
        for i in range(months * 4):
            bucket_start = now - timedelta(weeks=i + 1)
            bucket_end = now - timedelta(weeks=i)
            key = bucket_start.strftime("%Y-W%W")
            buckets[key] = {"start": bucket_start.strftime("%Y-%m-%d"), "end": bucket_end.strftime("%Y-%m-%d"), "collected": 0, "expected": 0, "count": 0}
    else:
        for i in range(months):
            dt = now - timedelta(days=i * 30)
            key = dt.strftime("%Y-%m")
            buckets[key] = {"month": key, "collected": 0, "expected": 0, "count": 0}
    
    # Aggregate payments into buckets
    for p in payments:
        created = p.get("created_at")
        if not created:
            continue
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            except ValueError:
                continue
        
        if period == "weekly":
            key = created.strftime("%Y-W%W")
        else:
            key = created.strftime("%Y-%m")
        
        if key in buckets:
            buckets[key]["collected"] += p.get("amount", 0)
            buckets[key]["count"] += 1
    
    # Calculate expected amounts per period
    clients = await db.clients.find(
        {**base_query, "outstanding_balance": {"$gt": 0}},
        {"_id": 0, "monthly_emi": 1}
    ).to_list(1000)
    
    total_monthly_expected = sum(c.get("monthly_emi", 0) for c in clients)
    for key in buckets:
        if period == "weekly":
            buckets[key]["expected"] = round(total_monthly_expected / 4, 2)
        else:
            buckets[key]["expected"] = round(total_monthly_expected, 2)
        buckets[key]["collected"] = round(buckets[key]["collected"], 2)
        if buckets[key]["expected"] > 0:
            buckets[key]["efficiency"] = round(buckets[key]["collected"] / buckets[key]["expected"] * 100, 1)
        else:
            buckets[key]["efficiency"] = 0
    
    sorted_data = sorted(buckets.values(), key=lambda x: x.get("month", x.get("start", "")))
    
    return {"period": period, "data": sorted_data, "total_periods": len(sorted_data)}


@router.get("/risk-score-history")
async def get_risk_score_history(
    client_id: str = Query(...),
    admin_token: str = Query(...),
):
    """Track risk score changes over the loan lifecycle for a specific client."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "risk_score_tracking")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    
    # Get risk score history from dedicated collection
    history = await db.risk_score_history.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    for entry in history:
        if isinstance(entry.get("created_at"), datetime):
            entry["created_at"] = entry["created_at"].isoformat()
    
    # Also get current score
    current = await db.credit_scores.find_one({"client_id": client_id}, {"_id": 0, "score": 1, "risk_level": 1})
    
    return {
        "client_id": client_id,
        "client_name": client.get("name", ""),
        "current_score": current.get("score") if current else None,
        "current_risk_level": current.get("risk_level") if current else None,
        "history": history,
        "total_entries": len(history),
    }


@router.get("/portfolio-health")
async def get_portfolio_health(admin_token: str = Query(...)):
    """Loan portfolio health - NPAs, aging analysis, risk distribution."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "portfolio_health")
    base_query = await _get_enterprise_client_query(admin_id)
    
    # Get client IDs for scoping
    client_ids = [c["id"] async for c in db.clients.find(base_query, {"_id": 0, "id": 1})]
    
    # Get all active loans from loans collection (source of truth)
    active_loans = await db.loans.find(
        {"client_id": {"$in": client_ids}, "status": "active"},
        {"_id": 0, "client_id": 1, "loan_amount": 1, "outstanding_balance": 1,
         "total_paid": 1, "due_date": 1, "given_date": 1, "interest_rate": 1, "tenure_months": 1}
    ).to_list(10000) if client_ids else []
    
    # Get client names for NPA list
    client_names = {}
    if active_loans:
        loan_client_ids = list(set(l.get("client_id") for l in active_loans))
        clients_info = await db.clients.find(
            {"id": {"$in": loan_client_ids}},
            {"_id": 0, "id": 1, "name": 1, "is_locked": 1}
        ).to_list(1000)
        client_names = {c["id"]: c for c in clients_info}
    
    now = datetime.now(timezone.utc)
    
    # Aging analysis buckets
    aging = {
        "current": {"count": 0, "amount": 0},
        "1_30_days": {"count": 0, "amount": 0},
        "31_60_days": {"count": 0, "amount": 0},
        "61_90_days": {"count": 0, "amount": 0},
        "90_plus_days": {"count": 0, "amount": 0},
    }
    
    total_disbursed = 0
    total_outstanding = 0
    total_collected = 0
    npa_clients = []
    
    for loan in active_loans:
        principal = loan.get("loan_amount", 0)
        paid = loan.get("total_paid", 0) or 0
        outstanding = loan.get("outstanding_balance", 0) or 0
        
        total_disbursed += principal
        total_collected += paid
        
        # Calculate days overdue
        days_overdue = 0
        due = loan.get("due_date")
        if due:
            try:
                if isinstance(due, str):
                    due_dt = datetime.fromisoformat(due.replace('Z', '+00:00'))
                else:
                    due_dt = due
                if hasattr(due_dt, 'tzinfo') and due_dt.tzinfo is None:
                    due_dt = due_dt.replace(tzinfo=timezone.utc)
                diff = (due_dt.date() - now.date()).days
                if diff < 0:
                    days_overdue = abs(diff)
            except (ValueError, TypeError):
                pass
        
        total_outstanding += outstanding
        
        cid = loan.get("client_id", "")
        cinfo = client_names.get(cid, {})
        
        if days_overdue <= 0:
            aging["current"]["count"] += 1
            aging["current"]["amount"] += outstanding
        elif days_overdue <= 30:
            aging["1_30_days"]["count"] += 1
            aging["1_30_days"]["amount"] += outstanding
        elif days_overdue <= 60:
            aging["31_60_days"]["count"] += 1
            aging["31_60_days"]["amount"] += outstanding
        elif days_overdue <= 90:
            aging["61_90_days"]["count"] += 1
            aging["61_90_days"]["amount"] += outstanding
        else:
            aging["90_plus_days"]["count"] += 1
            aging["90_plus_days"]["amount"] += outstanding
            npa_clients.append({"id": cid, "name": cinfo.get("name", ""), "days_overdue": days_overdue, "outstanding": outstanding})
    
    for bucket in aging.values():
        bucket["amount"] = round(bucket["amount"], 2)
    
    npa_amount = aging["90_plus_days"]["amount"]
    npa_ratio = round(npa_amount / total_outstanding * 100, 1) if total_outstanding > 0 else 0
    collection_rate = round(total_collected / total_disbursed * 100, 1) if total_disbursed > 0 else 0
    
    return {
        "total_loans": len(active_loans),
        "total_disbursed": round(total_disbursed, 2),
        "total_outstanding": round(total_outstanding, 2),
        "total_collected": round(total_collected, 2),
        "collection_rate": collection_rate,
        "npa_count": aging["90_plus_days"]["count"],
        "npa_amount": npa_amount,
        "npa_ratio": npa_ratio,
        "aging_analysis": aging,
        "npa_clients": npa_clients[:20],
    }


@router.get("/comparative")
async def get_comparative_analytics(admin_token: str = Query(...)):
    """Performance comparison across team members."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "comparative_analytics")
    
    # Get enterprise members
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "enterprise_id": 1, "is_super_admin": 1})
    if not admin or not admin.get("is_super_admin"):
        # Non-superadmin only sees their own stats
        members = [{"id": admin_id}]
    else:
        enterprise_id = admin.get("enterprise_id") or admin_id
        members = await db.admins.find(
            {"$or": [{"enterprise_id": enterprise_id}, {"id": admin_id}]},
            {"_id": 0, "id": 1, "username": 1, "full_name": 1}
        ).to_list(50)
        if not any(m["id"] == admin_id for m in members):
            members.append({"id": admin_id})
    
    results = []
    for member in members:
        mid = member["id"]
        
        # Get member info
        member_info = await db.admins.find_one({"id": mid}, {"_id": 0, "username": 1, "full_name": 1})
        
        # Count clients
        total_clients = await db.clients.count_documents({"admin_id": mid, "is_deleted": {"$ne": True}})
        
        # Get financial stats
        clients = await db.clients.find(
            {"admin_id": mid, "is_deleted": {"$ne": True}},
            {"_id": 0, "outstanding_balance": 1, "total_paid": 1, "loan_amount": 1, "days_overdue": 1}
        ).to_list(500)
        
        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        overdue_count = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
        collection_rate = round(total_collected / total_disbursed * 100, 1) if total_disbursed > 0 else 0
        
        results.append({
            "admin_id": mid,
            "username": member_info.get("username", "Unknown") if member_info else "Unknown",
            "full_name": member_info.get("full_name", "") if member_info else "",
            "total_clients": total_clients,
            "total_disbursed": round(total_disbursed, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "overdue_clients": overdue_count,
            "collection_rate": collection_rate,
        })
    
    # Sort by collection rate descending
    results.sort(key=lambda x: x["collection_rate"], reverse=True)
    
    return {"team_members": results, "total_members": len(results)}
