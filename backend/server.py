"""
EMI Device Admin API - Main Server

This is the main FastAPI application file that sets up middleware,
exception handlers, and includes all route modules.
"""
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, JSONResponse
import logging
import uuid

from config import LOG_LEVEL, LOG_FORMAT
from database import db, create_indexes, close_connection
from utils.auth import set_database
from utils.exceptions import ApplicationException

# Import all routers
from routes import (
    admin_router,
    clients_router,
    device_router,
    loans_router,
    reports_router,
    notifications_router,
    support_router,
    reminders_router,
    contracts_router,
)

# Configure logging
logging.basicConfig(level=LOG_LEVEL, format=LOG_FORMAT)
logger = logging.getLogger(__name__)

# Create the main app
app = FastAPI(title="Loan Phone Lock API", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== EXCEPTION HANDLERS =====================

@app.exception_handler(ApplicationException)
async def application_exception_handler(request, exc: ApplicationException):
    """Handle custom application exceptions."""
    logger.error(f"Application exception [{exc.correlation_id}]: {exc.error_code} - {exc.message}")
    status_codes = {
        "VALIDATION_ERROR": 422,
        "AUTHENTICATION_ERROR": 401,
        "AUTHORIZATION_ERROR": 403,
    }
    status_code = status_codes.get(exc.error_code, 500)
    return JSONResponse(status_code=status_code, content=exc.to_response())


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle all unhandled exceptions."""
    correlation_id = str(uuid.uuid4())
    logger.error(f"Unhandled exception [{correlation_id}]: {type(exc).__name__}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "An unexpected error occurred. Please try again later.",
            "code": "INTERNAL_ERROR",
            "correlation_id": correlation_id
        }
    )


# ===================== INCLUDE ROUTERS =====================

# All routes are prefixed with /api
app.include_router(admin_router, prefix="/api")
app.include_router(clients_router, prefix="/api")
app.include_router(device_router, prefix="/api")
app.include_router(loans_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(support_router, prefix="/api")
app.include_router(reminders_router, prefix="/api")
app.include_router(contracts_router, prefix="/api")


# ===================== ROOT ENDPOINTS =====================

@app.get("/api/")
async def root():
    """API root endpoint."""
    return {"message": "EMI Device Admin API v2.0.0", "status": "running"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# ===================== LIFECYCLE EVENTS =====================

@app.on_event("startup")
async def startup_event():
    """Initialize database and create indexes on startup."""
    set_database(db)
    await create_indexes()
    
    # Ensure default loan plan exists
    default_name = "One-Time Simple 50% Monthly"
    existing = await db.loan_plans.find_one({"name": default_name})
    if not existing:
        from models.schemas import LoanPlan
        default_plan = LoanPlan(
            name=default_name,
            interest_rate=50.0,
            min_tenure_months=1,
            max_tenure_months=1,
            processing_fee_percent=0.0,
            late_fee_percent=5.0,
            description="Simple one-time 50% interest loan for 1 month",
            is_active=True
        )
        await db.loan_plans.insert_one(default_plan.dict())
        logger.info("Created default loan plan")


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown."""
    await close_connection()
