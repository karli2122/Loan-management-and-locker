"""Plan enforcement - feature gating by subscription tier."""
from fastapi import APIRouter, Query
from utils.auth import get_admin_id_from_token
from database import db

router = APIRouter(prefix="/api/plans", tags=["plans"])

PLAN_LIMITS = {
    "starter": {
        "max_clients": 20,
        "lock_unlock": False,
        "auto_lock": False,
        "reminders": False,
        "reports": False,
        "bank_analyzer": False,
        "business_management": False,
        "device_owner": False,
        "backup": False,
        "credit_score": False,
    },
    "business": {
        "max_clients": 200,
        "lock_unlock": True,
        "auto_lock": True,
        "reminders": True,
        "reports": True,
        "bank_analyzer": True,
        "business_management": True,
        "device_owner": False,
        "backup": True,
        "credit_score": True,
    },
    "enterprise": {
        "max_clients": 1000,
        "lock_unlock": True,
        "auto_lock": True,
        "reminders": True,
        "reports": True,
        "bank_analyzer": True,
        "business_management": True,
        "device_owner": True,
        "backup": True,
        "credit_score": True,
    },
    "custom": {
        "max_clients": 999999,
        "lock_unlock": True,
        "auto_lock": True,
        "reminders": True,
        "reports": True,
        "bank_analyzer": True,
        "business_management": True,
        "device_owner": True,
        "backup": True,
        "credit_score": True,
    },
}


@router.get("/limits")
async def get_plan_limits(admin_token: str = Query(...)):
    """Get current plan limits for the admin."""
    admin_id = await get_admin_id_from_token(admin_token)
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        return {"plan": "starter", "limits": PLAN_LIMITS["starter"], "is_super_admin": False}

    is_super = admin.get("is_super_admin", False)

    # Superadmins get custom plan limits
    if is_super:
        return {"plan": "custom", "limits": PLAN_LIMITS["custom"], "is_super_admin": True}

    # Check subscription
    sub = await db.subscriptions.find_one({"admin_id": admin_id}, {"_id": 0})
    plan = "starter"
    if sub and sub.get("status") == "active":
        plan = sub.get("plan", "starter")

    # Also check admin.plan field
    admin_plan = admin.get("plan", "")
    if admin_plan in PLAN_LIMITS and admin_plan != "starter":
        plan = admin_plan

    limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])

    # Count current clients
    client_count = await db.clients.count_documents({
        "admin_id": admin_id,
        "is_deleted": {"$ne": True},
    })

    return {
        "plan": plan,
        "limits": limits,
        "is_super_admin": is_super,
        "current_clients": client_count,
        "can_add_client": client_count < limits["max_clients"],
    }


@router.get("/features")
async def get_all_plans():
    """Get all plan features for the pricing page."""
    return {
        "plans": [
            {
                "id": "starter",
                "name": "Starter",
                "price": 29,
                "currency": "EUR",
                "period": "month",
                "max_clients": 20,
                "features": [
                    "Up to 20 clients",
                    "Basic client management",
                    "Payment tracking",
                    "Multi-language support",
                ],
                "not_included": [
                    "Device Lock/Unlock",
                    "Auto-lock",
                    "Payment Reminders",
                    "Reports & Analytics",
                    "Bank Statement Analyzer",
                    "Data Backup",
                ],
            },
            {
                "id": "business",
                "name": "Business",
                "price": 79,
                "currency": "EUR",
                "period": "month",
                "max_clients": 200,
                "popular": True,
                "features": [
                    "Up to 200 clients",
                    "Device Lock/Unlock",
                    "Auto-lock on overdue",
                    "Email & Telegram Reminders",
                    "Reports & Analytics",
                    "Bank Statement Analyzer",
                    "Cloud Backup",
                    "Credit Score System",
                    "Business Management",
                ],
                "not_included": [
                    "Device Owner mode",
                ],
            },
            {
                "id": "enterprise",
                "name": "Enterprise",
                "price": 199,
                "currency": "EUR",
                "period": "month",
                "max_clients": 1000,
                "features": [
                    "Up to 1000 clients",
                    "Everything in Business",
                    "Device Owner kiosk mode",
                    "Custom Launcher",
                    "Priority support",
                ],
                "not_included": [],
            },
            {
                "id": "custom",
                "name": "Custom",
                "price": 0,
                "currency": "EUR",
                "period": "month",
                "max_clients": 999999,
                "contact_sales": True,
                "features": [
                    "Unlimited clients",
                    "Everything in Enterprise",
                    "Dedicated support",
                    "Custom integrations",
                    "SLA guarantee",
                ],
                "not_included": [],
            },
        ]
    }
