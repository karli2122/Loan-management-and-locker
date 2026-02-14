from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, RedirectResponse, JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import hashlib
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection with proper environment variable handling
mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.getenv('DB_NAME', 'emi_lock_db')

logger.info(f"Connecting to MongoDB: {mongo_url[:20]}...")

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Create the main app
app = FastAPI(title="Loan Phone Lock API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBasic()

# Custom exception classes for better error handling
class ApplicationException(Exception):
    """Base exception class for application errors"""
    def __init__(self, message: str, error_code: str, correlation_id: str = None):
        self.message = message
        self.error_code = error_code
        self.correlation_id = correlation_id or str(uuid.uuid4())
        super().__init__(self.message)
    
    def to_response(self):
        return {
            "error": self.message,
            "code": self.error_code,
            "correlation_id": self.correlation_id
        }

class ValidationException(ApplicationException):
    """Raised when input validation fails"""
    def __init__(self, message: str = "The provided data is invalid.", correlation_id: str = None):
        super().__init__(message, "VALIDATION_ERROR", correlation_id)

class AuthenticationException(ApplicationException):
    """Raised when authentication fails"""
    def __init__(self, message: str = "Authentication failed.", correlation_id: str = None):
        super().__init__(message, "AUTHENTICATION_ERROR", correlation_id)

class AuthorizationException(ApplicationException):
    """Raised when authorization fails"""
    def __init__(self, message: str = "Permission denied.", correlation_id: str = None):
        super().__init__(message, "AUTHORIZATION_ERROR", correlation_id)

# Global exception handler to prevent server crashes
@app.exception_handler(ApplicationException)
async def application_exception_handler(request, exc: ApplicationException):
    """Handle custom application exceptions"""
    logger.error(f"Application exception [{exc.correlation_id}]: {exc.error_code} - {exc.message}")
    status_codes = {
        "VALIDATION_ERROR": 422,
        "AUTHENTICATION_ERROR": 401,
        "AUTHORIZATION_ERROR": 403,
    }
    status_code = status_codes.get(exc.error_code, 500)
    return JSONResponse(
        status_code=status_code,
        content=exc.to_response()
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle all unhandled exceptions"""
    correlation_id = str(uuid.uuid4())
    # Log full details internally
    logger.error(f"Unhandled exception [{correlation_id}]: {type(exc).__name__}: {str(exc)}", exc_info=True)
    # Return sanitized response externally
    return JSONResponse(
        status_code=500,
        content={
            "error": "An unexpected error occurred. Please try again later.",
            "code": "INTERNAL_ERROR",
            "correlation_id": correlation_id
        }
    )

# ===================== HELPER FUNCTIONS =====================

# Initialize Argon2 password hasher with secure parameters
_argon2_hasher = PasswordHasher(
    time_cost=3,        # Number of iterations
    memory_cost=65536,  # 64 MB
    parallelism=4,      # Number of parallel threads
    hash_len=32,        # Length of the hash in bytes
    salt_len=16         # Length of random salt
)

def hash_password(password: str) -> str:
    """
    Hash password using Argon2id with secure parameters.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        Argon2id hash string
    """
    return _argon2_hasher.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify password against stored hash.
    Supports both Argon2id (new) and SHA-256 (legacy) hashes for migration.
    
    Args:
        password: Plain text password to verify
        password_hash: Stored password hash
        
    Returns:
        True if password matches, False otherwise
    """
    # Check if it's a legacy SHA-256 hash (64 hex characters)
    if len(password_hash) == 64 and all(c in '0123456789abcdef' for c in password_hash):
        # Legacy SHA-256 verification
        legacy_hash = hashlib.sha256(password.encode()).hexdigest()
        return legacy_hash == password_hash
    
    # Try Argon2id verification
    try:
        _argon2_hasher.verify(password_hash, password)
        
        # Check if hash needs rehashing (parameters changed)
        if _argon2_hasher.check_needs_rehash(password_hash):
            logger.info("Password hash needs rehashing with updated parameters")
        
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False

class SecureQueryBuilder:
    """
    Secure query builder to prevent NoSQL injection attacks.
    Implements field allowlisting and operator filtering.
    """
    
    # Allowed fields for each collection
    ALLOWED_FIELDS = {
        "clients": {
            "id", "name", "client_id", "phone", "email", "admin_id", 
            "is_locked", "auto_lock_enabled", "device_info", "registration_code"
        },
        "admins": {
            "id", "username", "role", "is_super_admin", "first_name", "last_name"
        },
        "loans": {
            "id", "client_id", "admin_id", "status", "principal", "monthly_emi"
        },
        "loan_plans": {
            "id", "name", "admin_id", "is_active", "interest_rate"
        }
    }
    
    # Allowed MongoDB operators
    ALLOWED_OPERATORS = {
        "$eq", "$ne", "$gt", "$gte", "$lt", "$lte", "$in", "$nin"
    }
    
    @classmethod
    def validate_field(cls, collection: str, field: str) -> bool:
        """Check if a field is allowed for a collection"""
        allowed = cls.ALLOWED_FIELDS.get(collection, set())
        return field in allowed
    
    @classmethod
    def validate_operator(cls, operator: str) -> bool:
        """Check if an operator is allowed"""
        return operator in cls.ALLOWED_OPERATORS
    
    @classmethod
    def build_safe_query(cls, collection: str, field: str, value, operator: str = "$eq") -> dict:
        """
        Build a safe MongoDB query with validation.
        
        Args:
            collection: Database collection name
            field: Field to query
            value: Value to match
            operator: MongoDB operator (default: $eq)
            
        Returns:
            Safe MongoDB query dict
            
        Raises:
            ValidationException: If field or operator is not allowed
        """
        if not cls.validate_field(collection, field):
            raise ValidationException(f"Field '{field}' is not allowed for querying")
        
        if not cls.validate_operator(operator):
            raise ValidationException(f"Operator '{operator}' is not allowed")
        
        # Build query with validated operator
        if operator == "$eq":
            return {field: value}
        else:
            return {field: {operator: value}}
    
    @classmethod
    def sanitize_query(cls, collection: str, query: dict) -> dict:
        """
        Sanitize a MongoDB query by removing disallowed fields and operators.
        
        Args:
            collection: Database collection name
            query: Query dictionary to sanitize
            
        Returns:
            Sanitized query dictionary
        """
        sanitized = {}
        
        for field, value in query.items():
            # Validate field
            if not cls.validate_field(collection, field):
                logger.warning(f"Ignoring disallowed field in query: {field}")
                continue
            
            # Check for operator in value
            if isinstance(value, dict):
                sanitized_value = {}
                for op, op_value in value.items():
                    if cls.validate_operator(op):
                        sanitized_value[op] = op_value
                    else:
                        logger.warning(f"Ignoring disallowed operator in query: {op}")
                
                if sanitized_value:
                    sanitized[field] = sanitized_value
            else:
                # Simple equality
                sanitized[field] = value
        
        return sanitized

def mask_email(email: str) -> str:
    """
    Mask email address for privacy.
    Shows only first and last character before @ and domain.
    
    Example: john.doe@example.com -> j*******e@example.com
    """
    if not email or '@' not in email:
        return email
    
    local, domain = email.split('@', 1)
    if len(local) <= 2:
        masked_local = local[0] + '*'
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    
    return f"{masked_local}@{domain}"

def mask_phone(phone: str) -> str:
    """
    Mask phone number for privacy.
    Shows only last 4 digits.
    
    Example: +1-555-123-4567 -> ***-***-4567
    """
    if not phone or len(phone) < 4:
        return '***'
    
    return '***-***-' + phone[-4:]

def mask_sensitive_data(data: dict, fields: list = None) -> dict:
    """
    Mask sensitive fields in a dictionary.
    
    Args:
        data: Dictionary containing data to mask
        fields: List of field names to mask (default: email, phone)
        
    Returns:
        Dictionary with masked sensitive fields
    """
    if fields is None:
        fields = ['email', 'phone']
    
    masked_data = data.copy()
    
    for field in fields:
        if field in masked_data and masked_data[field]:
            if field == 'email':
                masked_data[field] = mask_email(masked_data[field])
            elif field == 'phone':
                masked_data[field] = mask_phone(masked_data[field])
    
    return masked_data

def calculate_simple_interest_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using simple interest formula"""
    # Simple Interest = (P × R × T) / 100
    # where P = principal, R = annual rate, T = time in years
    years = months / 12
    interest = (principal * annual_rate * years) / 100
    total_amount = principal + interest
    monthly_emi = total_amount / months
    
    return {
        "method": "Simple Interest",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(interest, 2),
        "principal": round(principal, 2)
    }

def calculate_reducing_balance_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using reducing balance method (industry standard)"""
    # Monthly interest rate
    monthly_rate = (annual_rate / 12) / 100
    
    if monthly_rate == 0:
        monthly_emi = principal / months
        total_interest = 0
    else:
        # EMI = [P × R × (1+R)^N] / [(1+R)^N-1]
        power = (1 + monthly_rate) ** months
        monthly_emi = (principal * monthly_rate * power) / (power - 1)
        total_interest = (monthly_emi * months) - principal
    
    total_amount = principal + total_interest
    
    return {
        "method": "Reducing Balance",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(total_interest, 2),
        "principal": round(principal, 2)
    }

def calculate_flat_rate_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using flat rate method"""
    # Total interest calculated upfront on principal
    years = months / 12
    total_interest = (principal * annual_rate * years) / 100
    total_amount = principal + total_interest
    monthly_emi = total_amount / months
    
    return {
        "method": "Flat Rate",
        "monthly_emi": round(monthly_emi, 2),
        "total_amount": round(total_amount, 2),
        "total_interest": round(total_interest, 2),
        "principal": round(principal, 2)
    }

def calculate_all_methods(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using all three methods for comparison"""
    return {
        "simple_interest": calculate_simple_interest_emi(principal, annual_rate, months),
        "reducing_balance": calculate_reducing_balance_emi(principal, annual_rate, months),
        "flat_rate": calculate_flat_rate_emi(principal, annual_rate, months)
    }

def calculate_late_fee(principal_due: float, late_fee_percent: float, days_overdue: int) -> float:
    """Calculate late fee based on days overdue"""
    if days_overdue <= 0:
        return 0.0
    
    # Calculate late fee: (principal × late_fee_percent × months_overdue) / 100
    months_overdue = days_overdue / 30  # Approximate months
    late_fee = (principal_due * late_fee_percent * months_overdue) / 100
    
    return round(late_fee, 2)

async def apply_late_fees_to_overdue_clients():
    """Background job to calculate and apply late fees to overdue clients"""
    try:
        # Get all clients with overdue payments
        clients = await db.clients.find({
            "next_payment_due": {"$lt": datetime.utcnow()},
            "outstanding_balance": {"$gt": 0}
        }).to_list(1000)
        
        # Batch load all loan plans to avoid N+1 queries
        loan_plans = await db.loan_plans.find().to_list(1000)
        loan_plans_dict = {plan["id"]: plan for plan in loan_plans}
        
        for client in clients:
            days_overdue = (datetime.utcnow() - client["next_payment_due"]).days
            
            if days_overdue > 0:
                # Get late fee rate (from loan plan or default)
                late_fee_rate = 2.0  # Default 2% per month
                
                if client.get("loan_plan_id"):
                    plan = loan_plans_dict.get(client["loan_plan_id"])
                    if plan:
                        late_fee_rate = plan.get("late_fee_percent", 2.0)
                
                # Calculate late fee on monthly EMI
                monthly_emi = client.get("monthly_emi", 0)
                late_fee = calculate_late_fee(monthly_emi, late_fee_rate, days_overdue)
                
                # Update client with accumulated late fees
                current_late_fees = client.get("late_fees_accumulated", 0)
                new_late_fees = current_late_fees + late_fee
                
                await db.clients.update_one(
                    {"id": client["id"]},
                    {"$set": {
                        "late_fees_accumulated": new_late_fees,
                        "days_overdue": days_overdue
                    }}
                )
                
                logger.info(f"Applied late fee of €{late_fee} to client {client['id']} ({days_overdue} days overdue)")
    
    except Exception as e:
        logger.error(f"Late fee calculation error: {str(e)}")

async def send_expo_push_notification(push_token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification via Expo."""
    if not push_token:
        return False
    
    payload = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": body,
        "data": data or {}
    }
    
    try:
        async with httpx.AsyncClient(timeout=10) as http_client:
            response = await http_client.post("https://exp.host/--/api/v2/push/send", json=payload)
            if response.status_code >= httpx.codes.BAD_REQUEST:
                logger.warning(f"Expo push send failed ({response.status_code})")
                return False
        return True
    except Exception as exc:
        logger.error(f"Expo push error: {exc}")
        return False

async def create_payment_reminders():
    """Background job to create payment reminders"""
    try:
        from dateutil.relativedelta import relativedelta
        
        # Get all clients with active loans
        clients = await db.clients.find({
            "outstanding_balance": {"$gt": 0},
            "payment_reminders_enabled": True,
            "next_payment_due": {"$exists": True}
        }).to_list(1000)
        
        for client in clients:
            next_due = client.get("next_payment_due")
            if not next_due:
                continue
            
            days_until_due = (next_due - datetime.utcnow()).days
            
            # Create reminders for same-day due dates and 1/3/7-day overdue intervals
            reminder_configs = [
                (0, "payment_due_today", "Payment due today"),
                (-1, "payment_overdue_1day", "Payment overdue by 1 day"),
                (-3, "payment_overdue_3days", "Payment overdue by 3 days"),
                (-7, "payment_overdue_7days", "Final notice: Payment overdue by 7 days"),
            ]
            
            for days_before, reminder_type, message in reminder_configs:
                if days_until_due == days_before:
                    # Check if reminder already exists
                    existing = await db.reminders.find_one({
                        "client_id": client["id"],
                        "reminder_type": reminder_type,
                        "scheduled_date": {"$gte": datetime.utcnow() - relativedelta(days=1)}
                    })
                    
                    if not existing:
                        # Create reminder
                        admin_scope = client.get("admin_id")
                        if admin_scope:
                            admin_exists = await db.admins.find_one({"id": admin_scope})
                            if not admin_exists:
                                admin_scope = None
                        
                        reminder = Reminder(
                            client_id=client["id"],
                            reminder_type=reminder_type,
                            scheduled_date=datetime.utcnow(),
                            message=f"{message}. Amount: €{client.get('monthly_emi', 0):.2f}",
                            admin_id=admin_scope
                        )
                        await db.reminders.insert_one(reminder.dict())
                        
                        # Send Expo push notification if token available
                        push_token = client.get("expo_push_token")
                        if push_token:
                            await send_expo_push_notification(
                                push_token,
                                "Payment Reminder",
                                reminder.message,
                                {
                                    "client_id": client["id"],
                                    "reminder_type": reminder_type,
                                    "admin_id": admin_scope
                                }
                            )
                        logger.info(f"Created {reminder_type} reminder for client {client['id']}")
    
    except Exception as e:
        logger.error(f"Reminder creation error: {str(e)}")

def check_and_auto_lock_overdue_payments():
    """Background job to check overdue payments and auto-lock devices"""
    try:
        from datetime import datetime, timedelta
        import asyncio
        
        async def auto_lock_job():
            # Get all clients with auto-lock enabled (limit to 1000 for performance)
            clients = await db.clients.find({"auto_lock_enabled": True}).to_list(1000)
            
            for client in clients:
                if not client.get("next_payment_due"):
                    continue
                
                next_due = client["next_payment_due"]
                grace_days = client.get("auto_lock_grace_days", 3)
                
                # Calculate days overdue
                days_overdue = (datetime.utcnow() - next_due).days
                
                # Auto-lock if past grace period and not already locked
                if days_overdue > grace_days and not client.get("is_locked", False):
                    await db.clients.update_one(
                        {"id": client["id"]},
                        {"$set": {
                            "is_locked": True,
                            "lock_message": f"Device locked: Payment overdue by {days_overdue} days. Please contact admin.",
                            "days_overdue": days_overdue
                        }}
                    )
                    logger.warning(f"Auto-locked client {client['id']} - {days_overdue} days overdue")
                else:
                    # Update days overdue counter
                    await db.clients.update_one(
                        {"id": client["id"]},
                        {"$set": {"days_overdue": max(0, days_overdue)}}
                    )
        
        # Run the async job
        loop = asyncio.get_event_loop()
        loop.create_task(auto_lock_job())
        
    except Exception as e:
        logger.error(f"Auto-lock job error: {str(e)}")

# ===================== MODELS =====================

class Admin(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    role: str = "user"  # "admin" or "user"
    is_super_admin: bool = False
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AdminCreate(BaseModel):
    username: str
    password: str
    role: str = "user"  # "admin" or "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminResponse(BaseModel):
    id: str
    username: str
    role: str
    is_super_admin: bool
    token: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None

class LoanPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g., "Standard Plan", "Premium Plan"
    interest_rate: float  # Annual percentage
    min_tenure_months: int = 3
    max_tenure_months: int = 36
    processing_fee_percent: float = 0.0
    late_fee_percent: float = 2.0  # Per month
    description: str = ""
    is_active: bool = True
    admin_id: Optional[str] = None  # Tenant scoping - each admin has their own loan plans
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LoanPlanCreate(BaseModel):
    name: str
    interest_rate: float
    min_tenure_months: int = 3
    max_tenure_months: int = 36
    processing_fee_percent: float = 0.0
    late_fee_percent: float = 2.0
    description: str = ""

class Reminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    reminder_type: str  # "payment_due", "overdue", "final_notice"
    scheduled_date: datetime
    sent: bool = False
    sent_at: Optional[datetime] = None
    message: str
    admin_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: str = ""  # Made optional with default empty string for backwards compatibility
    admin_id: Optional[str] = None  # Tenant scoping
    device_id: str = ""
    device_model: str = ""
    device_make: str = ""  # Brand/Manufacturer
    used_price_eur: Optional[float] = None  # Used phone price in EUR
    price_fetched_at: Optional[datetime] = None  # When price was last fetched
    lock_mode: str = "device_admin"  # "device_owner" or "device_admin"
    registration_code: str = Field(default_factory=lambda: secrets.token_hex(4).upper())
    expo_push_token: Optional[str] = None  # Expo push notification token
    
    # Loan Management Fields
    loan_plan_id: Optional[str] = None  # Reference to loan plan
    loan_amount: float = 0.0  # Total loan amount (device price - down payment)
    down_payment: float = 0.0  # Initial down payment
    interest_rate: float = 0.0  # Annual interest rate percentage
    loan_tenure_months: int = 12  # Loan duration in months
    monthly_emi: float = 0.0  # Calculated monthly EMI
    total_amount_due: float = 0.0  # Principal + Interest
    total_paid: float = 0.0  # Total amount paid so far
    outstanding_balance: float = 0.0  # Remaining balance
    processing_fee: float = 0.0  # One-time processing fee
    late_fees_accumulated: float = 0.0  # Total late fees
    loan_start_date: Optional[datetime] = None  # When loan started
    last_payment_date: Optional[datetime] = None  # Last payment received
    next_payment_due: Optional[datetime] = None  # Next payment due date
    days_overdue: int = 0  # Days past due date
    payment_reminders_enabled: bool = True  # Enable payment reminders
    
    # Auto-lock settings
    auto_lock_enabled: bool = True  # Enable auto-lock on missed payment
    auto_lock_grace_days: int = 3  # Days grace period before auto-lock
    
    # Legacy fields (kept for backwards compatibility)
    emi_amount: float = 0.0
    emi_due_date: Optional[str] = None
    
    # Device control
    is_locked: bool = False
    lock_message: str = "Your device has been locked due to pending EMI payment."
    warning_message: str = ""
    
    # Location tracking
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_location_update: Optional[datetime] = None
    
    # Registration
    is_registered: bool = False
    registered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Security
    tamper_attempts: int = 0  # Count of tampering attempts
    last_tamper_attempt: Optional[datetime] = None  # Last tamper attempt timestamp
    last_reboot: Optional[datetime] = None  # Last device reboot timestamp
    admin_mode_active: bool = False  # Device Admin mode active on device
    last_heartbeat: Optional[datetime] = None  # Last heartbeat from device
    uninstall_allowed: bool = False  # Whether uninstall has been allowed by admin

class Payment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    amount: float
    payment_date: datetime = Field(default_factory=datetime.utcnow)
    payment_method: str = "cash"  # cash, bank_transfer, card, etc.
    notes: str = ""
    recorded_by: str = ""  # Admin username
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentCreate(BaseModel):
    amount: float
    payment_date: Optional[datetime] = None
    payment_method: str = "cash"
    notes: str = ""

class LoanSettings(BaseModel):
    auto_lock_enabled: bool
    auto_lock_grace_days: int

class ClientCreate(BaseModel):
    name: str
    phone: str
    email: str
    emi_amount: float = 0.0
    emi_due_date: Optional[str] = None
    lock_mode: str = "device_admin"  # "device_owner" or "device_admin"
    admin_id: Optional[str] = None
    # Loan fields
    loan_amount: float = 0.0
    down_payment: float = 0.0
    interest_rate: float = 10.0  # Default 10% annual
    loan_tenure_months: int = 12

class LoanSetup(BaseModel):
    """Model for setting up loan details for an existing client"""
    loan_amount: float
    interest_rate: float
    loan_tenure_months: int
    down_payment: float = 0.0

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    emi_amount: Optional[float] = None
    emi_due_date: Optional[str] = None
    is_locked: Optional[bool] = None
    lock_message: Optional[str] = None
    warning_message: Optional[str] = None
    device_make: Optional[str] = None
    device_model: Optional[str] = None
    used_price_eur: Optional[float] = None
    admin_id: Optional[str] = None

class DeviceRegistration(BaseModel):
    registration_code: str
    device_id: str
    device_model: str

class LocationUpdate(BaseModel):
    client_id: str
    latitude: float
    longitude: float

class PushTokenUpdate(BaseModel):
    client_id: str
    push_token: str
    admin_id: Optional[str] = None

class ClientStatusResponse(BaseModel):
    id: str
    name: str
    is_locked: bool
    lock_message: str
    warning_message: str
    emi_amount: float
    emi_due_date: Optional[str]
    uninstall_allowed: bool = False

# ===================== ADMIN ROUTES =====================

# Token configuration
TOKEN_EXPIRY_HOURS = 24  # 24-hour token lifetime as per security requirements

async def verify_admin_token_header(token: str) -> bool:
    """
    Helper function to verify admin token.
    Checks both token existence and expiration.
    
    Args:
        token: The admin token to verify
        
    Returns:
        True if token is valid and not expired, False otherwise
    """
    token_doc = await db.admin_tokens.find_one({"token": token})
    if not token_doc:
        return False
    
    # Check if token has expired
    if "expires_at" in token_doc:
        if datetime.utcnow() > token_doc["expires_at"]:
            # Token expired, remove it
            await db.admin_tokens.delete_one({"token": token})
            return False
    
    return True

async def enforce_client_scope(client: dict, admin_id: Optional[str]):
    """Ensure the requested client belongs to the provided admin scope"""
    if client.get("admin_id"):
        if not admin_id or client["admin_id"] != admin_id:
            raise AuthorizationException("Client not accessible for this admin")
    elif admin_id:
        logger.warning(f"Admin {admin_id} attempted to access unassigned client {client['id']}")
        raise AuthorizationException("Client not assigned to this admin")

@api_router.post("/admin/register", response_model=AdminResponse)
async def register_admin(admin_data: AdminCreate, admin_token: str = Query(default=None)):
    # Validate password length
    if len(admin_data.password) < 6:
        raise ValidationException("Password must be at least 6 characters")
    
    # Check if any admin exists - if yes, require token and check creator's role
    admin_count = await db.admins.count_documents({})
    is_first_admin = admin_count == 0
    
    if not is_first_admin:
        if not admin_token:
            raise AuthenticationException("Admin token required to register new users")
        
        # Get the creator's info
        token_data = await db.admin_tokens.find_one({"token": admin_token})
        if not token_data:
            raise AuthenticationException("Invalid admin token")
        
        creator = await db.admins.find_one({"id": token_data["admin_id"]})
        if not creator or creator.get("role") != "admin":
            raise AuthorizationException("Only admins can create new users")
    
    # Check if username already exists
    existing = await db.admins.find_one({"username": admin_data.username})
    if existing:
        raise ValidationException("Username already exists")
    
    admin = Admin(
        username=admin_data.username,
        password_hash=hash_password(admin_data.password),
        role=admin_data.role if not is_first_admin else "admin",
        is_super_admin=is_first_admin,
        first_name=admin_data.first_name,
        last_name=admin_data.last_name
    )
    await db.admins.insert_one(admin.dict())
    
    # Generate token with expiration
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    await db.admin_tokens.insert_one({
        "admin_id": admin.id,
        "token": token,
        "created_at": datetime.utcnow(),
        "expires_at": expires_at
    })
    
    return AdminResponse(
        id=admin.id, 
        username=admin.username, 
        role=admin.role,
        is_super_admin=admin.is_super_admin,
        token=token
    )

@api_router.post("/admin/login", response_model=AdminResponse)
async def login_admin(login_data: AdminLogin):
    admin = await db.admins.find_one({"username": login_data.username})
    if not admin or not verify_password(login_data.password, admin["password_hash"]):
        raise AuthenticationException("Invalid credentials")
    
    # Check if password needs rehashing (for legacy SHA-256 hashes)
    if len(admin["password_hash"]) == 64:
        # Legacy SHA-256 hash detected - rehash with Argon2id
        logger.info(f"Migrating password hash for user {admin['username']} to Argon2id")
        new_hash = hash_password(login_data.password)
        await db.admins.update_one(
            {"id": admin["id"]},
            {"$set": {"password_hash": new_hash}}
        )
    
    # Generate token with expiration
    token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    await db.admin_tokens.update_one(
        {"admin_id": admin["id"]},
        {"$set": {
            "token": token,
            "created_at": datetime.utcnow(),
            "expires_at": expires_at
        }},
        upsert=True
    )
    
    return AdminResponse(
        id=admin["id"], 
        username=admin["username"], 
        role=admin.get("role", "user"),
        is_super_admin=admin.get("is_super_admin", False),
        token=token,
        first_name=admin.get("first_name"),
        last_name=admin.get("last_name")
    )

@api_router.get("/admin/verify/{token}")
async def verify_admin_token(token: str):
    """Verify if a token is valid and not expired"""
    is_valid = await verify_admin_token_header(token)
    if not is_valid:
        raise AuthenticationException("Invalid or expired token")
    
    token_doc = await db.admin_tokens.find_one({"token": token})
    return {
        "valid": True,
        "admin_id": token_doc["admin_id"],
        "expires_at": token_doc.get("expires_at").isoformat() if token_doc.get("expires_at") else None
    }

# ===================== ADMIN MANAGEMENT ROUTES =====================

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class AdminListResponse(BaseModel):
    id: str
    username: str
    role: str
    is_super_admin: bool
    created_at: datetime

@api_router.get("/admin/list")
async def list_admins(admin_token: str = Query(...)):
    """List all users (requires admin role)"""
    # Verify token and check if requester is an admin
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    requester = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not requester or requester.get("role") != "admin":
        raise AuthorizationException("Only admins can view user list")
    
    admins = await db.admins.find().to_list(100)
    return [{
        "id": a["id"], 
        "username": a["username"], 
        "role": a.get("role", "user"),
        "is_super_admin": a.get("is_super_admin", False),
        "created_at": a.get("created_at")
    } for a in admins]

@api_router.post("/admin/change-password")
async def change_password(password_data: PasswordChange, admin_token: str = Query(...)):
    """Change admin password"""
    # Validate new password length
    if len(password_data.new_password) < 6:
        raise ValidationException("New password must be at least 6 characters")
    
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    admin = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Verify current password
    if not verify_password(password_data.current_password, admin["password_hash"]):
        raise AuthenticationException("Current password is incorrect")
    
    # Update password
    new_hash = hash_password(password_data.new_password)
    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password changed successfully"}

class ProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None

@api_router.put("/admin/update-profile")
async def update_admin_profile(profile_data: ProfileUpdate, admin_token: str = Query(...)):
    """Update admin profile information"""
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    admin = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Update profile fields
    update_data = {
        "first_name": profile_data.first_name,
        "last_name": profile_data.last_name,
    }
    if profile_data.email:
        update_data["email"] = profile_data.email
    if profile_data.phone:
        update_data["phone"] = profile_data.phone
    
    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": update_data}
    )
    
    logger.info(f"Profile updated for admin: {admin['username']}")
    return {"message": "Profile updated successfully"}

# Alias route for consistency - /admin/profile points to the same handler
@api_router.put("/admin/profile")
async def update_admin_profile_alias(profile_data: ProfileUpdate, admin_token: str = Query(...)):
    """Update admin profile information (alias endpoint)"""
    return await update_admin_profile(profile_data, admin_token)

@api_router.delete("/admin/{admin_id}")
async def delete_admin(admin_id: str, admin_token: str = Query(...)):
    """Delete a user (requires admin role, cannot delete yourself, super admin, or last admin)"""
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    # Check if requester is an admin
    requester = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not requester or requester.get("role") != "admin":
        raise AuthorizationException("Only admins can delete users")
    
    # Cannot delete yourself
    if token_doc["admin_id"] == admin_id:
        raise ValidationException("Cannot delete your own account")
    
    # Check if target user is super admin
    target_user = await db.admins.find_one({"id": admin_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("is_super_admin", False):
        raise AuthorizationException("Cannot delete super admin")
    
    # Check if this is the last admin
    admin_count = await db.admins.count_documents({"role": "admin"})
    if admin_count <= 1 and target_user.get("role") == "admin":
        raise ValidationException("Cannot delete the last admin")
    
    # Delete user
    result = await db.admins.delete_one({"id": admin_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete associated token
    await db.admin_tokens.delete_one({"admin_id": admin_id})
    
    return {"message": "User deleted successfully"}

# ===================== CLIENT MANAGEMENT ROUTES =====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, admin_token: Optional[str] = Query(default=None)):
    admin_id = client_data.admin_id
    
    if admin_token:
        token_doc = await db.admin_tokens.find_one({"token": admin_token})
        if not token_doc:
            raise AuthenticationException("Invalid admin token")
        admin_id = token_doc["admin_id"]
    
    client_payload = client_data.dict()
    if admin_id:
        client_payload["admin_id"] = admin_id
    
    client = Client(**client_payload)
    await db.clients.insert_one(client.dict())
    return client

@api_router.get("/clients")
async def get_all_clients(skip: int = Query(default=0), limit: int = Query(default=100), admin_id: Optional[str] = Query(default=None)):
    """Get all clients with pagination
    
    Args:
        skip: Number of records to skip (default: 0)
        limit: Maximum number of records to return (default: 100, max: 500)
    """
    # Cap limit at 500 to prevent excessive data transfer
    limit = min(limit, 500)
    
    if not admin_id:
        logger.warning("admin_id not provided for client listing; rejecting request")
        raise ValidationException("admin_id is required for client listings")
    
    query = {"admin_id": admin_id}
    
    # Get total count for pagination metadata
    total_count = await db.clients.count_documents(query)
    
    # Fetch paginated clients - removed projection to avoid Pydantic validation errors
    # The Client model requires all fields, projection would cause missing field errors
    clients = await db.clients.find(query).skip(skip).limit(limit).to_list(limit)
    
    return {
        "clients": [Client(**c) for c in clients],
        "pagination": {
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "has_more": skip + limit < total_count
        }
    }

@api_router.get("/clients/silent")
async def get_silent_clients(
    admin_token: str = Query(...),
    minutes: int = Query(default=5)
):
    """Get clients that haven't sent a heartbeat in the specified number of minutes.
    This detects Clear Data/Cache or device being turned off."""
    admin = await verify_admin_token(admin_token)
    cutoff = datetime.utcnow() - timedelta(minutes=minutes)
    
    silent_clients = []
    cursor = db.clients.find(
        {
            "admin_id": admin["admin_id"],
            "is_registered": True,
            "$or": [
                {"last_heartbeat": {"$lt": cutoff}},
                {"last_heartbeat": {"$exists": False}}
            ]
        },
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "last_heartbeat": 1, "is_locked": 1, "admin_mode_active": 1, "tamper_attempts": 1}
    )
    
    async for client in cursor:
        hb = client.get("last_heartbeat")
        client["last_heartbeat"] = hb.isoformat() if hb else None
        silent_clients.append(client)
    
    return {
        "silent_clients": silent_clients,
        "count": len(silent_clients),
        "cutoff_minutes": minutes
    }

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    return Client(**client)

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, update_data: ClientUpdate, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db.clients.update_one({"id": client_id}, {"$set": update_dict})
    
    updated_client = await db.clients.find_one({"id": client_id})
    return Client(**updated_client)

@api_router.post("/clients/{client_id}/allow-uninstall")
async def allow_uninstall(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Signal device to allow app uninstallation - must be called before deletion"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    # Mark client as ready for uninstall
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"uninstall_allowed": True}}
    )
    
    logger.info(f"Client {client_id} marked for uninstallation")
    
    return {
        "message": "Device has been signaled to allow uninstall",
        "next_step": "The device will disable its protection. You can now delete this client."
    }

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    # Check if uninstall was allowed first
    if not client.get("uninstall_allowed", False):
        raise HTTPException(
            status_code=400, 
            detail="Must signal device to allow uninstall first. Use the 'Allow Uninstall' button before deleting."
        )
    
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    logger.info(f"Client {client_id} deleted successfully")
    return {"message": "Client deleted successfully"}

# ===================== LOCK CONTROL ROUTES =====================

@api_router.post("/clients/{client_id}/lock")
async def lock_client_device(client_id: str, message: Optional[str] = None, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    update_data = {"is_locked": True}
    if message:
        update_data["lock_message"] = message
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    return {"message": "Device locked successfully"}

@api_router.post("/clients/{client_id}/unlock")
async def unlock_client_device(client_id: str, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one({"id": client_id}, {"$set": {"is_locked": False, "warning_message": ""}})
    return {"message": "Device unlocked successfully"}

@api_router.post("/clients/{client_id}/warning")
async def send_warning(client_id: str, message: str, admin_id: Optional[str] = Query(default=None)):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": message}})
    return {"message": "Warning sent successfully"}

# ===================== CLIENT DEVICE ROUTES =====================

@api_router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    client = await db.clients.find_one({"registration_code": registration.registration_code.upper()})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid registration code")
    
    if client.get("is_registered"):
        raise ValidationException("Device already registered")
    
    # Extract device make (brand) from device_model string
    device_make = registration.device_model.split()[0] if registration.device_model else ""
    
    await db.clients.update_one(
        {"id": client["id"]},
        {"$set": {
            "device_id": registration.device_id,
            "device_model": registration.device_model,
            "device_make": device_make,
            "is_registered": True,
            "registered_at": datetime.utcnow()
        }}
    )
    
    updated_client = await db.clients.find_one({"id": client["id"]})
    return {"message": "Device registered successfully", "client_id": client["id"], "client": Client(**updated_client).dict()}

@api_router.get("/device/status/{client_id}", response_model=ClientStatusResponse)
async def get_device_status(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Update heartbeat timestamp on every status check
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"last_heartbeat": datetime.utcnow()}}
    )
    
    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=client["is_locked"],
        lock_message=client["lock_message"],
        warning_message=client.get("warning_message", ""),
        emi_amount=client["emi_amount"],
        emi_due_date=client.get("emi_due_date"),
        uninstall_allowed=client.get("uninstall_allowed", False)
    )

@api_router.post("/device/location")
async def update_device_location(location: LocationUpdate):
    client = await db.clients.find_one({"id": location.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": location.client_id},
        {"$set": {
            "latitude": location.latitude,
            "longitude": location.longitude,
            "last_location_update": datetime.utcnow()
        }}
    )
    return {"message": "Location updated successfully"}

@api_router.post("/device/push-token")
async def update_push_token(token_data: PushTokenUpdate):
    client = await db.clients.find_one({"id": token_data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_fields = {
        "expo_push_token": token_data.push_token
    }
    
    if token_data.admin_id:
        update_fields["admin_id"] = token_data.admin_id
    
    await db.clients.update_one(
        {"id": token_data.client_id},
        {"$set": update_fields}
    )
    return {"message": "Push token updated"}

@api_router.post("/device/clear-warning/{client_id}")
async def clear_warning(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": ""}})
    return {"message": "Warning cleared"}

@api_router.post("/device/report-admin-status")
async def report_admin_status(client_id: str, admin_active: bool):
    """Report admin mode status from client device"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"admin_mode_active": admin_active}}
    )
    
    return {"message": "Admin mode status updated", "admin_active": admin_active}

# ===================== TAMPER DETECTION =====================

@api_router.post("/clients/{client_id}/report-tamper")
async def report_tamper_attempt(client_id: str, tamper_type: str = "unknown"):
    """Report tampering attempt from client device"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    current_attempts = client.get("tamper_attempts", 0)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "tamper_attempts": current_attempts + 1,
            "last_tamper_attempt": datetime.utcnow(),
            "warning_message": f"Tamper attempt detected: {tamper_type}"
        }}
    )
    
    logger.warning(f"Tamper attempt on client {client_id}: {tamper_type}")
    
    return {
        "message": "Tamper attempt recorded",
        "total_attempts": current_attempts + 1,
        "action": "device_locked"
    }

@api_router.post("/clients/{client_id}/report-reboot")
async def report_reboot(client_id: str):
    """Report device reboot"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "last_reboot": datetime.utcnow()
        }}
    )
    
    logger.info(f"Client {client_id} rebooted")
    
    # Return lock status - device should re-lock if it was locked before reboot
    return {
        "message": "Reboot recorded",
        "should_lock": client.get("is_locked", False),
        "lock_message": client.get("lock_message", "")
    }

