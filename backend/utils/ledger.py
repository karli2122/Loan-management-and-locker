"""Payment application helpers shared by routes and tests.

A payment must hit both the ``clients`` document and the active ``loans``
row. The loan collection is what the device status endpoint treats as the
ledger, so updating only the client leaves the lock screen showing a stale
balance.
"""
from datetime import datetime
from typing import Optional

from dateutil.relativedelta import relativedelta

from utils.calculations import money, should_advance_due_date
from utils.timeutils import as_utc, date_only, utc_now


def payment_ledger_updates(
    client: dict,
    payment_amount: float,
    loan: Optional[dict] = None,
    payment_date=None,
):
    """Compute the post-payment balances and due-date change (no I/O).

    Returns a dict suitable for applying with ``$inc`` / ``$set`` on both
    the client and the loan documents.
    """
    amount = money(payment_amount)
    if amount <= 0:
        raise ValueError("Payment amount must be positive")

    client_outstanding = money(client.get("outstanding_balance") or 0)
    client_paid = money(client.get("total_paid") or 0)
    # Prefer the loan ledger when present and it looks like the active loan.
    if loan is not None and loan.get("outstanding_balance") is not None:
        outstanding_before = money(loan.get("outstanding_balance") or 0)
        paid_before = money(loan.get("total_paid") or 0)
    else:
        outstanding_before = client_outstanding
        paid_before = client_paid

    new_outstanding = money(max(0.0, outstanding_before - amount))
    new_paid = money(paid_before + amount)
    cleared = new_outstanding <= 0

    payment_type = (
        (loan or {}).get("payment_type")
        or client.get("payment_type")
        or "single"
    )
    installment = (
        (loan or {}).get("installment_amount")
        or (loan or {}).get("next_payment_amount")
        or client.get("installment_amount")
    )
    # For one-time loans, monthly_emi was historically set to the lump sum;
    # should_advance_due_date already refuses to bump single loans.
    if installment is None:
        installment = client.get("monthly_emi")

    current_due = (
        client.get("next_payment_due")
        or (loan or {}).get("next_payment_date")
        or (loan or {}).get("due_date")
    )
    advance = should_advance_due_date(
        payment_type, amount, new_outstanding, installment
    )

    next_due = current_due
    if cleared:
        next_due = current_due  # keep historical due date for records
    elif advance:
        parsed = as_utc(current_due) or utc_now()
        next_due = (parsed + relativedelta(months=1)).strftime("%Y-%m-%d")
    else:
        next_due = date_only(current_due) or current_due

    late_fees = money(client.get("late_fees_accumulated") or 0)
    if cleared:
        late_fees = 0.0
        is_late = False
        days_overdue = 0
        late_score_penalized = False
    else:
        # Partial payment: keep accrued late fees and the original due date
        # so the overdue pipeline does not lose the period.
        is_late = bool(client.get("is_late"))
        days_overdue = client.get("days_overdue") or 0
        late_score_penalized = bool(client.get("late_score_penalized"))

    paid_at = payment_date or utc_now()
    if isinstance(paid_at, datetime):
        paid_at_value = paid_at
    else:
        paid_at_value = as_utc(paid_at) or utc_now()

    return {
        "amount": amount,
        "outstanding_before": outstanding_before,
        "outstanding_after": new_outstanding,
        "total_paid_after": new_paid,
        "cleared": cleared,
        "next_payment_due": next_due,
        "late_fees_accumulated": late_fees,
        "is_late": is_late,
        "days_overdue": days_overdue,
        "late_score_penalized": late_score_penalized,
        "last_payment_date": paid_at_value,
        "advanced_due_date": bool(advance),
        "payment_type": payment_type,
    }


async def apply_payment_to_client_and_loan(db, client_id: str, updates: dict, loan: Optional[dict] = None):
    """Persist the ledger updates to clients and the active loan (atomic $inc)."""
    from pymongo import ReturnDocument

    inc_paid = updates["amount"]

    set_fields = {
        "last_payment_date": updates["last_payment_date"],
        "next_payment_due": updates["next_payment_due"],
        "days_overdue": updates["days_overdue"],
        "is_late": updates["is_late"],
        "late_fees_accumulated": updates["late_fees_accumulated"],
        "late_score_penalized": updates["late_score_penalized"],
        "outstanding_balance": updates["outstanding_after"],
    }
    if updates["cleared"]:
        set_fields["is_locked"] = False
        set_fields["lock_message"] = ""

    # $inc for concurrency on total_paid; outstanding is set to the computed
    # floor of zero so overshoot cannot go negative. We still $inc first then
    # clamp, matching the previous client-only behaviour.
    updated = await db.clients.find_one_and_update(
        {"id": client_id},
        {
            "$inc": {"total_paid": inc_paid},
            "$set": set_fields,
        },
        return_document=ReturnDocument.AFTER,
    )

    loan_filter = None
    if loan and loan.get("id"):
        loan_filter = {"id": loan["id"]}
    else:
        # Fall back to the client's active loan, or any active loan for the client.
        if updated and updated.get("active_loan_id"):
            loan_filter = {"id": updated["active_loan_id"]}
        else:
            loan_filter = {"client_id": client_id, "status": "active"}

    loan_set = {
        "outstanding_balance": updates["outstanding_after"],
        "total_paid": updates["total_paid_after"],
        "next_payment_date": updates["next_payment_due"],
        "updated_at": utc_now(),
    }
    if updates["cleared"]:
        loan_set["status"] = "paid"
    await db.loans.update_one(loan_filter, {"$set": loan_set, "$inc": {}})

    return updated
