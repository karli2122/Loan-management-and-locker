"""Stripe payment routes for subscription plans."""
import os
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict
from dotenv import load_dotenv

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse
)
from config import db

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

# Fixed plan definitions - NEVER accept amounts from frontend
PLANS = {
    "starter": {"name": "Starter", "amount": 29.00, "currency": "eur", "clients": 50},
    "business": {"name": "Business", "amount": 79.00, "currency": "eur", "clients": 200},
    "enterprise": {"name": "Enterprise", "amount": 199.00, "currency": "eur", "clients": 1000},
}


class SubscribeRequest(BaseModel):
    plan_id: str
    origin_url: str
    admin_token: str


class CheckStatusRequest(BaseModel):
    session_id: str
    admin_token: Optional[str] = None


@router.post("/payments/subscribe")
async def create_subscription_checkout(req: SubscribeRequest, http_request: Request):
    """Create a Stripe checkout session for a subscription plan."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    if req.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Invalid plan")

    plan = PLANS[req.plan_id]

    # Resolve admin from token
    admin = await db.admins.find_one({"token": req.admin_token}, {"_id": 0})
    admin_id = admin["id"] if admin else "unknown"

    # Build URLs from frontend origin
    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/admin/settings?session_id={{CHECKOUT_SESSION_ID}}&plan={req.plan_id}"
    cancel_url = f"{origin}/admin/settings?cancelled=true"

    # Init Stripe
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    checkout_req = CheckoutSessionRequest(
        amount=plan["amount"],
        currency=plan["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "plan_id": req.plan_id,
            "plan_name": plan["name"],
            "admin_id": admin_id,
            "clients_limit": str(plan["clients"]),
        },
    )

    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_req)

    # Create payment transaction record BEFORE redirect
    await db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "admin_id": admin_id,
        "plan_id": req.plan_id,
        "plan_name": plan["name"],
        "amount": plan["amount"],
        "currency": plan["currency"],
        "status": "initiated",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"url": session.url, "session_id": session.session_id}


@router.get("/payments/status/{session_id}")
async def check_payment_status(session_id: str, http_request: Request):
    """Check the status of a checkout session and update the DB."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    # Find existing transaction
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # If already processed as paid, return cached result (prevent duplicate processing)
    if txn.get("payment_status") == "paid":
        return {
            "status": "complete",
            "payment_status": "paid",
            "plan_id": txn.get("plan_id"),
            "plan_name": txn.get("plan_name"),
        }

    # Poll Stripe for current status
    host_url = str(http_request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    # Update transaction in DB
    new_status = checkout_status.status
    new_payment_status = checkout_status.payment_status

    update_data = {
        "status": new_status,
        "payment_status": new_payment_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # If payment is successful, also update the admin's plan
    if new_payment_status == "paid" and txn.get("payment_status") != "paid":
        plan_id = txn.get("plan_id")
        admin_id = txn.get("admin_id")
        plan = PLANS.get(plan_id, {})

        # Update admin's subscription
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "subscription_plan": plan_id,
                "subscription_plan_name": plan.get("name", ""),
                "subscription_clients_limit": plan.get("clients", 50),
                "subscription_updated_at": datetime.now(timezone.utc).isoformat(),
                "subscription_session_id": session_id,
            }}
        )

        update_data["processed"] = True
        logger.info(f"Admin {admin_id} upgraded to {plan_id} plan")

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": update_data}
    )

    return {
        "status": new_status,
        "payment_status": new_payment_status,
        "plan_id": txn.get("plan_id"),
        "plan_name": txn.get("plan_name"),
    }


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")

    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")

    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)

        if webhook_response.payment_status == "paid":
            txn = await db.payment_transactions.find_one(
                {"session_id": webhook_response.session_id}, {"_id": 0}
            )
            if txn and txn.get("payment_status") != "paid":
                plan_id = txn.get("plan_id")
                admin_id = txn.get("admin_id")
                plan = PLANS.get(plan_id, {})

                await db.admins.update_one(
                    {"id": admin_id},
                    {"$set": {
                        "subscription_plan": plan_id,
                        "subscription_plan_name": plan.get("name", ""),
                        "subscription_clients_limit": plan.get("clients", 50),
                        "subscription_updated_at": datetime.now(timezone.utc).isoformat(),
                        "subscription_session_id": webhook_response.session_id,
                    }}
                )

                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {
                        "status": "complete",
                        "payment_status": "paid",
                        "processed": True,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }}
                )
                logger.info(f"Webhook: Admin {admin_id} plan updated to {plan_id}")

        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True, "error": str(e)}


@router.get("/payments/current-plan")
async def get_current_plan(admin_token: str):
    """Get the admin's current subscription plan."""
    admin = await db.admins.find_one({"token": admin_token}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "plan_id": admin.get("subscription_plan", "starter"),
        "plan_name": admin.get("subscription_plan_name", "Starter"),
        "clients_limit": admin.get("subscription_clients_limit", 50),
    }