# ===================== LOAN PLANS =====================

@api_router.post("/loan-plans", response_model=LoanPlan)
async def create_loan_plan(plan_data: LoanPlanCreate, admin_token: str = Query(...)):
    """Create a new loan plan"""
    if not await verify_admin_token_header(admin_token):
        raise AuthenticationException("Invalid admin token")
    
    # Get admin_id from token
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    # Create plan with admin_id
    plan_dict = plan_data.dict()
    plan_dict["admin_id"] = token_doc["admin_id"]
    plan = LoanPlan(**plan_dict)
    await db.loan_plans.insert_one(plan.dict())
    
    logger.info(f"Loan plan created: {plan.name} by admin {token_doc['admin_id']}")
    return plan

@api_router.get("/loan-plans")
async def get_loan_plans(active_only: bool = Query(default=False), admin_id: Optional[str] = Query(default=None)):
    """Get all loan plans for the specified admin"""
    if not admin_id:
        logger.warning("admin_id not provided for loan plan listing; rejecting request")
        raise ValidationException("admin_id is required for loan plan listings")
    
    query = {"admin_id": admin_id}
    if active_only:
        query["is_active"] = True
    
    plans = await db.loan_plans.find(query).to_list(100)
    return [LoanPlan(**p) for p in plans]

@api_router.get("/loan-plans/{plan_id}", response_model=LoanPlan)
async def get_loan_plan(plan_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get a specific loan plan"""
    plan = await db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    # Check admin ownership if admin_id is provided
    if admin_id and plan.get("admin_id") and plan["admin_id"] != admin_id:
        raise AuthorizationException("Access denied: This loan plan belongs to another admin")
    
    return LoanPlan(**plan)

@api_router.put("/loan-plans/{plan_id}", response_model=LoanPlan)
async def update_loan_plan(plan_id: str, plan_data: LoanPlanCreate, admin_token: str = Query(...)):
    """Update a loan plan"""
    if not await verify_admin_token_header(admin_token):
        raise AuthenticationException("Invalid admin token")
    
    # Get admin_id from token
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    plan = await db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    # Check admin ownership
    if plan.get("admin_id") and plan["admin_id"] != token_doc["admin_id"]:
        raise AuthorizationException("Access denied: This loan plan belongs to another admin")
    
    await db.loan_plans.update_one(
        {"id": plan_id},
        {"$set": plan_data.dict()}
    )
    
    updated_plan = await db.loan_plans.find_one({"id": plan_id})
    logger.info(f"Loan plan updated: {plan_id} by admin {token_doc['admin_id']}")
    return LoanPlan(**updated_plan)

@api_router.delete("/loan-plans/{plan_id}")
async def delete_loan_plan(plan_id: str, admin_token: str = Query(...), force: bool = Query(default=False)):
    """Delete a loan plan permanently. Checks for client usage unless force=true."""
    if not await verify_admin_token_header(admin_token):
        raise AuthenticationException("Invalid admin token")
    
    # Get admin_id from token
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    # Check if plan exists and belongs to admin
    plan = await db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    # Check admin ownership
    if plan.get("admin_id") and plan["admin_id"] != token_doc["admin_id"]:
        raise AuthorizationException("Access denied: This loan plan belongs to another admin")
    
    # Check if any clients are using this loan plan
    clients_using_plan = await db.clients.count_documents({"loan_plan_id": plan_id})
    
    if clients_using_plan > 0 and not force:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete loan plan: {clients_using_plan} client(s) are currently using this plan. Please reassign clients to a different plan first, or use force=true to delete and clear client references."
        )
    
    # If force=true or no clients using the plan, proceed with deletion
    if force and clients_using_plan > 0:
        # Clear the loan_plan_id from all clients using this plan
        await db.clients.update_many(
            {"loan_plan_id": plan_id},
            {"$set": {"loan_plan_id": None}}
        )
        logger.info(f"Cleared loan_plan_id from {clients_using_plan} clients before deleting plan {plan_id}")
    
    # Hard delete - remove from database
    result = await db.loan_plans.delete_one({"id": plan_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    logger.info(f"Loan plan deleted: {plan_id} by admin {token_doc['admin_id']}")
    return {
        "message": "Loan plan deleted successfully",
        "clients_affected": clients_using_plan if force else 0
    }

# ===================== EMI CALCULATOR =====================

@api_router.get("/calculator/compare")
async def compare_emi_methods(
    principal: float = Query(...),
    annual_rate: float = Query(...),
    months: int = Query(...)
):
    """Compare EMI calculations using all three methods"""
    if principal <= 0 or months <= 0:
        raise ValidationException("Principal and months must be positive")
    
    if annual_rate < 0:
        raise ValidationException("Interest rate cannot be negative")
    
    comparison = calculate_all_methods(principal, annual_rate, months)
    
    # Add savings comparison
    methods = [comparison["simple_interest"], comparison["reducing_balance"], comparison["flat_rate"]]
    min_total = min(m["total_amount"] for m in methods)
    
    for method in methods:
        method["savings_vs_highest"] = round(
            max(m["total_amount"] for m in methods) - method["total_amount"], 2
        )
        method["is_cheapest"] = method["total_amount"] == min_total
    
    return comparison

@api_router.post("/calculator/amortization")
async def calculate_amortization_schedule(
    principal: float,
    annual_rate: float,
    months: int,
    method: str = "reducing_balance"
):
    """Generate month-by-month amortization schedule"""
    if principal <= 0 or months <= 0:
        raise ValidationException("Principal and months must be positive")
    
    # Calculate EMI based on method
    if method == "reducing_balance":
        emi_data = calculate_reducing_balance_emi(principal, annual_rate, months)
    elif method == "simple_interest":
        emi_data = calculate_simple_interest_emi(principal, annual_rate, months)
    else:
        emi_data = calculate_flat_rate_emi(principal, annual_rate, months)
    
    monthly_emi = emi_data["monthly_emi"]
    monthly_rate = (annual_rate / 12) / 100
    
    schedule = []
    remaining_principal = principal
    
    for month in range(1, months + 1):
        if method == "reducing_balance":
            interest_payment = remaining_principal * monthly_rate
            principal_payment = monthly_emi - interest_payment
        elif method == "simple_interest":
            # Simple interest distributed equally
            interest_payment = emi_data["total_interest"] / months
            principal_payment = monthly_emi - interest_payment
        else:  # flat_rate
            interest_payment = emi_data["total_interest"] / months
            principal_payment = monthly_emi - interest_payment
        
        remaining_principal -= principal_payment
        
        schedule.append({
            "month": month,
            "emi": round(monthly_emi, 2),
            "principal": round(principal_payment, 2),
            "interest": round(interest_payment, 2),
            "balance": round(max(0, remaining_principal), 2)
        })
    
    return {
        "method": method,
        "monthly_emi": monthly_emi,
        "total_amount": emi_data["total_amount"],
        "total_interest": emi_data["total_interest"],
        "schedule": schedule
    }

# ===================== LOAN MANAGEMENT =====================

@api_router.post("/loans/{client_id}/setup")
async def setup_loan(client_id: str, loan_data: LoanSetup, admin_id: Optional[str] = Query(default=None)):
    """Setup or update loan details for a client"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Enforce admin scope - ensure client belongs to requesting admin
    await enforce_client_scope(client, admin_id)
    
    # Calculate EMI using simple interest
    loan_calc = calculate_simple_interest_emi(
        loan_data.loan_amount,
        loan_data.interest_rate,
        loan_data.loan_tenure_months
    )
    
    # Calculate next payment due date (one month from now)
    from dateutil.relativedelta import relativedelta
    loan_start = datetime.utcnow()
    next_due = loan_start + relativedelta(months=1)
    
    update_data = {
        "loan_amount": loan_data.loan_amount,
        "down_payment": loan_data.down_payment,
        "interest_rate": loan_data.interest_rate,
        "loan_tenure_months": loan_data.loan_tenure_months,
        "monthly_emi": loan_calc["monthly_emi"],
        "total_amount_due": loan_calc["total_amount"],
        "outstanding_balance": loan_calc["total_amount"],
        "loan_start_date": loan_start,
        "next_payment_due": next_due,
        "days_overdue": 0
    }
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    updated_client = await db.clients.find_one({"id": client_id})
    return {
        "message": "Loan setup successfully",
        "loan_details": loan_calc,
        "client": Client(**updated_client)
    }

@api_router.post("/loans/{client_id}/payments")
async def record_payment(client_id: str, payment_data: PaymentCreate, admin_token: str = Query(...)):
    """Record a payment for a client's loan"""
    # Verify admin token
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise AuthenticationException("Invalid admin token")
    
    admin = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise AuthenticationException("Admin not found")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin["id"])
    
    # Create payment record
    payment = Payment(
        client_id=client_id,
        amount=payment_data.amount,
        payment_date=payment_data.payment_date or datetime.utcnow(),
        payment_method=payment_data.payment_method,
        notes=payment_data.notes,
        recorded_by=admin["username"]
    )
    
    await db.payments.insert_one(payment.dict())
    
    # Update client loan balance
    total_paid = client.get("total_paid", 0) + payment_data.amount
    outstanding = client.get("total_amount_due", 0) - total_paid
    
    # Calculate next payment due date
    from dateutil.relativedelta import relativedelta
    current_next_due = client.get("next_payment_due", datetime.utcnow())
    next_payment_due = current_next_due + relativedelta(months=1)
    
    update_data = {
        "total_paid": total_paid,
        "outstanding_balance": max(0, outstanding),
        "last_payment_date": payment.payment_date,
        "next_payment_due": next_payment_due if outstanding > 0 else None,
        "days_overdue": 0  # Reset overdue days on payment
    }
    
    # Auto-unlock if loan is fully paid
    if outstanding <= 0:
        update_data["is_locked"] = False
        update_data["lock_message"] = "Loan fully paid. Device unlocked."
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    logger.info(f"Payment recorded: €{payment_data.amount} for client {client_id} by {admin['username']}")
    
    return {
        "message": "Payment recorded successfully",
        "payment": payment.dict(),
        "updated_balance": {
            "total_paid": total_paid,
            "outstanding_balance": max(0, outstanding),
            "loan_paid_off": outstanding <= 0
        }
    }

