"""Reports routes - analytics, collection reports, financial reports."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional
import logging

from database import db
from utils.auth import get_admin_id_from_token

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
    
    now = datetime.utcnow()
    query = {"is_registered": True, "is_deleted": {"$ne": True}}
    if target_admin_id:
        query["admin_id"] = target_admin_id
    
    clients = await db.clients.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "device_model": 1, "last_heartbeat": 1, "is_locked": 1}
    ).to_list(1000)
    
    online = []
    warning = []
    critical = []
    never_reported = []
    
    for client in clients:
        hb = client.get("last_heartbeat")
        entry = {
            "id": client["id"],
            "name": client.get("name", "Unknown"),
            "device_model": client.get("device_model", "Unknown"),
            "is_locked": client.get("is_locked", False),
            "last_heartbeat": hb.isoformat() if hb else None,
        }
        
        if not hb:
            entry["severity"] = "critical"
            entry["minutes_ago"] = None
            never_reported.append(entry)
        else:
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
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "loan_amount": 1, "total_paid": 1, "outstanding_balance": 1, "late_fees_accumulated": 1, "days_overdue": 1, "is_deleted": 1}).to_list(1000)
    
    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    
    active_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
    completed_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) <= 0 and c.get("loan_amount", 0) > 0)
    overdue_clients = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0

    # This month payments
    now = datetime.utcnow()
    first_of_month = datetime(now.year, now.month, 1)
    client_ids = [c["id"] for c in clients]
    this_month_payments = await db.payments.find(
        {"client_id": {"$in": client_ids}, "payment_date": {"$gte": first_of_month}},
        {"_id": 0, "amount": 1}
    ).to_list(10000)
    this_month_collected = sum(p.get("amount", 0) for p in this_month_payments)
    
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

    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)

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
    
    return {
        "total_clients": total_clients,
        "registered_devices": registered_clients,
        "locked_devices": locked_clients,
        "unlocked_devices": unlocked_registered,
        "unregistered_clients": total_clients - registered_clients
    }


@router.get("/analytics/dashboard")
async def get_dashboard_analytics(
    admin_token: str = Query(...),
    filter_admin_id: Optional[str] = Query(default=None)
):
    """Get comprehensive dashboard analytics. Superadmins see enterprise data."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Use enterprise scoping for superadmins
    if is_super_admin and not filter_admin_id:
        query = await _get_enterprise_client_query(admin_id)
    elif filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            query = {"is_deleted": {"$ne": True}}
        else:
            query = {"admin_id": filter_admin_id, "is_deleted": {"$ne": True}}
    else:
        query = {"admin_id": admin_id, "is_deleted": {"$ne": True}}
    
    clients = await db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "is_registered": 1, "is_locked": 1, "outstanding_balance": 1, "days_overdue": 1, "loan_amount": 1, "total_paid": 1, "registered_at": 1, "last_tamper_attempt": 1, "device_model": 1}).to_list(1000)
    
    # Overview metrics
    total_clients = len(clients)
    registered = sum(1 for c in clients if c.get("is_registered"))
    locked = sum(1 for c in clients if c.get("is_locked"))
    active_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
    overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    
    # Build admin_id scope for paid_loans query
    if is_super_admin and not filter_admin_id:
        paid_loans_query = {}
    elif filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            paid_loans_query = {}
        else:
            paid_loans_query = {"admin_id": filter_admin_id}
    else:
        paid_loans_query = {"admin_id": admin_id}
    
    # Get all paid/archived loans for revenue and interest calculations
    all_paid_loans = await db.paid_loans.find(
        paid_loans_query,
        {"_id": 0, "client_id": 1, "total_paid": 1, "total_interest": 1, "loan_amount": 1, "archived_at": 1, "payments_history": 1}
    ).to_list(10000)
    
    # Financial summary: include both active and archived data
    active_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    archived_disbursed = sum(pl.get("loan_amount", 0) for pl in all_paid_loans)
    total_disbursed = active_disbursed + archived_disbursed
    
    active_collected = sum(c.get("total_paid", 0) for c in clients)
    archived_collected = sum(pl.get("total_paid", 0) for pl in all_paid_loans)
    total_collected = active_collected + archived_collected
    
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
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

    # Monthly interest: calculate from payments based on client interest rates
    # For each payment, estimate the interest portion based on the client's rate
    monthly_interest = {}
    client_rates = {}
    for c in clients:
        rate = c.get("interest_rate", 0) or 0
        if rate > 0:
            client_rates[c["id"]] = rate / 100.0 / 12  # monthly rate

    # Interest from active loan payments
    for payment in payments_all:
        payment_date = payment.get("payment_date")
        if not payment_date or payment_date < six_months_ago:
            continue
        client_id = payment.get("client_id")
        amount = payment.get("amount", 0) or 0
        monthly_rate = client_rates.get(client_id, 0)
        if monthly_rate > 0 and amount > 0:
            # Approximate interest portion of each payment
            interest_portion = amount * (monthly_rate / (1 + monthly_rate)) if monthly_rate < 1 else amount * 0.1
            month_key = payment_date.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest_portion

    # Also add interest from archived/paid loans
    for pl in all_paid_loans:
        interest = pl.get("total_interest", 0) or 0
        if interest <= 0:
            continue
        archived_at = pl.get("archived_at")
        if not archived_at or not isinstance(archived_at, datetime):
            continue
        if archived_at >= six_months_ago:
            month_key = archived_at.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest

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
