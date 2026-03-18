"""
EMI Device Admin API - Main Server

This is the main FastAPI application file that sets up middleware,
exception handlers, and includes all route modules.
"""
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, JSONResponse, FileResponse, HTMLResponse
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
    messaging_router,
    risk_scoring_router,
    push_notifications_router,
    forecasting_router,
    loan_restructure_router,
    sessions_router,
    analytics_router,
    document_vault_router,
    stripe_connect_router,
)
from routes.backup import router as backup_router
from routes.provisioning import router as provisioning_router
from routes.plans import router as plans_router
from routes.schedules import router as schedules_router
from routes.team import router as team_router
from routes.telegram import router as telegram_router
from routes.documents import router as documents_router
from routes.bulk_import import router as import_router
from routes.exports import router as exports_router
from routes.report_schedules import router as report_schedules_router
from routes.contact import router as contact_router
from routes.client_payments import router as client_payments_router
from routes.app_version import router as app_version_router
from routes.loans_multi import router as loans_multi_router
from routes.registration import router as registration_router

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
app.include_router(payments_router, prefix="/api")
app.include_router(stripe_connect_router, prefix="/api")
app.include_router(backup_router)
app.include_router(provisioning_router)
app.include_router(plans_router)
app.include_router(schedules_router)
app.include_router(team_router)
app.include_router(telegram_router)
app.include_router(documents_router)
app.include_router(import_router)
app.include_router(exports_router, prefix="/api")
app.include_router(report_schedules_router)
app.include_router(contact_router)
app.include_router(client_payments_router, prefix="/api")
app.include_router(messaging_router)
app.include_router(risk_scoring_router)
app.include_router(push_notifications_router)
app.include_router(app_version_router)
app.include_router(forecasting_router)
app.include_router(loan_restructure_router)
app.include_router(sessions_router)
app.include_router(analytics_router)
app.include_router(document_vault_router)
app.include_router(loans_multi_router)
app.include_router(registration_router)


WEBSITE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "paylockpro-website")


def _serve_website_page(filename: str):
    """Serve a website HTML page with portal URL and asset paths injected."""
    file_path = os.path.join(WEBSITE_DIR, filename)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "Page not found"})
    with open(file_path, "r") as f:
        content = f.read()
    # Fix asset paths for backend serving
    content = content.replace('href="style.css"', 'href="/api/website/style.css"')
    content = content.replace('src="site.js"', 'src="/api/website/site.js"')
    # Fix page links
    content = content.replace('href="index.html"', 'href="/api/website"')
    content = content.replace('href="pricing.html"', 'href="/api/website/pricing"')
    content = content.replace('href="how-it-works.html"', 'href="/api/website/how-it-works"')
    content = content.replace('href="contact.html"', 'href="/api/website/contact"')
    content = content.replace('href="privacy-policy.html"', 'href="/api/website/privacy-policy"')
    content = content.replace('href="terms-of-use.html"', 'href="/api/website/terms-of-use"')
    content = content.replace('href="PORTAL_URL"', 'href="/api/portal"')
    return HTMLResponse(content=content)


@app.get("/api/download/website")
async def download_website():
    """Download the PayLock Pro website ZIP file."""
    import zipfile, io
    if not os.path.isdir(WEBSITE_DIR):
        return JSONResponse(status_code=404, content={"error": "Website directory not found"})
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in os.listdir(WEBSITE_DIR):
            fpath = os.path.join(WEBSITE_DIR, fname)
            if os.path.isfile(fpath):
                zf.write(fpath, f"paylockpro-website/{fname}")
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=paylockpro-website.zip"})


MANUALS_DIR = os.path.join(os.path.dirname(__file__), "static", "manuals")

@app.get("/api/download/manual/{manual_type}")
async def download_manual(manual_type: str):
    """Download a user manual PDF. Types: admin, client, portal"""
    names = {
        "admin": "PayLockPro_Admin_Manual.pdf",
        "client": "PayLockPro_Client_Manual.pdf",
        "portal": "PayLockPro_WebPortal_Manual.pdf",
    }
    fname = names.get(manual_type)
    if not fname:
        return JSONResponse(status_code=404, content={"error": f"Unknown manual type. Use: {list(names.keys())}"})
    fpath = os.path.join(MANUALS_DIR, fname)
    if not os.path.isfile(fpath):
        return JSONResponse(status_code=404, content={"error": "Manual not found. Run generation script first."})
    return FileResponse(fpath, media_type="application/pdf", filename=fname)


