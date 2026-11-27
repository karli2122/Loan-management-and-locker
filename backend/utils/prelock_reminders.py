"""Pre-lock reminder schedule helpers (pure, no I/O).

Default offsets: 3 days and 1 day before the due date, plus a final
warning on the last day of the auto-lock grace period (the day before
auto-lock fires, which happens when days_overdue > grace).
"""
from typing import Iterable, List, Optional, Sequence

DEFAULT_PRELOCK_OFFSETS_DAYS = (3, 1)


def normalize_offsets(offsets: Optional[Sequence[int]]) -> List[int]:
    if not offsets:
        return list(DEFAULT_PRELOCK_OFFSETS_DAYS)
    cleaned = []
    for raw in offsets:
        try:
            days = int(raw)
        except (TypeError, ValueError):
            continue
        if days <= 0 or days > 60:
            continue
        if days not in cleaned:
            cleaned.append(days)
    return cleaned or list(DEFAULT_PRELOCK_OFFSETS_DAYS)


def reminder_kinds_for_today(
    days_until_due: int,
    grace_days: int = 3,
    offsets: Optional[Sequence[int]] = None,
    enabled: bool = True,
    already_locked: bool = False,
) -> List[str]:
    """Return reminder kind keys that should be sent today.

    Kinds:
      - ``due_minus_<N>`` when the due date is exactly N days away
      - ``prelock_final`` when days overdue equals the grace period
        (auto-lock applies the following day)
    """
    if not enabled or already_locked:
        return []
    kinds: List[str] = []
    for days in normalize_offsets(offsets):
        if days_until_due == days:
            kinds.append(f"due_minus_{days}")
    try:
        grace = max(0, int(grace_days))
    except (TypeError, ValueError):
        grace = 3
    days_overdue = -int(days_until_due) if days_until_due < 0 else 0
    if days_overdue == grace and grace >= 0:
        kinds.append("prelock_final")
    return kinds


def reminder_dedupe_key(client_id: str, due_date: str, kind: str) -> dict:
    """Identity of one reminder for one payment period (for upsert/lookup)."""
    return {
        "client_id": client_id,
        "due_date": str(due_date)[:10],
        "kind": kind,
    }


def reminder_copy(kind: str, name: str, amount: float, days_until_due: int, grace_days: int = 3) -> dict:
    """Title/body for a pre-lock reminder push."""
    amount = float(amount or 0)
    if kind == "prelock_final":
        return {
            "title": "Final warning before device lock",
            "body": (
                f"Hi {name}, your payment of {amount:.2f} is still overdue. "
                f"Your device may be locked after the {grace_days}-day grace period. "
                "Please pay today or contact your lender."
            ),
        }
    days = days_until_due
    if kind.startswith("due_minus_"):
        try:
            days = int(kind.split("_")[-1])
        except ValueError:
            pass
    return {
        "title": "Payment reminder",
        "body": (
            f"Hi {name}, your payment of {amount:.2f} is due in {days} day(s). "
            "Please prepare your payment to avoid late fees or a device lock."
        ),
    }
