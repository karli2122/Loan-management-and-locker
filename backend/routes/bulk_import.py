"""Bulk CSV Import - Import clients from CSV files and reconcile bank statements."""
import csv
import io
import uuid
import re
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Query, UploadFile, File, Form, HTTPException
from starlette.responses import JSONResponse
from database import db
from utils.auth import get_admin_id_from_token
from utils.plan_gating import check_plan_access, get_admin_plan, PLAN_HIERARCHY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/import", tags=["import"])

# Keywords to identify and ignore bank/card fees and card payments
IGNORE_KEYWORDS = [
    # Bank fees
    "teenustasu", "service fee", "fee", "commission", "konto",
    "account fee", "monthly fee", "annual fee", "maintenance fee",
    "pangateenused", "pangakulu", "tasu", "maksekorraldus",
    # Card payments (ignore these - they're not loan-related cash transfers)
    "kaardimakse", "card payment", "pos", "terminal", "mastercard", 
    "visa", "purchase", "ost", "makseterminal", "contactless",
    # Other non-loan transactions
    "intress", "interest charge", "debit interest",
]

def is_ignorable_transaction(description: str) -> bool:
    """Check if transaction should be ignored (fees, card payments, etc.)"""
    desc_lower = description.lower()
    for keyword in IGNORE_KEYWORDS:
        if keyword in desc_lower:
            return True
    return False

def normalize_name(name: str) -> str:
    """Normalize name for matching - lowercase, remove extra spaces, common prefixes."""
    if not name:
        return ""
    name = name.strip().lower()
    # Remove common prefixes like "Hr.", "Pr.", "Mr.", "Mrs."
    name = re.sub(r'^(hr\.|pr\.|mr\.|mrs\.|ms\.)\s*', '', name, flags=re.IGNORECASE)
    # Normalize multiple spaces
    name = re.sub(r'\s+', ' ', name)
    return name.strip()

def name_match_score(client_name: str, transaction_name: str) -> float:
    """Calculate match score between client name and transaction name."""
    cn = normalize_name(client_name)
    tn = normalize_name(transaction_name)
    
    if not cn or not tn:
        return 0.0
    
    # Exact match
    if cn == tn:
        return 1.0
    
    # Check if one contains the other
    if cn in tn or tn in cn:
        return 0.9
    
    # Check word overlap
    cn_words = set(cn.split())
    tn_words = set(tn.split())
    
    if len(cn_words) == 0 or len(tn_words) == 0:
        return 0.0
    
    # Both first and last name match (at least 2 words overlap)
    overlap = cn_words & tn_words
    if len(overlap) >= 2:
        return 0.85
    
    # At least one significant word matches (min 3 chars)
    for word in overlap:
        if len(word) >= 3:
            return 0.7
    
    return 0.0


