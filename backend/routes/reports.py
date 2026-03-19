"""Reports routes - analytics, collection reports, financial reports."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta, timezone
from typing import Optional
import logging

from database import db
from utils.auth import get_admin_id_from_token
from utils.plan_gating import check_plan_access

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


async def _get_enterprise_client_query(admin_id: str) -> dict:
    """Build a client query scoped to enterprise for superusers, or own data for team members."""
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        return {"admin_id": admin_id, "is_deleted": {"$ne": True}}
    if admin.get("is_super_admin"):
        enterprise_id = admin.get("enterprise_id") or admin_id
        members = await db.admins.find({"enterprise_id": enterprise_id}, {"_id": 0, "id": 1}).to_list(100)
        member_ids = [m["id"] for m in members]
        if admin_id not in member_ids:
            member_ids.append(admin_id)
        return {"admin_id": {"$in": member_ids}, "is_deleted": {"$ne": True}}
    return {"admin_id": admin_id, "is_deleted": {"$ne": True}}


def calculate_interest_total(client: dict) -> float:
    loan_amount = client.get("loan_amount", 0) or 0
    total_due = client.get("total_amount_due", 0) or 0

    # If total_amount_due is properly set and higher than loan_amount, use the difference
    if total_due > 0 and total_due > loan_amount:
        return round(total_due - loan_amount, 2)

    # Fallback: calculate from interest_rate (applied once to principal, not monthly)
    rate = client.get("interest_rate", 0) or 0
    if loan_amount > 0 and rate > 0:
        return round(loan_amount * rate / 100, 2)

    return 0


@router.get("/heartbeat/summary")
async def get_heartbeat_summary(
    admin_token: str = Query(...),
    filter_admin_id: Optional[str] = Query(default=None)
):
    """Get heartbeat monitoring summary with severity breakdown. Superadmins can filter by admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "heartbeat")
    
    # Check if requester is superadmin for filtering capability
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Determine which admin's data to fetch
    target_admin_id = admin_id
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            target_admin_id = None
        else:
            target_admin_id = filter_admin_id
    
    # Use timezone-aware UTC datetime to avoid mismatch with MongoDB's timezone-aware dates
    now = datetime.now(timezone.utc)
    query = {"is_registered": True, "is_deleted": {"$ne": True}}
    if target_admin_id:
        query["admin_id"] = target_admin_id
    
    clients = await db.clients.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "device_model": 1, "last_heartbeat": 1, "is_locked": 1, "uninstall_allowed": 1}
    ).to_list(1000)
    
    online = []
    warning = []
    critical = []
    never_reported = []
    
    for client in clients:
        hb = client.get("last_heartbeat")
        entry = {
            "id": client["id"],
            "client_id": client["id"],  # Add client_id for frontend compatibility
            "name": client.get("name", "Unknown"),
            "device_model": client.get("device_model", "Unknown"),
            "is_locked": client.get("is_locked", False),
            "uninstall_allowed": client.get("uninstall_allowed", False),
            "last_heartbeat": hb.isoformat() if hb else None,
        }
        
        if not hb:
            entry["severity"] = "critical"
            entry["minutes_ago"] = None
            never_reported.append(entry)
        else:
            # Handle both timezone-aware and naive datetimes from MongoDB
            if hb.tzinfo is None:
                # Naive datetime - assume it's UTC
                hb = hb.replace(tzinfo=timezone.utc)
            minutes_ago = (now - hb).total_seconds() / 60
            entry["minutes_ago"] = round(minutes_ago)
            
            if minutes_ago <= 30:
                entry["severity"] = "online"
                online.append(entry)
            elif minutes_ago <= 120:
                entry["severity"] = "warning"
                warning.append(entry)
            else:
                entry["severity"] = "critical"
                critical.append(entry)
    
    all_critical = critical + never_reported

    return {
        "total_registered": len(clients),
        "online_count": len(online),
        "warning_count": len(warning),
        "critical_count": len(all_critical),
        "online": online,
        "warning": warning,
        "critical": all_critical,
        "thresholds": {
            "online_minutes": 30,
            "warning_minutes": 120,
        }
    }


