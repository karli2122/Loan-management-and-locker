"""Stripe Connect routes - Payment forwarding with 0.75% platform fee."""
from fastapi import APIRouter, Query, HTTPException, Request
from datetime import datetime, timezone
import stripe
import os
import logging
import uuid

from database import db
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Stripe Connect"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
PLATFORM_FEE_PERCENT = 0.75  # 0.75% platform fee

stripe.api_key = STRIPE_API_KEY


@router.post("/connect/onboard")
async def create_connect_account(request: Request, admin_token: str = Query(...)):
    """Create a Stripe Connect Express account and return the onboarding URL."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Check plan access
    plan = admin.get("plan", "starter")
    if plan not in ("enterprise", "custom"):
        raise HTTPException(status_code=403, detail="Stripe Connect is available for Enterprise and Custom plans only.")
    
    # Check if admin already has a connected account
    existing_account_id = admin.get("stripe_connect_account_id")
    
    if existing_account_id:
        # Check if onboarding is complete
        try:
            account = stripe.Account.retrieve(existing_account_id)
            if account.charges_enabled and account.payouts_enabled:
                return {
                    "status": "already_connected",
                    "account_id": existing_account_id,
                    "charges_enabled": True,
                    "payouts_enabled": True,
                }
        except stripe.error.StripeError:
            pass
    
    # Create a new Express account
    try:
        account = stripe.Account.create(
            type="express",
            email=admin.get("email"),
            capabilities={
                "card_payments": {"requested": True},
                "transfers": {"requested": True},
            },
            metadata={
                "admin_id": admin_id,
                "platform": "paylockpro",
            },
        )
        
        # Save account ID to admin record
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "stripe_connect_account_id": account.id,
                "stripe_connect_status": "pending",
                "stripe_connect_created_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        
        # Create account link for onboarding
        host_url = str(request.base_url).rstrip("/")
        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=f"{host_url}/api/connect/onboard/refresh?admin_token={admin_token}",
            return_url=f"{host_url}/api/connect/onboard/complete?admin_token={admin_token}",
            type="account_onboarding",
        )
        
        return {
            "status": "onboarding",
            "account_id": account.id,
            "onboarding_url": account_link.url,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe Connect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect/onboard/complete")
async def connect_onboard_complete(admin_token: str = Query(...)):
    """Handle return from Stripe Connect onboarding."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    account_id = admin.get("stripe_connect_account_id")
    if not account_id:
        return {"status": "error", "message": "No connected account found"}
    
    try:
        account = stripe.Account.retrieve(account_id)
        status = "active" if account.charges_enabled and account.payouts_enabled else "pending"
        
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "stripe_connect_status": status,
                "stripe_connect_charges_enabled": account.charges_enabled,
                "stripe_connect_payouts_enabled": account.payouts_enabled,
            }}
        )
        
        return {
            "status": status,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "message": "Stripe Connect setup complete!" if status == "active" else "Additional information required. Please complete onboarding.",
        }
    except stripe.error.StripeError as e:
        return {"status": "error", "message": str(e)}


@router.get("/connect/onboard/refresh")
async def connect_onboard_refresh(request: Request, admin_token: str = Query(...)):
    """Refresh the Stripe Connect onboarding link if it expired."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    account_id = admin.get("stripe_connect_account_id")
    if not account_id:
        raise HTTPException(status_code=400, detail="No connected account found")
    
    host_url = str(request.base_url).rstrip("/")
    account_link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=f"{host_url}/api/connect/onboard/refresh?admin_token={admin_token}",
        return_url=f"{host_url}/api/connect/onboard/complete?admin_token={admin_token}",
        type="account_onboarding",
    )
    
    return {"onboarding_url": account_link.url}


@router.get("/connect/status")
async def get_connect_status(admin_token: str = Query(...)):
    """Get the current Stripe Connect status for an admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    account_id = admin.get("stripe_connect_account_id")
    if not account_id:
        return {
            "connected": False,
            "status": "not_connected",
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
        }
    
    try:
        account = stripe.Account.retrieve(account_id)
        status = "active" if account.charges_enabled and account.payouts_enabled else "pending"
        
        # Update status in DB
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "stripe_connect_status": status,
                "stripe_connect_charges_enabled": account.charges_enabled,
                "stripe_connect_payouts_enabled": account.payouts_enabled,
            }}
        )
        
        return {
            "connected": True,
            "status": status,
            "account_id": account_id,
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
        }
    except stripe.error.StripeError as e:
        return {"connected": False, "status": "error", "message": str(e)}