@router.post("/clients/csv")
async def import_clients_csv(
    admin_token: str = Form(...),
    file: UploadFile = File(...),
    skip_duplicates: str = Form(default="false"),
):
    """Import clients/loans from a CSV file.

    Expected CSV columns (case-insensitive, flexible matching):
    - Required: name (client name)
    - Optional: date_given/loan_date, amount/loan_amount, phone, email, address, birth_number, interest_rate
    
    Behavior:
    - If client name exists: adds loan to existing client
    - If client doesn't exist: creates new client with imported=true flag
    - Imported clients need admin to add missing data (phone, email, interest rate, etc.)
    """
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "bulk_import")

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
        if fl in ("name", "client_name", "full_name", "nimi"):
            field_map[f] = "name"
        elif fl in ("phone", "phone_number", "tel", "mobile", "telefon"):
            field_map[f] = "phone"
        elif fl in ("email", "e-mail", "email_address"):
            field_map[f] = "email"
        elif fl in ("address", "addr", "aadress"):
            field_map[f] = "address"
        elif fl in ("birth_number", "id_code", "personal_id", "id", "pesel", "personnummer", "isikukood"):
            field_map[f] = "birth_number"
        elif fl in ("loan_amount", "loan", "amount", "principal", "summa", "laenu_summa"):
            field_map[f] = "loan_amount"
        elif fl in ("interest_rate", "rate", "interest", "intress"):
            field_map[f] = "interest_rate"
        elif fl in ("duration", "months", "loan_duration", "loan_duration_months", "tenure", "kuud"):
            field_map[f] = "loan_duration_months"
        elif fl in ("date_given", "loan_date", "start_date", "date", "kuupäev", "antud"):
            field_map[f] = "date_given"
        elif fl in ("telegram", "telegram_chat_id", "telegram_id"):
            field_map[f] = "telegram_chat_id"

    imported_new, imported_existing, skipped, errors = 0, 0, 0, []

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

        # Parse loan amount
        loan_amount = 0
        try:
            amount_str = mapped.get("loan_amount", "0").replace(",", ".").replace(" ", "")
            loan_amount = float(amount_str) if amount_str else 0
        except (ValueError, TypeError):
            pass

        # Parse interest rate (default to 0 for imported - needs editing)
        interest_rate = 0
        try:
            rate_str = mapped.get("interest_rate", "0").replace(",", ".").replace(" ", "")
            interest_rate = float(rate_str) if rate_str else 0
        except (ValueError, TypeError):
            pass

        # Parse date given
        date_given = mapped.get("date_given", "")
        if date_given:
            # Try to parse various date formats
            for fmt in ["%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"]:
                try:
                    parsed_date = datetime.strptime(date_given, fmt)
                    date_given = parsed_date.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
        else:
            date_given = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Check if client with same name already exists for this admin
        existing_client = await db.clients.find_one({
            "name": {"$regex": f"^{name}$", "$options": "i"},
            "admin_id": admin_id,
            "is_deleted": {"$ne": True}
        })

        if existing_client:
            # Client exists - add/update loan
            total_due = loan_amount * (1 + interest_rate / 100) if interest_rate else loan_amount
            loan_update = {
                "loan_amount": loan_amount,
                "interest_rate": interest_rate,
                "total_amount_due": total_due,
                "outstanding_balance": total_due,
                "loan_given_date": date_given,
                "loan_setup_at": datetime.now(timezone.utc).isoformat(),
                "imported": True,
                "import_needs_review": True,  # Needs admin to complete data
            }
            await db.clients.update_one({"id": existing_client["id"]}, {"$set": loan_update})
            imported_existing += 1
        else:
            # Create new client with imported flag
            total_due = loan_amount * (1 + interest_rate / 100) if interest_rate else loan_amount
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
                "total_amount_due": total_due,
                "outstanding_balance": total_due,
                "total_paid": 0,
                "days_overdue": 0,
                "is_registered": False,
                "is_locked": False,
                "registration_code": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "loan_given_date": date_given,
                "imported": True,
                "import_needs_review": True,  # Needs admin to add missing data
                "telegram_chat_id": mapped.get("telegram_chat_id", ""),
                "admin_id": admin_id,
            }

            await db.clients.insert_one(client)
            imported_new += 1

    return {
        "imported_new": imported_new,
        "imported_existing": imported_existing,
        "total_imported": imported_new + imported_existing,
        "skipped": skipped,
        "errors": errors[:20],
        "total_rows": imported_new + imported_existing + skipped + len(errors),
        "detected_columns": list(field_map.values()),
        "message": f"Imported {imported_new} new clients and updated {imported_existing} existing clients. All imported items need review."
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
    await check_plan_access(admin_id, "bulk_import")

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



@router.post("/bank-statement/reconcile")
async def reconcile_bank_statement(
    admin_token: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Reconcile bank statement transactions with existing clients.
    
    Supported file types: CSV, PDF, ASICE
    
    Logic:
    - Matches transaction names to existing clients
    - Negative amount (-): Creates/adds loan to matched client
    - Positive amount (+): Records payment for matched client's active loan
      - If payment > loan+interest due: marks difference as extra interest paid
      - If payment < loan+interest: marks that amount as paid
    - Ignores card payments and bank/card fees
    
    Returns summary of matched transactions, loans created, payments recorded.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    await check_plan_access(admin_id, "bulk_import")
    
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    
    if ext not in ("csv", "pdf", "asice"):
        raise HTTPException(
            status_code=400, 
            detail="Supported file types: CSV, PDF, ASICE"
        )
    
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")
    
    # Extract text/data based on file type
    transactions = []
    
    if ext == "csv":
        # Parse CSV directly
        transactions = await parse_csv_transactions(file_bytes)
    elif ext == "pdf" or ext == "asice":
        # Use AI to extract transactions from PDF/ASICE
        transactions = await extract_transactions_with_ai(file_bytes, ext, admin_id)
    
    if not transactions:
        raise HTTPException(
            status_code=422,
            detail="No transactions could be extracted from the file. Please check the file format."
        )
    
    # Get all clients for this admin
    clients = await db.clients.find(
        {"admin_id": admin_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "loan_amount": 1, "interest_rate": 1, 
         "total_amount_due": 1, "outstanding_balance": 1, "total_paid": 1}
    ).to_list(1000)
    
    # Process transactions
    results = {
        "loans_created": [],
        "payments_recorded": [],
        "ignored_transactions": [],
        "unmatched_transactions": [],
        "errors": []
    }
    
    for txn in transactions:
        name = txn.get("name", "").strip()
        amount = txn.get("amount", 0)
        description = txn.get("description", "")
        date = txn.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
        
        # Skip if no name or amount
        if not name or amount == 0:
            continue
        
        # Check if transaction should be ignored (fees, card payments)
        if is_ignorable_transaction(description) or is_ignorable_transaction(name):
            results["ignored_transactions"].append({
                "name": name,
                "amount": amount,
                "reason": "Bank fee or card payment"
            })
            continue
        
        # Find matching client
        best_match = None
        best_score = 0
        
        for client in clients:
            score = name_match_score(client["name"], name)
            if score > best_score and score >= 0.7:  # Minimum 70% match
                best_score = score
                best_match = client
        
        if not best_match:
            results["unmatched_transactions"].append({
                "name": name,
                "amount": amount,
                "date": date,
                "description": description[:100] if description else ""
            })
            continue
        
        # Process based on amount sign
        if amount < 0:
            # Negative = Money going out = Loan disbursement
            loan_amount = abs(amount)
            
            # Create/add loan to client
            try:
                interest_rate = best_match.get("interest_rate", 0) or 0
                total_due = loan_amount * (1 + interest_rate / 100)
                
                await db.clients.update_one(
                    {"id": best_match["id"]},
                    {"$set": {
                        "loan_amount": loan_amount,
                        "total_amount_due": total_due,
                        "outstanding_balance": total_due,
                        "loan_given_date": date,
                        "loan_setup_at": datetime.now(timezone.utc).isoformat(),
                        "imported_from_statement": True,
                    }}
                )
                
                results["loans_created"].append({
                    "client_name": best_match["name"],
                    "client_id": best_match["id"],
                    "loan_amount": loan_amount,
                    "date": date,
                    "match_score": round(best_score * 100)
                })
                
                # Update local client data for subsequent transactions
                best_match["loan_amount"] = loan_amount
                best_match["total_amount_due"] = total_due
                best_match["outstanding_balance"] = total_due
                
            except Exception as e:
                results["errors"].append({
                    "name": name,
                    "error": f"Failed to create loan: {str(e)}"
                })
        
        else:
            # Positive = Money coming in = Payment received
            payment_amount = amount
            outstanding = best_match.get("outstanding_balance", 0) or 0
            total_due = best_match.get("total_amount_due", 0) or 0
            loan_amount = best_match.get("loan_amount", 0) or 0
            
            if outstanding <= 0:
                results["errors"].append({
                    "name": name,
                    "amount": payment_amount,
                    "error": f"Client {best_match['name']} has no active loan"
                })
                continue
            
            try:
                # Calculate payment allocation
                principal_portion = 0
                interest_portion = 0
                extra_interest = 0
                
                # Interest due = total_due - loan_amount
                interest_due = max(total_due - loan_amount, 0)
                
                if payment_amount >= outstanding:
                    # Full payoff (or overpayment)
                    if payment_amount > outstanding:
                        # Overpayment - difference goes to extra interest
                        extra_interest = round(payment_amount - outstanding, 2)
                    
                    principal_portion = loan_amount
                    interest_portion = interest_due + extra_interest
                    new_outstanding = 0
                else:
                    # Partial payment - allocate to interest first, then principal
                    if payment_amount <= interest_due:
                        interest_portion = payment_amount
                        principal_portion = 0
                    else:
                        interest_portion = interest_due
                        principal_portion = payment_amount - interest_due
                    
                    new_outstanding = max(outstanding - payment_amount, 0)
                
                # Update client
                current_total_paid = best_match.get("total_paid", 0) or 0
                await db.clients.update_one(
                    {"id": best_match["id"]},
                    {"$set": {
                        "outstanding_balance": new_outstanding,
                        "total_paid": current_total_paid + payment_amount,
                    }}
                )
                
                # Record payment in payments collection
                payment_record = {
                    "id": str(uuid.uuid4()),
                    "client_id": best_match["id"],
                    "admin_id": admin_id,
                    "amount": payment_amount,
                    "principal_portion": principal_portion,
                    "interest_portion": interest_portion,
                    "payment_date": datetime.fromisoformat(date) if isinstance(date, str) else date,
                    "payment_method": "bank_transfer",
                    "notes": f"Imported from bank statement. Extra interest: {extra_interest}" if extra_interest > 0 else "Imported from bank statement",
                    "created_at": datetime.now(timezone.utc),
                    "imported_from_statement": True,
                }
                await db.payments.insert_one(payment_record)
                
                results["payments_recorded"].append({
                    "client_name": best_match["name"],
                    "client_id": best_match["id"],
                    "payment_amount": payment_amount,
                    "principal_portion": principal_portion,
                    "interest_portion": interest_portion,
                    "extra_interest": extra_interest,
                    "new_outstanding": new_outstanding,
                    "date": date,
                    "match_score": round(best_score * 100),
                    "loan_fully_paid": new_outstanding == 0
                })
                
                # Update local client data
                best_match["outstanding_balance"] = new_outstanding
                best_match["total_paid"] = current_total_paid + payment_amount
                
            except Exception as e:
                results["errors"].append({
                    "name": name,
                    "amount": payment_amount,
                    "error": f"Failed to record payment: {str(e)}"
                })
    
    return {
        "summary": {
            "total_transactions": len(transactions),
            "loans_created": len(results["loans_created"]),
            "payments_recorded": len(results["payments_recorded"]),
            "ignored": len(results["ignored_transactions"]),
            "unmatched": len(results["unmatched_transactions"]),
            "errors": len(results["errors"])
        },
        "details": results
    }


async def parse_csv_transactions(file_bytes: bytes) -> list:
    """Parse CSV file to extract transactions."""
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = file_bytes.decode("latin-1")
        except Exception:
            return []
    
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    
    # Map field names flexibly
    field_map = {}
    for f in reader.fieldnames:
        fl = f.strip().lower().replace(" ", "_")
        if fl in ("name", "beneficiary", "recipient", "sender", "saaja", "maksja", "counterparty", "partner"):
            field_map[f] = "name"
        elif fl in ("amount", "sum", "summa", "value", "debit", "credit"):
            field_map[f] = "amount"
        elif fl in ("date", "kuupäev", "transaction_date", "booking_date", "value_date"):
            field_map[f] = "date"
        elif fl in ("description", "details", "reference", "selgitus", "kirjeldus", "memo"):
            field_map[f] = "description"
    
    transactions = []
    for row in reader:
        txn = {}
        for csv_col, our_col in field_map.items():
            val = row.get(csv_col, "").strip()
            if val:
                txn[our_col] = val
        
        # Parse amount
        if "amount" in txn:
            try:
                amount_str = txn["amount"].replace(",", ".").replace(" ", "").replace("€", "").replace("EUR", "")
                txn["amount"] = float(amount_str)
            except (ValueError, TypeError):
                txn["amount"] = 0
        else:
            txn["amount"] = 0
        
        # Parse date
        if "date" in txn:
            for fmt in ["%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"]:
                try:
                    parsed = datetime.strptime(txn["date"], fmt)
                    txn["date"] = parsed.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue
        
        if txn.get("name") and txn.get("amount", 0) != 0:
            transactions.append(txn)
    
    return transactions


async def extract_transactions_with_ai(file_bytes: bytes, ext: str, admin_id: str) -> list:
    """Extract transactions from PDF/ASICE using AI."""
    import zipfile
    from io import BytesIO
    
    # Check if user has OCR access (enterprise feature)
    admin_plan = await get_admin_plan(admin_id)
    admin_level = PLAN_HIERARCHY.get(admin_plan, 0)
    enterprise_level = PLAN_HIERARCHY.get("enterprise", 2)
    has_ocr_access = admin_level >= enterprise_level
    
    # For ASICE, extract the content first
    pdf_bytes = None
    csv_bytes = None
    
    if ext == "asice":
        try:
            with zipfile.ZipFile(BytesIO(file_bytes), 'r') as zf:
                # Look for CSV first (easier to parse)
                csv_files = [n for n in zf.namelist() if n.lower().endswith('.csv')]
                if csv_files:
                    csv_bytes = zf.read(csv_files[0])
                else:
                    # Look for PDF
                    pdf_files = [n for n in zf.namelist() if n.lower().endswith('.pdf')]
                    if pdf_files:
                        pdf_bytes = zf.read(pdf_files[0])
        except Exception as e:
            logger.error(f"Failed to extract from ASICE: {e}")
            return []
    else:
        pdf_bytes = file_bytes
    
    # If we found CSV in ASICE, parse it directly
    if csv_bytes:
        return await parse_csv_transactions(csv_bytes)
    
    # For PDF, we need OCR/AI
    if not pdf_bytes:
        return []
    
    if not has_ocr_access:
        raise HTTPException(
            status_code=403,
            detail="PDF bank statement processing requires Enterprise plan for AI extraction."
        )
    
    # Use AI to extract transactions from PDF
    try:
        import base64
        from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContent
        import os
        
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI key not configured")
        
        b64_pdf = base64.b64encode(pdf_bytes).decode()
        pdf_file = FileContent(content_type="application/pdf", file_content_base64=b64_pdf)
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"txn-extract-{uuid.uuid4().hex[:8]}",
            system_message="""You are a bank statement parser. Extract ALL transactions from this bank statement.
For each transaction, extract:
- name: The counterparty name (sender for incoming, recipient for outgoing)
- amount: The transaction amount (POSITIVE for money received/incoming, NEGATIVE for money sent/outgoing)
- date: Transaction date in YYYY-MM-DD format
- description: Any reference or description text

Return a JSON array of transactions like:
[
  {"name": "John Doe", "amount": 150.00, "date": "2026-03-15", "description": "Payment for loan"},
  {"name": "Jane Smith", "amount": -500.00, "date": "2026-03-14", "description": "Loan disbursement"}
]

IMPORTANT:
- Positive amounts = money RECEIVED (incoming transfers, payments to you)
- Negative amounts = money SENT (outgoing transfers, loan disbursements)
- Skip bank fees, card payments, and internal transfers
- Return ONLY valid JSON array, no other text"""
        ).with_model("openai", "gpt-4.1")
        
        msg = UserMessage(
            text="Extract all transactions from this bank statement as JSON array.",
            file_contents=[pdf_file],
        )
        result = await chat.send_message(msg)
        
        # Parse JSON response
        import json
        cleaned = result.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        
        transactions = json.loads(cleaned.strip())
        return transactions if isinstance(transactions, list) else []
        
    except Exception as e:
        logger.error(f"AI transaction extraction failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract transactions from PDF: {str(e)}"
        )
