"""Routes package - exports all routers."""
from .admin import router as admin_router
from .clients import router as clients_router
from .device import router as device_router
from .loans import router as loans_router
from .reports import router as reports_router
from .notifications import router as notifications_router
from .support import router as support_router
from .reminders import router as reminders_router
from .contracts import router as contracts_router
from .client_auth import router as client_auth_router
from .audit_logs import router as audit_logs_router
from .credit_score import router as credit_score_router
from .paid_loans import router as paid_loans_router
from .bank_statements import router as bank_statements_router
from .payments import router as payments_router
from .messaging import router as messaging_router
from .risk_scoring import router as risk_scoring_router
from .push_notifications import router as push_notifications_router
from .forecasting import router as forecasting_router
from .loan_restructure import router as loan_restructure_router
from .sessions import router as sessions_router
from .analytics import router as analytics_router
from .document_vault import router as document_vault_router
from .stripe_connect import router as stripe_connect_router

__all__ = [
    "admin_router",
    "clients_router",
    "device_router",
    "loans_router",
    "reports_router",
    "notifications_router",
    "support_router",
    "reminders_router",
    "contracts_router",
    "client_auth_router",
    "audit_logs_router",
    "credit_score_router",
    "paid_loans_router",
    "bank_statements_router",
    "payments_router",
    "messaging_router",
    "risk_scoring_router",
    "push_notifications_router",
    "forecasting_router",
    "loan_restructure_router",
    "sessions_router",
    "analytics_router",
    "document_vault_router",
    "stripe_connect_router",
]
