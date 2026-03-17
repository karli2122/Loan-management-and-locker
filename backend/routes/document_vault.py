"""Document vault - secure storage for client ID photos, contracts, proof of income."""
from fastapi import APIRouter, Query, UploadFile, File
from datetime import datetime, timezone
from typing import Optional
import uuid
import os
import logging
import base64
import shutil

from database import db
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.audit import log_audit, AuditAction
from utils.plan_gating import check_plan_access

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents/vault", tags=["Document Vault"])

DOC_PATH = os.environ.get("DOC_VAULT_PATH", "/opt/paylock/documents")


def _ensure_dir(client_id: str):
    dir_path = os.path.join(DOC_PATH, client_id)
    os.makedirs(dir_path, exist_ok=True)
    return dir_path


@router.post("/{client_id}/upload")
async def upload_document(
    client_id: str,
    admin_token: str = Query(...),
    doc_type: str = Query(..., regex="^(id_photo|contract|proof_of_income|other)$"),
    description: str = Query(default=""),
    file: UploadFile = File(...),
):
    """Upload a document to the client's vault."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "document_vault")

    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        from utils.exceptions import ValidationException
        raise ValidationException("File size exceeds 10MB limit")

    ext = os.path.splitext(file.filename or "file")[1] or ".bin"
    doc_id = str(uuid.uuid4())
    filename = f"{doc_id}{ext}"

    dir_path = _ensure_dir(client_id)
    file_path = os.path.join(dir_path, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    doc_meta = {
        "id": doc_id,
        "client_id": client_id,
        "admin_id": admin_id,
        "doc_type": doc_type,
        "description": description,
        "original_filename": file.filename,
        "stored_filename": filename,
        "file_path": file_path,
        "file_size": len(content),
        "content_type": file.content_type or "application/octet-stream",
        "created_at": datetime.now(timezone.utc),
    }
    await db.document_vault.insert_one(doc_meta)
    doc_meta.pop("_id", None)
    if isinstance(doc_meta.get("created_at"), datetime):
        doc_meta["created_at"] = doc_meta["created_at"].isoformat()

    await log_audit(admin_id, AuditAction.CLIENT_UPDATE, "document", client_id,
                    client.get("name", ""), f"Uploaded {doc_type}: {file.filename}")

    return {"message": "Document uploaded", "document": doc_meta}


# NOTE: /all must come BEFORE /{client_id} to avoid route matching issues
@router.get("/all")
async def list_all_documents(
    admin_token: str = Query(...),
    doc_type: Optional[str] = Query(default=None),
):
    """List all documents across all clients (for Document Vault page)."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "document_vault")

    # Get admin's clients
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "is_super_admin": 1})
    is_super_admin = admin.get("is_super_admin", False) if admin else False
    
    if is_super_admin:
        # Super admin sees all documents
        query = {}
    else:
        # Regular admin sees documents from their clients
        client_ids = await db.clients.find(
            {"$or": [{"admin_id": admin_id}, {"created_by": admin_id}]},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        client_id_list = [c["id"] for c in client_ids]
        query = {"client_id": {"$in": client_id_list}}

    if doc_type:
        query["doc_type"] = doc_type

    docs = await db.document_vault.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for d in docs:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()

    return {"documents": docs, "total": len(docs)}


@router.get("/{client_id}")
async def list_documents(
    client_id: str,
    admin_token: str = Query(...),
    doc_type: Optional[str] = Query(default=None),
):
    """List all documents in a client's vault."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "document_vault")

    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)

    query = {"client_id": client_id}
    if doc_type:
        query["doc_type"] = doc_type

    docs = await db.document_vault.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for d in docs:
        if isinstance(d.get("created_at"), datetime):
            d["created_at"] = d["created_at"].isoformat()

    return {"client_id": client_id, "documents": docs, "total": len(docs)}



@router.get("/{client_id}/{doc_id}/download")
async def download_document(
    client_id: str,
    doc_id: str,
    admin_token: str = Query(...),
):
    """Download a document from the vault (returns base64 encoded content)."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "document_vault")

    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)

    doc = await db.document_vault.find_one({"id": doc_id, "client_id": client_id}, {"_id": 0})
    if not doc:
        from utils.exceptions import ValidationException
        raise ValidationException("Document not found")

    file_path = doc.get("file_path") or doc.get("remote_path", "")
    
    # If file_path is empty or doesn't exist, check if we have inline data
    if not file_path or not os.path.isfile(file_path):
        # Check if document has stored data directly
        stored_data = doc.get("data")
        if stored_data:
            return {
                "document": {
                    "id": doc["id"],
                    "filename": doc.get("original_filename", "document"),
                    "content_type": doc.get("content_type", "application/octet-stream"),
                    "data": stored_data if isinstance(stored_data, str) else base64.b64encode(stored_data).decode("utf-8"),
                }
            }
        from utils.exceptions import ValidationException
        raise ValidationException(f"File not found on disk: {file_path}")

    with open(file_path, "rb") as f:
        content = f.read()

    return {
        "document": {
            "id": doc["id"],
            "filename": doc.get("original_filename", "document"),
            "content_type": doc.get("content_type", "application/octet-stream"),
            "data": base64.b64encode(content).decode("utf-8"),
        }
    }


@router.delete("/{client_id}/{doc_id}")
async def delete_document(
    client_id: str,
    doc_id: str,
    admin_token: str = Query(...),
):
    """Delete a document from the vault."""
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "document_vault")

    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)

    doc = await db.document_vault.find_one({"id": doc_id, "client_id": client_id})
    if not doc:
        from utils.exceptions import ValidationException
        raise ValidationException("Document not found")

    file_path = doc.get("file_path") or doc.get("remote_path", "")
    if os.path.isfile(file_path):
        os.remove(file_path)

    await db.document_vault.delete_one({"id": doc_id})

    await log_audit(admin_id, AuditAction.CLIENT_UPDATE, "document", client_id,
                    client.get("name", ""), f"Deleted document: {doc.get('original_filename')}")

    return {"message": "Document deleted", "doc_id": doc_id}
