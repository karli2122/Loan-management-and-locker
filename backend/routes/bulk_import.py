"""Bulk CSV Import - Import clients from CSV files."""
import csv
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Query, UploadFile, File, Form
from starlette.responses import JSONResponse
from database import db
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/clients/csv")
async def import_clients_csv(
    admin_token: str = Form(...),
    file: UploadFile = File(...),
    skip_duplicates: str = Form(default="true"),
):
    """Import clients from a CSV file.

    Expected CSV columns (case-insensitive, flexible matching):
    name, phone, email, address, birth_number/id_code, loan_amount, interest_rate, loan_duration_months
    """
    await get_admin_id_from_token(admin_token)

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            return JSONResponse(status_code=400, content={"error": "Cannot decode file. Use UTF-8 or Latin-1 encoding."})

    # Parse CSV
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return JSONResponse(status_code=400, content={"error": "Empty CSV or no header row"})

    # Normalize field names
    field_map = {}
    for f in reader.fieldnames:
        fl = f.strip().lower().replace(" ", "_")
        if fl in ("name", "client_name", "full_name"):
            field_map[f] = "name"
        elif fl in ("phone", "phone_number", "tel", "mobile"):
            field_map[f] = "phone"
        elif fl in ("email", "e-mail", "email_address"):
            field_map[f] = "email"
        elif fl in ("address", "addr"):
            field_map[f] = "address"
        elif fl in ("birth_number", "id_code", "personal_id", "id", "pesel", "personnummer"):
            field_map[f] = "birth_number"
        elif fl in ("loan_amount", "loan", "amount", "principal"):
            field_map[f] = "loan_amount"
        elif fl in ("interest_rate", "rate", "interest"):
            field_map[f] = "interest_rate"
        elif fl in ("duration", "months", "loan_duration", "loan_duration_months", "tenure"):
            field_map[f] = "loan_duration_months"
        elif fl in ("telegram", "telegram_chat_id", "telegram_id"):
            field_map[f] = "telegram_chat_id"

    skip_dupes = skip_duplicates.lower() in ("true", "1", "yes")
    imported, skipped, errors = 0, 0, []

    for row_num, row in enumerate(reader, start=2):
        mapped = {}
        for csv_col, our_col in field_map.items():
            val = row.get(csv_col, "").strip()
            if val:
                mapped[our_col] = val

        name = mapped.get("name", "").strip()
        if not name:
            errors.append({"row": row_num, "error": "Missing name"})
            continue

        # Check duplicates by phone or birth_number
        if skip_dupes:
            dupe_query = []
            if mapped.get("phone"):
                dupe_query.append({"phone": mapped["phone"]})
            if mapped.get("birth_number"):
                dupe_query.append({"birth_number": mapped["birth_number"]})
            if dupe_query:
                existing = await db.clients.find_one({"$or": dupe_query})
                if existing:
                    skipped += 1
                    continue

        loan_amount = 0
        try:
            loan_amount = float(mapped.get("loan_amount", 0))
        except (ValueError, TypeError):
            pass

        interest_rate = 0
        try:
            interest_rate = float(mapped.get("interest_rate", 0))
        except (ValueError, TypeError):
            pass

        client = {
            "id": str(uuid.uuid4()),
            "name": name,
            "phone": mapped.get("phone", ""),
            "email": mapped.get("email", ""),
            "address": mapped.get("address", ""),
            "birth_number": mapped.get("birth_number", ""),
            "loan_amount": loan_amount,
            "interest_rate": interest_rate,
            "monthly_emi": 0,
            "total_amount_due": loan_amount * (1 + interest_rate / 100) if loan_amount and interest_rate else loan_amount,
            "outstanding_balance": loan_amount * (1 + interest_rate / 100) if loan_amount and interest_rate else loan_amount,
            "total_paid": 0,
            "days_overdue": 0,
            "is_registered": False,
            "is_locked": False,
            "registration_code": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "imported": True,
            "telegram_chat_id": mapped.get("telegram_chat_id", ""),
        }

        await db.clients.insert_one(client)
        imported += 1

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:20],
        "total_rows": imported + skipped + len(errors),
        "detected_columns": list(field_map.values()),
    }


@router.get("/template")
async def get_csv_template(admin_token: str = Query(...)):
    """Get a CSV template for client import."""
    await get_admin_id_from_token(admin_token)
    template = "name,phone,email,address,birth_number,loan_amount,interest_rate\n"
    template += "John Doe,+37255512345,john@example.com,Tallinn Estonia,39001010001,1000,10\n"
    template += "Jane Smith,+37255598765,jane@example.com,Tartu Estonia,49505050002,2000,12\n"
    return JSONResponse(
        content={"template": template},
        headers={"Content-Type": "application/json"}
    )
