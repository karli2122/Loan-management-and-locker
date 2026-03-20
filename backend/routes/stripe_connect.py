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
    
    # Check plan access (enterprise/custom or superadmin)
    plan = admin.get("plan", "starter")
    is_super = admin.get("is_super_admin", False)
    if plan not in ("enterprise", "custom") and not is_super:
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
        error_msg = str(e)
        # Provide actionable guidance for common platform config errors
        if "platform-profile" in error_msg or "managing losses" in error_msg:
            error_msg = (
                "Stripe Connect platform setup required. "
                "Please go to https://dashboard.stripe.com/settings/connect/platform-profile "
                "and review the loss liability settings for connected accounts, then try again."
            )
        raise HTTPException(status_code=500, detail=error_msg)


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



@router.get("/connect/dashboard")
async def get_connect_dashboard(admin_token: str = Query(...)):
    """Get platform fees dashboard (superadmin only)."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin or not admin.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    
    # Get all completed connect payments
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {
            "_id": None,
            "total_volume": {"$sum": "$amount"},
            "total_fees": {"$sum": {"$multiply": ["$amount", PLATFORM_FEE_PERCENT / 100]}},
            "total_transactions": {"$sum": 1},
        }}
    ]
    result = await db.connect_payments.aggregate(pipeline).to_list(1)
    totals = result[0] if result else {"total_volume": 0, "total_fees": 0, "total_transactions": 0}
    
    # Monthly breakdown
    monthly_pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {
            "_id": {
                "year": {"$year": "$completed_at"},
                "month": {"$month": "$completed_at"},
            },
            "volume": {"$sum": "$amount"},
            "fees": {"$sum": {"$multiply": ["$amount", PLATFORM_FEE_PERCENT / 100]}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.year": -1, "_id.month": -1}},
        {"$limit": 12},
    ]
    monthly = await db.connect_payments.aggregate(monthly_pipeline).to_list(12)
    
    # Connected accounts count
    connected_count = await db.admins.count_documents({"stripe_connect_status": "active"})
    pending_count = await db.admins.count_documents({"stripe_connect_status": "pending"})
    
    # Recent transactions
    recent = await db.connect_payments.find(
        {"payment_status": "paid"},
        {"_id": 0, "id": 1, "amount": 1, "platform_fee_cents": 1, "client_id": 1, "admin_id": 1, "completed_at": 1}
    ).sort("completed_at", -1).limit(20).to_list(20)
    
    # Enrich recent with admin/client names
    for tx in recent:
        tx["platform_fee"] = round((tx.get("platform_fee_cents", 0) or 0) / 100, 2)
        admin_doc = await db.admins.find_one({"id": tx.get("admin_id")}, {"_id": 0, "username": 1})
        client_doc = await db.clients.find_one({"id": tx.get("client_id")}, {"_id": 0, "name": 1})
        tx["admin_name"] = admin_doc.get("username", "Unknown") if admin_doc else "Unknown"
        tx["client_name"] = client_doc.get("name", "Unknown") if client_doc else "Unknown"
        if tx.get("completed_at"):
            tx["completed_at"] = tx["completed_at"].isoformat() if hasattr(tx["completed_at"], 'isoformat') else str(tx["completed_at"])
    
    return {
        "platform_fee_percent": PLATFORM_FEE_PERCENT,
        "total_volume": round(totals.get("total_volume", 0), 2),
        "total_fees_earned": round(totals.get("total_fees", 0), 2),
        "total_transactions": totals.get("total_transactions", 0),
        "connected_accounts": connected_count,
        "pending_accounts": pending_count,
        "monthly_breakdown": [
            {
                "month": f"{m['_id']['year']}-{m['_id']['month']:02d}",
                "volume": round(m["volume"], 2),
                "fees": round(m["fees"], 2),
                "count": m["count"],
            }
            for m in monthly
        ],
        "recent_transactions": recent,
    }


@router.post("/connect/send-payment-link")
async def send_payment_link_to_client(
    request: Request,
    admin_token: str = Query(...),
    client_id: str = Query(...),
    loan_id: str = Query(...),
    amount: float = Query(None),
    message: str = Query(default="You have a payment link for your loan."),
):
    """Create a payment link and send it to the client via in-app messaging + push notification."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Check plan access
    plan = admin.get("plan", "starter")
    is_super = admin.get("is_super_admin", False)
    if plan not in ("enterprise", "custom") and not is_super:
        raise HTTPException(status_code=403, detail="Payment links require Enterprise or Custom plan.")
    
    # Verify Connect is set up
    account_id = admin.get("stripe_connect_account_id")
    if not account_id:
        raise HTTPException(status_code=400, detail="Stripe Connect not set up. Go to Settings to connect your Stripe account.")
    
    # Check account is active
    try:
        account = stripe.Account.retrieve(account_id)
        if not account.charges_enabled:
            raise HTTPException(status_code=400, detail="Stripe account not fully activated.")
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Get client and loan
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    if not amount:
        amount = loan.get("outstanding_balance", 0)
    
    if not amount or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    
    # Calculate platform fee
    application_fee_amount = int(round(amount * PLATFORM_FEE_PERCENT / 100 * 100))
    amount_cents = int(round(amount * 100))
    
    host_url = str(request.base_url).rstrip("/")
    payment_id = str(uuid.uuid4())
    
    try:
        # Create Checkout Session
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "eur",
                    "product_data": {
                        "name": f"Loan Payment - {client.get('name', 'Client')}",
                        "description": f"Payment of {amount:.2f} EUR",
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
                "transfer_data": {"destination": account_id},
            },
            metadata={
                "payment_id": payment_id,
                "admin_id": admin_id,
                "client_id": client_id,
                "loan_id": loan_id,
            },
        )
        
        # Save payment record
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
        
        # Send in-app message with payment link
        msg_text = f"{message}\n\nPayment amount: {amount:.2f} EUR\nPay here: {session.url}"
        msg_record = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "sender_type": "admin",
            "sender_id": admin_id,
            "text": msg_text,
            "type": "payment_link",
            "payment_url": session.url,
            "payment_id": payment_id,
            "amount": amount,
            "created_at": datetime.now(timezone.utc),
        }
        await db.messages.insert_one(msg_record)
        
        # Send push notification to client
        push_sent = False
        client_device = await db.devices.find_one(
            {"client_id": client_id},
            {"_id": 0, "expo_push_token": 1, "push_token": 1}
        )
        push_token = None
        if client_device:
            push_token = client_device.get("expo_push_token") or client_device.get("push_token")
        
        if push_token and push_token.startswith("ExponentPushToken"):
            try:
                import httpx
                async with httpx.AsyncClient(timeout=15) as http_client:
                    resp = await http_client.post(
                        "https://exp.host/--/api/v2/push/send",
                        json={
                            "to": push_token,
                            "title": "Payment Request",
                            "body": f"You have a payment of {amount:.2f} EUR. Tap to pay.",
                            "sound": "default",
                            "priority": "high",
                            "data": {
                                "type": "payment_link",
                                "payment_url": session.url,
                                "amount": amount,
                                "payment_id": payment_id,
                            },
                        },
                    )
                    push_sent = resp.status_code == 200
            except Exception as e:
                logger.error(f"Push notification failed: {e}")
        
        return {
            "success": True,
            "payment_url": session.url,
            "payment_id": payment_id,
            "amount": amount,
            "platform_fee": round(amount * PLATFORM_FEE_PERCENT / 100, 2),
            "message_sent": True,
            "push_notification_sent": push_sent,
        }
    except stripe.error.StripeError as e:
        logger.error(f"Stripe Connect payment link error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connect/platform-fee")
async def get_platform_fee(admin_token: str = Query(...)):
    """Get the current platform fee setting. Superadmin only."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "is_super_admin": 1})
    if not admin or not admin.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    
    config = await db.platform_config.find_one({"key": "platform_fee"}, {"_id": 0})
    fee = config["value"] if config else PLATFORM_FEE_PERCENT
    return {"platform_fee_percent": fee}


@router.put("/connect/platform-fee")
async def set_platform_fee(admin_token: str = Query(...), fee_percent: float = Query(..., ge=0, le=10)):
    """Set the platform fee percentage. Superadmin only. Range: 0-10%."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "is_super_admin": 1})
    if not admin or not admin.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Superadmin access required")
    
    await db.platform_config.update_one(
        {"key": "platform_fee"},
        {"$set": {"key": "platform_fee", "value": fee_percent, "updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": admin_id}},
        upsert=True,
    )
    
    global PLATFORM_FEE_PERCENT
    PLATFORM_FEE_PERCENT = fee_percent
    
    logger.info(f"Platform fee updated to {fee_percent}% by superadmin {admin_id}")
    return {"platform_fee_percent": fee_percent, "status": "updated"}
