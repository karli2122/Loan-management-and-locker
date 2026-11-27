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


def is_device_owner_enrolled(device_owner_active=None, lock_mode: str = None) -> bool:
    """True only when the device has actually reported Device Owner enrollment."""
    if device_owner_active is True:
        return True
    # lock_mode is the *intended* enrollment, not proof that DO is active.
    return False


def device_capabilities(
    *,
    lock_mode: str = "device_admin",
    device_owner_active=None,
    device_admin_active=None,
) -> dict:
    """What this enrollment can actually do on Android.

    Device Admin (the 8-digit registration code; existing 16-char codes also work) can force-lock the keyguard, disable the
    camera, and (while still active) request a factory reset. It cannot
    suspend packages, pin the app without a user prompt, or set a default
    launcher. Those need Device Owner.
    """
    enrollment = lock_mode if lock_mode in ("device_admin", "device_owner") else "device_admin"
    owner = bool(device_owner_active)
    admin = bool(device_admin_active) or owner
    gaps = []
    if not admin:
        gaps.append("Device Admin is not active — lockNow, camera disable, and wipe are unavailable")
    if not owner:
        gaps.append("Restricted mode (package suspension / unattended lock-task) requires Device Owner")
        gaps.append("Silent kiosk, default-launcher, and user restrictions require Device Owner")
        if enrollment == "device_owner":
            gaps.append("Enrollment is Device Owner but the device has not reported owner status — treat as Device Admin until it does")
    supported = ["none", "warning", "full"]
    if owner:
        supported.append("restricted")
    return {
        "enrollment": enrollment,
        "device_admin_active": admin,
        "device_owner_active": owner,
        "can_lock_now": admin,
        "can_wipe_while_admin_active": admin,
        "can_disable_camera": admin,
        "can_suspend_packages": owner,
        "can_lock_task_unattended": owner,
        "can_set_default_launcher": owner,
        "can_user_restrictions": owner,
        "can_overlay_lock": True,
        "supported_lock_levels": supported,
        "restricted_fallback": None if owner else "full",
        "gaps": gaps,
    }


def resolve_applied_lock_level(
    requested: str = None,
    *,
    device_owner_active=None,
    default: str = "full",
) -> tuple:
    """Return (applied_level, fallback_reason_or_None).

    Restricted mode is downgraded to full lock when the device is not a
    Device Owner, so a Device Admin phone still gets a real lock (overlay /
    lock screen) instead of a no-op banner.
    """
    level = normalize_lock_level(requested, default)
    if level == "restricted" and not bool(device_owner_active):
        return "full", "device_admin_no_package_suspend"
    return level, None


def tamper_lock_updates(tamper_type: str, uninstall_allowed: bool = False) -> dict:
    """Fields to set on the client after a verified device tamper report.

    Admin-disable is always recorded as admin_mode_active=False. When the
    uninstall was not authorized, the device is put into a full lock so a
    later status poll stays locked even if the local UI failed to lock.
    """
    kind = (tamper_type or "unknown").strip().lower()
    updates = {}
    if kind.startswith("admin_disabled") or kind == "admin_disabled":
        updates["admin_mode_active"] = False
        updates["device_owner_active"] = False
    if uninstall_allowed:
        return updates
    if kind.startswith("admin_disabled") or kind.startswith("permission_revoked"):
        updates["is_locked"] = True
        updates["lock_level"] = "full"
        updates["lock_reason"] = "tamper"
        updates["lock_message"] = (
            "Security alert: device protection was disabled. "
            "Re-enable Device Admin and contact your lender."
        )
    return updates
