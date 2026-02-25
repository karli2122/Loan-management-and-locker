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
import os
import asyncio
import aiohttp

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
    client_auth_router,
    audit_logs_router,
    credit_score_router,
    paid_loans_router,
    bank_statements_router,
    payments_router,
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
        "NOT_FOUND_ERROR": 404,
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
app.include_router(client_auth_router, prefix="/api")
app.include_router(audit_logs_router, prefix="/api")
app.include_router(credit_score_router, prefix="/api")
app.include_router(paid_loans_router, prefix="/api")
app.include_router(bank_statements_router, prefix="/api")


# ===================== ROOT ENDPOINTS =====================

@app.get("/api/")
async def root():
    """API root endpoint."""
    return {"message": "EMI Device Admin API v2.0.0", "status": "running"}


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


KEEPALIVE_URL_ENV = "KEEPALIVE_URL"
KEEPALIVE_INTERVAL_ENV = "KEEPALIVE_INTERVAL_SECONDS"


async def keepalive_loop(base_url: str, interval: int):
    endpoint = base_url.rstrip("/")
    if not endpoint.endswith("/api/health"):
        endpoint = f"{endpoint}/api/health"

    timeout = aiohttp.ClientTimeout(total=10)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        while True:
            try:
                async with session.get(endpoint) as resp:
                    logger.info("Keepalive ping %s -> %s", endpoint, resp.status)
            except Exception as e:
                logger.warning("Keepalive ping failed: %s", e)
            await asyncio.sleep(interval)


def start_keepalive(app_instance: FastAPI):
    keepalive_url = os.environ.get(KEEPALIVE_URL_ENV)
    keepalive_interval = os.environ.get(KEEPALIVE_INTERVAL_ENV)
    if not keepalive_url or not keepalive_interval:
        logger.info("Keepalive disabled; set KEEPALIVE_URL and KEEPALIVE_INTERVAL_SECONDS to enable.")
        return

    try:
        interval = int(keepalive_interval)
    except ValueError:
        logger.error("Invalid KEEPALIVE_INTERVAL_SECONDS value: %s", keepalive_interval)
        return

    app_instance.state.keepalive_task = asyncio.create_task(keepalive_loop(keepalive_url, interval))


# ===================== LIFECYCLE EVENTS =====================

@app.on_event("startup")
async def startup_event():
    """Initialize database and create indexes on startup."""
    set_database(db)
    await create_indexes()

    # Ensure tesseract is available for OCR (SEB bank statement processing)
    import shutil, subprocess
    if not shutil.which("tesseract"):
        logger.info("Tesseract not found — installing...")
        try:
            subprocess.run(
                ["apt-get", "install", "-y", "tesseract-ocr", "tesseract-ocr-est", "tesseract-ocr-eng"],
                check=True, capture_output=True, timeout=120
            )
            logger.info("Tesseract installed successfully")
        except Exception as e:
            logger.warning(f"Tesseract install failed (OCR unavailable): {e}")
    else:
        logger.info("Tesseract available for OCR")
    
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

    start_keepalive(app)


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown."""
    keepalive_task = getattr(app.state, "keepalive_task", None)
    if keepalive_task:
        keepalive_task.cancel()
        try:
            await keepalive_task
        except asyncio.CancelledError:
            pass
    await close_connection()
