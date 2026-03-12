"""AI-powered client risk scoring."""
from fastapi import APIRouter, Query
from database import db
from utils.auth import get_admin_id_from_token
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/risk", tags=["risk"])


def calculate_risk_score(client: dict, loans: list, payments: list) -> dict:
    """Rule-based risk scoring with AI-style analysis."""
    score = 100
    factors = []

    # Payment history (40% weight)
    total_payments = len(payments)
    late_payments = sum(1 for p in payments if p.get("is_late"))
    if total_payments > 0:
        on_time_rate = (total_payments - late_payments) / total_payments
        payment_score = on_time_rate * 40
        score = score - (40 - payment_score)
        if on_time_rate < 0.5:
            factors.append({"factor": "Payment History", "impact": "high", "detail": f"Only {on_time_rate*100:.0f}% payments on time"})
        elif on_time_rate < 0.8:
            factors.append({"factor": "Payment History", "impact": "medium", "detail": f"{on_time_rate*100:.0f}% payments on time"})
        else:
            factors.append({"factor": "Payment History", "impact": "low", "detail": f"{on_time_rate*100:.0f}% payments on time"})
    else:
        score -= 20
        factors.append({"factor": "Payment History", "impact": "high", "detail": "No payment history"})

    # Active loans (20% weight)
    active_loans = [l for l in loans if l.get("status") == "active"]
    overdue_loans = [l for l in active_loans if l.get("days_overdue", 0) > 0]
    if overdue_loans:
        overdue_pct = len(overdue_loans) / max(len(active_loans), 1)
        score -= overdue_pct * 20
        max_overdue = max(l.get("days_overdue", 0) for l in overdue_loans)
        factors.append({"factor": "Overdue Loans", "impact": "high" if max_overdue > 30 else "medium", "detail": f"{len(overdue_loans)} overdue (max {max_overdue} days)"})

    # Loan amount vs income (20% weight)
    total_debt = sum(l.get("remaining_amount", 0) for l in active_loans)
    if total_debt > 10000:
        score -= 10
        factors.append({"factor": "Debt Level", "impact": "medium", "detail": f"Total debt: {total_debt:.2f}"})

    # Account age (10% weight)
    created = client.get("created_at")
    if created:
        try:
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            age_days = (datetime.now(timezone.utc) - created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created).days
            if age_days < 30:
                score -= 10
                factors.append({"factor": "Account Age", "impact": "medium", "detail": f"New client ({age_days} days)"})
        except Exception:
            pass

    # Device lock compliance (10% weight)
    if client.get("is_locked") and not client.get("last_heartbeat"):
        score -= 5
        factors.append({"factor": "Device Compliance", "impact": "low", "detail": "No device heartbeat"})

    score = max(0, min(100, round(score)))

    if score >= 80:
        risk_level = "low"
    elif score >= 50:
        risk_level = "medium"
    else:
        risk_level = "high"

    return {
        "score": score,
        "risk_level": risk_level,
        "factors": factors,
        "total_payments": total_payments,
        "late_payments": late_payments,
        "active_loans": len(active_loans),
        "overdue_loans": len(overdue_loans),
        "total_debt": round(total_debt, 2),
    }


@router.get("/client/{client_id}")
async def get_client_risk(client_id: str, admin_token: str = Query(...)):
    """Get AI risk score for a client."""
    await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        return {"error": "Client not found"}

    loans = await db.loans.find({"client_id": client_id}, {"_id": 0}).to_list(100)
    payments = await db.payments.find({"client_id": client_id}, {"_id": 0}).to_list(500)

    result = calculate_risk_score(client, loans, payments)
    result["client_id"] = client_id
    result["client_name"] = client.get("name", "")

    # Store the score
    await db.risk_scores.update_one(
        {"client_id": client_id},
        {"$set": {**result, "calculated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )

    return result


@router.get("/overview")
async def get_risk_overview(admin_token: str = Query(...)):
    """Get risk overview for all clients."""
    admin_id = await get_admin_id_from_token(admin_token)

    clients = await db.clients.find({"admin_id": admin_id}, {"_id": 0}).to_list(1000)
    results = []

    for client in clients:
        loans = await db.loans.find({"client_id": client["id"]}, {"_id": 0}).to_list(50)
        payments = await db.payments.find({"client_id": client["id"]}, {"_id": 0}).to_list(200)
        risk = calculate_risk_score(client, loans, payments)
        risk["client_id"] = client["id"]
        risk["client_name"] = client.get("name", "")
        results.append(risk)

    high_risk = sum(1 for r in results if r["risk_level"] == "high")
    medium_risk = sum(1 for r in results if r["risk_level"] == "medium")
    low_risk = sum(1 for r in results if r["risk_level"] == "low")
    avg_score = round(sum(r["score"] for r in results) / max(len(results), 1))

    return {
        "overview": {"high": high_risk, "medium": medium_risk, "low": low_risk, "avg_score": avg_score, "total": len(results)},
        "clients": sorted(results, key=lambda x: x["score"])
    }
