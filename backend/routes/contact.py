"""Contact route - sends emails for website contact form."""
import os
import asyncio
from fastapi import APIRouter, Body
import resend

router = APIRouter(tags=["contact"])

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
CONTACT_EMAIL = "paylockpro@gmail.com"


@router.post("/api/contact")
async def contact_form(data: dict = Body(...)):
    name = data.get("name", "")
    email = data.get("email", "")
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
