"""Revenue forecasting routes."""
from fastapi import APIRouter, Query
from datetime import datetime, timezone, timedelta
import logging

from database import db
from utils.auth import get_admin_id_from_token
from routes.reports import _get_enterprise_client_query

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Forecasting"])


@router.get("/api/forecasting/revenue")
async def get_revenue_forecast(
    admin_token: str = Query(...),
    days: int = Query(default=90, le=365),
):
    """Predict upcoming collections based on payment schedules and historical behavior.
    
    Returns expected vs likely collections for the next N days,
    factoring in each client's historical payment reliability.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    base_query = await _get_enterprise_client_query(admin_id)

    clients = await db.clients.find(
        {**base_query, "outstanding_balance": {"$gt": 0}},
        {"_id": 0, "id": 1, "name": 1, "outstanding_balance": 1,
         "monthly_emi": 1, "next_payment_due": 1, "total_paid": 1,
         "loan_amount": 1, "days_overdue": 1, "total_amount_due": 1}
    ).to_list(1000)

    now = datetime.now(timezone.utc)
    end_date = now + timedelta(days=days)

    # Calculate per-client payment reliability from paid_loans history
    client_reliability = {}
    paid_loans = await db.paid_loans.find(
        {}, {"_id": 0, "client_id": 1, "total_paid": 1, "total_amount_due": 1,
             "loan_amount": 1, "late_fees_accumulated": 1}
    ).to_list(5000)
    
    for pl in paid_loans:
        cid = pl.get("client_id")
        if cid not in client_reliability:
            client_reliability[cid] = {"total_due": 0, "total_paid": 0}
        client_reliability[cid]["total_due"] += pl.get("total_amount_due", 0) or pl.get("loan_amount", 0)
        client_reliability[cid]["total_paid"] += pl.get("total_paid", 0)

    # Build daily forecast buckets (weekly for display)
    weekly_forecast = []
    total_expected = 0
    total_likely = 0

    for week_offset in range(0, days, 7):
        week_start = now + timedelta(days=week_offset)
        week_end = week_start + timedelta(days=7)
        week_expected = 0
        week_likely = 0

        for client in clients:
            emi = client.get("monthly_emi", 0)
            if emi <= 0:
                continue

            next_due = client.get("next_payment_due")
            if not next_due:
                continue
            if isinstance(next_due, str):
                try:
                    next_due = datetime.fromisoformat(next_due.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if next_due.tzinfo is None:
                next_due = next_due.replace(tzinfo=timezone.utc)

            # Check if any payment falls in this week
            payment_date = next_due
            while payment_date < week_start:
                payment_date += timedelta(days=30)
            
            if week_start <= payment_date < week_end:
                remaining = client.get("outstanding_balance", 0)
                payment_amount = min(emi, remaining)
                week_expected += payment_amount

                # Calculate reliability score
                cid = client["id"]
                reliability = 0.7  # Default 70% if no history
                if cid in client_reliability:
                    cr = client_reliability[cid]
                    if cr["total_due"] > 0:
                        reliability = min(1.0, cr["total_paid"] / cr["total_due"])
                
                # Reduce reliability for currently overdue clients
                if client.get("days_overdue", 0) > 7:
                    reliability *= 0.5
                elif client.get("days_overdue", 0) > 0:
                    reliability *= 0.75

                week_likely += payment_amount * reliability

        total_expected += week_expected
        total_likely += week_likely
        weekly_forecast.append({
            "week_start": week_start.strftime("%Y-%m-%d"),
            "week_end": week_end.strftime("%Y-%m-%d"),
            "expected": round(week_expected, 2),
            "likely": round(week_likely, 2),
        })

    # Portfolio summary
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    overdue_clients = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    avg_reliability = 0
    if client_reliability:
        scores = []
        for cr in client_reliability.values():
            if cr["total_due"] > 0:
                scores.append(min(1.0, cr["total_paid"] / cr["total_due"]))
        avg_reliability = sum(scores) / len(scores) if scores else 0.7

    return {
        "forecast_days": days,
        "weekly_forecast": weekly_forecast,
        "summary": {
            "total_expected": round(total_expected, 2),
            "total_likely": round(total_likely, 2),
            "total_outstanding": round(total_outstanding, 2),
            "active_loans": len(clients),
            "overdue_clients": overdue_clients,
            "avg_payment_reliability": round(avg_reliability * 100, 1),
        }
    }
