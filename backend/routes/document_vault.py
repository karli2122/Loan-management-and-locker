"""Document vault - secure storage for client ID photos, contracts, proof of income on VPS."""
from fastapi import APIRouter, Query, UploadFile, File, Form
from datetime import datetime, timezone
from typing import Optional
import uuid
import os
import logging
import asyncio
import base64

from database import db
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.audit import log_audit, AuditAction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents/vault", tags=["Document Vault"])

VPS_HOST = "37.148.202.159"
VPS_USER = "karliv"
VPS_PASS = "Nasvakas123!"
VPS_DOC_PATH = "/opt/paylock/documents"


async def _ensure_vps_dir(client_id: str):
    """Ensure the document directory exists on VPS."""
    dir_path = f"{VPS_DOC_PATH}/{client_id}"
    cmd = f"sshpass -p '{VPS_PASS}' ssh -o StrictHostKeyChecking=no {VPS_USER}@{VPS_HOST} 'mkdir -p {dir_path}'"
    proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    await proc.communicate()


async def _upload_to_vps(local_path: str, remote_path: str):
    """Upload a file to VPS via SCP."""
    cmd = f"sshpass -p '{VPS_PASS}' scp -o StrictHostKeyChecking=no {local_path} {VPS_USER}@{VPS_HOST}:{remote_path}"
    proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, stderr = await proc.communicate()
    return proc.returncode == 0


async def _delete_from_vps(remote_path: str):
    """Delete a file from VPS."""
    cmd = f"sshpass -p '{VPS_PASS}' ssh -o StrictHostKeyChecking=no {VPS_USER}@{VPS_HOST} 'rm -f {remote_path}'"
    proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    await proc.communicate()


async def _download_from_vps(remote_path: str) -> bytes:
    """Download file content from VPS."""
    cmd = f"sshpass -p '{VPS_PASS}' ssh -o StrictHostKeyChecking=no {VPS_USER}@{VPS_HOST} 'cat {remote_path}'"
    proc = await asyncio.create_subprocess_shell(cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    stdout, _ = await proc.communicate()
    return stdout


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
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)
    
    # Read file content
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        from utils.exceptions import ValidationException
        raise ValidationException("File size exceeds 10MB limit")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename or "file")[1] or ".bin"
    doc_id = str(uuid.uuid4())
    filename = f"{doc_id}{ext}"
    remote_path = f"{VPS_DOC_PATH}/{client_id}/{filename}"
    
    # Save temp file locally then upload to VPS
    tmp_path = f"/tmp/{filename}"
    with open(tmp_path, "wb") as f:
        f.write(content)
    
    await _ensure_vps_dir(client_id)
    uploaded = await _upload_to_vps(tmp_path, remote_path)
    
    # Clean up temp
    try:
        os.remove(tmp_path)
    except Exception:
        pass
    
    if not uploaded:
        from utils.exceptions import ValidationException
        raise ValidationException("Failed to upload file to storage")
    
    # Save metadata to MongoDB
    doc_meta = {
        "id": doc_id,
        "client_id": client_id,
        "admin_id": admin_id,
        "doc_type": doc_type,
        "description": description,
        "original_filename": file.filename,
        "stored_filename": filename,
        "remote_path": remote_path,
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


@router.get("/{client_id}")
async def list_documents(
    client_id: str,
    admin_token: str = Query(...),
    doc_type: Optional[str] = Query(default=None),
):
    """List all documents in a client's vault."""
    admin_id = await get_admin_id_from_token(admin_token)
    
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
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)
    
    doc = await db.document_vault.find_one({"id": doc_id, "client_id": client_id}, {"_id": 0})
    if not doc:
        from utils.exceptions import ValidationException
        raise ValidationException("Document not found")
    
    content = await _download_from_vps(doc["remote_path"])
    
    return {
        "document": {
            "id": doc["id"],
            "filename": doc["original_filename"],
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
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        from utils.exceptions import ValidationException
        raise ValidationException("Client not found")
    await enforce_client_scope(client, admin_id)
    
    doc = await db.document_vault.find_one({"id": doc_id, "client_id": client_id})
    if not doc:
        from utils.exceptions import ValidationException
        raise ValidationException("Document not found")
    
    # Delete from VPS
    await _delete_from_vps(doc["remote_path"])
    
    # Delete from MongoDB
    await db.document_vault.delete_one({"id": doc_id})
    
    await log_audit(admin_id, AuditAction.CLIENT_UPDATE, "document", client_id,
                    client.get("name", ""), f"Deleted document: {doc.get('original_filename')}")
    
    return {"message": "Document deleted", "doc_id": doc_id}
