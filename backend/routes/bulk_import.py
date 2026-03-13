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
    admin_id = await get_admin_id_from_token(admin_token)

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
            "admin_id": admin_id,
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



@router.post("/loans/csv")
async def import_loans_csv(
    admin_token: str = Form(...),
    file: UploadFile = File(...),
):
    """Import loans from a CSV file and set up loans for existing clients.
    
    Expected CSV columns (flexible matching):
    client_name/phone, loan_amount, interest_rate, duration_months, emi_amount, start_date
    """
    admin_id = await get_admin_id_from_token(admin_token)

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            return JSONResponse(status_code=400, content={"error": "Cannot decode file."})

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return JSONResponse(status_code=400, content={"error": "Empty CSV or no header row"})

    field_map = {}
    for f in reader.fieldnames:
        fl = f.strip().lower().replace(" ", "_")
        if fl in ("client_name", "name", "full_name"):
            field_map[f] = "client_name"
        elif fl in ("phone", "phone_number", "mobile"):
            field_map[f] = "phone"
        elif fl in ("loan_amount", "amount", "principal"):
            field_map[f] = "loan_amount"
        elif fl in ("interest_rate", "rate", "interest"):
            field_map[f] = "interest_rate"
        elif fl in ("duration", "months", "duration_months", "tenure", "tenure_months"):
            field_map[f] = "duration_months"
        elif fl in ("emi", "emi_amount", "monthly_emi", "monthly_payment"):
            field_map[f] = "emi_amount"
        elif fl in ("start_date", "loan_date", "date"):
            field_map[f] = "start_date"

    imported, skipped, errors = 0, 0, []

    for row_num, row in enumerate(reader, start=2):
        mapped = {}
        for csv_col, our_col in field_map.items():
            val = row.get(csv_col, "").strip()
            if val:
                mapped[our_col] = val

        # Find matching client
        client = None
        if mapped.get("phone"):
            client = await db.clients.find_one({"phone": mapped["phone"], "admin_id": admin_id, "is_deleted": {"$ne": True}})
        if not client and mapped.get("client_name"):
            client = await db.clients.find_one({"name": mapped["client_name"], "admin_id": admin_id, "is_deleted": {"$ne": True}})

        if not client:
            errors.append({"row": row_num, "error": f"Client not found: {mapped.get('client_name', mapped.get('phone', '?'))}"})
            continue

        # Skip if client already has an active loan
        if client.get("loan_amount", 0) > 0 and client.get("outstanding_balance", 0) > 0:
            skipped += 1
            continue

        try:
            loan_amount = float(mapped.get("loan_amount", 0))
            interest_rate = float(mapped.get("interest_rate", 0))
            duration = int(mapped.get("duration_months", 12))
            emi = float(mapped.get("emi_amount", 0))
            start_date = mapped.get("start_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        except (ValueError, TypeError) as e:
            errors.append({"row": row_num, "error": f"Invalid number: {str(e)}"})
            continue

        if loan_amount <= 0:
            errors.append({"row": row_num, "error": "Invalid loan amount"})
            continue

        total_due = loan_amount * (1 + interest_rate / 100) if interest_rate else loan_amount
        if emi <= 0:
            emi = round(total_due / duration, 2) if duration > 0 else total_due

        # Set up the loan
        loan_update = {
            "loan_amount": loan_amount,
            "interest_rate": interest_rate,
            "monthly_emi": emi,
            "emi_amount": emi,
            "total_amount_due": total_due,
            "outstanding_balance": total_due,
            "total_paid": 0,
            "days_overdue": 0,
            "loan_start_date": start_date,
            "loan_setup_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.clients.update_one({"id": client["id"]}, {"$set": loan_update})
        imported += 1

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:20],
        "total_rows": imported + skipped + len(errors),
        "detected_columns": list(field_map.values()),
    }


@router.get("/loans/template")
async def get_loan_csv_template(admin_token: str = Query(...)):
    """Get a CSV template for loan import."""
    await get_admin_id_from_token(admin_token)
    template = "client_name,phone,loan_amount,interest_rate,duration_months,emi_amount,start_date\n"
    template += "John Doe,+37255512345,1000,10,12,91.67,2026-04-01\n"
    template += "Jane Smith,+37255598765,2000,12,24,93.33,2026-04-01\n"
    return JSONResponse(content={"template": template})
