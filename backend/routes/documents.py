"""Document Storage - Attach documents to client profiles (MongoDB base64)."""
import uuid
import base64
from datetime import datetime, timezone
from fastapi import APIRouter, Query, Body, UploadFile, File, Form
from starlette.responses import JSONResponse, Response
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/documents", tags=["documents"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_document(
    admin_token: str = Form(...),
    client_id: str = Form(...),
    doc_type: str = Form(default="other"),
    description: str = Form(default=""),
    file: UploadFile = File(...),
):
    """Upload a document linked to a client. Stored as base64 in MongoDB."""
    await get_admin_id_from_token(admin_token)

    client = await db.clients.find_one({"id": client_id})
    if not client:
        return JSONResponse(status_code=404, content={"error": "Client not found"})

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        return JSONResponse(status_code=400, content={"error": "File too large (max 10MB)"})

    doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": len(content),
        "data": base64.b64encode(content).decode("utf-8"),
        "doc_type": doc_type,
        "description": description,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(doc)
    return {
        "id": doc["id"],
        "client_id": client_id,
        "filename": doc["filename"],
        "content_type": doc["content_type"],
        "size": doc["size"],
        "doc_type": doc["doc_type"],
        "description": doc["description"],
        "uploaded_at": doc["uploaded_at"],
    }


@router.get("/client/{client_id}")
async def list_client_documents(client_id: str, admin_token: str = Query(...)):
    """List all documents for a client (without file data)."""
    await get_admin_id_from_token(admin_token)
    docs = await db.documents.find(
        {"client_id": client_id},
        {"_id": 0, "data": 0}
    ).sort("uploaded_at", -1).to_list(100)
    return {"documents": docs, "total": len(docs)}


@router.get("/{doc_id}/download")
async def download_document(doc_id: str, admin_token: str = Query(...)):
    """Download a document by ID."""
    await get_admin_id_from_token(admin_token)
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        return JSONResponse(status_code=404, content={"error": "Document not found"})

    content = base64.b64decode(doc["data"])
    return Response(
        content=content,
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f"attachment; filename={doc['filename']}"}
    )


@router.get("/{doc_id}/info")
async def get_document_info(doc_id: str, admin_token: str = Query(...)):
    """Get document metadata."""
    await get_admin_id_from_token(admin_token)
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0, "data": 0})
    if not doc:
        return JSONResponse(status_code=404, content={"error": "Document not found"})
    return doc


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, admin_token: str = Query(...)):
    """Delete a document."""
    await get_admin_id_from_token(admin_token)
    r = await db.documents.delete_one({"id": doc_id})
    return {"deleted": r.deleted_count > 0}


@router.get("/stats")
async def document_stats(admin_token: str = Query(...)):
    """Get document storage statistics."""
    await get_admin_id_from_token(admin_token)
    pipeline = [
        {"$group": {
            "_id": "$doc_type",
            "count": {"$sum": 1},
            "total_size": {"$sum": "$size"}
        }}
    ]
    stats = await db.documents.aggregate(pipeline).to_list(50)
    total_docs = sum(s["count"] for s in stats)
    total_size = sum(s["total_size"] for s in stats)
    return {
        "total_documents": total_docs,
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "by_type": {s["_id"]: {"count": s["count"], "size": s["total_size"]} for s in stats}
    }
