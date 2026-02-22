"""Reports routes - analytics, collection reports, financial reports."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional
import logging

from database import db
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


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
    query = {"is_registered": True}
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
    
    # Check if requester is superadmin for filtering capability
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Determine which admin's data to fetch
    target_admin_id = admin_id
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            target_admin_id = None  # Fetch all clients
        else:
            target_admin_id = filter_admin_id
    
    query = {"admin_id": target_admin_id} if target_admin_id else {}
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    
    active_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
    completed_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) <= 0 and c.get("loan_amount", 0) > 0)
    overdue_loans = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0
    
    return {
        "total_disbursed": round(total_disbursed, 2),
        "total_collected": round(total_collected, 2),
        "total_outstanding": round(total_outstanding, 2),
        "collection_rate": round(collection_rate, 2),
        "active_loans": active_loans,
        "completed_loans": completed_loans,
        "overdue_loans": overdue_loans,
        "total_clients": len(clients)
    }


@router.get("/reports/clients")
async def get_clients_report(admin_token: str = Query(...)):
    """Get detailed clients report."""
    admin_id = await get_admin_id_from_token(admin_token)
    clients = await db.clients.find(
        {"admin_id": admin_id},
        {"_id": 0, "registration_code": 0}
    ).to_list(1000)
    
    report = []
    for client in clients:
        report.append({
            "id": client["id"],
            "name": client["name"],
            "phone": client.get("phone", ""),
            "loan_amount": client.get("loan_amount", 0),
            "total_paid": client.get("total_paid", 0),
            "outstanding_balance": client.get("outstanding_balance", 0),
            "days_overdue": client.get("days_overdue", 0),
            "is_locked": client.get("is_locked", False),
            "is_registered": client.get("is_registered", False),
            "last_payment_date": client.get("last_payment_date")
        })
    
    return report


@router.get("/reports/financial")
async def get_financial_report(
    admin_token: str = Query(...),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None)
):
    """Get financial report with optional date range."""
    admin_id = await get_admin_id_from_token(admin_token)
    query = {"admin_id": admin_id}
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
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

    payments_all = await db.payments.find(payment_query, {"_id": 0}).to_list(10000)

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
async def get_stats(admin_id: str = Query(default=None)):
    """Get general statistics with device breakdown."""
    query = {"admin_id": admin_id} if admin_id else {}
    
    total_clients = await db.clients.count_documents(query)
    registered_clients = await db.clients.count_documents({**query, "is_registered": True})
    locked_clients = await db.clients.count_documents({**query, "is_locked": True})
    unlocked_registered = await db.clients.count_documents({**query, "is_registered": True, "is_locked": False})
    
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
    """Get comprehensive dashboard analytics. Superadmins can filter by specific admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Check if requester is superadmin for filtering capability
    admin = await db.admins.find_one({"id": admin_id})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    # Determine which admin's data to fetch
    target_admin_id = admin_id
    if filter_admin_id and is_super_admin:
        if filter_admin_id == "all":
            target_admin_id = None  # Fetch all clients
        else:
            target_admin_id = filter_admin_id
    
    query = {"admin_id": target_admin_id} if target_admin_id else {}
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
    # Overview metrics
    total_clients = len(clients)
    registered = sum(1 for c in clients if c.get("is_registered"))
    locked = sum(1 for c in clients if c.get("is_locked"))
    active_loans = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
    overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    
    # Financial summary
    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
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
    
    # Monthly revenue trend (last 6 months)
    six_months_ago = datetime.utcnow() - timedelta(days=180)
    client_ids = [c["id"] for c in clients]
    payments_all = await db.payments.find({
        "client_id": {"$in": client_ids}
    }).to_list(10000)

    monthly_revenue = {}
    for payment in payments_all:
        payment_date = payment.get("payment_date")
        if not payment_date:
            continue
        if payment_date >= six_months_ago:
            month_key = payment_date.strftime("%Y-%m")
            monthly_revenue[month_key] = monthly_revenue.get(month_key, 0) + payment.get("amount", 0)

    # Monthly interest earned (last 6 months) — computed from payment allocations
    paid_loans = await db.paid_loans.find(
        {"admin_id": target_admin_id} if target_admin_id else {},
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

    monthly_interest = {}
    payments_sorted = sorted(payments_all, key=lambda p: p.get("payment_date") or datetime.min)
    for payment in payments_sorted:
        amount = payment.get("amount", 0)
        client_id = payment.get("client_id")
        remaining_interest = interest_remaining.get(client_id, 0)
        interest_component = min(remaining_interest, amount)
        if client_id in interest_remaining:
            interest_remaining[client_id] = max(remaining_interest - interest_component, 0)
        payment_date = payment.get("payment_date")
        if payment_date and payment_date >= six_months_ago:
            month_key = payment_date.strftime("%Y-%m")
            monthly_interest[month_key] = monthly_interest.get(month_key, 0) + interest_component

    now = datetime.utcnow()
    for i in range(5, -1, -1):
        month_date = now - timedelta(days=30 * i)
        month_key = month_date.strftime("%Y-%m")
        monthly_interest.setdefault(month_key, 0)

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
