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
from database import db

load_dotenv()
logger = logging.getLogger(__name__)
router = APIRouter()

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

# Fixed plan definitions - NEVER accept amounts from frontend
PLANS = {
    "starter": {"name": "Starter", "amount": 29.00, "currency": "eur", "clients": 50},
    "professional": {"name": "Professional", "amount": 79.00, "currency": "eur", "clients": 200},
    "business": {"name": "Business", "amount": 79.00, "currency": "eur", "clients": 200},  # Alias for professional
    "enterprise": {"name": "Enterprise", "amount": 199.00, "currency": "eur", "clients": 1000},
}


class SubscribeRequest(BaseModel):
    plan_id: str
    origin_url: str
    admin_token: str
    source: Optional[str] = None  # "app" or "website"


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

    # Build URLs from frontend origin - handle website vs app
    origin = req.origin_url.rstrip("/")
    if req.source == "website":
        # Website registration - redirect to success page on website
        success_url = f"{origin}/payment-success.html?session_id={{CHECKOUT_SESSION_ID}}&plan={req.plan_id}"
        cancel_url = f"{origin}/register.html?cancelled=true&plan={req.plan_id}"
    else:
        # App - redirect to settings screen
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
                
                # Get admin's current plan for upgrade/downgrade logic
                admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "plan": 1, "subscription_renewal_date": 1})
                current_plan = admin.get("plan", "demo") if admin else "demo"
                current_level = {"demo": -1, "starter": 0, "professional": 1, "business": 1, "enterprise": 2, "custom": 3}.get(current_plan, 0)
                new_level = {"demo": -1, "starter": 0, "professional": 1, "business": 1, "enterprise": 2, "custom": 3}.get(plan_id, 0)
                
                # Calculate renewal date - 1 month from now for upgrades
                # For downgrades, keep current renewal date (plan takes effect after renewal)
                from datetime import timedelta
                if new_level > current_level:
                    # Upgrade - immediate effect, new renewal date
                    renewal_date = datetime.now(timezone.utc) + timedelta(days=30)
                    effective_plan = plan_id
                else:
                    # Downgrade - keep current plan until renewal, then switch
                    renewal_date = admin.get("subscription_renewal_date") if admin else None
                    if not renewal_date:
                        renewal_date = datetime.now(timezone.utc) + timedelta(days=30)
                    effective_plan = current_plan  # Keep current plan until renewal
                    # Store pending downgrade
                    await db.admins.update_one(
                        {"id": admin_id},
                        {"$set": {"pending_plan": plan_id, "pending_plan_date": renewal_date}}
                    )

                await db.admins.update_one(
                    {"id": admin_id},
                    {"$set": {
                        "subscription_plan": effective_plan,
                        "plan": effective_plan,
                        "subscription_plan_name": plan.get("name", ""),
                        "subscription_clients_limit": plan.get("clients", 50),
                        "subscription_updated_at": datetime.now(timezone.utc).isoformat(),
                        "subscription_session_id": webhook_response.session_id,
                        "subscription_renewal_date": renewal_date if isinstance(renewal_date, datetime) else datetime.fromisoformat(str(renewal_date)),
                        "subscription_status": "paid",
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
                logger.info(f"Webhook: Admin {admin_id} plan updated to {effective_plan}")

        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True, "error": str(e)}


@router.get("/payments/current-plan")
async def get_current_plan(admin_token: str):
    """Get the admin's current subscription plan."""
    # Look up token in admin_tokens collection first
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    admin = await db.admins.find_one({"id": token_doc["admin_id"]}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "plan_id": admin.get("subscription_plan", "starter"),
        "plan_name": admin.get("subscription_plan_name", "Starter"),
        "clients_limit": admin.get("subscription_clients_limit", 50),
    }
