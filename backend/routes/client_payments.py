"""Client Stripe payment management - Setup, save methods, charge, auto-collect."""
import os
import uuid
import logging
import stripe
from datetime import datetime, timezone
from fastapi import APIRouter, Query, HTTPException, Body
from database import db
from utils.auth import get_admin_id_from_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Client Payments"])

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")


def _get_stripe():
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    stripe.api_key = STRIPE_API_KEY
    return stripe


@router.post("/clients/{client_id}/setup-payment")
async def setup_client_payment(client_id: str, admin_token: str = Query(...)):
    """Create a Stripe Customer + Setup Intent for a client so their card can be saved."""
    admin_id = await get_admin_id_from_token(admin_token)
    s = _get_stripe()

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Create or reuse Stripe Customer
    stripe_cid = client.get("stripe_customer_id")
    if not stripe_cid:
        customer = s.Customer.create(
            name=client.get("name", ""),
            email=client.get("email") or None,
            phone=client.get("phone") or None,
            metadata={"client_id": client_id, "admin_id": admin_id},
        )
        stripe_cid = customer.id
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {"stripe_customer_id": stripe_cid}},
        )

    # Create Setup Intent
    setup_intent = s.SetupIntent.create(
        customer=stripe_cid,
        payment_method_types=["card"],
        metadata={"client_id": client_id, "admin_id": admin_id},
    )

    return {
        "client_secret": setup_intent.client_secret,
        "setup_intent_id": setup_intent.id,
        "stripe_customer_id": stripe_cid,
    }


@router.post("/clients/{client_id}/save-payment-method")
async def save_payment_method(
    client_id: str,
    admin_token: str = Query(...),
    data: dict = Body(...),
):
    """After Setup Intent completes, save the payment method ID to the client record."""
    admin_id = await get_admin_id_from_token(admin_token)
    s = _get_stripe()

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    payment_method_id = data.get("payment_method_id")
    setup_intent_id = data.get("setup_intent_id")

    if not payment_method_id and setup_intent_id:
        si = s.SetupIntent.retrieve(setup_intent_id)
        payment_method_id = si.payment_method

    if not payment_method_id:
        raise HTTPException(status_code=400, detail="payment_method_id required")

    # Get card details for display
    pm = s.PaymentMethod.retrieve(payment_method_id)
    card_info = {}
    if pm.card:
        card_info = {
            "brand": pm.card.brand,
            "last4": pm.card.last4,
            "exp_month": pm.card.exp_month,
            "exp_year": pm.card.exp_year,
        }

    # Set as default payment method on the Stripe Customer
    stripe_cid = client.get("stripe_customer_id")
    if stripe_cid:
        s.Customer.modify(
            stripe_cid,
            invoice_settings={"default_payment_method": payment_method_id},
        )

    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "stripe_payment_method_id": payment_method_id,
            "stripe_card_info": card_info,
            "auto_pay_enabled": True,
            "payment_method_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    return {"message": "Payment method saved", "card": card_info}


@router.get("/clients/{client_id}/payment-methods")
async def get_payment_methods(client_id: str, admin_token: str = Query(...)):
    """Get saved payment method info for a client."""
    admin_id = await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    return {
        "stripe_customer_id": client.get("stripe_customer_id"),
        "stripe_payment_method_id": client.get("stripe_payment_method_id"),
        "card": client.get("stripe_card_info"),
        "auto_pay_enabled": client.get("auto_pay_enabled", False),
    }


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


@router.post("/clients/{client_id}/charge")
async def charge_client(client_id: str, admin_token: str = Query(...), data: dict = Body(...)):
    """Manually charge a client's saved payment method."""
    admin_id = await get_admin_id_from_token(admin_token)
    s = _get_stripe()

    client = await db.clients.find_one({"id": client_id, "admin_id": admin_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    stripe_cid = client.get("stripe_customer_id")
    pm_id = client.get("stripe_payment_method_id")
    if not stripe_cid or not pm_id:
        raise HTTPException(status_code=400, detail="No saved payment method for this client")

    amount = float(data.get("amount", client.get("monthly_emi", 0)))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    currency = data.get("currency", "eur")
    description = data.get("description", f"PayLock Pro - Payment from {client.get('name', 'Client')}")

    result = await _create_payment_intent(
        s, stripe_cid, pm_id, amount, currency, description,
        client_id=client_id, admin_id=admin_id, source="manual"
    )
    return result


async def _create_payment_intent(
    s, stripe_customer_id, payment_method_id, amount, currency,
    description, client_id, admin_id, source="auto"
):
    """Create an off-session PaymentIntent and record the result."""
    payment_id = str(uuid.uuid4())
    amount_cents = int(round(amount * 100))

    try:
        intent = s.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            customer=stripe_customer_id,
            payment_method=payment_method_id,
            off_session=True,
            confirm=True,
            description=description,
            metadata={
                "client_id": client_id,
                "admin_id": admin_id,
                "source": source,
                "payment_id": payment_id,
            },
        )
        status = intent.status  # "succeeded", "requires_action", "processing"
        succeeded = status == "succeeded"
    except stripe.error.CardError as e:
        status = "failed"
        succeeded = False
        intent = None
        logger.warning(f"Card error charging client {client_id}: {e}")
    except Exception as e:
        status = "failed"
        succeeded = False
        intent = None
        logger.error(f"Stripe error charging client {client_id}: {e}")

    # Record payment transaction
    txn = {
        "id": payment_id,
        "client_id": client_id,
        "admin_id": admin_id,
        "amount": amount,
        "currency": currency,
        "status": status,
        "stripe_payment_intent_id": intent.id if intent else None,
        "source": source,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(txn)

    # If succeeded, update client balances
    if succeeded:
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
        logger.info(f"[{source}] Charged {amount} {currency} from client {client_id} - succeeded")

    return {
        "payment_id": payment_id,
        "status": status,
        "amount": amount,
        "currency": currency,
        "succeeded": succeeded,
    }
