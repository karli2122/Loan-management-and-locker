"""Single overdue pipeline used by background tasks and calculate-all.

Covers every client with a ``next_payment_due`` (including one-time loans
that have no ``payment_schedules`` row). Late fees and auto-lock use the
same helpers so running both paths cannot double-charge or disagree.
"""
import logging
from typing import Optional

from utils.calculations import (
    DEFAULT_AUTO_LOCK_GRACE_DAYS,
    DEFAULT_LATE_FEE_FREQUENCY_DAYS,
    calculate_period_late_fee,
    money,
    resolve_late_fee_percent,
    should_apply_late_fee,
)
from utils.timeutils import days_between, utc_now

logger = logging.getLogger(__name__)


async def _load_plan(db, client: dict) -> Optional[dict]:
    plan_id = client.get("loan_plan_id")
    if not plan_id:
        return None
    return await db.loan_plans.find_one({"id": plan_id}, {"_id": 0})


async def apply_overdue_for_client(
    db,
    client: dict,
    *,
    admin_settings: Optional[dict] = None,
    apply_lock: bool = True,
    apply_fees: bool = True,
    today=None,
    notify=None,
) -> dict:
    """Update overdue flags, maybe charge a late-fee period, maybe auto-lock.

    Returns a result dict describing what changed. Idempotent with respect
    to fee frequency (``last_late_fee_date``).
    """
    today = today or utc_now()
    admin_settings = admin_settings or {}
    client_id = client.get("id")
    due = client.get("next_payment_due") or client.get("loan_due_date")
    outstanding = money(client.get("outstanding_balance") or 0)

    result = {
        "client_id": client_id,
        "days_overdue": 0,
        "is_late": False,
        "fee_applied": 0.0,
        "locked": False,
        "credit_penalized": False,
        "skipped": False,
    }

    if not client_id or outstanding <= 0 or client.get("is_deleted"):
        result["skipped"] = True
        return result

    days = days_between(due, today)
    if days is None:
        result["skipped"] = True
        return result

    if days <= 0:
        unset = {
            "days_overdue": 0,
            "is_late": False,
        }
        await db.clients.update_one({"id": client_id}, {"$set": unset})
        return result

    result["days_overdue"] = days
    result["is_late"] = True

    grace = client.get("auto_lock_grace_days")
    if grace is None:
        grace = admin_settings.get("auto_lock_grace_days", DEFAULT_AUTO_LOCK_GRACE_DAYS)
    grace = int(grace or 0)

    update = {
        "days_overdue": days,
        "is_late": True,
    }

    # Credit-score penalty once per overdue period (cleared on a full catch-up).
    if not client.get("late_score_penalized"):
        try:
            from routes.credit_score import update_credit_score
            await update_credit_score(
                client_id=client_id,
                change_amount=-10,
                reason=f"late_payment_detected_{days}_days",
                admin_id=client.get("admin_id"),
            )
            update["late_score_penalized"] = True
            result["credit_penalized"] = True
        except Exception as exc:
            logger.error("Credit score penalty failed for %s: %s", client_id, exc)

    auto_late_fee = admin_settings.get("payment_auto_late_fee_enabled", True)
    fee_freq = admin_settings.get(
        "payment_late_fee_frequency_days", DEFAULT_LATE_FEE_FREQUENCY_DAYS
    )
    if apply_fees and auto_late_fee and should_apply_late_fee(
        days, grace, client.get("last_late_fee_date"), fee_freq, today
    ):
        plan = await _load_plan(db, client)
        percent = resolve_late_fee_percent(client, plan)
        fee = calculate_period_late_fee(outstanding, percent)
        if fee > 0:
            await db.clients.update_one(
                {"id": client_id},
                {
                    "$inc": {
                        "late_fees_accumulated": fee,
                        "outstanding_balance": fee,
                        "total_amount_due": fee,
                    },
                    "$set": {
                        **update,
                        "last_late_fee_date": today.isoformat(),
                    },
                },
            )
            # Keep the active loan ledger in sync with the fee.
            await db.loans.update_many(
                {"client_id": client_id, "status": "active"},
                {
                    "$inc": {
                        "outstanding_balance": fee,
                        "total_amount": fee,
                        "total_amount_due": fee,
                    }
                },
            )
            result["fee_applied"] = fee
            update = {}  # already written
            # Refresh outstanding for lock messaging
            outstanding = money(outstanding + fee)

    auto_lock_enabled = client.get("auto_lock_enabled", True)
    auto_lock_setting = admin_settings.get("payment_auto_lock_enabled", True)
    already_locked = bool(client.get("is_locked"))
    if (
        apply_lock
        and auto_lock_enabled
        and auto_lock_setting
        and days > grace
        and not already_locked
    ):
        lock_message = (
            f"Device auto-locked: Payment is {days} days overdue. "
            "Please contact your lender to unlock."
        )
        update.update({
            "is_locked": True,
            "lock_level": "full",
            "lock_message": lock_message,
            "lock_reason": "auto_lock",
        })
        result["locked"] = True
        if notify:
            try:
                await notify(client, locked=True, message=lock_message, reason="auto_lock")
            except Exception as exc:
                logger.error("Lock notify failed for %s: %s", client_id, exc)

    if update:
        await db.clients.update_one({"id": client_id}, {"$set": update})

    return result