@router.get("/reports/collection")
async def get_collection_report(
    admin_token: str = Query(...),
    filter_admin_id: Optional[str] = Query(default=None)
):
    """Get collection report for an admin. Superadmins can filter by specific admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    target_admin_id = admin_id
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            target_admin_id = None
        else:
            target_admin_id = filter_admin_id
    
    query = {"admin_id": target_admin_id, "is_deleted": {"$ne": True}} if target_admin_id else {"is_deleted": {"$ne": True}}
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "loan_amount": 1, "total_paid": 1, "outstanding_balance": 1, "late_fees_accumulated": 1, "days_overdue": 1, "is_deleted": 1, "created_at": 1}).to_list(1000)
    
    client_ids = [c["id"] for c in clients]
    
    # Fetch all active loans from loans collection for accurate stats
    all_loans = await db.loans.find(
        {"client_id": {"$in": client_ids}, "status": "active"},
        {"_id": 0, "loan_amount": 1, "total_paid": 1, "outstanding_balance": 1, "due_date": 1, "given_date": 1, "interest_rate": 1, "tenure_months": 1, "client_id": 1}
    ).to_list(10000) if client_ids else []
    
    # Also get archived loans from paid_loans for complete financial picture
    archived_loans = await db.paid_loans.find(
        {"admin_id": target_admin_id} if target_admin_id else {},
        {"_id": 0, "loan_amount": 1, "total_paid": 1, "total_interest": 1}
    ).to_list(10000)
    
    # Calculate stats from loans collection (source of truth)
    now = datetime.now(timezone.utc)
    active_disbursed = sum(l.get("loan_amount", 0) for l in all_loans)
    active_collected = sum(l.get("total_paid", 0) or 0 for l in all_loans)
    archived_disbursed = sum(pl.get("loan_amount", 0) for pl in archived_loans)
    archived_collected = sum(pl.get("total_paid", 0) for pl in archived_loans)
    
    total_disbursed = active_disbursed + archived_disbursed
    total_collected = active_collected + archived_collected
    
    # Calculate outstanding dynamically using the due_today formula
    total_outstanding = 0
    overdue_client_ids = set()
    for l in all_loans:
        principal = l.get("loan_amount", 0)
        rate = l.get("interest_rate", 0)
        tenure = l.get("tenure_months", 1) or 1
        already_paid = l.get("total_paid", 0) or 0
        has_given = bool(l.get("given_date"))
        
        days_overdue = 0
        days_until_due = 0
        due = l.get("due_date")
        if due:
            try:
                if isinstance(due, str):
                    due_dt = datetime.fromisoformat(due.replace('Z', '+00:00'))
                else:
                    due_dt = due
                if hasattr(due_dt, 'tzinfo') and due_dt.tzinfo is None:
                    due_dt = due_dt.replace(tzinfo=timezone.utc)
                diff = (due_dt.date() - now.date()).days if hasattr(due_dt, 'date') else (due_dt - now).days
                if diff < 0:
                    days_overdue = abs(diff)
                else:
                    days_until_due = diff
            except (ValueError, TypeError):
                pass
        
        if has_given:
            base_interest = principal * (rate / 100) * tenure
            base_total = principal + base_interest
            daily_interest = principal * (rate / 100) / 30 if rate > 0 else 0
            if days_overdue > 0:
                loan_outstanding = max(0, base_total + (daily_interest * days_overdue) - already_paid)
            elif days_until_due <= 2:
                loan_outstanding = max(0, base_total - already_paid)
            else:
                loan_outstanding = max(0, base_total - ((days_until_due - 2) * daily_interest) - already_paid)
        else:
            loan_outstanding = l.get("outstanding_balance", 0) or max(0, principal - already_paid)
        
        total_outstanding += loan_outstanding
        if days_overdue > 0:
            overdue_client_ids.add(l.get("client_id"))
    
    total_late_fees = 0  # Late fees are included in outstanding
    
    active_loans = len(all_loans)
    completed_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) <= 0 and c.get("loan_amount", 0) > 0)
    overdue_clients = len(overdue_client_ids)
    
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0

    # This month payments and new loans
    now = datetime.utcnow()
    first_of_month = datetime(now.year, now.month, 1)
    client_ids = [c["id"] for c in clients]
    this_month_payments = await db.payments.find(
        {"client_id": {"$in": client_ids}, "payment_date": {"$gte": first_of_month}},
        {"_id": 0, "amount": 1}
    ).to_list(10000)
    this_month_collected = sum(p.get("amount", 0) for p in this_month_payments)
    
    # Count new loans this month (clients created this month with loan_amount > 0)
    new_loans_this_month = sum(
        1 for c in clients 
        if c.get("loan_amount", 0) > 0 and c.get("created_at") and c["created_at"] >= first_of_month
    )
    
    return {
        "overview": {
            "total_clients": len(clients),
            "active_loans": active_loans,
            "completed_loans": completed_loans,
            "overdue_clients": overdue_clients,
        },
        "financial": {
            "total_disbursed": round(total_disbursed, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "total_late_fees": round(total_late_fees, 2),
            "collection_rate": round(collection_rate, 2),
        },
        "this_month": {
            "total_collected": round(this_month_collected, 2),
            "number_of_payments": len(this_month_payments),
            "new_loans": new_loans_this_month,
        },
        # Keep flat fields for backward compat
        "total_disbursed": round(total_disbursed, 2),
        "total_collected": round(total_collected, 2),
        "total_outstanding": round(total_outstanding, 2),
        "collection_rate": round(collection_rate, 2),
        "active_loans": active_loans,
        "completed_loans": completed_loans,
        "overdue_loans": overdue_clients,
        "total_clients": len(clients),
    }


@router.get("/reports/clients")
async def get_clients_report(admin_token: str = Query(...)):
    """Get detailed clients report with summary and details."""
    admin_id = await get_admin_id_from_token(admin_token)
    clients = await db.clients.find(
        {"admin_id": admin_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "registration_code": 0}
    ).to_list(1000)

    now = datetime.utcnow()
    first_of_month = datetime(now.year, now.month, 1)

    # Repeat customers = clients who currently have an active loan AND completed at least one before
    active_client_ids = {c["id"] for c in clients}
    paid_loan_client_ids = set()
    async for pl in db.paid_loans.find({"admin_id": admin_id}, {"_id": 0, "client_id": 1}):
        if pl.get("client_id"):
            paid_loan_client_ids.add(pl["client_id"])
    repeat_client_ids = active_client_ids & paid_loan_client_ids

    on_time_list = []
    at_risk_list = []
    defaulted_list = []
    completed_list = []
    new_this_month = 0

    for client in clients:
        days_overdue = client.get("days_overdue", 0) or 0
        loan_amount = client.get("loan_amount", 0) or 0
        outstanding = client.get("outstanding_balance", 0) or 0
        total_paid = client.get("total_paid", 0) or 0

        row = {
            "id": client["id"],
            "name": client["name"],
            "phone": client.get("phone", ""),
            "loan_amount": loan_amount,
            "total_paid": total_paid,
            "outstanding_balance": outstanding,
            "days_overdue": days_overdue,
            "is_locked": client.get("is_locked", False),
        }

        created_at = client.get("created_at")
        if created_at and created_at >= first_of_month:
            new_this_month += 1

        if outstanding <= 0 and loan_amount > 0:
            completed_list.append(row)
        elif days_overdue > 7:
            defaulted_list.append(row)
        elif days_overdue > 0:
            at_risk_list.append(row)
        elif loan_amount > 0:
            on_time_list.append(row)

    return {
        "summary": {
            "on_time_clients": len(on_time_list),
            "at_risk_clients": len(at_risk_list),
            "defaulted_clients": len(defaulted_list),
            "completed_clients": len(completed_list),
            "new_clients_this_month": new_this_month,
            "repeat_customers": len(repeat_client_ids),
            "total_clients": len(clients),
        },
        "details": {
            "on_time": on_time_list,
            "at_risk": at_risk_list,
            "defaulted": defaulted_list,
            "completed": completed_list,
        }
    }


@router.get("/reports/financial")
async def get_financial_report(
    admin_token: str = Query(...),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None)
):
    """Get financial report. Enterprise superusers see all enterprise data."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    is_super = admin.get("is_super_admin", False) if admin else False
    
    # Use enterprise scoping
    query = await _get_enterprise_client_query(admin_id)
    
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "loan_amount": 1, "total_paid": 1, "outstanding_balance": 1, "late_fees_accumulated": 1, "processing_fee": 1, "interest_rate": 1, "total_amount_due": 1}).to_list(1000)
    
    # Get all payments
    payment_query = {}
    client_ids = [c["id"] for c in clients]
    payment_query["client_id"] = {"$in": client_ids}

    start = None
    end = None
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
        except ValueError:
            start = None

    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
        except ValueError:
            end = None

    payments_all = await db.payments.find(payment_query, {"_id": 0, "client_id": 1, "amount": 1, "payment_date": 1, "payment_method": 1}).to_list(10000)

    def in_range(payment):
        payment_date = payment.get("payment_date")
        if not payment_date:
            return False
        if start and payment_date < start:
            return False
        if end and payment_date > end:
            return False
        return True

    payments = [p for p in payments_all if in_range(p)]

    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)

    # Interest allocation setup
    if is_super:
        enterprise_id = admin.get("enterprise_id") or admin_id
        members = await db.admins.find({"enterprise_id": enterprise_id}, {"_id": 0, "id": 1}).to_list(100)
        member_ids = [m["id"] for m in members]
        if admin_id not in member_ids:
            member_ids.append(admin_id)
        paid_loans = await db.paid_loans.find(
            {"admin_id": {"$in": member_ids}},
            {"_id": 0, "client_id": 1, "total_interest": 1, "archived_at": 1}
        ).to_list(10000)
    else:
        paid_loans = await db.paid_loans.find(
            {"admin_id": admin_id},
            {"_id": 0, "client_id": 1, "total_interest": 1, "archived_at": 1}
        ).to_list(10000)

    paid_loans_map = {}
    for pl in paid_loans:
        client_id = pl.get("client_id")
        if not client_id:
            continue
        current = paid_loans_map.get(client_id)
        if not current:
            paid_loans_map[client_id] = pl
            continue
        current_date = current.get("archived_at") or datetime.min
        pl_date = pl.get("archived_at") or datetime.min
        if pl_date > current_date:
            paid_loans_map[client_id] = pl

    interest_remaining = {}
    for client in clients:
        interest_total = calculate_interest_total(client)
        if interest_total == 0:
            paid = paid_loans_map.get(client.get("id"))
            if paid:
                interest_total = paid.get("total_interest", 0) or 0
        interest_remaining[client.get("id")] = interest_total

    total_payments = 0
    total_interest_earned = 0
    total_principal_collected = 0

    # Group payments by month
    monthly_data = {}
    monthly_interest_map = {}

    payments_sorted = sorted(payments_all, key=lambda p: p.get("payment_date") or datetime.min)
    for payment in payments_sorted:
        amount = payment.get("amount", 0)
        client_id = payment.get("client_id")
        remaining_interest = interest_remaining.get(client_id, 0)
        interest_component = min(remaining_interest, amount)
        principal_component = amount - interest_component
        if client_id in interest_remaining:
            interest_remaining[client_id] = max(remaining_interest - interest_component, 0)

        if not in_range(payment):
            continue

        total_payments += amount
        total_interest_earned += interest_component
        total_principal_collected += principal_component

        month_name = payment["payment_date"].strftime("%B %Y")
        month_key = payment["payment_date"].strftime("%Y-%m")
        if month_name not in monthly_data:
            monthly_data[month_name] = {
                "revenue": 0,
                "count": 0,
                "interest_earned": 0,
                "principal_collected": 0,
                "month_key": month_key,
            }
        monthly_data[month_name]["revenue"] += amount
        monthly_data[month_name]["count"] += 1
        monthly_data[month_name]["interest_earned"] += interest_component
        monthly_data[month_name]["principal_collected"] += principal_component
        monthly_interest_map[month_key] = monthly_interest_map.get(month_key, 0) + interest_component

    # Build monthly trend array
    monthly_trend = []
    for month_name, data in sorted(monthly_data.items(), key=lambda x: x[0]):
        monthly_trend.append({
            "month": month_name,
            "revenue": round(data["revenue"], 2),
            "payments_count": data["count"],
            "interest_earned": round(data["interest_earned"], 2),
            "principal_collected": round(data["principal_collected"], 2),
        })

    # Monthly interest for past 6 months
    now = datetime.utcnow()
    monthly_interest_list = []
    for i in range(5, -1, -1):
        month_date = now - timedelta(days=30 * i)
        month_key = month_date.strftime("%Y-%m")
        month_name = month_date.strftime("%B %Y")
        monthly_interest_list.append({
            "month": month_name,
            "interest_earned": round(monthly_interest_map.get(month_key, 0), 2)
        })

    # Calculate disbursed/outstanding from loans collection for active loans
    client_ids_list = [c["id"] for c in clients]
    active_loans = await db.loans.find(
        {"client_id": {"$in": client_ids_list}, "status": "active"},
        {"_id": 0, "loan_amount": 1, "outstanding_balance": 1}
    ).to_list(10000) if client_ids_list else []
    
    # Include archived data from paid_loans by admin_id (consistent with dashboard)
    if is_super:
        enterprise_id = admin.get("enterprise_id") or admin_id
        members = await db.admins.find({"enterprise_id": enterprise_id}, {"_id": 0, "id": 1}).to_list(100)
        member_ids = [m["id"] for m in members]
        if admin_id not in member_ids:
            member_ids.append(admin_id)
        archived_paid_query = {"admin_id": {"$in": member_ids}}
    else:
        archived_paid_query = {"admin_id": admin_id}
    
    archived_paid = await db.paid_loans.find(
        archived_paid_query,
        {"_id": 0, "loan_amount": 1, "total_paid": 1}
    ).to_list(10000)
    
    total_disbursed = sum(l.get("loan_amount", 0) for l in active_loans) + sum(pl.get("loan_amount", 0) for pl in archived_paid)
    total_outstanding = sum(l.get("outstanding_balance", 0) for l in active_loans)

    return {
        "total_payments": round(total_payments, 2),
        "total_late_fees": round(total_late_fees, 2),
        "total_processing_fees": round(total_processing_fees, 2),
        "payment_count": len(payments),
        "monthly_breakdown": {k: round(v["revenue"], 2) for k, v in monthly_data.items()},
        "monthly_trend": monthly_trend,
        "monthly_interest": monthly_interest_list,
        "totals": {
            "total_revenue": round(total_payments + total_late_fees + total_processing_fees, 2),
            "interest_earned": round(total_interest_earned, 2),
            "principal_disbursed": round(total_disbursed, 2),
            "principal_collected": round(total_principal_collected, 2),
            "processing_fees": round(total_processing_fees, 2),
            "late_fees": round(total_late_fees, 2),
            "total_disbursed": round(total_disbursed, 2),
            "total_outstanding": round(total_outstanding, 2),
        }
    }


