from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import hashlib
import secrets

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
app = FastAPI(title="EMI Phone Lock API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBasic()

# Utility functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

# ===================== MODELS =====================

class Admin(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AdminCreate(BaseModel):
    username: str
    password: str

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminResponse(BaseModel):
    id: str
    username: str
    token: str

class Client(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: str
    device_id: str = ""
    device_model: str = ""
    registration_code: str = Field(default_factory=lambda: secrets.token_hex(4).upper())
    emi_amount: float = 0.0
    emi_due_date: Optional[str] = None
    is_locked: bool = False
    lock_message: str = "Your device has been locked due to pending EMI payment."
    warning_message: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_location_update: Optional[datetime] = None
    is_registered: bool = False
    registered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ClientCreate(BaseModel):
    name: str
    phone: str
    email: str
    emi_amount: float = 0.0
    emi_due_date: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    emi_amount: Optional[float] = None
    emi_due_date: Optional[str] = None
    is_locked: Optional[bool] = None
    lock_message: Optional[str] = None
    warning_message: Optional[str] = None

class DeviceRegistration(BaseModel):
    registration_code: str
    device_id: str
    device_model: str

class LocationUpdate(BaseModel):
    client_id: str
    latitude: float
    longitude: float

class ClientStatusResponse(BaseModel):
    id: str
    name: str
    is_locked: bool
    lock_message: str
    warning_message: str
    emi_amount: float
    emi_due_date: Optional[str]

# ===================== ADMIN ROUTES =====================

async def verify_admin_token_header(token: str) -> bool:
    """Helper function to verify admin token"""
    token_doc = await db.admin_tokens.find_one({"token": token})
    return token_doc is not None

@api_router.post("/admin/register", response_model=AdminResponse)
async def register_admin(admin_data: AdminCreate, admin_token: str = None):
    # Validate password length
    if len(admin_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Check if any admin exists - if yes, require token
    admin_count = await db.admins.count_documents({})
    if admin_count > 0:
        if not admin_token:
            raise HTTPException(status_code=401, detail="Admin token required to register new admins")
        if not await verify_admin_token_header(admin_token):
            raise HTTPException(status_code=401, detail="Invalid admin token")
    
    # Check if admin already exists
    existing = await db.admins.find_one({"username": admin_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Admin username already exists")
    
    admin = Admin(
        username=admin_data.username,
        password_hash=hash_password(admin_data.password)
    )
    await db.admins.insert_one(admin.dict())
    
    token = secrets.token_hex(32)
    await db.admin_tokens.insert_one({"admin_id": admin.id, "token": token})
    
    return AdminResponse(id=admin.id, username=admin.username, token=token)

@api_router.post("/admin/login", response_model=AdminResponse)
async def login_admin(login_data: AdminLogin):
    admin = await db.admins.find_one({"username": login_data.username})
    if not admin or not verify_password(login_data.password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = secrets.token_hex(32)
    await db.admin_tokens.update_one(
        {"admin_id": admin["id"]},
        {"$set": {"token": token}},
        upsert=True
    )
    
    return AdminResponse(id=admin["id"], username=admin["username"], token=token)

@api_router.get("/admin/verify/{token}")
async def verify_admin_token(token: str):
    token_doc = await db.admin_tokens.find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"valid": True, "admin_id": token_doc["admin_id"]}

# ===================== ADMIN MANAGEMENT ROUTES =====================

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class AdminListResponse(BaseModel):
    id: str
    username: str
    created_at: datetime

@api_router.get("/admin/list")
async def list_admins(admin_token: str):
    """List all admins (requires valid admin token)"""
    if not await verify_admin_token_header(admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    admins = await db.admins.find().to_list(100)
    return [{"id": a["id"], "username": a["username"], "created_at": a.get("created_at")} for a in admins]

@api_router.post("/admin/change-password")
async def change_password(admin_token: str, password_data: PasswordChange):
    """Change admin password"""
    # Validate new password length
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    admin = await db.admins.find_one({"id": token_doc["admin_id"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Verify current password
    if not verify_password(password_data.current_password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Update password
    new_hash = hash_password(password_data.new_password)
    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password changed successfully"}

@api_router.delete("/admin/{admin_id}")
async def delete_admin(admin_id: str, admin_token: str):
    """Delete an admin (cannot delete yourself or the last admin)"""
    token_doc = await db.admin_tokens.find_one({"token": admin_token})
    if not token_doc:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    
    # Cannot delete yourself
    if token_doc["admin_id"] == admin_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    # Check if this is the last admin
    admin_count = await db.admins.count_documents({})
    if admin_count <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    
    # Delete admin
    result = await db.admins.delete_one({"id": admin_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Delete associated token
    await db.admin_tokens.delete_one({"admin_id": admin_id})
    
    return {"message": "Admin deleted successfully"}

# ===================== CLIENT MANAGEMENT ROUTES =====================

@api_router.post("/clients", response_model=Client)
async def create_client(client_data: ClientCreate):
    client = Client(**client_data.dict())
    await db.clients.insert_one(client.dict())
    return client

@api_router.get("/clients", response_model=List[Client])
async def get_all_clients():
    clients = await db.clients.find().to_list(1000)
    return [Client(**c) for c in clients]

@api_router.get("/clients/{client_id}", response_model=Client)
async def get_client(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return Client(**client)

@api_router.put("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, update_data: ClientUpdate):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
    if update_dict:
        await db.clients.update_one({"id": client_id}, {"$set": update_dict})
    
    updated_client = await db.clients.find_one({"id": client_id})
    return Client(**updated_client)

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str):
    result = await db.clients.delete_one({"id": client_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"message": "Client deleted successfully"}

# ===================== LOCK CONTROL ROUTES =====================

@api_router.post("/clients/{client_id}/lock")
async def lock_client_device(client_id: str, message: Optional[str] = None):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_data = {"is_locked": True}
    if message:
        update_data["lock_message"] = message
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    return {"message": "Device locked successfully"}

@api_router.post("/clients/{client_id}/unlock")
async def unlock_client_device(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one({"id": client_id}, {"$set": {"is_locked": False, "warning_message": ""}})
    return {"message": "Device unlocked successfully"}

@api_router.post("/clients/{client_id}/warning")
async def send_warning(client_id: str, message: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": message}})
    return {"message": "Warning sent successfully"}

# ===================== CLIENT DEVICE ROUTES =====================

@api_router.post("/device/register")
async def register_device(registration: DeviceRegistration):
    client = await db.clients.find_one({"registration_code": registration.registration_code.upper()})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid registration code")
    
    if client.get("is_registered"):
        raise HTTPException(status_code=400, detail="Device already registered")
    
    await db.clients.update_one(
        {"id": client["id"]},
        {"$set": {
            "device_id": registration.device_id,
            "device_model": registration.device_model,
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
    
    return ClientStatusResponse(
        id=client["id"],
        name=client["name"],
        is_locked=client["is_locked"],
        lock_message=client["lock_message"],
        warning_message=client.get("warning_message", ""),
        emi_amount=client["emi_amount"],
        emi_due_date=client.get("emi_due_date")
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

@api_router.post("/device/clear-warning/{client_id}")
async def clear_warning(client_id: str):
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one({"id": client_id}, {"$set": {"warning_message": ""}})
    return {"message": "Warning cleared"}

# ===================== STATS ROUTE =====================

@api_router.get("/stats")
async def get_stats():
    total_clients = await db.clients.count_documents({})
    locked_devices = await db.clients.count_documents({"is_locked": True})
    registered_devices = await db.clients.count_documents({"is_registered": True})
    
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
        
        # Admin collection indexes
        await db.admins.create_index("id", unique=True)
        await db.admins.create_index("username", unique=True)
        
        # Admin tokens collection indexes
        await db.admin_tokens.create_index("admin_id")
        await db.admin_tokens.create_index("token", unique=True)
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Could not create indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Close database connection on shutdown"""
    logger.info("Closing database connection...")
    client.close()
