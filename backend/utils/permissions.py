"""Permission enforcement middleware for role-based access control."""
from functools import wraps
from database import db
from utils.auth import get_admin_id_from_token
from utils.exceptions import AuthorizationException

# Permission mapping for roles
ROLE_PERMISSIONS = {
    "super_admin": {"all"},
    "superadmin": {"all"},  # Alias for super_admin
    "full_admin": {"clients", "loans", "payments", "reminders", "reports", "devices",
                   "contracts", "schedules", "documents", "import", "settings", "team",
                   "clients_read", "reports_read", "loans_read"},
    "admin": {"clients", "loans", "payments", "reminders", "reports", "devices",
              "contracts", "schedules", "documents", "import", "settings", "team",
              "clients_read", "reports_read", "loans_read"},  # Alias for full_admin
    "collections": {"clients", "loans", "payments", "reminders", "contracts",
                    "clients_read", "loans_read"},
    "viewer": {"clients_read", "reports_read", "loans_read"},
}


async def check_permission(admin_token: str, required_permission: str) -> str:
    """Check if admin has the required permission. Returns admin_id if authorized.
    
    Args:
        admin_token: The admin's auth token
        required_permission: e.g. 'clients', 'loans', 'payments', 'settings', 'clients_read'
    
    Raises:
        AuthorizationException if the admin lacks the permission.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1, "is_super_admin": 1})
    if not admin:
        raise AuthorizationException("Admin not found")
    
    role = admin.get("role", "full_admin")
    if admin.get("is_super_admin"):
        role = "super_admin"
    
    perms = ROLE_PERMISSIONS.get(role, set())
    
    if "all" in perms:
        return admin_id
    
    # Read permissions are implied by write permissions
    if required_permission.endswith("_read"):
        base_perm = required_permission.replace("_read", "")
        if base_perm in perms or required_permission in perms:
            return admin_id
    elif required_permission in perms:
        return admin_id
    
    raise AuthorizationException(f"Insufficient permissions. Role '{role}' does not have '{required_permission}' access.")
