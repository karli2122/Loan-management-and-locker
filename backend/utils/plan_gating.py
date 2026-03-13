"""Plan gating utility - check if admin's subscription allows a feature."""
from database import db
from utils.exceptions import AuthorizationException

# Feature-to-plan mapping based on user-confirmed tiers:
# Starter: Basic loan management, payments, client management
# Business: + Analytics, Bulk Import, Restructuring, Document Vault, Device lock & unlock
# Enterprise: + RBAC, Session Management, Revenue Forecasting, Audit Logs, Bank Statement Analyze
FEATURE_PLANS = {
    # Starter features (available to all)
    "clients": "starter",
    "loans": "starter",
    "payments": "starter",
    "messaging": "starter",
    "reports": "starter",
    "notifications": "starter",
    "contracts": "starter",
    "loan_plans": "starter",
    "calculator": "starter",

    # Business features
    "device_lock": "business",
    "auto_lock": "business",
    "reminders": "business",
    "collection_trends": "business",
    "bulk_import": "business",
    "loan_restructure": "business",
    "document_vault": "business",
    "daily_digest": "business",

    # Enterprise features
    "device_owner": "enterprise",
    "custom_launcher": "enterprise",
    "credit_scoring": "enterprise",
    "audit_log": "enterprise",
    "revenue_forecast": "enterprise",
    "portfolio_health": "enterprise",
    "risk_score_tracking": "enterprise",
    "comparative_analytics": "enterprise",
    "session_management": "enterprise",
    "role_permissions": "enterprise",
    "screenshot_block": "enterprise",
    "tamper_detection": "enterprise",
    "bank_ocr": "enterprise",
    "reports_gps": "enterprise",
}

PLAN_HIERARCHY = {"starter": 0, "business": 1, "enterprise": 2, "custom": 3}


async def get_admin_plan(admin_id: str) -> str:
    """Get the subscription plan for an admin."""
    admin = await db.admins.find_one(
        {"id": admin_id},
        {"_id": 0, "subscription_plan": 1, "plan": 1, "is_super_admin": 1, "enterprise_id": 1}
    )
    if not admin:
        return "starter"
    if admin.get("is_super_admin"):
        return "custom"
    # If team member, inherit plan from enterprise owner
    enterprise_id = admin.get("enterprise_id")
    if enterprise_id and enterprise_id != admin_id:
        owner = await db.admins.find_one(
            {"id": enterprise_id},
            {"_id": 0, "subscription_plan": 1, "plan": 1}
        )
        if owner:
            return owner.get("subscription_plan") or owner.get("plan", "starter")
    return admin.get("subscription_plan") or admin.get("plan", "starter")


async def check_plan_access(admin_id: str, feature: str) -> bool:
    """Check if admin's plan allows access to a feature. Returns True or raises."""
    admin = await db.admins.find_one(
        {"id": admin_id},
        {"_id": 0, "subscription_plan": 1, "plan": 1, "is_super_admin": 1, "enterprise_id": 1}
    )
    if not admin:
        raise AuthorizationException("Admin not found")

    # Super admins always have access
    if admin.get("is_super_admin"):
        return True

    plan = admin.get("subscription_plan") or admin.get("plan", "starter")

    # Team members inherit their enterprise owner's plan
    enterprise_id = admin.get("enterprise_id")
    if enterprise_id and enterprise_id != admin_id:
        owner = await db.admins.find_one(
            {"id": enterprise_id},
            {"_id": 0, "subscription_plan": 1, "plan": 1}
        )
        if owner:
            plan = owner.get("subscription_plan") or owner.get("plan", "starter")

    required_plan = FEATURE_PLANS.get(feature, "starter")
    admin_level = PLAN_HIERARCHY.get(plan, 0)
    required_level = PLAN_HIERARCHY.get(required_plan, 0)

    if admin_level < required_level:
        raise AuthorizationException(
            f"This feature requires the {required_plan.title()} plan or higher. "
            f"Current plan: {plan.title()}"
        )

    return True


async def get_accessible_features(admin_id: str) -> dict:
    """Return a dict of feature -> bool indicating which features the admin can access."""
    plan = await get_admin_plan(admin_id)
    admin_level = PLAN_HIERARCHY.get(plan, 0)

    result = {}
    for feature, required_plan in FEATURE_PLANS.items():
        required_level = PLAN_HIERARCHY.get(required_plan, 0)
        result[feature] = admin_level >= required_level

    return {"plan": plan, "features": result}
