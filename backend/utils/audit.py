"""Audit logging utility functions."""
from datetime import datetime
from typing import Optional
import logging

from database import db
from models.schemas import AuditLog

logger = logging.getLogger(__name__)


async def log_audit(
    admin_id: str,
    action_type: str,
    target_type: str = "",
    target_id: Optional[str] = None,
    target_name: Optional[str] = None,
    details: str = "",
    ip_address: Optional[str] = None
):
    """Log an admin action to the audit log."""
    try:
        # Get admin username
        admin = await db.admins.find_one({"id": admin_id})
        admin_username = admin.get("username", "") if admin else ""
        
        audit_log = AuditLog(
            admin_id=admin_id,
            admin_username=admin_username,
            action_type=action_type,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            details=details,
            ip_address=ip_address,
            created_at=datetime.utcnow()
        )
        
        await db.audit_logs.insert_one(audit_log.dict())
        logger.debug(f"Audit log created: {action_type} by {admin_username}")
        
    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")


# Action type constants
class AuditAction:
    # Auth actions
    LOGIN = "login"
    LOGOUT = "logout"
    
    # Client actions
    CLIENT_CREATE = "client_create"
    CLIENT_UPDATE = "client_update"
    CLIENT_DELETE = "client_delete"
    CLIENT_LOCK = "client_lock"
    CLIENT_UNLOCK = "client_unlock"
    CLIENT_WARNING = "client_warning"
    CLIENT_ALLOW_UNINSTALL = "client_allow_uninstall"
    
    # Loan actions
    LOAN_SETUP = "loan_setup"
    PAYMENT_RECORD = "payment_record"
    LOAN_PLAN_CREATE = "loan_plan_create"
    LOAN_PLAN_UPDATE = "loan_plan_update"
    LOAN_PLAN_DELETE = "loan_plan_delete"
    
    # Admin actions
    ADMIN_CREATE = "admin_create"
    ADMIN_DELETE = "admin_delete"
    CREDITS_ASSIGN = "credits_assign"
    SETTINGS_UPDATE = "settings_update"
    
    # Credit score actions
    CREDIT_SCORE_UPDATE = "credit_score_update"
    CREDIT_SCORE_ADJUST = "credit_score_manual_adjust"
    
    # Bulk actions
    BULK_LOCK = "bulk_lock"
    BULK_UNLOCK = "bulk_unlock"
    BULK_WARNING = "bulk_warning"
    
    # Code generation
    REGISTRATION_CODE_GENERATE = "registration_code_generate"
