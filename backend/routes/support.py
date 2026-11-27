"""Support routes - chat messages, payment history."""
from fastapi import APIRouter, Query, HTTPException, Header
from typing import Optional
import logging

from database import db
from models.schemas import SupportMessage, SupportMessageCreate, Notification
from utils.auth import get_admin_id_from_token, verify_device, enforce_client_scope
from utils.exceptions import AuthenticationException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Support"])


async def _authorize_client_or_admin(
    client_id: str,
    admin_token: Optional[str] = None,
    device_token: Optional[str] = None,
) -> tuple[dict, str]:
    """Return (client, sender) where sender is 'admin' or 'client'.

    Admin calls must present a valid admin token and own the client.
    Device/client calls must present the per-device token issued at registration.
    """
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if admin_token:
        admin_id = await get_admin_id_from_token(admin_token)
        await enforce_client_scope(client, admin_id)
        return client, "admin"

    if device_token:
        await verify_device(client_id, device_token)
        return client, "client"

    raise AuthenticationException("Authentication required")


@router.get("/support/messages/{client_id}")
async def get_support_messages(
    client_id: str,
    admin_token: str = Query(default=None),
    device_token: str = Query(default=None),
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
):
    """Get support chat messages for a client. Requires admin or device auth."""
    await _authorize_client_or_admin(client_id, admin_token, x_device_token or device_token)

    messages = await db.support_messages.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)

    return messages


@router.post("/support/messages/{client_id}")
async def send_support_message(
    client_id: str,
    message_data: SupportMessageCreate,
    admin_token: str = Query(default=None),
    device_token: str = Query(default=None),
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
):
    """Send a support message. Sender is derived from the authenticated principal."""
    client, sender = await _authorize_client_or_admin(
        client_id, admin_token, x_device_token or device_token
    )

    message = SupportMessage(
        client_id=client_id,
        sender=sender,
        message=message_data.message
    )

    await db.support_messages.insert_one(message.dict())

    if sender == "client" and client.get("admin_id"):
        notification = Notification(
            admin_id=client["admin_id"],
            type="support_message",
            title="New Support Message",
            message=f"New message from {client['name']}: {message_data.message[:50]}...",
            client_id=client_id,
            client_name=client["name"]
        )
        await db.notifications.insert_one(notification.dict())

    return {"message": "Message sent", "id": message.id, "sender": sender}


@router.post("/support/messages/{client_id}/mark-read")
async def mark_messages_read(
    client_id: str,
    admin_token: str = Query(default=None),
    device_token: str = Query(default=None),
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
):
    """Mark support messages as read. Admins mark client messages; devices mark admin messages."""
    client, sender = await _authorize_client_or_admin(
        client_id, admin_token, x_device_token or device_token
    )
    counterpart = "client" if sender == "admin" else "admin"

    await db.support_messages.update_many(
        {"client_id": client_id, "sender": counterpart, "is_read": False},
        {"$set": {"is_read": True}}
    )

    return {"message": "Messages marked as read"}


@router.get("/payments/history/{client_id}")
async def get_payment_history(
    client_id: str,
    admin_token: str = Query(default=None),
    device_token: str = Query(default=None),
    x_device_token: Optional[str] = Header(default=None, alias="X-Device-Token"),
):
    """Get payment history for a client. Requires admin or device auth."""
    client, _ = await _authorize_client_or_admin(
        client_id, admin_token, x_device_token or device_token
    )

    payments = await db.payments.find(
        {"client_id": client_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)

    return {
        "payments": payments,
        "loan_info": {
            "loan_amount": client.get("loan_amount", 0),
            "total_paid": client.get("total_paid", 0),
            "outstanding_balance": client.get("outstanding_balance", 0),
            "monthly_emi": client.get("monthly_emi", 0),
            "next_payment_due": client.get("next_payment_due")
        }
    }


@router.get("/feature-suggestions")
async def get_feature_suggestions(admin_token: str = Query(...)):
    """Get suggested features for the application, categorized by priority."""
    await get_admin_id_from_token(admin_token)
    
    return {
        "high_priority": [
            {
                "title": "Automated Payment Scheduling",
                "description": "Allow clients to set up recurring automatic payments via bank transfer or card. Reduces overdue rates and manual collection work.",
                "impact": "Revenue protection, reduced overdue by ~30%",
                "effort": "Medium"
            },
            {
                "title": "Multi-Language SMS/Email Templates",
                "description": "Customizable reminder templates in multiple languages (Estonian, Russian, English). Personalized messages improve payment rates.",
                "impact": "Better client communication, higher collection rates",
                "effort": "Low"
            },
            {
                "title": "Client Self-Service Portal",
                "description": "Web portal where clients can view their loan balance, payment history, and make payments online. Reduces support calls.",
                "impact": "Reduced support workload, improved client experience",
                "effort": "Medium"
            },
            {
                "title": "Geofencing-Based Lock",
                "description": "Lock device only when client leaves a designated area (e.g., their home/work address), adding a flexible enforcement option.",
                "impact": "Better enforcement options, client retention",
                "effort": "High"
            },
        ],
        "medium_priority": [
            {
                "title": "Credit Scoring Integration",
                "description": "Integrate with credit bureaus to auto-assess client creditworthiness before loan approval. Reduces default risk.",
                "impact": "Risk reduction, better loan decisions",
                "effort": "High"
            },
            {
                "title": "Payment Receipt Generation",
                "description": "Auto-generate PDF receipts for each payment and send via email/WhatsApp. Improves transparency and trust.",
                "impact": "Client trust, compliance documentation",
                "effort": "Low"
            },
            {
                "title": "Bulk Client Import (CSV/Excel)",
                "description": "Import clients from spreadsheets for businesses migrating from manual tracking or other systems.",
                "impact": "Easier onboarding for new businesses",
                "effort": "Low"
            },
            {
                "title": "Admin Team Management",
                "description": "Add sub-admin accounts with role-based permissions (e.g., collection agent, accountant, manager).",
                "impact": "Scalability for growing businesses",
                "effort": "Medium"
            },
            {
                "title": "Advanced Analytics Dashboard",
                "description": "Charts and graphs showing trends: collection rate over time, default rate by month, revenue projections.",
                "impact": "Better business decisions",
                "effort": "Medium"
            },
        ],
        "nice_to_have": [
            {
                "title": "Client Photo Verification",
                "description": "Take a photo of the client during registration for identity verification and fraud prevention.",
                "impact": "Fraud reduction",
                "effort": "Low"
            },
            {
                "title": "Loan Calculator Widget",
                "description": "Embeddable widget for the business website showing monthly payments based on loan amount and interest rate.",
                "impact": "Lead generation",
                "effort": "Low"
            },
            {
                "title": "Payment Reminders via Telegram Bot",
                "description": "Automated payment reminders through a Telegram bot for clients who prefer Telegram over SMS/email.",
                "impact": "Wider communication reach",
                "effort": "Medium"
            },
            {
                "title": "Document Storage (ID, Contracts)",
                "description": "Attach and store client documents (ID copies, signed contracts, collateral photos) linked to each client profile.",
                "impact": "Better record keeping, compliance",
                "effort": "Medium"
            },
            {
                "title": "WhatsApp Business API Integration",
                "description": "Send automated reminders and payment confirmations through WhatsApp Business API (beyond deep links).",
                "impact": "Higher engagement rates",
                "effort": "Medium"
            },
        ]
    }