@router.post("/connect/payment-link")
async def create_connect_payment_link(
    request: Request,
    admin_token: str = Query(...),
    client_id: str = Query(...),
    loan_id: str = Query(None),
    amount: float = Query(None),
):
    """Create a Stripe payment link that forwards payment to the admin's connected account."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Verify Connect is set up
    account_id = admin.get("stripe_connect_account_id")
    if not account_id:
        raise HTTPException(status_code=400, detail="Stripe Connect not set up. Please connect your Stripe account in Settings.")
    
    # Verify account is active
    try:
        account = stripe.Account.retrieve(account_id)
        if not account.charges_enabled:
            raise HTTPException(status_code=400, detail="Stripe account not fully activated. Please complete onboarding.")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Get client info
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Determine amount
    if loan_id:
        loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        if not amount:
            amount = loan.get("outstanding_balance", 0)
    
    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    
    # Calculate platform fee (0.75%)
    application_fee_amount = int(round(amount * PLATFORM_FEE_PERCENT / 100 * 100))  # in cents
    amount_cents = int(round(amount * 100))
    
    host_url = str(request.base_url).rstrip("/")
    payment_id = str(uuid.uuid4())
    
    try:
        # Create a Checkout Session with destination charge
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {
                        "name": f"Loan Payment - {client.get('name', 'Client')}",
                        "description": f"Payment for loan #{loan_id[:8] if loan_id else 'N/A'}",
                    },
                    "unit_amount": amount_cents,
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{host_url}/api/connect/payment/success?session_id={{CHECKOUT_SESSION_ID}}&payment_id={payment_id}",
            cancel_url=f"{host_url}/api/connect/payment/cancel?payment_id={payment_id}",
            payment_intent_data={
                "application_fee_amount": application_fee_amount,
                "transfer_data": {
                    "destination": account_id,
                },
            },
            metadata={
                "payment_id": payment_id,
                "admin_id": admin_id,
                "client_id": client_id,
                "loan_id": loan_id or "",
                "platform": "paylockpro",
            },
        )
        
        # Record the payment transaction
        await db.connect_payments.insert_one({
            "id": payment_id,
            "session_id": session.id,
            "admin_id": admin_id,
            "client_id": client_id,
            "loan_id": loan_id,
            "amount": amount,
            "amount_cents": amount_cents,
            "platform_fee_cents": application_fee_amount,
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
            "destination_account": account_id,
            "status": "pending",
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc),
        })
        
        return {
            "payment_url": session.url,
            "session_id": session.id,
            "payment_id": payment_id,
            "amount": amount,
            "platform_fee": round(amount * PLATFORM_FEE_PERCENT / 100, 2),
            "net_to_lender": round(amount - amount * PLATFORM_FEE_PERCENT / 100, 2),
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe Connect payment error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect/payment/success")
async def connect_payment_success(session_id: str = Query(...), payment_id: str = Query(...)):
    """Handle successful Connect payment."""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status == "paid":
            payment = await db.connect_payments.find_one({"id": payment_id}, {"_id": 0})
            if payment and payment.get("payment_status") != "paid":
                await db.connect_payments.update_one(
                    {"id": payment_id},
                    {"$set": {
                        "status": "completed",
                        "payment_status": "paid",
                        "completed_at": datetime.now(timezone.utc),
                        "stripe_payment_intent": session.payment_intent,
                    }}
                )
                
                # Record payment on the loan if applicable
                loan_id = payment.get("loan_id")
                if loan_id:
                    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
                    if loan:
                        amount = payment.get("amount", 0)
                        current_paid = loan.get("total_paid", 0) or 0
                        new_paid = current_paid + amount
                        outstanding = loan.get("outstanding_balance", 0)
                        new_outstanding = max(0, outstanding - amount)
                        new_status = "archived" if new_outstanding <= 0 else "active"
                        
                        await db.loans.update_one(
                            {"id": loan_id},
                            {"$set": {
                                "total_paid": new_paid,
                                "outstanding_balance": new_outstanding,
                                "status": new_status,
                                "last_payment_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                            }}
                        )
            
            return {"status": "success", "message": "Payment completed successfully"}
        
        return {"status": "pending", "message": "Payment is being processed"}
    except stripe.error.StripeError as e:
        return {"status": "error", "message": str(e)}


@router.get("/connect/payment/cancel")
async def connect_payment_cancel(payment_id: str = Query(...)):
    """Handle cancelled Connect payment."""
    await db.connect_payments.update_one(
        {"id": payment_id},
        {"$set": {"status": "cancelled", "payment_status": "cancelled"}}
    )
    return {"status": "cancelled", "message": "Payment was cancelled"}


@router.get("/connect/payment/status/{session_id}")
async def get_connect_payment_status(session_id: str, admin_token: str = Query(...)):
    """Check Connect payment status."""
    await get_admin_id_from_token(admin_token)
    
    payment = await db.connect_payments.find_one({"session_id": session_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Check Stripe for latest status
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        if session.payment_status == "paid" and payment.get("payment_status") != "paid":
            await db.connect_payments.update_one(
                {"session_id": session_id},
                {"$set": {
                    "status": "completed",
                    "payment_status": "paid",
                    "completed_at": datetime.now(timezone.utc),
                }}
            )
            payment["payment_status"] = "paid"
            payment["status"] = "completed"
    except stripe.error.StripeError:
        pass
    
    return {
        "payment_id": payment.get("id"),
        "status": payment.get("status"),
        "payment_status": payment.get("payment_status"),
        "amount": payment.get("amount"),
        "client_id": payment.get("client_id"),
        "loan_id": payment.get("loan_id"),
    }
