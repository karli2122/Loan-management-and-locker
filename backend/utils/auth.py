"""Authentication and authorization utilities"""
import hashlib
import logging
from datetime import datetime
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from .exceptions import AuthenticationException, AuthorizationException

logger = logging.getLogger(__name__)

# Initialize Argon2 password hasher
_argon2_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)


def hash_password(password: str) -> str:
    """Hash password using Argon2id"""
    return _argon2_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against stored hash. Supports Argon2id and legacy SHA-256."""
    # Check if it's a legacy SHA-256 hash (64 hex characters)
    if len(password_hash) == 64 and all(c in '0123456789abcdef' for c in password_hash):
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        return legacy_hash == password_hash
    
    try:
        _argon2_hasher.verify(password_hash, password)
        if _argon2_hasher.check_needs_rehash(password_hash):
            logger.info("Password hash needs rehashing with updated parameters")
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


# Database reference - will be set by main app
_db = None


def set_database(db):
    """Set the database reference for auth functions"""
    global _db
    _db = db


async def verify_admin_token_header(token: str) -> bool:
    """Verify admin token existence and expiration"""
    if _db is None:
        raise RuntimeError("Database not initialized for auth")
    
    token_doc = await _db.admin_tokens.find_one({"token": token})
    if not token_doc:
        return False
    
    if "expires_at" in token_doc:
        if datetime.utcnow() > token_doc["expires_at"]:
            await _db.admin_tokens.delete_one({"token": token})
            return False
    
    return True


async def get_admin_id_from_token(admin_token: str) -> str:
    """Get admin_id from token, raising AuthenticationException if invalid"""
    if _db is None:
        raise RuntimeError("Database not initialized for auth")
    
    if not admin_token:
        raise AuthenticationException("Admin token required")
    
    token_doc = await _db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    if "expires_at" in token_doc:
        if datetime.utcnow() > token_doc["expires_at"]:
            await _db.admin_tokens.delete_one({"token": admin_token})
            raise AuthenticationException("Token expired")
    
    return token_doc["admin_id"]


def extract_token(authorization: str = None, admin_token: str = None) -> str:
    """Resolve an admin token from the Authorization header (preferred) or a
    legacy query/body param. Header form: 'Authorization: Bearer <token>'.

    Passing tokens in the URL query string leaks them into access logs, proxy
    logs and browser history, so the header is strongly preferred. The query
    fallback exists only for backward compatibility with older app builds and
    should be removed once all clients are updated.
    """
    if authorization:
        parts = authorization.split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
        # Allow a bare token in the header too.
        return authorization.strip()
    if admin_token:
        return admin_token
    return ""


def sign_lock_state(client_id: str, is_locked: bool, device_token: str, issued_at: int) -> str:
    """Produce a tamper-evident signature for a lock decision.

    Keyed with the per-device token (a shared secret the device already holds),
    so the device can verify the server really issued this is_locked value and a
    network attacker cannot forge an "unlocked" response. issued_at (unix
    seconds) lets the device reject stale/replayed payloads.
    """
    import hmac
    import hashlib
    msg = f"{client_id}|{1 if is_locked else 0}|{issued_at}".encode()
    return hmac.new(str(device_token).encode(), msg, hashlib.sha256).hexdigest()


async def verify_device(client_id: str, device_token: str) -> dict:
    """Verify a device's identity using the device_token issued at registration.

    Device-facing endpoints (location, push token, status reports) must call
    this instead of trusting a bare client_id, otherwise anyone who knows or
    guesses a client_id could read a borrower's location or tamper with their
    lock state. Returns the client document on success.
    """
    if _db is None:
        raise RuntimeError("Database not initialized for auth")

    if not client_id or not device_token:
        raise AuthenticationException("Device authentication required")

    client = await _db.clients.find_one({"id": client_id})
    if not client:
        raise AuthenticationException("Invalid device credentials")

    stored = client.get("device_token")
    # Constant-time comparison to avoid timing attacks.
    import hmac
    if not stored or not hmac.compare_digest(str(stored), str(device_token)):
        raise AuthenticationException("Invalid device credentials")

    return client


async def enforce_client_scope(client: dict, admin_id: str):
    """Ensure the requested client belongs to the provided admin scope.
    Super admins can access all clients in their enterprise."""
    from database import db
    
    # Check if admin is a super admin
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "is_super_admin": 1, "role": 1})
    is_super = admin.get("is_super_admin", False) if admin else False
    is_super = is_super or (admin and admin.get("role") in ["super_admin", "superadmin"])
    
    if is_super:
        # Super admins can access all clients in the enterprise
        return
    
    if client.get("admin_id"):
        if not admin_id or client["admin_id"] != admin_id:
            raise AuthorizationException("Client not accessible for this admin")
    elif admin_id:
        logger.warning(f"Admin {admin_id} attempted to access unassigned client {client['id']}")
        raise AuthorizationException("Client not assigned to this admin")