@app.get("/api/download/email/{asset_type}")
async def download_email_asset(asset_type: str):
    """Download email assets. Types: signature, auto-reply"""
    names = {
        "signature": "email_signature.html",
        "auto-reply": "auto_reply.html",
    }
    fname = names.get(asset_type)
    if not fname:
        return JSONResponse(status_code=404, content={"error": f"Unknown asset. Use: {list(names.keys())}"})
    fpath = os.path.join(MANUALS_DIR, fname)
    if not os.path.isfile(fpath):
        return JSONResponse(status_code=404, content={"error": "Asset not found"})
    with open(fpath, "rb") as f:
        content = f.read()
    return Response(content=content, media_type="text/html",
                    headers={"Content-Disposition": f"attachment; filename={fname}"})


@app.get("/api/website")
async def serve_website():
    """Serve the PayLock Pro marketing website homepage."""
    return _serve_website_page("index.html")


@app.get("/api/website/pricing")
async def serve_website_pricing():
    return _serve_website_page("pricing.html")


@app.get("/api/website/how-it-works")
async def serve_website_how_it_works():
    return _serve_website_page("how-it-works.html")


@app.get("/api/website/contact")
async def serve_website_contact():
    return _serve_website_page("contact.html")


@app.get("/api/website/privacy-policy")
async def serve_website_privacy():
    return _serve_website_page("privacy-policy.html")


@app.get("/api/website/terms-of-use")
async def serve_website_terms():
    return _serve_website_page("terms-of-use.html")


@app.get("/api/website/style.css")
async def serve_website_css():
    css_path = os.path.join(WEBSITE_DIR, "style.css")
    if not os.path.exists(css_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    with open(css_path, "r") as f:
        return Response(content=f.read(), media_type="text/css")


@app.get("/api/website/site.js")
async def serve_website_js():
    js_path = os.path.join(WEBSITE_DIR, "site.js")
    if not os.path.exists(js_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    with open(js_path, "r") as f:
        return Response(content=f.read(), media_type="application/javascript")


@app.get("/api/portal/translations.js")
async def serve_portal_translations():
    """Serve portal translations JS file."""
    tr_path = os.path.join(os.path.dirname(__file__), "static", "portal", "translations.js")
    if not os.path.exists(tr_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    with open(tr_path, "r") as f:
        return Response(content=f.read(), media_type="application/javascript")


@app.get("/api/portal/portal.css")
async def serve_portal_css():
    """Serve portal CSS file."""
    css_path = os.path.join(os.path.dirname(__file__), "static", "portal", "portal.css")
    if not os.path.exists(css_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    with open(css_path, "r") as f:
        return Response(content=f.read(), media_type="text/css")


@app.get("/api/portal/portal-app.js")
async def serve_portal_app_js():
    """Serve portal main application JS file."""
    js_path = os.path.join(os.path.dirname(__file__), "static", "portal", "portal-app.js")
    if not os.path.exists(js_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    with open(js_path, "r") as f:
        return Response(content=f.read(), media_type="application/javascript")


@app.get("/api/portal/{filename:path}")
async def serve_portal_file(filename: str):
    """Serve any portal static file."""
    safe_name = os.path.basename(filename)
    file_path = os.path.join(os.path.dirname(__file__), "static", "portal", safe_name)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    media = "application/javascript" if safe_name.endswith(".js") else "text/css" if safe_name.endswith(".css") else "text/html"
    with open(file_path, "r") as f:
        return Response(content=f.read(), media_type=media)



@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """Serve a downloadable file from the static directory."""
    from fastapi.responses import FileResponse
    safe_name = os.path.basename(filename)
    file_path = os.path.join(os.path.dirname(__file__), "static", safe_name)
    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(file_path, filename=safe_name)


@app.get("/api/portal")
async def serve_portal():
    """Serve the web admin portal."""
    portal_path = os.path.join(os.path.dirname(__file__), "static", "portal", "index.html")
    if not os.path.exists(portal_path):
        return JSONResponse(status_code=404, content={"error": "Portal not found"})
    with open(portal_path, "r") as f:
        return HTMLResponse(content=f.read())



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
    # Try KEEPALIVE_URL first, then fall back to APP_URL (injected by Emergent platform)
    keepalive_url = os.environ.get(KEEPALIVE_URL_ENV) or os.environ.get("APP_URL")
    keepalive_interval = os.environ.get(KEEPALIVE_INTERVAL_ENV, "30")
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

    # Check tesseract availability for OCR (SEB bank statement processing)
    import shutil
    if shutil.which("tesseract"):
        logger.info("Tesseract available for OCR")
    else:
        logger.info("Tesseract not found — OCR features will be unavailable")
    
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

    # Start background tasks
    from tasks import process_due_payments, send_scheduled_reports, process_auto_reminders, send_daily_digest
    asyncio.create_task(process_due_payments())
    asyncio.create_task(send_scheduled_reports())
    asyncio.create_task(process_auto_reminders())
    asyncio.create_task(send_daily_digest())
    logger.info("Background tasks started (payment scheduler, report emailer, auto reminders, daily digest)")


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
