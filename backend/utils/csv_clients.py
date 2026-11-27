"""Shared CSV client-import parsing and validation (no I/O)."""
import csv
import io
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Set, Tuple

COLUMN_ALIASES = {
    "name": ("name", "client_name", "full_name", "nimi"),
    "phone": ("phone", "phone_number", "tel", "mobile", "telefon"),
    "email": ("email", "e-mail", "email_address"),
    "address": ("address", "addr", "aadress"),
    "birth_number": ("birth_number", "id_code", "personal_id", "id", "pesel", "personnummer", "isikukood"),
    "loan_amount": ("loan_amount", "loan", "amount", "principal", "summa", "laenu_summa"),
    "interest_rate": ("interest_rate", "rate", "interest", "intress"),
    "loan_duration_months": ("duration", "months", "loan_duration", "loan_duration_months", "tenure", "kuud"),
    "date_given": ("date_given", "loan_date", "start_date", "date", "kuupäev", "antud"),
    "telegram_chat_id": ("telegram", "telegram_chat_id", "telegram_id"),
    "loan_plan": ("loan_plan", "plan", "plan_name", "plan_id"),
}

DATE_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y")


def normalize_header(name: str) -> str:
    return (name or "").strip().lower().replace(" ", "_")


def build_field_map(fieldnames: Optional[Iterable[str]]) -> Dict[str, str]:
    field_map: Dict[str, str] = {}
    for raw in fieldnames or []:
        fl = normalize_header(raw)
        for canonical, aliases in COLUMN_ALIASES.items():
            if fl in aliases:
                field_map[raw] = canonical
                break
    return field_map


def _parse_float(value: str, default: float = 0.0):
    if value is None or str(value).strip() == "":
        return default, None
    try:
        cleaned = str(value).replace(",", ".").replace(" ", "")
        return float(cleaned), None
    except (ValueError, TypeError):
        return default, f"Invalid number: {value}"


def _parse_date(value: str) -> Tuple[Optional[str], Optional[str]]:
    if not value:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d"), None
    text = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d"), None
        except ValueError:
            continue
    return None, f"Unrecognized date: {value}"


def map_row(row: dict, field_map: Dict[str, str]) -> dict:
    mapped = {}
    for csv_col, our_col in field_map.items():
        val = (row.get(csv_col) or "").strip()
        if val:
            mapped[our_col] = val
    return mapped


def validate_mapped_row(
    mapped: dict,
    row_num: int,
    existing_names: Optional[Set[str]] = None,
) -> dict:
    """Return a preview row with errors/warnings and normalized values."""
    errors: List[str] = []
    warnings: List[str] = []
    name = (mapped.get("name") or "").strip()
    if not name:
        errors.append("Missing name")

    loan_amount, amount_err = _parse_float(mapped.get("loan_amount", ""), 0.0)
    if amount_err:
        errors.append(amount_err)
    elif loan_amount < 0:
        errors.append("Loan amount cannot be negative")

    interest_rate, rate_err = _parse_float(mapped.get("interest_rate", ""), 0.0)
    if rate_err:
        errors.append(rate_err)
    elif interest_rate < 0 or interest_rate > 100:
        errors.append("Interest rate must be between 0 and 100")

    tenure = None
    if mapped.get("loan_duration_months"):
        tenure, tenure_err = _parse_float(mapped.get("loan_duration_months", ""), 0)
        if tenure_err:
            errors.append(tenure_err)
        elif tenure is not None and tenure < 1:
            errors.append("Loan duration must be at least 1 month")
        else:
            tenure = int(tenure) if tenure else None

    date_given, date_err = _parse_date(mapped.get("date_given", ""))
    if date_err:
        errors.append(date_err)

    email = (mapped.get("email") or "").strip()
    if email and "@" not in email:
        errors.append("Invalid email")

    is_duplicate = False
    if name and existing_names is not None:
        is_duplicate = name.strip().lower() in existing_names
        if is_duplicate:
            warnings.append("A client with this name already exists; import will add a loan to the existing record")

    if not mapped.get("phone"):
        warnings.append("Phone is missing — imported client will need review")
    if loan_amount == 0:
        warnings.append("Loan amount is 0 or missing")

    status = "error" if errors else ("duplicate" if is_duplicate else "ok")
    return {
        "row": row_num,
        "status": status,
        "errors": errors,
        "warnings": warnings,
        "is_duplicate": is_duplicate,
        "data": {
            "name": name,
            "phone": mapped.get("phone", ""),
            "email": email,
            "address": mapped.get("address", ""),
            "birth_number": mapped.get("birth_number", ""),
            "loan_amount": loan_amount,
            "interest_rate": interest_rate,
            "loan_duration_months": tenure,
            "date_given": date_given,
            "telegram_chat_id": mapped.get("telegram_chat_id", ""),
            "loan_plan": mapped.get("loan_plan", ""),
        },
    }


def preview_clients_csv(text: str, existing_names: Optional[Iterable[str]] = None) -> dict:
    if not text or not text.strip():
        return {"ok": False, "error": "Empty CSV", "rows": [], "summary": {}}
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {"ok": False, "error": "Empty CSV or no header row", "rows": [], "summary": {}}
    field_map = build_field_map(reader.fieldnames)
    if "name" not in field_map.values():
        return {
            "ok": False,
            "error": "CSV must include a name column (name, client_name, full_name, or nimi)",
            "rows": [],
            "summary": {},
            "columns": list(reader.fieldnames),
        }
    existing = {n.strip().lower() for n in (existing_names or []) if n}
    rows = []
    for row_num, row in enumerate(reader, start=2):
        mapped = map_row(row, field_map)
        rows.append(validate_mapped_row(mapped, row_num, existing))
    summary = {
        "total": len(rows),
        "ok": sum(1 for r in rows if r["status"] == "ok"),
        "duplicates": sum(1 for r in rows if r["status"] == "duplicate"),
        "errors": sum(1 for r in rows if r["status"] == "error"),
        "warnings": sum(1 for r in rows if r["warnings"] and r["status"] != "error"),
    }
    return {
        "ok": True,
        "columns": list(reader.fieldnames),
        "mapped_fields": sorted(set(field_map.values())),
        "rows": rows,
        "summary": summary,
    }
