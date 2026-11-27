"""Lock levels: none, warning, restricted, full.

- none: device is unlocked
- warning: device stays usable; a warning message is shown
- restricted: selected apps are suspended (Device Owner); phone, SMS,
  banking and payment packages stay on the allowlist
- full: existing full-screen kiosk / lock-task lock
"""
from typing import Iterable, List, Optional

LOCK_LEVELS = ("none", "warning", "restricted", "full")

# Packages that must remain usable in restricted mode (phone, SMS, and
# common banking/payment apps). The client app itself is always added
# at apply time. Admins can extend this per client / per settings.
DEFAULT_RESTRICTED_ALLOWLIST = [
    # Phone / dialer
    "com.android.dialer",
    "com.google.android.dialer",
    "com.samsung.android.dialer",
    "com.android.phone",
    "com.android.server.telecom",
    "com.android.incallui",
    # SMS / messaging
    "com.android.mms",
    "com.android.messaging",
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.google.android.apps.nbu.files",
    # System essentials (do not suspend)
    "com.android.systemui",
    "com.android.settings",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
    "com.android.providers.telephony",
    "com.android.providers.contacts",
    "com.android.contacts",
    "com.google.android.contacts",
    "com.android.emergency",
    # Payments / wallets (common)
    "com.google.android.apps.walletnfcrel",
    "com.google.android.gms",
    "com.android.vending",
    "net.metaquotes.metatrader",  # kept out — not a payment app
]


# Drop the accidental metatrader entry: keep a clean payments list.
DEFAULT_RESTRICTED_ALLOWLIST = [p for p in DEFAULT_RESTRICTED_ALLOWLIST if "metatrader" not in p]

# Common games/social packages used as the default *block* list when the
# admin does not provide a custom one. Restricted mode still prefers an
# allowlist; this is only a fallback blocklist hint in the admin UI.
DEFAULT_RESTRICTED_BLOCKLIST = [
    "com.facebook.katana",
    "com.facebook.lite",
    "com.instagram.android",
    "com.zhiliaoapp.musically",  # TikTok
    "com.snapchat.android",
    "com.twitter.android",
    "com.whatsapp",
    "com.whatsapp.w4b",
    "com.discord",
    "com.roblox.client",
    "com.king.candycrushsaga",
    "com.mojang.minecraftpe",
    "com.supercell.clashofclans",
    "com.supercell.clashroyale",
    "com.activision.callofduty.shooter",
    "com.tencent.ig",
]


def normalize_lock_level(value: Optional[str], default: str = "full") -> str:
    if value is None or str(value).strip() == "":
        return default
    level = str(value).strip().lower()
    if level in ("unlock", "unlocked", "off"):
        return "none"
    if level in ("warn", "warning_only"):
        return "warning"
    if level in ("restrict", "restricted_apps", "partial"):
        return "restricted"
    if level in ("lock", "locked", "kiosk", "complete"):
        return "full"
    if level in LOCK_LEVELS:
        return level
    return default


def is_effectively_locked(level: str) -> bool:
    """True when the device should be treated as locked for HMAC / UI."""
    return normalize_lock_level(level, "none") in ("restricted", "full")


def normalize_allowlist(packages: Optional[Iterable[str]], extra: Optional[Iterable[str]] = None) -> List[str]:
    items = []
    for source in (DEFAULT_RESTRICTED_ALLOWLIST, packages or [], extra or []):
        for raw in source:
            pkg = str(raw or "").strip()
            if pkg and pkg not in items:
                items.append(pkg)
    return items


def lock_signature_message(client_id: str, is_locked: bool, issued_at: int, lock_level: str = "full") -> str:
    level = normalize_lock_level(lock_level, "full" if is_locked else "none")
    return f"{client_id}|{1 if is_locked else 0}|{issued_at}|{level}"
