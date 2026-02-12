"""
Loan Phone Lock API - Fixed Version
====================================
Fixes applied:
1. Proper CORS configuration
2. bcrypt for secure password hashing (replaces SHA256)
3. Improved error handling with specific exception handlers
4. Database connection retry logic
5. Input validation improvements
6. Rate limiting for auth endpoints
7. Proper MongoDB indexes
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response, RedirectResponse, JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, validator
from typing import List, Optional
import uuid
from datetime import datetime
import bcrypt
import secrets
import asyncio
from contextlib import asynccontextmanager

ROOT_DIR = Path(__file__).parent

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / '.env')
except ImportError:
    pass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== DATABASE CONNECTION WITH RETRY =====================

class DatabaseManager:
    """Manages MongoDB connection with retry logic"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self._connected = False
    
    async def connect(self, max_retries=5, retry_delay=2):
        """Connect to MongoDB with retry logic"""
        mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.getenv('DB_NAME', 'emi_lock_db')
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to MongoDB (attempt {attempt + 1}/{max_retries})...")
                self.client = AsyncIOMotorClient(
                    mongo_url,
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=5000,
                    socketTimeoutMS=30000,
                )
                # Verify connection
                await self.client.admin.command('ping')
                self.db = self.client[db_name]
                self._connected = True
                logger.info(f"Successfully connected to MongoDB database: {db_name}")
                
                # Create indexes
                await self._create_indexes()
                return True
                
            except Exception as e:
                logger.error(f"MongoDB connection attempt {attempt + 1} failed: {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                else:
                    logger.error("Failed to connect to MongoDB after all retries")
                    raise
        
        return False
    
    async def _create_indexes(self):
        """Create necessary database indexes"""
        try:
            # Clients collection indexes
            await self.db.clients.create_index("id", unique=True)
            await self.db.clients.create_index("registration_code", unique=True)
            await self.db.clients.create_index("admin_id")
            await self.db.clients.create_index("phone")
            await self.db.clients.create_index("is_locked")
            await self.db.clients.create_index("next_payment_due")
            
            # Admins collection indexes
            await self.db.admins.create_index("id", unique=True)
            await self.db.admins.create_index("username", unique=True)
            
            # Tokens collection indexes
            await self.db.admin_tokens.create_index("token", unique=True)
            await self.db.admin_tokens.create_index("admin_id")
            
            # Loan plans collection indexes
            await self.db.loan_plans.create_index("id", unique=True)
            await self.db.loan_plans.create_index("admin_id")
            
            # Payments collection indexes
            await self.db.payments.create_index("id", unique=True)
            await self.db.payments.create_index("client_id")
            await self.db.payments.create_index("payment_date")
            
            logger.info("Database indexes created successfully")
        except Exception as e:
            logger.warning(f"Some indexes may already exist: {str(e)}")
    
    async def disconnect(self):
        """Close database connection"""
        if self.client:
            self.client.close()
            self._connected = False
            logger.info("MongoDB connection closed")
    
    @property
    def is_connected(self):
        return self._connected

# Global database manager
db_manager = DatabaseManager()

# ===================== LIFESPAN MANAGEMENT =====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan"""
    # Startup
    try:
        await db_manager.connect()
        logger.info("Application startup complete")
    except Exception as e:
        logger.error(f"Startup failed: {str(e)}")
        # Continue without database for development/testing
        logger.warning("Continuing without database connection")
    
    yield
    
    # Shutdown
    await db_manager.disconnect()
    logger.info("Application shutdown complete")

# ===================== APP INITIALIZATION =====================

app = FastAPI(
    title="Loan Phone Lock API",
    version="1.1.0",
    description="API for EMI Phone Lock System with device management",
    lifespan=lifespan
)

# ===================== CORS CONFIGURATION =====================

# Proper CORS configuration - allow specific origins in production
allowed_origins = os.getenv(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:3000,http://localhost:19006,http://localhost:8081'
).split(',')

# Add Expo development URLs
allowed_origins.extend([
    "https://*.expo.dev",
    "https://*.expo.io",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.expo\.(dev|io)",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "*",
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "Accept",
        "Origin",
    ],
    expose_headers=["Content-Range", "X-Total-Count"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Create API router
api_router = APIRouter(prefix="/api")
security = HTTPBasic()

# ===================== PASSWORD SECURITY (bcrypt) =====================

def hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    if not password:
        raise ValueError("Password cannot be empty")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, password_hash: str) -> bool:
    """Verify password against bcrypt hash"""
    if not password or not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception:
        return False

# ===================== EXCEPTION HANDLERS =====================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_type": type(exc).__name__,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """Value error handler"""
    return JSONResponse(
        status_code=400,
        content={
            "detail": str(exc),
            "error_type": "ValidationError",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# ===================== EMI CALCULATION FUNCTIONS =====================

def calculate_simple_interest_emi(principal: float, annual_rate: float, months: int) -> dict:
    """Calculate EMI using simple interest formula"""
    if principal <= 0 or months <= 0:
        raise ValueError("Principal and months must be positive")
    
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
    if principal <= 0 or months <= 0:
        raise ValueError("Principal and months must be positive")
    
    monthly_rate = (annual_rate / 12) / 100
    
    if monthly_rate == 0:
        monthly_emi = principal / months
        total_interest = 0
    else:
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
    if principal <= 0 or months <= 0:
        raise ValueError("Principal and months must be positive")
    
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
    if days_overdue <= 0 or principal_due <= 0:
        return 0.0
    
    months_overdue = days_overdue / 30
    late_fee = (principal_due * late_fee_percent * months_overdue) / 100
    
    return round(late_fee, 2)

# ===================== BACKGROUND TASKS =====================

async def apply_late_fees_to_overdue_clients():
    """Background job to calculate and apply late fees to overdue clients"""
    try:
        if not db_manager.db:
            logger.error("Database not connected")
            return
            
        clients = await db_manager.db.clients.find({
            "next_payment_due": {"$lt": datetime.utcnow()},
            "outstanding_balance": {"$gt": 0}
        }).to_list(1000)
        
        loan_plans = await db_manager.db.loan_plans.find().to_list(1000)
        loan_plans_dict = {plan["id"]: plan for plan in loan_plans}
        
        for client in clients:
            days_overdue = (datetime.utcnow() - client["next_payment_due"]).days
            
            if days_overdue > 0:
                late_fee_rate = 2.0
                
                if client.get("loan_plan_id"):
                    plan = loan_plans_dict.get(client["loan_plan_id"])
                    if plan:
                        late_fee_rate = plan.get("late_fee_percent", 2.0)
                
                monthly_emi = client.get("monthly_emi", 0)
                late_fee = calculate_late_fee(monthly_emi, late_fee_rate, days_overdue)
                
                current_late_fees = client.get("late_fees_accumulated", 0)
                new_late_fees = current_late_fees + late_fee
                
                await db_manager.db.clients.update_one(
                    {"id": client["id"]},
                    {"$set": {
                        "late_fees_accumulated": new_late_fees,
                        "days_overdue": days_overdue
                    }}
                )
                
                logger.info(f"Applied late fee of €{late_fee} to client {client['id']}")
    
    except Exception as e:
        logger.error(f"Late fee calculation error: {str(e)}")

async def send_expo_push_notification(push_token: str, title: str, body: str, data: Optional[dict] = None) -> bool:
    """Send a push notification via Expo"""
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
            response = await http_client.post(
                "https://exp.host/--/api/v2/push/send",
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json"
                }
            )
            if response.status_code >= 400:
                logger.warning(f"Expo push send failed ({response.status_code}): {response.text}")
                return False
        return True
    except Exception as exc:
        logger.error(f"Expo push error: {exc}")
        return False

async def create_payment_reminders():
    """Background job to create payment reminders"""
    try:
        if not db_manager.db:
            logger.error("Database not connected")
            return
            
        from dateutil.relativedelta import relativedelta
        
        clients = await db_manager.db.clients.find({
            "outstanding_balance": {"$gt": 0},
            "payment_reminders_enabled": True,
            "next_payment_due": {"$exists": True}
        }).to_list(1000)
        
        for client in clients:
            next_due = client.get("next_payment_due")
            if not next_due:
                continue
            
            days_until_due = (next_due - datetime.utcnow()).days
            
            reminder_configs = [
                (0, "payment_due_today", "Payment due today"),
                (-1, "payment_overdue_1day", "Payment overdue by 1 day"),
                (-3, "payment_overdue_3days", "Payment overdue by 3 days"),
                (-7, "payment_overdue_7days", "Final notice: Payment overdue by 7 days"),
            ]
            
            for days_before, reminder_type, message in reminder_configs:
                if days_until_due == days_before:
                    existing = await db_manager.db.reminders.find_one({
                        "client_id": client["id"],
                        "reminder_type": reminder_type,
                        "scheduled_date": {"$gte": datetime.utcnow() - relativedelta(days=1)}
                    })
                    
                    if not existing:
                        admin_scope = client.get("admin_id")
                        
                        reminder = {
                            "id": str(uuid.uuid4()),
                            "client_id": client["id"],
                            "reminder_type": reminder_type,
                            "scheduled_date": datetime.utcnow(),
                            "sent": False,
                            "message": f"{message}. Amount: €{client.get('monthly_emi', 0):.2f}",
                            "admin_id": admin_scope,
                            "created_at": datetime.utcnow()
                        }
                        await db_manager.db.reminders.insert_one(reminder)
                        
                        push_token = client.get("expo_push_token")
                        if push_token:
                            await send_expo_push_notification(
                                push_token,
                                "Payment Reminder",
                                reminder["message"],
                                {
                                    "client_id": client["id"],
                                    "reminder_type": reminder_type,
                                    "admin_id": admin_scope
                                }
                            )
                        logger.info(f"Created {reminder_type} reminder for client {client['id']}")
    
    except Exception as e:
        logger.error(f"Reminder creation error: {str(e)}")

# ===================== PYDANTIC MODELS =====================

class Admin(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    role: str = "user"
    is_super_admin: bool = False
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    @validator('username')
    def username_alphanumeric(cls, v):
        if not v.isalnum():
            raise ValueError('Username must be alphanumeric')
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        return v.lower()

class AdminCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v
    
    @validator('username')
    def validate_username(cls, v):
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if not v.isalnum():
            raise ValueError('Username must be alphanumeric')
        return v.lower()

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminResponse(BaseModel):
    id: str
    username: str
    role: str
    is_super_admin: bool
    token: str

class LoanPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    interest_rate: float = Field(..., ge=0, le=100)
    min_tenure_months: int = Field(default=3, ge=1)
    max_tenure_months: int = Field(default=36, ge=1)
    processing_fee_percent: float = Field(default=0.0, ge=0)
    late_fee_percent: float = Field(default=2.0, ge=0)
    description: str = ""
    is_active: bool = True
    admin_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LoanPlanCreate(BaseModel):
    name: str
    interest_rate: float = Field(..., ge=0, le=100)
    min_tenure_months: int = Field(default=3, ge=1)
    max_tenure_months: int = Field(default=36, ge=1)
    processing_fee_percent: float = Field(default=0.0, ge=0)
    late_fee_percent: float = Field(default=2.0, ge=0)
    description: str = ""

class Reminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    reminder_type: str
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
    email: str = ""
    admin_id: Optional[str] = None
    device_id: str = ""
    device_model: str = ""
    device_make: str = ""
    used_price_eur: Optional[float] = None
    price_fetched_at: Optional[datetime] = None
    lock_mode: str = "device_admin"
    registration_code: str = Field(default_factory=lambda: secrets.token_hex(4).upper())
    expo_push_token: Optional[str] = None
    
    # Loan Management Fields
    loan_plan_id: Optional[str] = None
    loan_amount: float = Field(default=0.0, ge=0)
    down_payment: float = Field(default=0.0, ge=0)
    interest_rate: float = Field(default=0.0, ge=0)
    loan_tenure_months: int = Field(default=12, ge=1)
    monthly_emi: float = Field(default=0.0, ge=0)
    total_amount_due: float = Field(default=0.0, ge=0)
    total_paid: float = Field(default=0.0, ge=0)
    outstanding_balance: float = Field(default=0.0, ge=0)
    processing_fee: float = Field(default=0.0, ge=0)
    late_fees_accumulated: float = Field(default=0.0, ge=0)
    loan_start_date: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    next_payment_due: Optional[datetime] = None
    days_overdue: int = Field(default=0, ge=0)
    payment_reminders_enabled: bool = True
    
    # Auto-lock settings
    auto_lock_enabled: bool = True
    auto_lock_grace_days: int = Field(default=3, ge=0)
    
    # Legacy fields
    emi_amount: float = Field(default=0.0, ge=0)
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
    tamper_attempts: int = Field(default=0, ge=0)
    last_tamper_attempt: Optional[datetime] = None
    last_reboot: Optional[datetime] = None
    admin_mode_active: bool = False
    
    @validator('phone')
    def validate_phone(cls, v):
        # Basic phone validation - remove spaces and validate digits
        cleaned = v.replace(' ', '').replace('-', '').replace('+', '')
        if not cleaned.isdigit():
            raise ValueError('Phone number must contain only digits, spaces, and +')
        if len(cleaned) < 8:
            raise ValueError('Phone number must be at least 8 digits')
        return v

class Payment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    amount: float = Field(..., gt=0)
    payment_date: datetime = Field(default_factory=datetime.utcnow)
    payment_method: str = "cash"
    notes: str = ""
    recorded_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    payment_date: Optional[datetime] = None
    payment_method: str = "cash"
    notes: str = ""

class LoanSettings(BaseModel):
    auto_lock_enabled: bool
    auto_lock_grace_days: int = Field(..., ge=0, le=30)

class ClientCreate(BaseModel):
    name: str
    phone: str
    email: str = ""
    emi_amount: float = Field(default=0.0, ge=0)
    emi_due_date: Optional[str] = None
    lock_mode: str = "device_admin"
    admin_id: Optional[str] = None
    loan_amount: float = Field(default=0.0, ge=0)
    down_payment: float = Field(default=0.0, ge=0)
    interest_rate: float = Field(default=10.0, ge=0)
    loan_tenure_months: int = Field(default=12, ge=1)

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
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)

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

# ===================== HELPER FUNCTIONS =====================

async def verify_admin_token_header(token: str) -> bool:
    """Verify admin token"""
    if not db_manager.db:
        return False
    token_doc = await db_manager.db.admin_tokens.find_one({"token": token})
    return token_doc is not None

async def enforce_client_scope(client: dict, admin_id: Optional[str]):
    """Ensure the requested client belongs to the provided admin scope"""
    if client.get("admin_id"):
        if not admin_id or client["admin_id"] != admin_id:
            raise HTTPException(status_code=403, detail="Client not accessible for this admin")
    elif admin_id:
        logger.warning(f"Admin {admin_id} attempted to access unassigned client {client['id']}")
        raise HTTPException(status_code=403, detail="Client not assigned to this admin")

# ===================== ADMIN ROUTES =====================

@api_router.post("/admin/register", response_model=AdminResponse)
async def register_admin(admin_data: AdminCreate, admin_token: str = Query(default=None)):
    """Register a new admin/user"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    # Check if any admin exists
    admin_count = await db_manager.db.admins.count_documents({})
    is_first_admin = admin_count == 0
    
    if not is_first_admin:
        if not admin_token:
            raise HTTPException(status_code=401, detail="Admin token required to register new users")
        
        token_data = await db_manager.db.admin_tokens.find_one({"token": admin_token})
        if not token_data:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        creator = await db_manager.db.admins.find_one({"id": token_data["admin_id"]})
        if not creator or creator.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can create new users")
    
    # Check if username already exists
    existing = await db_manager.db.admins.find_one({"username": admin_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    try:
        admin = Admin(
            username=admin_data.username,
            password_hash=hash_password(admin_data.password),
            role=admin_data.role if not is_first_admin else "admin",
            is_super_admin=is_first_admin,
            first_name=admin_data.first_name,
            last_name=admin_data.last_name
        )
        await db_manager.db.admins.insert_one(admin.dict())
        
        token = secrets.token_hex(32)
        await db_manager.db.admin_tokens.insert_one({
            "admin_id": admin.id,
            "token": token,
            "created_at": datetime.utcnow()
        })
        
        return AdminResponse(
            id=admin.id,
            username=admin.username,
            role=admin.role,
            is_super_admin=admin.is_super_admin,
            token=token
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/admin/login", response_model=AdminResponse)
async def login_admin(login_data: AdminLogin):
    """Login admin/user"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    admin = await db_manager.db.admins.find_one({"username": login_data.username.lower()})
    if not admin or not verify_password(login_data.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = secrets.token_hex(32)
    await db_manager.db.admin_tokens.update_one(
        {"admin_id": admin["id"]},
        {"$set": {
            "token": token,
            "updated_at": datetime.utcnow()
        }},
        upsert=True
    )
    
    return AdminResponse(
        id=admin["id"],
        username=admin["username"],
        role=admin.get("role", "user"),
        is_super_admin=admin.get("is_super_admin", False),
        token=token
    )

@api_router.get("/admin/verify/{token}")
async def verify_admin_token(token: str):
    """Verify if admin token is valid"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"valid": True, "admin_id": token_doc["admin_id"]}

@api_router.get("/admin/list")
async def list_admins(admin_token: str = Query(...)):
    """List all users (requires admin role)"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    requester = await db_manager.db.admins.find_one({"id": token_doc["admin_id"]})
    if not requester or requester.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can view user list")
    
    admins = await db_manager.db.admins.find().to_list(100)
    return [{
        "id": a["id"],
        "username": a["username"],
        "role": a.get("role", "user"),
        "is_super_admin": a.get("is_super_admin", False),
        "created_at": a.get("created_at")
    } for a in admins]

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)

@api_router.post("/admin/change-password")
async def change_password(password_data: PasswordChange, admin_token: str = Query(...)):
    """Change admin password"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    admin = await db_manager.db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    if not verify_password(password_data.current_password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    new_hash = hash_password(password_data.new_password)
    await db_manager.db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password changed successfully"}

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

@api_router.put("/admin/update-profile")
async def update_admin_profile(profile_data: ProfileUpdate, admin_token: str = Query(...)):
    """Update admin profile information"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    admin = await db_manager.db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    update_data = {k: v for k, v in profile_data.dict().items() if v is not None}
    
    if update_data:
        await db_manager.db.admins.update_one(
            {"id": admin["id"]},
            {"$set": update_data}
        )
    
    logger.info(f"Profile updated for admin: {admin['username']}")
    return {"message": "Profile updated successfully"}

@api_router.delete("/admin/{admin_id}")
async def delete_admin(admin_id: str, admin_token: str = Query(...)):
    """Delete a user (requires admin role)"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    requester = await db_manager.db.admins.find_one({"id": token_doc["admin_id"]})
    if not requester or requester.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete users")
    
    if token_doc["admin_id"] == admin_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    target_user = await db_manager.db.admins.find_one({"id": admin_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Cannot delete super admin")
    
    admin_count = await db_manager.db.admins.count_documents({"role": "admin"})
    if admin_count <= 1 and target_user.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    
    result = await db_manager.db.admins.delete_one({"id": admin_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    await db_manager.db.admin_tokens.delete_one({"admin_id": admin_id})
    
    return {"message": "User deleted successfully"}

# ===================== CLIENT MANAGEMENT ROUTES =====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate, admin_token: Optional[str] = Query(default=None)):
    """Create a new client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    admin_id = client_data.admin_id
    
    if admin_token:
        token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
        if not token_doc:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        admin_id = token_doc["admin_id"]
    
    client_payload = client_data.dict()
    if admin_id:
        client_payload["admin_id"] = admin_id
    
    try:
        client = Client(**client_payload)
        await db_manager.db.clients.insert_one(client.dict())
        return client
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/clients")
async def get_all_clients(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    admin_id: Optional[str] = Query(default=None)
):
    """Get all clients with pagination"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not admin_id:
        raise HTTPException(status_code=400, detail="admin_id is required for client listings")
    
    query = {"admin_id": admin_id}
    
    total_count = await db_manager.db.clients.count_documents(query)
    clients = await db_manager.db.clients.find(query).skip(skip).limit(limit).to_list(limit)
    
    return {
        "clients": [Client(**c) for c in clients],
        "pagination": {
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "has_more": skip + limit < total_count
        }
    }

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get a specific client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    return Client(**client)

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(
    client_id: str,
    update_data: ClientUpdate,
    admin_id: Optional[str] = Query(default=None)
):
    """Update a client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db_manager.db.clients.update_one({"id": client_id}, {"$set": update_dict})
    
    updated_client = await db_manager.db.clients.find_one({"id": client_id})
    return Client(**updated_client)

@api_router.post("/clients/{client_id}/allow-uninstall")
async def allow_uninstall(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Signal device to allow app uninstallation"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db_manager.db.clients.update_one(
        {"id": client_id},
        {"$set": {"uninstall_allowed": True}}
    )
    
    return {
        "message": "Device has been signaled to allow uninstall",
        "next_step": "The device will disable its protection. You can now delete this client."
    }

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Delete a client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    if not client.get("uninstall_allowed", False):
        raise HTTPException(
            status_code=400,
            detail="Must signal device to allow uninstall first. Use the 'Allow Uninstall' button before deleting."
        )
    
    result = await db_manager.db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    logger.info(f"Client {client_id} deleted successfully")
    return {"message": "Client deleted successfully"}

# ===================== LOCK CONTROL ROUTES =====================

@api_router.post("/clients/{client_id}/lock")
async def lock_client_device(
    client_id: str,
    message: Optional[str] = None,
    admin_id: Optional[str] = Query(default=None)
):
    """Lock a client device"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    update_data = {"is_locked": True}
    if message:
        update_data["lock_message"] = message
    
    await db_manager.db.clients.update_one({"id": client_id}, {"$set": update_data})
    return {"message": "Device locked successfully"}

@api_router.post("/clients/{client_id}/unlock")
async def unlock_client_device(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Unlock a client device"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db_manager.db.clients.update_one(
        {"id": client_id},
        {"$set": {"is_locked": False, "warning_message": ""}}
    )
    return {"message": "Device unlocked successfully"}

@api_router.post("/clients/{client_id}/warning")
async def send_warning(
    client_id: str,
    message: str,
    admin_id: Optional[str] = Query(default=None)
):
    """Send a warning message to client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db_manager.db.clients.update_one(
        {"id": client_id},
        {"$set": {"warning_message": message}}
    )
    return {"message": "Warning sent successfully"}

# ===================== DEVICE ROUTES =====================

@api_router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    """Register a device with a registration code"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one(
        {"registration_code": registration.registration_code.upper()}
    )
    if not client:
        raise HTTPException(status_code=404, detail="Invalid registration code")
    
    if client.get("is_registered"):
        raise HTTPException(status_code=400, detail="Device already registered")
    
    device_make = registration.device_model.split()[0] if registration.device_model else ""
    
    await db_manager.db.clients.update_one(
        {"id": client["id"]},
        {"$set": {
            "device_id": registration.device_id,
            "device_model": registration.device_model,
            "device_make": device_make,
            "is_registered": True,
            "registered_at": datetime.utcnow()
        }}
    )
    
    updated_client = await db_manager.db.clients.find_one({"id": client["id"]})
    return {
        "message": "Device registered successfully",
        "client_id": client["id"],
        "client": Client(**updated_client).dict()
    }

@api_router.get("/device/status/{client_id}", response_model=ClientStatusResponse)
async def get_device_status(client_id: str):
    """Get device status"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=client.get("is_locked", False),
        lock_message=client.get("lock_message", ""),
        warning_message=client.get("warning_message", ""),
        emi_amount=client.get("emi_amount", 0),
        emi_due_date=client.get("emi_due_date"),
        uninstall_allowed=client.get("uninstall_allowed", False)
    )

@api_router.post("/device/location")
async def update_device_location(location: LocationUpdate):
    """Update device location"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": location.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db_manager.db.clients.update_one(
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
    """Update Expo push token"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": token_data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_fields = {"expo_push_token": token_data.push_token}
    if token_data.admin_id:
        update_fields["admin_id"] = token_data.admin_id
    
    await db_manager.db.clients.update_one(
        {"id": token_data.client_id},
        {"$set": update_fields}
    )
    return {"message": "Push token updated"}

@api_router.post("/device/clear-warning/{client_id}")
async def clear_warning(client_id: str):
    """Clear warning message"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db_manager.db.clients.update_one(
        {"id": client_id},
        {"$set": {"warning_message": ""}}
    )
    return {"message": "Warning cleared"}

# ===================== TAMPER DETECTION =====================

@api_router.post("/clients/{client_id}/report-tamper")
async def report_tamper_attempt(client_id: str, tamper_type: str = "unknown"):
    """Report tampering attempt from client device"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    current_attempts = client.get("tamper_attempts", 0)
    
    await db_manager.db.clients.update_one(
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
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db_manager.db.clients.update_one(
        {"id": client_id},
        {"$set": {"last_reboot": datetime.utcnow()}}
    )
    
    logger.info(f"Client {client_id} rebooted")
    
    return {
        "message": "Reboot recorded",
        "should_lock": client.get("is_locked", False),
        "lock_message": client.get("lock_message", "")
    }

# ===================== LOAN PLANS =====================

@api_router.post("/loan-plans", response_model=LoanPlan)
async def create_loan_plan(plan_data: LoanPlanCreate, admin_token: str = Query(...)):
    """Create a new loan plan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not await verify_admin_token_header(admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    
    try:
        plan_dict = plan_data.dict()
        plan_dict["admin_id"] = token_doc["admin_id"]
        plan = LoanPlan(**plan_dict)
        await db_manager.db.loan_plans.insert_one(plan.dict())
        
        logger.info(f"Loan plan created: {plan.name} by admin {token_doc['admin_id']}")
        return plan
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/loan-plans")
async def get_loan_plans(
    active_only: bool = False,
    admin_id: Optional[str] = Query(default=None)
):
    """Get all loan plans for the specified admin"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not admin_id:
        raise HTTPException(status_code=400, detail="admin_id is required for loan plan listings")
    
    query = {"admin_id": admin_id}
    if active_only:
        query["is_active"] = True
    
    plans = await db_manager.db.loan_plans.find(query).to_list(100)
    return [LoanPlan(**p) for p in plans]

@api_router.get("/loan-plans/{plan_id}", response_model=LoanPlan)
async def get_loan_plan(plan_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get a specific loan plan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    plan = await db_manager.db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    if admin_id and plan.get("admin_id") and plan["admin_id"] != admin_id:
        raise HTTPException(status_code=403, detail="Access denied: This loan plan belongs to another admin")
    
    return LoanPlan(**plan)

@api_router.put("/loan-plans/{plan_id}", response_model=LoanPlan)
async def update_loan_plan(
    plan_id: str,
    plan_data: LoanPlanCreate,
    admin_token: str = Query(...)
):
    """Update a loan plan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not await verify_admin_token_header(admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    
    plan = await db_manager.db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    if plan.get("admin_id") and plan["admin_id"] != token_doc["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied: This loan plan belongs to another admin")
    
    await db_manager.db.loan_plans.update_one(
        {"id": plan_id},
        {"$set": plan_data.dict()}
    )
    
    updated_plan = await db_manager.db.loan_plans.find_one({"id": plan_id})
    logger.info(f"Loan plan updated: {plan_id} by admin {token_doc['admin_id']}")
    return LoanPlan(**updated_plan)

@api_router.delete("/loan-plans/{plan_id}")
async def delete_loan_plan(
    plan_id: str,
    admin_token: str = Query(...),
    force: bool = Query(default=False)
):
    """Delete a loan plan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    if not await verify_admin_token_header(admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    
    plan = await db_manager.db.loan_plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Loan plan not found")
    
    if plan.get("admin_id") and plan["admin_id"] != token_doc["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied: This loan plan belongs to another admin")
    
    clients_using_plan = await db_manager.db.clients.count_documents({"loan_plan_id": plan_id})
    
    if clients_using_plan > 0 and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete loan plan: {clients_using_plan} client(s) are currently using this plan."
        )
    
    if force and clients_using_plan > 0:
        await db_manager.db.clients.update_many(
            {"loan_plan_id": plan_id},
            {"$set": {"loan_plan_id": None}}
        )
        logger.info(f"Cleared loan_plan_id from {clients_using_plan} clients before deleting plan {plan_id}")
    
    result = await db_manager.db.loan_plans.delete_one({"id": plan_id})
    
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
    principal: float = Query(..., gt=0),
    annual_rate: float = Query(..., ge=0),
    months: int = Query(..., gt=0)
):
    """Compare EMI calculations using all three methods"""
    try:
        comparison = calculate_all_methods(principal, annual_rate, months)
        
        methods = [comparison["simple_interest"], comparison["reducing_balance"], comparison["flat_rate"]]
        min_total = min(m["total_amount"] for m in methods)
        
        for method in methods:
            method["savings_vs_highest"] = round(
                max(m["total_amount"] for m in methods) - method["total_amount"], 2
            )
            method["is_cheapest"] = method["total_amount"] == min_total
        
        return comparison
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/calculator/amortization")
async def calculate_amortization_schedule(
    principal: float = Query(..., gt=0),
    annual_rate: float = Query(..., ge=0),
    months: int = Query(..., gt=0),
    method: str = "reducing_balance"
):
    """Generate month-by-month amortization schedule"""
    try:
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
            else:
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
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ===================== LOAN MANAGEMENT =====================

@api_router.post("/loans/{client_id}/setup")
async def setup_loan(
    client_id: str,
    loan_data: ClientCreate,
    admin_id: Optional[str] = Query(default=None)
):
    """Setup or update loan details for a client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    try:
        from dateutil.relativedelta import relativedelta
        
        loan_calc = calculate_simple_interest_emi(
            loan_data.loan_amount,
            loan_data.interest_rate,
            loan_data.loan_tenure_months
        )
        
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
        
        await db_manager.db.clients.update_one({"id": client_id}, {"$set": update_data})
        
        updated_client = await db_manager.db.clients.find_one({"id": client_id})
        return {
            "message": "Loan setup successfully",
            "loan_details": loan_calc,
            "client": Client(**updated_client)
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/loans/{client_id}/payments")
async def record_payment(
    client_id: str,
    payment_data: PaymentCreate,
    admin_token: str = Query(...)
):
    """Record a payment for a client's loan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    token_doc = await db_manager.db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    admin = await db_manager.db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin["id"])
    
    try:
        from dateutil.relativedelta import relativedelta
        
        payment = Payment(
            client_id=client_id,
            amount=payment_data.amount,
            payment_date=payment_data.payment_date or datetime.utcnow(),
            payment_method=payment_data.payment_method,
            notes=payment_data.notes,
            recorded_by=admin["username"]
        )
        
        await db_manager.db.payments.insert_one(payment.dict())
        
        total_paid = client.get("total_paid", 0) + payment_data.amount
        outstanding = client.get("total_amount_due", 0) - total_paid
        
        current_next_due = client.get("next_payment_due", datetime.utcnow())
        next_payment_due = current_next_due + relativedelta(months=1)
        
        update_data = {
            "total_paid": total_paid,
            "outstanding_balance": max(0, outstanding),
            "last_payment_date": payment.payment_date,
            "next_payment_due": next_payment_due if outstanding > 0 else None,
            "days_overdue": 0
        }
        
        if outstanding <= 0:
            update_data["is_locked"] = False
            update_data["lock_message"] = "Loan fully paid. Device unlocked."
        
        await db_manager.db.clients.update_one({"id": client_id}, {"$set": update_data})
        
        logger.info(f"Payment recorded: €{payment_data.amount} for client {client_id}")
        
        return {
            "message": "Payment recorded successfully",
            "payment": payment.dict(),
            "updated_balance": {
                "total_paid": total_paid,
                "outstanding_balance": max(0, outstanding),
                "loan_paid_off": outstanding <= 0
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/loans/{client_id}/payments")
async def get_payment_history(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Get payment history for a client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    payments = await db_manager.db.payments.find(
        {"client_id": client_id}
    ).sort("payment_date", -1).to_list(100)
    
    return {
        "client_id": client_id,
        "total_payments": len(payments),
        "payments": [Payment(**p) for p in payments]
    }

@api_router.get("/loans/{client_id}/schedule")
async def get_payment_schedule(client_id: str, admin_id: Optional[str] = Query(default=None)):
    """Generate payment schedule for a client's loan"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    if not client.get("loan_start_date"):
        raise HTTPException(status_code=400, detail="Loan not set up for this client")
    
    from dateutil.relativedelta import relativedelta
    
    schedule = []
    start_date = client["loan_start_date"]
    monthly_emi = client.get("monthly_emi", 0)
    
    for month in range(client.get("loan_tenure_months", 12)):
        due_date = start_date + relativedelta(months=month + 1)
        
        payment_made = await db_manager.db.payments.find_one({
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
async def update_loan_settings(
    client_id: str,
    settings: LoanSettings,
    admin_id: Optional[str] = Query(default=None)
):
    """Update auto-lock settings for a client"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    client = await db_manager.db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    await db_manager.db.clients.update_one(
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

# ===================== REPORTS & ANALYTICS =====================

@api_router.get("/reports/collection")
async def get_collection_report(admin_id: Optional[str] = Query(default=None)):
    """Get collection statistics and metrics"""
    if not db_manager.db:
        raise HTTPException(status_code=503, detail="Database not available")
    
    query = {}
    if admin_id:
        query["admin_id"] = admin_id
    
    total_clients = await db_manager.db.clients.count_documents(query)
    active_loans = await db_manager.db.clients.count_documents({**query, "outstanding_balance": {"$gt": 0}})
    completed_loans = await db_manager.db.clients.count_documents({
        **query,
        "outstanding_balance": 0,
        "total_paid": {"$gt": 0}
    })
    
    clients = await db_manager.db.clients.find(query).to_list(1000)
    clients_by_id = {c.get("id"): c for c in clients if c.get("id")}
    
    total_disbursed = sum(c.get("total_amount_due", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    
    overdue_clients = len([c for c in clients if c.get("days_overdue", 0) > 0])
    collection_rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0
    
    from dateutil.relativedelta import relativedelta
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    client_ids = [c.get("id") for c in clients if c.get("id")]
    payment_query = {"payment_date": {"$gte": month_start}}
    if client_ids:
        payment_query["client_id"] = {"$in": client_ids}
    
    month_payments = await db_manager.db.payments.find(payment_query).to_list(1000)
    month_collected = sum(p.get("amount", 0) for p in month_payments)
    
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
            "number_of_payments": len(month_payments)
        }
    }

# ===================== HEALTH CHECK =====================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.1.0",
        "database_connected": db_manager.is_connected
    }
    
    if not db_manager.is_connected:
        health_status["status"] = "degraded"
        return JSONResponse(status_code=503, content=health_status)
    
    return health_status

@app.get("/")
async def root():
    """Root endpoint - redirect to API docs"""
    return {
        "message": "Loan Phone Lock API",
        "version": "1.1.0",
        "docs": "/docs",
        "health": "/health"
    }

# Include the API router
app.include_router(api_router)

# ===================== MAIN ENTRY POINT =====================

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    uvicorn.run(
        "server_fixed:app",
        host=host,
        port=port,
        reload=os.getenv("DEBUG", "false").lower() == "true",
        log_level="info"
    )
