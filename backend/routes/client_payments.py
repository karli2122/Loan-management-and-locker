"""Client Stripe payment management - Setup, charge via checkout, auto-collect."""
import os
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, Body

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse
)
from database import db
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Client Payments"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
BACKEND_URL = os.environ.get("KEEPALIVE_URL", "")


def _get_stripe_checkout(webhook_url=None):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    wh = webhook_url or f"{BACKEND_URL}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=wh)


@router.post("/clients/{client_id}/create-payment-link")
async def create_payment_link(client_id: str, admin_token: str = Query(...), data: dict = Body({})):
    """Create a Stripe Checkout payment link for a client. Used for manual or auto-payment collection."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    amount = float(data.get("amount", client.get("monthly_emi", 0)))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    currency = data.get("currency", "eur")
    description = data.get("description", f"Payment - {client.get('name', 'Client')}")

    # Use the portal URL as base for success/cancel
    origin = BACKEND_URL.rstrip("/")
    success_url = f"{origin}/api/portal?payment_success=true&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/api/portal?payment_cancelled=true"

    sc = _get_stripe_checkout()
    checkout_req = CheckoutSessionRequest(
        amount=amount,
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "client_id": client_id,
            "admin_id": admin_id,
            "client_name": client.get("name", ""),
            "type": "client_payment",
            "description": description,
        },
    )

    session: CheckoutSessionResponse = await sc.create_checkout_session(checkout_req)

    # Record payment transaction
    payment_id = str(uuid.uuid4())
    await db.payments.insert_one({
        "id": payment_id,
        "client_id": client_id,
        "admin_id": admin_id,
        "amount": amount,
        "currency": currency,
        "status": "pending",
        "payment_method": "stripe",
        "stripe_session_id": session.session_id,
        "source": data.get("source", "manual"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "payment_id": payment_id,
        "checkout_url": session.url,
        "session_id": session.session_id,
        "amount": amount,
        "currency": currency,
    }


@router.get("/clients/{client_id}/check-payment/{session_id}")
async def check_client_payment(client_id: str, session_id: str, admin_token: str = Query(...)):
    """Check status of a client payment checkout session."""
    admin_id = await get_admin_id_from_token(admin_token)

    # Find the payment record
    payment = await db.payments.find_one(
        {"stripe_session_id": session_id, "client_id": client_id}, {"_id": 0}
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    # If already completed, return cached
    if payment.get("status") == "succeeded":
        return {"status": "succeeded", "amount": payment["amount"]}

    sc = _get_stripe_checkout()
    checkout_status: CheckoutStatusResponse = await sc.get_checkout_status(session_id)

    new_status = "succeeded" if checkout_status.payment_status == "paid" else checkout_status.payment_status

    # Update payment record
    await db.payments.update_one(
        {"stripe_session_id": session_id},
        {"$set": {
            "status": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # If payment succeeded, update client balance
    if new_status == "succeeded" and payment.get("status") != "succeeded":
        amount = payment["amount"]
        await db.clients.update_one(
            {"id": client_id},
            {
                "$inc": {"total_paid": amount, "outstanding_balance": -amount, "total_amount_due": -amount},
                "$set": {
                    "last_payment_date": datetime.now(timezone.utc).isoformat(),
                    "last_payment_amount": amount,
                    "is_late": False,
                    "days_overdue": 0,
                },
            },
        )
        # Notify admin
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "type": "payment_received",
            "title": "Payment Received",
            "message": f"Received {amount:.2f} EUR from {payment.get('client_name', 'client')} via Stripe.",
            "client_id": client_id,
            "is_read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Payment {session_id} for client {client_id} succeeded: {amount} EUR")

    return {"status": new_status, "amount": payment["amount"]}


@router.post("/clients/{client_id}/toggle-autopay")
async def toggle_autopay(client_id: str, admin_token: str = Query(...), data: dict = Body(...)):
    """Enable or disable auto-pay for a client."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    enabled = bool(data.get("enabled", False))
    await db.clients.update_one({"id": client_id}, {"$set": {"auto_pay_enabled": enabled}})
    return {"auto_pay_enabled": enabled}


