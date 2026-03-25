"""Contact route - sends emails for website contact form with rate limiting."""
import os
import asyncio
import time
from collections import defaultdict
from fastapi import APIRouter, Body, HTTPException, Request
import resend

router = APIRouter(tags=["contact"])

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
CONTACT_EMAIL = "support@paylock.pro"

# Rate limiting: max 3 submissions per IP per 5 minutes
RATE_LIMIT_WINDOW = 300  # 5 minutes in seconds
RATE_LIMIT_MAX = 3
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(key: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.time()
    # Prune old entries outside the window
    _rate_limit_store[key] = [t for t in _rate_limit_store[key] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limit_store[key]) >= RATE_LIMIT_MAX:
        return False
    _rate_limit_store[key].append(now)
    return True


@router.post("/api/contact")
async def contact_form(request: Request, data: dict = Body(...)):
    # Rate limit by client IP
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(f"ip:{client_ip}"):
        raise HTTPException(
            status_code=429,
            detail="Too many messages. Please wait a few minutes before sending again."
        )

    # Also rate limit by email to prevent abuse from different IPs
    email = data.get("email", "")
    if email and not _check_rate_limit(f"email:{email}"):
        raise HTTPException(
            status_code=429,
            detail="Too many messages from this email. Please wait a few minutes."
        )

    name = data.get("name", "")
    subject = data.get("subject", "Contact Form")
    message = data.get("message", "")

    if not email or not message:
        return {"success": False, "error": "Email and message are required"}

    html = f"""
    <div style="font-family:Arial;padding:20px">
        <h2>New Contact Form Submission</h2>
        <p><b>Name:</b> {name}</p>
        <p><b>Email:</b> {email}</p>
        <p><b>Subject:</b> {subject}</p>
        <p><b>Message:</b></p>
        <p style="background:#f5f5f5;padding:16px;border-radius:8px">{message}</p>
    </div>"""

    try:
        await asyncio.to_thread(resend.Emails.send, {
            "from": SENDER_EMAIL,
            "to": [CONTACT_EMAIL],
            "reply_to": email,
            "subject": f"PayLock Pro Contact: {subject}",
            "html": html,
        })
        return {"success": True, "message": "Message sent successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}