@router.get("/stats")
async def get_stats(admin_id: str = Query(default=None), admin_token: str = Query(default=None)):
    """Get general statistics with device breakdown."""
    if admin_token:
        token_admin_id = await get_admin_id_from_token(admin_token)
        base_query = await _get_enterprise_client_query(token_admin_id)
    elif admin_id:
        base_query = {"admin_id": admin_id, "is_deleted": {"$ne": True}}
    else:
        base_query = {"is_deleted": {"$ne": True}}
    
    total_clients = await db.clients.count_documents(base_query)
    registered_clients = await db.clients.count_documents({**base_query, "is_registered": True})
    locked_clients = await db.clients.count_documents({**base_query, "is_locked": True})
    unlocked_registered = await db.clients.count_documents({**base_query, "is_registered": True, "is_locked": False})
    
    # Count actual active loans via client_ids (consistent with reports/collection)
    client_ids = [c["id"] async for c in db.clients.find(base_query, {"_id": 0, "id": 1})]
    active_loans = await db.loans.count_documents({"client_id": {"$in": client_ids}, "status": "active"}) if client_ids else 0
    
    return {
        "total_clients": total_clients,
        "registered_devices": registered_clients,
        "locked_devices": locked_clients,
        "unlocked_devices": unlocked_registered,
        "unregistered_clients": total_clients - registered_clients,
        "active_loans": active_loans,
    }


