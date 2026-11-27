"""UTC-aware datetime helpers.

Loan due-date and overdue math must not mix naive ``datetime.utcnow()`` values
with timezone-aware timestamps. Every helper here returns or compares UTC.
"""
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Union

DateLike = Union[datetime, date, str, None]


def utc_now() -> datetime:
    """Current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def as_utc(value: DateLike) -> Optional[datetime]:
    """Parse a datetime/date/ISO string and return an aware UTC datetime.

    Date-only values (``YYYY-MM-DD`` or ``datetime.date``) are treated as
    midnight UTC. ``None`` or unparsable values return ``None``.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        # Allow a trailing Z, and accept date-only strings.
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            if "T" in text or " " in text or "+" in text[10:]:
                parsed = datetime.fromisoformat(text.replace(" ", "T", 1))
            else:
                parsed = datetime.fromisoformat(text[:10])
        except (ValueError, TypeError):
            try:
                parsed = datetime.strptime(text[:10], "%Y-%m-%d")
            except (ValueError, TypeError):
                return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


def date_only(value: DateLike) -> Optional[str]:
    """Return ``YYYY-MM-DD`` in UTC, or None."""
    parsed = as_utc(value)
    if not parsed:
        return None
    return parsed.strftime("%Y-%m-%d")


def days_between(start: DateLike, end: DateLike) -> Optional[int]:
    """Whole UTC days from start to end (end - start). None if either is missing."""
    start_dt = as_utc(start)
    end_dt = as_utc(end)
    if start_dt is None or end_dt is None:
        return None
    return (end_dt.date() - start_dt.date()).days


def add_days(value: DateLike, days: int) -> Optional[datetime]:
    parsed = as_utc(value)
    if parsed is None:
        return None
    return parsed + timedelta(days=days)