@api_router.get("/loans/{client_id}/payments")
async def get_payment_history(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get payment history for a client"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Enforce admin scope
    await enforce_client_scope(client, admin_id)
    
    payments = await db.payments.find({"client_id": client_id}).sort("payment_date", -1).to_list(100)
    
    return {
        "client_id": client_id,
        "total_payments": len(payments),
        "payments": [Payment(**p) for p in payments]
    }

@api_router.get("/loans/{client_id}/schedule")
async def get_payment_schedule(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Generate payment schedule for a client's loan"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Enforce admin scope
    await enforce_client_scope(client, admin_id)
    
    if not client.get("loan_start_date"):
        raise ValidationException("Loan not set up for this client")
    
    from dateutil.relativedelta import relativedelta
    
    schedule = []
    start_date = client["loan_start_date"]
    monthly_emi = client.get("monthly_emi", 0)
    outstanding = client.get("total_amount_due", 0)
    
    for month in range(client.get("loan_tenure_months", 12)):
        due_date = start_date + relativedelta(months=month + 1)
        
        # Check if payment was made for this month
        payment_made = await db.payments.find_one({
            "client_id": client_id,
            "payment_date": {
                "$gte": due_date - relativedelta(days=15),
                "$lte": due_date + relativedelta(days=15)
            }
        })
        
        schedule.append({
            "month": month + 1,
            "due_date": due_date.isoformat(),
            "amount_due": monthly_emi,
            "status": "paid" if payment_made else ("overdue" if due_date < datetime.utcnow() else "pending"),
            "payment_id": payment_made["id"] if payment_made else None
        })
    
    return {
        "client_id": client_id,
        "loan_amount": client.get("loan_amount", 0),
        "monthly_emi": monthly_emi,
        "total_payments": client.get("loan_tenure_months", 12),
        "schedule": schedule
    }

@api_router.put("/loans/{client_id}/settings")
async def update_loan_settings(client_id: str, settings: LoanSettings, admin_id: Optional[str] = Query(default=None)):
    """Update auto-lock settings for a client"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Enforce admin scope
    await enforce_client_scope(client, admin_id)
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {
            "auto_lock_enabled": settings.auto_lock_enabled,
            "auto_lock_grace_days": settings.auto_lock_grace_days
        }}
    )
    
    return {
        "message": "Loan settings updated",
        "auto_lock_enabled": settings.auto_lock_enabled,
        "auto_lock_grace_days": settings.auto_lock_grace_days
    }

# ===================== LATE FEES & REMINDERS =====================

@api_router.post("/late-fees/calculate-all")
async def calculate_all_late_fees(admin_token: str = Query(...)):
    """Manually trigger late fee calculation for all overdue clients"""
    if not await verify_admin_token_header(admin_token):
        raise AuthenticationException("Invalid admin token")
    
    await apply_late_fees_to_overdue_clients()
    return {"message": "Late fees calculated and applied successfully"}

@api_router.get("/clients/{client_id}/late-fees")
async def get_client_late_fees(client_id: str):
    """Get late fee details for a specific client"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    days_overdue = client.get("days_overdue", 0)
    late_fees = client.get("late_fees_accumulated", 0)
    
    return {
        "client_id": client_id,
        "days_overdue": days_overdue,
        "late_fees_accumulated": late_fees,
        "monthly_emi": client.get("monthly_emi", 0),
        "outstanding_with_fees": client.get("outstanding_balance", 0) + late_fees
    }

@api_router.get("/reminders")
async def get_reminders(sent: bool = Query(default=None), limit: int = Query(default=100), admin_id: Optional[str] = Query(default=None)):
    """Get all reminders, optionally filtered by sent status"""
    query = {}
    if sent is not None:
        query["sent"] = sent
    if admin_id:
        query["admin_id"] = admin_id
    
    reminders = await db.reminders.find(query).sort("scheduled_date", -1).limit(limit).to_list(limit)
    return [Reminder(**r) for r in reminders]

@api_router.get("/clients/{client_id}/reminders")
async def get_client_reminders(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get reminders for a specific client"""
    query = {"client_id": client_id}
    
    if admin_id:
        query["admin_id"] = admin_id
    
    reminders = await db.reminders.find(query).sort("scheduled_date", -1).to_list(50)
    return [Reminder(**r) for r in reminders]

@api_router.post("/reminders/create-all")
async def create_all_reminders(admin_token: str = Query(...)):
    """Manually trigger reminder creation for all clients"""
    if not await verify_admin_token_header(admin_token):
        raise AuthenticationException("Invalid admin token")
    
    await create_payment_reminders()
    return {"message": "Reminders created successfully"}

@api_router.post("/reminders/{reminder_id}/mark-sent")
async def mark_reminder_sent(reminder_id: str):
    """Mark a reminder as sent"""
    result = await db.reminders.update_one(
        {"id": reminder_id},
        {"$set": {"sent": True, "sent_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    return {"message": "Reminder marked as sent"}

# ===================== REPORTS & ANALYTICS =====================

@api_router.get("/reports/collection")
async def get_collection_report(admin_id: Optional[str] = Query(default=None)):
    """Get collection statistics and metrics"""
    if not admin_id:
        raise ValidationException("admin_id is required for collection reports")
    
    # Build query filter for admin
    query = {"admin_id": admin_id}
    
    # Total clients
    total_clients = await db.clients.count_documents(query)
    active_loans = await db.clients.count_documents({**query, "outstanding_balance": {"$gt": 0}})
    completed_loans = await db.clients.count_documents({**query, "outstanding_balance": 0, "total_paid": {"$gt": 0}})
    
    # Financial totals
    clients = await db.clients.find(query).to_list(1000)
    clients_by_id = {c.get("id"): c for c in clients if c.get("id")}
    total_disbursed = sum(c.get("total_amount_due", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    
    # Overdue clients
    overdue_clients = len([c for c in clients if c.get("days_overdue", 0) > 0])
    
    # Collection rate
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0
    
    # This month's collections
    from dateutil.relativedelta import relativedelta
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = month_start + relativedelta(months=1)
    
    # Get client IDs for this admin to filter payments
    client_ids = [c.get("id") for c in clients if c.get("id")]
    payment_query = {"payment_date": {"$gte": month_start}}
    if client_ids:
        payment_query["client_id"] = {"$in": client_ids}
    
    month_payments = await db.payments.find(payment_query).to_list(1000)
    month_collected = sum(p.get("amount", 0) for p in month_payments)
    month_profit = 0
    for payment in month_payments:
        client = clients_by_id.get(payment.get("client_id"))
        if not client:
            continue
        total_due = client.get("total_amount_due", 0)
        if total_due <= 0:
            continue
        principal = client.get("loan_amount", 0)
        if principal < 0 or principal > total_due:
            continue
        # principal may equal total_due for interest-free loans (margin becomes 0)
        margin = (total_due - principal) / total_due
        month_profit += payment.get("amount", 0) * margin
    
    # Amounts due this month (not yet rolled to next month)
    month_due_total = 0
    for client in clients:
        next_due = client.get("next_payment_due")
        if (
            isinstance(next_due, datetime)
            and month_start <= next_due < month_end
            and client.get("outstanding_balance", 0) > 0
        ):
            monthly_due = client.get("monthly_emi", 0) or 0
            outstanding = client.get("outstanding_balance", 0) or 0
            month_due_total += min(monthly_due, outstanding)
    
    return {
        "overview": {
            "total_clients": total_clients,
            "active_loans": active_loans,
            "completed_loans": completed_loans,
            "overdue_clients": overdue_clients
        },
        "financial": {
            "total_disbursed": round(total_disbursed, 2),
            "total_collected": round(total_collected, 2),
            "total_outstanding": round(total_outstanding, 2),
            "total_late_fees": round(total_late_fees, 2),
            "collection_rate": round(collection_rate, 2)
        },
        "this_month": {
            "total_collected": round(month_collected, 2),
            "number_of_payments": len(month_payments),
            "profit_collected": round(month_profit, 2),
            "due_outstanding": round(month_due_total, 2)
        }
    }

@api_router.get("/reports/clients")
async def get_client_report(admin_id: Optional[str] = Query(default=None)):
    """Get client-wise statistics"""
    if not admin_id:
        raise ValidationException("admin_id is required for client reports")
    
    query = {"admin_id": admin_id}
    
    clients = await db.clients.find(query).to_list(1000)
    
    # Categorize clients
    on_time = []
    at_risk = []  # 1-7 days overdue
    defaulted = []  # >7 days overdue
    completed = []
    
    for client in clients:
        days_overdue = client.get("days_overdue", 0)
        outstanding = client.get("outstanding_balance", 0)
        
        if outstanding == 0 and client.get("total_paid", 0) > 0:
            completed.append(client)
        elif days_overdue > 7:
            defaulted.append(client)
        elif days_overdue > 0:
            at_risk.append(client)
        else:
            on_time.append(client)
    
    return {
        "summary": {
            "on_time_clients": len(on_time),
            "at_risk_clients": len(at_risk),
            "defaulted_clients": len(defaulted),
            "completed_clients": len(completed)
        },
        "details": {
            "on_time": [{"id": c["id"], "name": c["name"], "outstanding": c.get("outstanding_balance", 0)} for c in on_time[:10]],
            "at_risk": [{"id": c["id"], "name": c["name"], "days_overdue": c.get("days_overdue", 0)} for c in at_risk],
            "defaulted": [{"id": c["id"], "name": c["name"], "days_overdue": c.get("days_overdue", 0)} for c in defaulted],
        }
    }

@api_router.get("/reports/financial")
async def get_financial_report(admin_id: Optional[str] = Query(default=None)):
    """Get detailed financial breakdown"""
    query = {}
    if admin_id:
        query["admin_id"] = admin_id
    
    clients = await db.clients.find(query).to_list(1000)
    
    # Get client IDs to filter payments
    client_ids = [c.get("id") for c in clients if c.get("id")]
    payment_query = {}
    if client_ids:
        payment_query["client_id"] = {"$in": client_ids}
    
    payments = await db.payments.find(payment_query).to_list(1000)
    
    # Calculate totals
    total_principal = sum(c.get("loan_amount", 0) for c in clients)
    total_interest = sum(c.get("total_amount_due", 0) - c.get("loan_amount", 0) for c in clients)
    total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    
    # Revenue breakdown
    total_revenue = sum(p.get("amount", 0) for p in payments)
    
    # Monthly breakdown (last 6 months)
    from dateutil.relativedelta import relativedelta
    monthly_data = []
    for i in range(6):
        month_start = (datetime.utcnow() - relativedelta(months=i)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_end = month_start + relativedelta(months=1)
        
        month_payments = [p for p in payments if month_start <= p.get("payment_date", datetime.utcnow()) < month_end]
        month_revenue = sum(p.get("amount", 0) for p in month_payments)
        
        monthly_data.append({
            "month": month_start.strftime("%b %Y"),
            "revenue": round(month_revenue, 2),
            "payments_count": len(month_payments)
        })
    
    monthly_data.reverse()
    
    # Fetch admin user details if admin_id provided
    admin_info = None
    if admin_id:
        admin_doc = await db.admins.find_one({"id": admin_id})
        if admin_doc:
            admin_info = {
                "id": admin_doc["id"],
                "username": admin_doc.get("username", ""),
                "first_name": admin_doc.get("first_name", ""),
                "last_name": admin_doc.get("last_name", ""),
                "role": admin_doc.get("role", "user"),
            }
    
    result = {
        "totals": {
            "principal_disbursed": round(total_principal, 2),
            "interest_earned": round(total_interest, 2),
            "processing_fees": round(total_processing_fees, 2),
            "late_fees": round(total_late_fees, 2),
            "total_revenue": round(total_revenue, 2)
        },
        "monthly_trend": monthly_data
    }
    
    if admin_info:
        result["admin"] = admin_info
    
    return result

# ===================== PHONE PRICE LOOKUP =====================

@api_router.get("/clients/{client_id}/fetch-price")
async def fetch_phone_price(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Fetch used phone price for a client's device"""
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    await enforce_client_scope(client, admin_id)
    
    device_model = client.get("device_model", "")
    if not device_model or device_model == "Unknown Device":
        raise ValidationException("Device model not available")
    
    try:
        # Use web search to find phone price
        import httpx
        
        # Search query for used phone price
        search_query = f"{device_model} used price EUR"
        
        # Use a simple HTTP request to search (you could integrate with a real search API)
        # For now, we'll use a placeholder that returns an estimated price
        # In production, you would integrate with eBay API, Swappa, or similar
        
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            # Search for the phone price using web search
            # This is a simplified version - in production use proper marketplace APIs
            search_url = f"https://www.google.com/search?q={search_query.replace(' ', '+')}"
            
            # For demonstration, let's use a basic heuristic based on device make
            # In production, implement proper web scraping or API integration
            device_make_lower = client.get("device_make", "").lower()
            
            # Estimated used prices based on brand (placeholder logic)
            estimated_price = None
            if "apple" in device_make_lower or "iphone" in device_model.lower():
                estimated_price = 450.0  # Average used iPhone price
            elif "samsung" in device_make_lower:
                estimated_price = 300.0  # Average used Samsung price
            elif "google" in device_make_lower or "pixel" in device_model.lower():
                estimated_price = 350.0
            elif "oneplus" in device_make_lower:
                estimated_price = 280.0
            elif "xiaomi" in device_make_lower:
                estimated_price = 200.0
            elif "huawei" in device_make_lower:
                estimated_price = 220.0
            else:
                estimated_price = 250.0  # Default estimate
        
        # Update client with fetched price
        await db.clients.update_one(
            {"id": client_id},
            {"$set": {
                "used_price_eur": estimated_price,
                "price_fetched_at": datetime.utcnow()
            }}
        )
        
        return {
            "client_id": client_id,
            "device_model": device_model,
            "used_price_eur": estimated_price,
            "fetched_at": datetime.utcnow(),
            "note": "Price is an estimate. For production, integrate with real marketplace APIs."
        }
        
    except Exception as e:
        logger.error(f"Error fetching phone price: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch price: {str(e)}")

# ===================== STATS ROUTE =====================

@api_router.get("/stats")
async def get_stats(admin_id: Optional[str] = Query(default=None)):
    """Get statistics filtered by admin_id"""
    if not admin_id:
        raise ValidationException("admin_id is required for statistics")
    
    query = {"admin_id": admin_id}
    
    total_clients = await db.clients.count_documents(query)
    locked_query = {**query, "is_locked": True}
    locked_devices = await db.clients.count_documents(locked_query)
    registered_query = {**query, "is_registered": True}
    registered_devices = await db.clients.count_documents(registered_query)
    
    return {
        "total_clients": total_clients,
        "locked_devices": locked_devices,
        "registered_devices": registered_devices,
        "unlocked_devices": total_clients - locked_devices
    }

# Health check - works without database connection
@api_router.get("/")
async def root():
    return {"message": "EMI Phone Lock API is running", "status": "healthy"}

@api_router.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes liveness/readiness probes"""
    try:
        # Try to ping the database
        await client.admin.command('ping')
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0"
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def swallow_404_middleware(request, call_next):
    """Discard body for 404 responses to reduce noise."""
    def json_redirect(corrected_path: str):
        return JSONResponse(
            status_code=307,
            content={"redirect_to": corrected_path, "detail": "Use /api prefix"},
            headers={"Location": corrected_path}
        )

    response = await call_next(request)
    if response.status_code == 404:
        path = request.url.path
        query = f"?{request.url.query}" if request.url.query else ""

        # Fix double /api/api prefix
        if path.startswith("/api/api"):
            corrected = path.replace("/api/api", "/api", 1) + query
            return json_redirect(corrected)

        # Add missing /api prefix for common admin endpoints
        missing_admin_api_targets = (
            "/admin/login",
            "/admin/register",
            "/admin/list",
            "/admin/change-password",
        )
        if path in missing_admin_api_targets:
            corrected = f"/api{path}{query}"
            return json_redirect(corrected)

        # Add missing /api prefix for common client endpoints
        missing_client_api_targets = (
            "/device/register",
            "/device/status",
        )
        if path in missing_client_api_targets:
            corrected = f"/api{path}{query}"
            return json_redirect(corrected)

        return Response(status_code=404)
    return response

@app.on_event("startup")
async def startup_db_client():
    """Create database indexes on startup for better performance"""
    try:
        logger.info("Creating database indexes...")
        # Client collection indexes
        await db.clients.create_index("id", unique=True)
        await db.clients.create_index("registration_code", unique=True)
        await db.clients.create_index("is_locked")
        await db.clients.create_index("is_registered")
        # Compound index for overdue payment queries
        await db.clients.create_index([("next_payment_due", 1), ("outstanding_balance", 1)])
        # Index for loan plan lookups
        await db.clients.create_index("loan_plan_id")
        
        # Admin collection indexes
        await db.admins.create_index("id", unique=True)
        await db.admins.create_index("username", unique=True)
        
        # Admin tokens collection indexes
        await db.admin_tokens.create_index("admin_id")
        await db.admin_tokens.create_index("token", unique=True)
        
        # Ensure default loan plan exists
        await ensure_default_loan_plan()

        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Could not create indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    logger.info("Closing database connection...")
    client.close()


async def ensure_default_loan_plan():
    """Seed required default loan plan if missing."""
    default_name = "One-Time Simple 50% Monthly"
    existing = await db.loan_plans.find_one({"name": default_name})
    if existing:
        return

    plan = LoanPlan(
        name=default_name,
        interest_rate=50.0,  # 50% per month, simple interest
        min_tenure_months=1,
        max_tenure_months=1,
        processing_fee_percent=0.0,
        late_fee_percent=0.0,
        description="One-time loan, simple interest at 50% per month."
    )
    await db.loan_plans.insert_one(plan.dict())
    logger.info(f"Seeded default loan plan: {default_name}")
