"""Database connection and utilities."""
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URL, DB_NAME

logger = logging.getLogger(__name__)

logger.info(f"Connecting to MongoDB: {MONGO_URL[:20]}...")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


async def create_indexes():
    """Create database indexes on startup for better performance."""
    try:
        logger.info("Creating database indexes...")
        # Client collection indexes
        await db.clients.create_index("id", unique=True)
        await db.clients.create_index("registration_code", unique=True)
        await db.clients.create_index("is_locked")
        await db.clients.create_index("is_registered")
        await db.clients.create_index([("next_payment_due", 1), ("outstanding_balance", 1)])
        await db.clients.create_index("loan_plan_id")
        
        # Admin collection indexes
        await db.admins.create_index("id", unique=True)
        await db.admins.create_index("username", unique=True)
        
        # Admin tokens collection indexes
        await db.admin_tokens.create_index("admin_id")
        await db.admin_tokens.create_index("token", unique=True)
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Could not create indexes: {e}")


async def close_connection():
    """Close database connection on shutdown."""
    logger.info("Closing database connection...")
    client.close()
