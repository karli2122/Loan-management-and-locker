"""Push a signed lock/unlock decision to a device.

The Expo push payload includes the HMAC lock signature and lock-screen
fields (amount due, contact, payment hint) so the client can enforce a
lock immediately without waiting for the next poll. Unlocks are also
signed; the client must verify the signature before clearing a lock.
"""
import logging
from utils.auth import sign_lock_state
from utils.calculations import amount_due_from_loan, money
from utils.timeutils import date_only, utc_now

logger = logging.getLogger(__name__)


async def build_lock_push_payload(db, client: dict, *, is_locked: bool, reason: str = "", message: str = "") -> dict:
    """Build a signed data payload for an Expo push notification."""
    client_id = client.get("id")
    device_token = client.get("device_token") or ""
    issued_at = int(utc_now().timestamp())
    signature = ""
    if client_id and device_token:
        signature = sign_lock_state(client_id, is_locked, device_token, issued_at)

    amount_due = money(client.get("outstanding_balance") or 0)
    due = date_only(client.get("next_payment_due") or client.get("loan_due_date"))
    try:
        loan = await db.loans.find_one(
            {"client_id": client_id, "status": "active"},
            {"_id": 0},
        )
        if loan:
            amount_due = amount_due_from_loan(loan)
            due = due or date_only(loan.get("due_date") or loan.get("next_payment_date"))
    except Exception as exc:
        logger.warning("Could not load loan for lock payload: %s", exc)

    admin_phone = admin_email = admin_name = None
    payment_instructions = client.get("payment_instructions") or ""
    admin_id = client.get("admin_id")
    if admin_id:
        try:
            admin = await db.admins.find_one(
                {"id": admin_id},
                {"_id": 0, "phone": 1, "email": 1, "first_name": 1, "last_name": 1, "payment_instructions": 1},
            )
            if admin:
                admin_phone = admin.get("phone")
                admin_email = admin.get("email")
                admin_name = " ".join(
                    p for p in [admin.get("first_name"), admin.get("last_name")] if p
                ).strip() or None
                payment_instructions = payment_instructions or admin.get("payment_instructions") or ""
        except Exception as exc:
            logger.warning("Could not load admin contact for lock payload: %s", exc)

    return {
        "action": "lock" if is_locked else "unlock",
        "is_locked": is_locked,
        "reason": reason,
        "lock_message": message or client.get("lock_message") or "",
        "lock_signature": signature,
        "lock_issued_at": issued_at,
        "client_id": client_id,
        "outstanding_balance": amount_due,
        "loan_due_date": due,
        "admin_phone": admin_phone,
        "admin_email": admin_email,
        "admin_firstname": (admin_name.split()[0] if admin_name else None),
        "payment_instructions": payment_instructions,
    }


async def notify_device_lock_change(
    db,
    client: dict,
    *,
    is_locked: bool,
    reason: str = "",
    message: str = "",
) -> bool:
    """Send the signed Expo push. Returns True if a push was attempted."""
    push_token = client.get("expo_push_token")
    if not push_token:
        return False
    payload = await build_lock_push_payload(
        db, client, is_locked=is_locked, reason=reason, message=message
    )
    title = "Device Locked" if is_locked else "Device Unlocked"
    body = message or (
        "Your device has been locked." if is_locked else "Your device has been unlocked."
    )
    try:
        from routes.reminders import send_expo_push_notification
        await send_expo_push_notification(push_token, title, body, payload)
        return True
    except Exception as exc:
        logger.error("Failed to send lock push for %s: %s", client.get("id"), exc)
        return False
