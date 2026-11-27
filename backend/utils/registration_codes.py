"""Registration codes encode lock mode in their length.

New codes: 8 hex chars = device_admin, 9 = device_owner.
Existing 16-character (device_admin) and 17-character (device_owner)
codes issued earlier remain valid.
"""
import secrets
from typing import Optional


def generate_registration_code_value(lock_mode: str) -> str:
    """Issue a new registration code. Length encodes the lock mode."""
    if lock_mode == "device_owner":
        return (secrets.token_hex(4) + secrets.token_hex(1)[0]).upper()[:9]
    return secrets.token_hex(4).upper()


def lock_mode_from_registration_code(code: str, stored: Optional[str] = None) -> str:
    """Resolve lock mode from a registration code.

    If the client already has an explicit lock_mode, that wins.
    """
    if stored in ("device_admin", "device_owner"):
        return stored
    n = len((code or "").strip())
    if n == 9 or n >= 17:
        return "device_owner"
    return "device_admin"
