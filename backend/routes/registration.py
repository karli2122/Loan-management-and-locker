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
        "role": "admin",
        "is_super_admin": False,
        "plan": "demo",
        "subscription_plan": "demo",
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
    
    return {
        "success": True,
        "message": "Account created successfully",
        "admin_id": admin_id,
        "token": token,
        "plan": "demo",
    }


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
