"""Stripe payment routes for subscription plans."""
import os
import logging
import resend
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
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

# Fixed plan definitions - NEVER accept amounts from frontend
PLANS = {
    "starter": {"name": "Starter", "amount": 29.00, "currency": "eur", "clients": 50},
    "professional": {"name": "Professional", "amount": 79.00, "currency": "eur", "clients": 200},
    "business": {"name": "Business", "amount": 79.00, "currency": "eur", "clients": 200},  # Alias for professional
    "enterprise": {"name": "Enterprise", "amount": 199.00, "currency": "eur", "clients": 1000},
}

# Plans that include client app access
PLANS_WITH_CLIENT_APP = ["professional", "business", "enterprise", "custom"]


async def send_welcome_email(admin_id: str, plan_id: str, source: str = "app"):
    """Send welcome email after successful payment with download links."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping welcome email")
        return False
    
    try:
        resend.api_key = RESEND_API_KEY
        
        # Get admin details
        admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "email": 1, "first_name": 1, "last_name": 1})
        if not admin:
            logger.error(f"Admin {admin_id} not found for welcome email")
            return False
        
        email = admin.get("email")
        first_name = admin.get("first_name", "")
        plan_name = PLANS.get(plan_id, {}).get("name", plan_id.title())
        
        # Build download links
        admin_app_link = "https://api.paylock.pro/api/download/admin-apk"
        client_app_link = "https://api.paylock.pro/api/download/client-apk"
        portal_link = "https://api.paylock.pro/api/portal"
        manual_link = "https://api.paylock.pro/api/download/admin-manual"
        
        # Check if plan includes client app
        include_client_app = plan_id.lower() in PLANS_WITH_CLIENT_APP
        
        # Build email HTML
        client_app_section = ""
        if include_client_app:
            client_app_section = f"""
            <tr>
              <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="50" style="vertical-align: top;">
                      <div style="width: 40px; height: 40px; background: #22c55e; border-radius: 10px; text-align: center; line-height: 40px; color: white; font-size: 18px;">2</div>
                    </td>
                    <td style="vertical-align: top; padding-left: 12px;">
                      <h4 style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Download Client App</h4>
                      <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Install the client app on your customers' devices for device management and payment tracking.</p>
                      <a href="{client_app_link}" style="display: inline-block; padding: 8px 16px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">Download Client APK</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            """
        
        step_numbers = "3" if include_client_app else "2"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 800;">Welcome to PayLock Pro!</h1>
                      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Your {plan_name} subscription is now active</p>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 32px;">
                      <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151;">
                        Hi {first_name or 'there'},
                      </p>
                      <p style="margin: 0 0 24px 0; font-size: 15px; color: #4b5563; line-height: 1.6;">
                        Thank you for choosing PayLock Pro! Your account is ready and you can start managing loans right away. Here's everything you need to get started:
                      </p>
                      
                      <!-- Steps -->
                      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f9fafb; border-radius: 12px; padding: 20px;">
                        <tr>
                          <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="50" style="vertical-align: top;">
                                  <div style="width: 40px; height: 40px; background: #0ea5e9; border-radius: 10px; text-align: center; line-height: 40px; color: white; font-size: 18px;">1</div>
                                </td>
                                <td style="vertical-align: top; padding-left: 12px;">
                                  <h4 style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Download Admin App</h4>
                                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Install the PayLock Pro Admin app to manage clients, loans, and payments from your Android device.</p>
                                  <a href="{admin_app_link}" style="display: inline-block; padding: 8px 16px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">Download Admin APK</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        {client_app_section}
                        <tr>
                          <td style="padding: 16px 0;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="50" style="vertical-align: top;">
                                  <div style="width: 40px; height: 40px; background: #8b5cf6; border-radius: 10px; text-align: center; line-height: 40px; color: white; font-size: 18px;">{step_numbers}</div>
                                </td>
                                <td style="vertical-align: top; padding-left: 12px;">
                                  <h4 style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Read the User Manual</h4>
                                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Learn all the features with our comprehensive guide covering client management, device locking, and more.</p>
                                  <a href="{manual_link}" style="display: inline-block; padding: 8px 16px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 600;">View Manual (PDF)</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      
                      <!-- Portal Link -->
                      <div style="margin-top: 24px; padding: 20px; background: #f0f9ff; border-radius: 10px; text-align: center;">
                        <p style="margin: 0 0 12px 0; font-size: 14px; color: #0369a1;">You can also access your account via web browser:</p>
                        <a href="{portal_link}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Open Web Portal</a>
                      </div>
                      
                      <!-- Support -->
                      <p style="margin: 24px 0 0 0; font-size: 13px; color: #6b7280; text-align: center;">
                        Need help? Contact us at <a href="mailto:support@paylock.pro" style="color: #0ea5e9;">support@paylock.pro</a>
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background: #1f2937; padding: 24px; text-align: center;">
                      <p style="margin: 0; color: #9ca3af; font-size: 12px;">&copy; 2026 PayLock Pro OU. Tallinn, Estonia</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """
        
        # Send email
        resend.Emails.send({
            "from": "PayLock Pro <noreply@paylockpro.com>",
            "to": [email],
            "subject": f"Welcome to PayLock Pro - Your {plan_name} Plan is Active!",
            "html": html_content,
        })
        
        logger.info(f"Welcome email sent to {email} for plan {plan_id} (source: {source})")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send welcome email to admin {admin_id}: {e}")
        return False


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
        "source": req.source or "app",  # Track where the payment originated
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
        
        # Send welcome email
        source = txn.get("source", "app")
        await send_welcome_email(admin_id, plan_id, source)

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
                
                # Calculate renewal date - 1 month from now
                from datetime import timedelta
                
                # Check if current renewal date is in the future (renewal payment)
                current_renewal = admin.get("subscription_renewal_date") if admin else None
                now = datetime.now(timezone.utc)
                
                # If paying for same plan and renewal is in future, extend from renewal date
                if plan_id == current_plan and current_renewal:
                    if isinstance(current_renewal, str):
                        current_renewal = datetime.fromisoformat(current_renewal.replace("Z", "+00:00"))
                    if current_renewal.tzinfo is None:
                        current_renewal = current_renewal.replace(tzinfo=timezone.utc)
                    if current_renewal > now:
                        # Extend from current renewal date (stacking payments)
                        renewal_date = current_renewal + timedelta(days=30)
                    else:
                        # Expired, start fresh
                        renewal_date = now + timedelta(days=30)
                    effective_plan = plan_id
                elif new_level > current_level:
                    # Upgrade - immediate effect, new renewal date
                    renewal_date = now + timedelta(days=30)
                    effective_plan = plan_id
                else:
                    # Downgrade - keep current plan until renewal, then switch
                    renewal_date = current_renewal if current_renewal else None
                    if not renewal_date:
                        renewal_date = now + timedelta(days=30)
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
                
                # Send welcome email
                source = txn.get("source", "app")
                await send_welcome_email(admin_id, plan_id, source)

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
