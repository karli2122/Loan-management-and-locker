"""Routes package - exports all routers."""
from .admin import router as admin_router
from .clients import router as clients_router
from .device import router as device_router
from .loans import router as loans_router
from .reports import router as reports_router
from .notifications import router as notifications_router
from .support import router as support_router
from .reminders import router as reminders_router

__all__ = [
    "admin_router",
    "clients_router",
    "device_router",
    "loans_router",
    "reports_router",
    "notifications_router",
    "support_router",
    "reminders_router",
]
