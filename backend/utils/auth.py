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
    if not _db:
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
    if not _db:
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


async def enforce_client_scope(client: dict, admin_id: str):
    """Ensure the requested client belongs to the provided admin scope"""
    if client.get("admin_id"):
        if not admin_id or client["admin_id"] != admin_id:
            raise AuthorizationException("Client not accessible for this admin")
    elif admin_id:
        logger.warning(f"Admin {admin_id} attempted to access unassigned client {client['id']}")
        raise AuthorizationException("Client not assigned to this admin")