@router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    admin_token: str = Query(...),
    filter_admin_id: Optional[str] = Query(default=None)
):
    """Get comprehensive dashboard analytics. Each admin sees only their own data by default."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "dashboard_analytics")
    
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Dashboard always shows own data unless explicitly filtered
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            query = await _get_enterprise_client_query(admin_id)
        else:
            query = {"admin_id": filter_admin_id, "is_deleted": {"$ne": True}}
    else:
        # Default: always show only own clients
        query = {"admin_id": admin_id, "is_deleted": {"$ne": True}}
    
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "is_registered": 1, "is_locked": 1, "outstanding_balance": 1, "days_overdue": 1, "loan_amount": 1, "total_paid": 1, "registered_at": 1, "last_tamper_attempt": 1, "device_model": 1, "interest_rate": 1}).to_list(1000)
    
    # Overview metrics - use loans collection for accurate counts
    total_clients = len(clients)
    registered = sum(1 for c in clients if c.get("is_registered"))
    locked = sum(1 for c in clients if c.get("is_locked"))
    
    # Calculate active loans and overdue from loans collection
    client_ids = [c["id"] for c in clients]
    all_active_loans = await db.loans.find(
        {"client_id": {"$in": client_ids}, "status": "active"},
        {"_id": 0, "loan_amount": 1, "total_paid": 1, "due_date": 1, "given_date": 1, "interest_rate": 1, "tenure_months": 1, "client_id": 1, "outstanding_balance": 1}
    ).to_list(10000) if client_ids else []
    
    now_utc = datetime.now(timezone.utc) if hasattr(timezone, 'utc') else datetime.utcnow()
    active_loans = len(all_active_loans)
    overdue_client_ids = set()
    for loan in all_active_loans:
        due = loan.get("due_date")
        if due:
            try:
                if isinstance(due, str):
                    due_dt = datetime.fromisoformat(due.replace('Z', '+00:00'))
                else:
                    due_dt = due
                if hasattr(due_dt, 'tzinfo') and due_dt.tzinfo is None:
                    due_dt = due_dt.replace(tzinfo=timezone.utc)
                if (now_utc.date() - due_dt.date()).days > 0:
                    overdue_client_ids.add(loan.get("client_id"))
            except (ValueError, TypeError):
                pass
    overdue = len(overdue_client_ids)
    
    # Build admin_id scope for paid_loans query (match client query scope)
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            enterprise_id = admin.get("enterprise_id") or admin_id
            members = await db.admins.find({"enterprise_id": enterprise_id}, {"_id": 0, "id": 1}).to_list(100)
            member_ids = [m["id"] for m in members]
            if admin_id not in member_ids:
                member_ids.append(admin_id)
            paid_loans_query = {"admin_id": {"$in": member_ids}}
        else:
            paid_loans_query = {"admin_id": filter_admin_id}
    else:
        # Default: own data only
        paid_loans_query = {"admin_id": admin_id}
    
    # Get all paid/archived loans for revenue and interest calculations
    all_paid_loans = await db.paid_loans.find(
        paid_loans_query,
        {"_id": 0, "client_id": 1, "total_paid": 1, "total_interest": 1, "loan_amount": 1, "archived_at": 1, "payments_history": 1}
    ).to_list(10000)
    
    # Financial summary: combine active loans data + archived data
    # Active loans - calculate from loans collection
    active_disbursed = sum(l.get("loan_amount", 0) for l in all_active_loans)
    active_collected = sum(l.get("total_paid", 0) or 0 for l in all_active_loans)
    
    # Archived loans from paid_loans
    archived_disbursed = sum(pl.get("loan_amount", 0) for pl in all_paid_loans)
    archived_collected = sum(pl.get("total_paid", 0) for pl in all_paid_loans)
    
    total_disbursed = active_disbursed + archived_disbursed
    total_collected = active_collected + archived_collected
    
    # Calculate total outstanding dynamically from active loans
    total_outstanding_calc = 0
    for loan in all_active_loans:
        principal = loan.get("loan_amount", 0)
        rate = loan.get("interest_rate", 0)
        tenure = loan.get("tenure_months", 1) or 1
        already_paid = loan.get("total_paid", 0) or 0
        has_given = bool(loan.get("given_date"))
        
        if has_given:
            base_total = principal + principal * (rate / 100) * tenure
            daily_interest = principal * (rate / 100) / 30 if rate > 0 else 0
            due = loan.get("due_date")
            days_overdue = 0
            days_until_due = 0
            if due:
                try:
                    if isinstance(due, str):
                        due_dt = datetime.fromisoformat(due.replace('Z', '+00:00'))
                    else:
                        due_dt = due
                    if hasattr(due_dt, 'tzinfo') and due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                    diff = (due_dt.date() - now_utc.date()).days if hasattr(due_dt, 'date') else (due_dt - now_utc).days
                    if diff < 0:
                        days_overdue = abs(diff)
                    else:
                        days_until_due = diff
                except (ValueError, TypeError):
                    pass
            
            if days_overdue > 0:
                loan_outstanding = max(0, base_total + daily_interest * days_overdue - already_paid)
            elif days_until_due <= 2:
                loan_outstanding = max(0, base_total - already_paid)
            else:
                loan_outstanding = max(0, base_total - (days_until_due - 2) * daily_interest - already_paid)
        else:
            loan_outstanding = loan.get("outstanding_balance", 0) or max(0, principal - already_paid)
        
        total_outstanding_calc += loan_outstanding
    
    total_outstanding = total_outstanding_calc
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0
    
    # Recent activity (last 7 days)
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_registrations = sum(
        1 for c in clients 
        if c.get("registered_at") and c["registered_at"] > week_ago
    )
    recent_tamper_attempts = sum(
        1 for c in clients 
        if c.get("last_tamper_attempt") and c["last_tamper_attempt"] > week_ago
    )
    
    now = datetime.utcnow()
    six_months_ago = now - timedelta(days=180)
    
    # Monthly revenue from active client payments
    client_ids = [c["id"] for c in clients]
    payments_all = await db.payments.find({
        "client_id": {"$in": client_ids}
    }).to_list(10000)

    monthly_revenue = {}
    for payment in payments_all:
        payment_date = payment.get("payment_date")
        if not payment_date or payment_date < six_months_ago:
            continue
        month_key = payment_date.strftime("%Y-%m")
        monthly_revenue[month_key] = monthly_revenue.get(month_key, 0) + payment.get("amount", 0)

    # Also add revenue from archived loans (from their payment history)
    for pl in all_paid_loans:
        for ph in (pl.get("payments_history") or []):
            pd_str = ph.get("payment_date", "")
            if not pd_str:
                continue
            try:
                pd_dt = datetime.fromisoformat(str(pd_str)) if isinstance(pd_str, str) else pd_str
            except (ValueError, TypeError):
                continue
            if pd_dt >= six_months_ago:
                month_key = pd_dt.strftime("%Y-%m")
                monthly_revenue[month_key] = monthly_revenue.get(month_key, 0) + (ph.get("amount", 0) or 0)

    # Monthly interest: calculate from paid_loans (accurate) + archived loans from loans collection + active loan interest
    monthly_interest = {}
    
    # Track paid_loan loan_ids to avoid double counting
    paid_loan_ids = set(pl.get("loan_id") for pl in all_paid_loans if pl.get("loan_id"))
    
    # Interest from paid_loans (archived via paid_loans collection)
    for pl in all_paid_loans:
        interest = pl.get("total_interest", 0) or 0
        if interest <= 0:
            continue
        archived_at = pl.get("archived_at") or pl.get("paid_date")
        if not archived_at or not isinstance(archived_at, datetime):
            continue
        if archived_at >= six_months_ago:
            month_key = archived_at.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest
    
    # Interest from archived loans in the loans collection (not in paid_loans)
    archived_loans_in_db = await db.loans.find(
        {"client_id": {"$in": client_ids}, "status": "archived"},
        {"_id": 0, "id": 1, "loan_amount": 1, "total_paid": 1, "archived_at": 1}
    ).to_list(10000)
    
    for al in archived_loans_in_db:
        if al.get("id") in paid_loan_ids:
            continue
        principal = al.get("loan_amount", 0)
        paid = al.get("total_paid", 0) or 0
        interest = max(0, paid - principal)
        if interest <= 0:
            continue
        archived_at = al.get("archived_at")
        if isinstance(archived_at, datetime) and archived_at >= six_months_ago:
            month_key = archived_at.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest
    
    # Interest from active loan payments where total_paid > principal
    for loan in all_active_loans:
        principal = loan.get("loan_amount", 0)
        paid = loan.get("total_paid", 0) or 0
        interest_from_loan = max(0, paid - principal)
        if interest_from_loan > 0:
            month_key = now_utc.strftime("%Y-%m") if hasattr(now_utc, 'strftime') else now.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest_from_loan

    # Ensure all 6 months have entries
    for i in range(5, -1, -1):
        month_date = now - timedelta(days=30 * i)
        month_key = month_date.strftime("%Y-%m")
        monthly_revenue.setdefault(month_key, 0)
        monthly_interest.setdefault(month_key, 0)

    # Round values
    monthly_revenue = {k: round(v, 2) for k, v in monthly_revenue.items()}
    monthly_interest = {k: round(v, 2) for k, v in monthly_interest.items()}

    # Activity log
    activity_log = []
    for client in sorted(clients, key=lambda x: x.get("registered_at") or datetime.min, reverse=True)[:10]:
        if client.get("registered_at"):
            activity_log.append({
                "type": "registration",
                "client_name": client["name"],
                "timestamp": client["registered_at"].isoformat(),
                "details": f"Device registered: {client.get('device_model', 'Unknown')}"
            })
    
    return {
        "overview": {
            "total_clients": total_clients,
            "registered": registered,
            "locked": locked,
            "active_loans": active_loans,
            "overdue": overdue
        },
        "financial": {
            "total_disbursed": round(total_disbursed, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "collection_rate": round(collection_rate, 2)
        },
        "recent_activity": {
            "registrations_7d": recent_registrations,
            "tamper_attempts_7d": recent_tamper_attempts
        },
        "monthly_revenue": monthly_revenue,
        "monthly_interest": monthly_interest,
        "activity_log": activity_log
    }
