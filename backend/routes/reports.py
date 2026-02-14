"""Reports routes - analytics, collection reports, financial reports."""
from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
from typing import Optional
import logging

from database import db
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reports"])


@router.get("/reports/collection")
async def get_collection_report(admin_id: str = Query(...)):
    """Get collection report for an admin."""
    clients = await db.clients.find(
        {"admin_id": admin_id},
        {"_id": 0}
    ).to_list(1000)
    
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
async def get_clients_report(admin_id: str = Query(...)):
    """Get detailed clients report."""
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
    admin_id: str = Query(...),
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None)
):
    """Get financial report with optional date range."""
    query = {"admin_id": admin_id}
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
    # Get all payments
    payment_query = {}
    client_ids = [c["id"] for c in clients]
    payment_query["client_id"] = {"$in": client_ids}
    
    if start_date:
        try:
            start = datetime.fromisoformat(start_date)
            payment_query["payment_date"] = {"$gte": start}
        except ValueError:
            pass
    
    if end_date:
        try:
            end = datetime.fromisoformat(end_date)
            if "payment_date" in payment_query:
                payment_query["payment_date"]["$lte"] = end
            else:
                payment_query["payment_date"] = {"$lte": end}
        except ValueError:
            pass
    
    payments = await db.payments.find(payment_query, {"_id": 0}).to_list(10000)
    
    total_payments = sum(p.get("amount", 0) for p in payments)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)
    
    # Group payments by month
    monthly_data = {}
    for payment in payments:
        month_key = payment["payment_date"].strftime("%Y-%m")
        if month_key not in monthly_data:
            monthly_data[month_key] = 0
        monthly_data[month_key] += payment.get("amount", 0)
    
    return {
        "total_payments": round(total_payments, 2),
        "total_late_fees": round(total_late_fees, 2),
        "total_processing_fees": round(total_processing_fees, 2),
        "payment_count": len(payments),
        "monthly_breakdown": monthly_data
    }


@router.get("/stats")
async def get_stats(admin_id: str = Query(default=None)):
    """Get general statistics."""
    query = {"admin_id": admin_id} if admin_id else {}
    
    total_clients = await db.clients.count_documents(query)
    registered_clients = await db.clients.count_documents({**query, "is_registered": True})
    locked_clients = await db.clients.count_documents({**query, "is_locked": True})
    
    return {
        "total_clients": total_clients,
        "registered_clients": registered_clients,
        "locked_clients": locked_clients,
        "unregistered_clients": total_clients - registered_clients
    }


@router.get("/analytics/dashboard")
async def get_dashboard_analytics(admin_token: str = Query(...)):
    """Get comprehensive dashboard analytics."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    clients = await db.clients.find({"admin_id": admin_id}, {"_id": 0}).to_list(1000)
    
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
    payments = await db.payments.find({
        "client_id": {"$in": client_ids},
        "payment_date": {"$gte": six_months_ago}
    }).to_list(10000)
    
    monthly_revenue = {}
    for payment in payments:
        month_key = payment["payment_date"].strftime("%Y-%m")
        monthly_revenue[month_key] = monthly_revenue.get(month_key, 0) + payment.get("amount", 0)
    
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
        "activity_log": activity_log
    }