@router.get("/stripe/payment-tracker")
async def stripe_payment_tracker(admin_token: str = Query(...), limit: int = Query(default=30)):
    """Get Stripe payment tracker data - pending, completed, and failed payment links."""
    admin_id = await get_admin_id_from_token(admin_token)

    # Fetch recent Stripe payments
    payments = await db.payments.find(
        {"admin_id": admin_id, "payment_method": "stripe"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)

    # Enrich with client names
    client_ids = list({p["client_id"] for p in payments if p.get("client_id")})
    clients = {}
    if client_ids:
        client_docs = await db.clients.find(
            {"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}
        ).to_list(len(client_ids))
        clients = {c["id"]: c for c in client_docs}

    enriched = []
    for p in payments:
        c = clients.get(p.get("client_id"), {})
        enriched.append({
            "id": p["id"],
            "client_id": p.get("client_id"),
            "client_name": c.get("name", "Unknown"),
            "client_phone": c.get("phone", ""),
            "amount": p["amount"],
            "currency": p.get("currency", "eur"),
            "status": p["status"],
            "source": p.get("source", "manual"),
            "stripe_session_id": p.get("stripe_session_id"),
            "schedule_id": p.get("schedule_id"),
            "created_at": p.get("created_at"),
        })

    # Summary stats
    pending = [p for p in enriched if p["status"] == "pending"]
    succeeded = [p for p in enriched if p["status"] == "succeeded"]
    failed = [p for p in enriched if p["status"] == "failed"]

    return {
        "payments": enriched,
        "summary": {
            "total": len(enriched),
            "pending": len(pending),
            "succeeded": len(succeeded),
            "failed": len(failed),
            "pending_amount": sum(p["amount"] for p in pending),
            "succeeded_amount": sum(p["amount"] for p in succeeded),
            "failed_amount": sum(p["amount"] for p in failed),
        },
    }


@router.post("/stripe/refresh-payment/{payment_id}")
async def refresh_stripe_payment(payment_id: str, admin_token: str = Query(...)):
    """Refresh a specific pending payment's status from Stripe."""
    admin_id = await get_admin_id_from_token(admin_token)

    payment = await db.payments.find_one(
        {"id": payment_id, "admin_id": admin_id, "payment_method": "stripe"}, {"_id": 0}
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    session_id = payment.get("stripe_session_id")
    if not session_id:
        return {"status": payment["status"], "message": "No session to check"}

    if payment["status"] == "succeeded":
        return {"status": "succeeded", "message": "Already completed"}

    sc = _get_stripe_checkout()
    try:
        checkout_status: CheckoutStatusResponse = await sc.get_checkout_status(session_id)
        new_status = "succeeded" if checkout_status.payment_status == "paid" else checkout_status.payment_status

        await db.payments.update_one(
            {"id": payment_id},
            {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )

        # If succeeded, update client balance
        if new_status == "succeeded" and payment["status"] != "succeeded":
            amount = payment["amount"]
            await db.clients.update_one(
                {"id": payment["client_id"]},
                {
                    "$inc": {"total_paid": amount, "outstanding_balance": -amount, "total_amount_due": -amount},
                    "$set": {
                        "last_payment_date": datetime.now(timezone.utc).isoformat(),
                        "last_payment_amount": amount,
                    },
                },
            )

        return {"status": new_status, "message": f"Updated to {new_status}"}
    except Exception as e:
        logger.error(f"Error refreshing payment {payment_id}: {e}")
        return {"status": payment["status"], "message": str(e)}


@router.get("/clients/{client_id}/payment-methods")
async def get_payment_methods(client_id: str, admin_token: str = Query(...)):
    """Get payment info for a client."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get recent Stripe payments
    recent = await db.payments.find(
        {"client_id": client_id, "payment_method": "stripe"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(5)

    return {
        "auto_pay_enabled": client.get("auto_pay_enabled", False),
        "recent_stripe_payments": recent,
        "total_paid_stripe": sum(p["amount"] for p in recent if p.get("status") == "succeeded"),
    }


async def create_auto_payment_link(client, amount, currency="eur", schedule_id=None):
    """Create a checkout session for auto-payment and return the URL.
    Called by the background task scheduler when auto-charge is enabled."""
    if not STRIPE_API_KEY or not BACKEND_URL:
        return None, "stripe_not_configured"

    origin = BACKEND_URL.rstrip("/")
    success_url = f"{origin}/api/portal?payment_success=true&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/api/portal?payment_cancelled=true"

    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=f"{origin}/api/webhook/stripe")

    checkout_req = CheckoutSessionRequest(
        amount=amount,
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "client_id": client["id"],
            "admin_id": client.get("admin_id", ""),
            "client_name": client.get("name", ""),
            "schedule_id": schedule_id or "",
            "type": "auto_payment",
        },
    )

    try:
        session: CheckoutSessionResponse = await sc.create_checkout_session(checkout_req)

        # Record payment
        payment_id = str(uuid.uuid4())
        await db.payments.insert_one({
            "id": payment_id,
            "client_id": client["id"],
            "admin_id": client.get("admin_id", ""),
            "amount": amount,
            "currency": currency,
            "status": "pending",
            "payment_method": "stripe",
            "stripe_session_id": session.session_id,
            "source": "auto",
            "schedule_id": schedule_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return session.url, "payment_link_created"
    except Exception as e:
        logger.error(f"Error creating auto payment link for client {client['id']}: {e}")
        return None, str(e)
