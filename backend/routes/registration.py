"""Admin registration and email verification routes."""
import os
import uuid
import random
import string
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, EmailStr
from typing import Optional
import argon2

from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

ph = argon2.PasswordHasher()

# Email configuration - using Resend
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")


class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    address: str
    email: EmailStr
    phone: str
    username: str
    password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


async def send_verification_email(email: str, code: str, first_name: str):
    """Send verification email using Resend."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return False
    
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        
        resend.Emails.send({
            "from": "PayLock Pro <noreply@paylockpro.com>",
            "to": email,
            "subject": "Verify Your PayLock Pro Account",
            "html": f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2563EB;">Welcome to PayLock Pro!</h1>
                <p>Hi {first_name},</p>
                <p>Thank you for registering. Please use the following verification code to complete your registration:</p>
                <div style="background: #F3F4F6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563EB;">{code}</span>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't register for PayLock Pro, please ignore this email.</p>
                <p style="color: #6B7280; font-size: 12px; margin-top: 40px;">
                    PayLock Pro - Loan Management Made Simple
                </p>
            </div>
            """
        })
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email: {e}")
        return False


@router.post("/register")
async def register_admin(req: RegisterRequest):
    """Register a new admin account. Sends verification email."""
    # Check if username exists in admins
    existing_username = await db.admins.find_one({"username": req.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Check if username exists in pending registrations
    existing_pending_username = await db.pending_registrations.find_one(
        {"username": req.username, "verified": False}
    )
    if existing_pending_username:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Check if email exists in admins
    existing_email = await db.admins.find_one({"email": req.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if email exists in pending registrations
    existing_pending_email = await db.pending_registrations.find_one(
        {"email": req.email, "verified": False}
    )
    if existing_pending_email:
        raise HTTPException(status_code=400, detail="Email already registered. Please check your email for verification code or use resend verification.")
    
    # Generate verification code
    verification_code = ''.join(random.choices(string.digits, k=6))
    verification_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    # Create pending registration
    pending_id = str(uuid.uuid4())
    pending_registration = {
        "id": pending_id,
        "first_name": req.first_name,
        "last_name": req.last_name,
        "address": req.address,
        "email": req.email,
        "phone": req.phone,
        "username": req.username,
        "password_hash": ph.hash(req.password),
        "verification_code": verification_code,
        "verification_expires": verification_expires,
        "verified": False,
        "created_at": datetime.now(timezone.utc),
    }
    
    await db.pending_registrations.insert_one(pending_registration)
    
    # Send verification email
    email_sent = await send_verification_email(req.email, verification_code, req.first_name)
    
    return {
        "success": True,
        "message": "Verification code sent to your email",
        "email": req.email,
        "email_sent": email_sent,
        # For testing when email is not configured or email sending failed
        "debug_code": verification_code if (not RESEND_API_KEY or not email_sent) else None
    }


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest):
    """Verify email with the code and create the admin account."""
    # Find pending registration
    pending = await db.pending_registrations.find_one(
        {"email": req.email, "verified": False},
        {"_id": 0}
    )
    
    if not pending:
        raise HTTPException(status_code=404, detail="No pending registration found")
    
    # Check if code expired
    expires = pending.get("verification_expires")
    if expires:
        # Make sure both datetimes are timezone-aware
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Verification code expired. Please register again.")
    
    # Check code
    if pending.get("verification_code") != req.code:
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Mark as verified
    await db.pending_registrations.update_one(
        {"email": req.email},
        {"$set": {"verified": True}}
    )
    
    # Create the admin account with DEMO plan
    admin_id = str(uuid.uuid4())
    token = ''.join(random.choices(string.ascii_lowercase + string.digits, k=64))
    
    # Determine role based on plan: enterprise/custom get admin role, others get user role
    plan = pending.get("plan", "demo").lower() if pending.get("plan") else "demo"
    role = "admin" if plan in ["enterprise", "custom"] else "user"
    
    new_admin = {
        "id": admin_id,
        "username": pending["username"],
        "password_hash": pending["password_hash"],
        "first_name": pending["first_name"],
        "last_name": pending["last_name"],
        "email": pending["email"],
        "phone": pending["phone"],
        "address": pending["address"],
        "token": token,
        "role": role,
        "is_super_admin": False,
        "plan": plan,
        "subscription_plan": plan,
        "subscription_renewal_date": None,  # Demo has no renewal
        "subscription_status": "demo",
        "created_at": datetime.now(timezone.utc),
        "verified_at": datetime.now(timezone.utc),
    }
    
    await db.admins.insert_one(new_admin)
    
    # Create token in admin_tokens collection for API authentication
    await db.admin_tokens.insert_one({
        "token": token,
        "admin_id": admin_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=365),  # Long-lived for demo
    })
    
    # Clean up pending registration
    await db.pending_registrations.delete_one({"email": req.email})
    
    # Send welcome email with download links (async, don't block response)
    import asyncio
    asyncio.create_task(_send_welcome_email(new_admin["email"], new_admin["first_name"]))
    
    return {
        "success": True,
        "message": "Account created successfully",
        "admin_id": admin_id,
        "token": token,
        "plan": "demo",
    }


async def _send_welcome_email(email: str, first_name: str):
    """Send welcome email after successful registration with download links."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured, skipping welcome email")
        return
    
    try:
        import resend
        resend.api_key = RESEND_API_KEY
        
        admin_app_link = "https://api.paylock.pro/api/download/admin-apk"
        portal_link = "https://api.paylock.pro/api/portal"
        
        html = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 32px; text-align: center;">
                      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 800;">Welcome to PayLock Pro!</h1>
                      <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Your account is ready</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px;">
                      <p style="font-size: 16px; color: #111827; margin: 0 0 16px 0;">Hi {first_name},</p>
                      <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px 0;">
                        Thank you for registering with PayLock Pro! Your account has been created successfully. Get started by downloading the admin app below.
                      </p>
                      <table cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="50" style="vertical-align: top;">
                                  <div style="width: 40px; height: 40px; background: #2563EB; border-radius: 10px; text-align: center; line-height: 40px; color: white; font-size: 18px;">1</div>
                                </td>
                                <td style="vertical-align: top; padding-left: 12px;">
                                  <h4 style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Download Admin App</h4>
                                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">Install the admin app on your Android device to manage loans and clients on the go.</p>
                                  <a href="{admin_app_link}" style="display: inline-block; padding: 10px 20px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Download Admin APK</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 16px 0;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td width="50" style="vertical-align: top;">
                                  <div style="width: 40px; height: 40px; background: #8b5cf6; border-radius: 10px; text-align: center; line-height: 40px; color: white; font-size: 18px;">2</div>
                                </td>
                                <td style="vertical-align: top; padding-left: 12px;">
                                  <h4 style="margin: 0 0 4px 0; font-size: 15px; color: #111827;">Access Web Portal</h4>
                                  <p style="margin: 0 0 8px 0; font-size: 13px; color: #6b7280;">You can also manage everything from your browser using the web portal.</p>
                                  <a href="{portal_link}" style="display: inline-block; padding: 10px 20px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Open Web Portal</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                      <div style="margin-top: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
                        <p style="margin: 0; font-size: 13px; color: #0c4a6e;">You're currently on the <b>Demo</b> plan. Upgrade anytime to unlock all features including client app, bulk imports, and more.</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background: #f9fafb; padding: 20px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; font-size: 12px; color: #9ca3af;">PayLock Pro - Loan Management Made Simple</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """
        
        resend.Emails.send({
            "from": "PayLock Pro <noreply@paylockpro.com>",
            "to": email,
            "subject": "Welcome to PayLock Pro - Download Your Admin App",
            "html": html,
        })
        logger.info(f"Welcome email sent to {email}")
    except Exception as e:
        logger.error(f"Failed to send welcome email to {email}: {e}")


@router.post("/resend-verification")
async def resend_verification(email: str = Query(...)):
    """Resend verification email."""
    pending = await db.pending_registrations.find_one(
        {"email": email, "verified": False},
        {"_id": 0}
    )
    
    if not pending:
        raise HTTPException(status_code=404, detail="No pending registration found")
    
    # Generate new code
    verification_code = ''.join(random.choices(string.digits, k=6))
    verification_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    await db.pending_registrations.update_one(
        {"email": email},
        {"$set": {
            "verification_code": verification_code,
            "verification_expires": verification_expires,
        }}
    )
    
    email_sent = await send_verification_email(email, verification_code, pending.get("first_name", "User"))
    
    return {
        "success": True,
        "message": "New verification code sent",
        "email_sent": email_sent,
        "debug_code": verification_code if (not RESEND_API_KEY or not email_sent) else None
    }
