"""Plan gating utility - check if admin's subscription allows a feature."""
from database import db
from utils.exceptions import AuthorizationException

# Feature-to-plan mapping based on user-confirmed tiers:
# Starter: Up to 25 clients, Push notifications, Basic analytics dashboard, Email reminders
# Professional: Everything in Starter + Device lock & unlock, Client messaging, PDF contracts,
#   Automated payment scheduling, Auto-lock, Late fee automation, Team (3 members), GPS, Reports
# Enterprise: Everything in Professional + Unlimited team, QR/NFC provisioning, Device Owner,
#   Bank OCR, Document vault, Stripe, Scheduled reports, Portfolio health, Risk score,
#   Daily digest, Session management, RBAC, Credit scoring, Bulk import/export, API access
FEATURE_PLANS = {
    # Starter features (available to all)
    "clients": "starter",
    "loans": "starter",
    "payments": "starter",
    "notifications": "starter",
    "calculator": "starter",

    # Professional features
    "reminders": "professional",  # Payment reminders
    "device_lock": "professional",
    "auto_lock": "professional",
    "messaging": "professional",
    "contracts": "professional",
    "loan_plans": "professional",
    "collection_trends": "professional",
    "reports": "professional",
    "reports_gps": "professional",
    "late_fee": "professional",
    "loan_restructure": "professional",
    "team_management": "professional",
    "heartbeat": "professional",
    "dashboard_analytics": "professional",
    "interest_summary": "professional",
    "device_management": "professional",
    "device_info": "professional",  # Device information visibility
    "registration_code": "professional",  # Generate key / registration code

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
    "document_vault": "enterprise",
    "bulk_import": "professional",
    "daily_digest": "enterprise",
    "scheduled_reports": "enterprise",
    "stripe_integration": "enterprise",
    "qr_provisioning": "enterprise",
    "nfc_provisioning": "enterprise",
    "api_access": "enterprise",
}

# Support both "professional" and legacy "business" at the same level
PLAN_HIERARCHY = {"starter": 0, "professional": 1, "business": 1, "enterprise": 2, "custom": 3}


async def get_admin_plan(admin_id: str) -> str:
    """Get the subscription plan for an admin. Plan field is the authority."""
    admin = await db.admins.find_one(
        {"id": admin_id},
        {"_id": 0, "subscription_plan": 1, "plan": 1, "enterprise_id": 1}
    )
    if not admin:
        return "starter"
    # Check own plan first
    own_plan = admin.get("subscription_plan") or admin.get("plan")
    if own_plan:
        return own_plan
    # If team member, inherit plan from enterprise owner
    enterprise_id = admin.get("enterprise_id")
    if enterprise_id and enterprise_id != admin_id:
        owner = await db.admins.find_one(
            {"id": enterprise_id},
            {"_id": 0, "subscription_plan": 1, "plan": 1}
        )
        if owner:
            return owner.get("subscription_plan") or owner.get("plan", "starter")
    return "starter"


async def check_plan_access(admin_id: str, feature: str) -> bool:
    """Check if admin's plan allows access to a feature. Returns True or raises."""
    plan = await get_admin_plan(admin_id)

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
