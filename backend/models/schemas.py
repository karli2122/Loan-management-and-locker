"""Pydantic models for EMI Device Admin application"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import uuid
import secrets


# ===================== ADMIN MODELS =====================

class Admin(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    role: str = "user"
    is_super_admin: bool = False
    credits: int = 5
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None  # Lender address for contracts
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AdminCreate(BaseModel):
    username: str
    password: str
    role: str = "user"
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
    credits: int = 5
    token: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class ProfileUpdate(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None  # Lender address for contracts


class CreditAssignment(BaseModel):
    target_admin_id: str
    credits: int


# ===================== CLIENT MODELS =====================

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: str = ""
    address: str = ""  # Client address for contracts
    birth_number: str = ""  # Personal identification code (isikukood) for contracts
    admin_id: Optional[str] = None
    device_id: str = ""
    device_model: str = ""
    device_make: str = ""
    used_price_eur: Optional[float] = None
    price_fetched_at: Optional[datetime] = None
    lock_mode: str = "device_admin"
    registration_code: str = ""  # Empty by default, generated via "Generate key" button
    expo_push_token: Optional[str] = None
    
    # Loan Management Fields
    loan_plan_id: Optional[str] = None
    loan_amount: float = 0.0
    down_payment: float = 0.0
    interest_rate: float = 0.0
    loan_tenure_months: int = 12
    monthly_emi: float = 0.0
    total_amount_due: float = 0.0
    total_paid: float = 0.0
    outstanding_balance: float = 0.0
    processing_fee: float = 0.0
    late_fees_accumulated: float = 0.0
    loan_start_date: Optional[datetime] = None
    last_payment_date: Optional[datetime] = None
    next_payment_due: Optional[datetime] = None
    days_overdue: int = 0
    payment_reminders_enabled: bool = True
    
    # Auto-lock settings
    auto_lock_enabled: bool = True
    auto_lock_grace_days: int = 3
    
    # Legacy fields
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
    tamper_attempts: int = 0
    last_tamper_attempt: Optional[datetime] = None
    last_reboot: Optional[datetime] = None
    admin_mode_active: bool = False
    last_heartbeat: Optional[datetime] = None
    uninstall_allowed: bool = False


class ClientCreate(BaseModel):
    name: str
    phone: str
    email: str
    address: str = ""  # Client address for contracts
    birth_number: str = ""  # Personal identification code (isikukood)
    emi_amount: float = 0.0
    emi_due_date: Optional[str] = None
    lock_mode: str = "device_admin"
    admin_id: Optional[str] = None
    loan_amount: float = 0.0
    down_payment: float = 0.0
    interest_rate: float = 10.0
    loan_tenure_months: int = 12


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None  # Client address for contracts
    birth_number: Optional[str] = None  # Personal identification code (isikukood)
    emi_amount: Optional[float] = None
    emi_due_date: Optional[str] = None
    is_locked: Optional[bool] = None
    lock_message: Optional[str] = None
    warning_message: Optional[str] = None
    device_make: Optional[str] = None
    device_model: Optional[str] = None
    used_price_eur: Optional[float] = None
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


# ===================== LOAN MODELS =====================

class LoanPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    interest_rate: float
    min_tenure_months: int = 3
    max_tenure_months: int = 36
    processing_fee_percent: float = 0.0
    late_fee_percent: float = 2.0
    description: str = ""
    is_active: bool = True
    admin_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LoanPlanCreate(BaseModel):
    name: str
    interest_rate: float
    min_tenure_months: int = 3
    max_tenure_months: int = 36
    processing_fee_percent: float = 0.0
    late_fee_percent: float = 2.0
    description: str = ""


class LoanSetup(BaseModel):
    loan_amount: float
    interest_rate: float
    loan_tenure_months: int
    down_payment: float = 0.0


class LoanSettings(BaseModel):
    auto_lock_enabled: bool
    auto_lock_grace_days: int


class Payment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    amount: float
    payment_date: datetime = Field(default_factory=datetime.utcnow)
    payment_method: str = "cash"
    notes: str = ""
    recorded_by: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PaymentCreate(BaseModel):
    amount: float
    payment_date: Optional[datetime] = None
    payment_method: str = "cash"
    notes: str = ""


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


# ===================== NOTIFICATION MODELS =====================

class Notification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str
    type: str
    title: str
    message: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ===================== SUPPORT MODELS =====================

class SupportMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_id: str
    sender: str
    message: str
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SupportMessageCreate(BaseModel):
    message: str


# ===================== BULK OPERATIONS =====================

class BulkOperationRequest(BaseModel):
    client_ids: List[str]
    action: str
    message: Optional[str] = None
