"""Bank Statement Analyzer - Upload and analyze bank statements with AI."""
import os
import zipfile
import tempfile
import json
import uuid
import logging
import re
from datetime import datetime, timezone
from io import BytesIO
from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from dotenv import load_dotenv

from database import db
from utils.auth import get_admin_id_from_token

load_dotenv()

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Bank Statements"])

SUPPORTED_BANKS = [
    "Swedbank", "SEB", "LHV", "Coop Pank",
    "Revolut", "Paysera", "Mytu", "Bunq", "N26", "Wise"
]

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB


def extract_pdf_from_asice(file_bytes: bytes) -> tuple:
    """Extract document content from an ASiC-E (.asice) container (ZIP-based).
    Returns (content_bytes, content_type) where content_type is 'pdf' or 'xml' or 'csv'."""
    try:
        with zipfile.ZipFile(BytesIO(file_bytes), 'r') as zf:
            # Priority: PDF > XML > CSV > any non-signature file
            pdf_files = [n for n in zf.namelist() if n.lower().endswith('.pdf')]
            if pdf_files:
                return zf.read(pdf_files[0]), 'pdf'
            
            xml_files = [n for n in zf.namelist() if n.lower().endswith('.xml') and 'signatures' not in n.lower() and 'manifest' not in n.lower() and 'META-INF' not in n]
            if xml_files:
                return zf.read(xml_files[0]), 'xml'
            
            csv_files = [n for n in zf.namelist() if n.lower().endswith('.csv')]
            if csv_files:
                return zf.read(csv_files[0]), 'csv'
            
            # Fallback: return first non-META-INF file
            for name in zf.namelist():
                if 'META-INF' not in name and not name.endswith('/'):
                    return zf.read(name), 'unknown'
            
            raise ValueError("No document found inside .asice container")
    except zipfile.BadZipFile:
        raise ValueError("Invalid .asice file - not a valid container")


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    import fitz
    text_parts = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page in doc:
            text_parts.append(page.get_text())
    return "\n".join(text_parts)


def _parse_seb_money(value: str):
    if value is None:
        return None
    cleaned = value.replace("\u00a0", " ").replace(" ", "")
    cleaned = cleaned.replace("EUR", "").replace("€", "")
    cleaned = cleaned.replace(",", ".")
    if cleaned in ("", "-", "+"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_seb_summary(statement_text: str):
    if "SEB" not in statement_text and "SEB Pank" not in statement_text:
        return None

    period_match = re.search(r"\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}\.\d{2}\.\d{4}", statement_text)
    period = period_match.group(0) if period_match else None

    lines = [line.strip() for line in statement_text.splitlines() if line.strip()]
    account_holder = None
    for line in lines[:6]:
        if "KONTO" in line or "VÄLJAVÕTE" in line or "SEB" in line:
            continue
        if any(ch.isalpha() for ch in line):
            account_holder = line.title()
            break

    opening_match = re.search(r"Algsaldo\s*([\d.,-]+)", statement_text, re.IGNORECASE)
    closing_match = re.search(r"Lõppsaldo\s*([\d.,-]+)", statement_text, re.IGNORECASE)
    income_match = re.search(r"Perioodi\s+sissetulekud\s*([\d.,-]+)", statement_text, re.IGNORECASE)
    expense_match = re.search(r"Perioodi\s+väljaminekud\s*([\d.,-]+)", statement_text, re.IGNORECASE)

    opening_balance = _parse_seb_money(opening_match.group(1)) if opening_match else None
    closing_balance = _parse_seb_money(closing_match.group(1)) if closing_match else None
    total_income = _parse_seb_money(income_match.group(1)) if income_match else None
    total_expenses = _parse_seb_money(expense_match.group(1)) if expense_match else None

    if total_expenses is not None:
        total_expenses = abs(total_expenses)

    if total_income is None and total_expenses is None and opening_balance is None and closing_balance is None:
        return None

    net_balance = None
    if total_income is not None and total_expenses is not None:
        net_balance = total_income - total_expenses
    elif opening_balance is not None and closing_balance is not None:
        net_balance = closing_balance - opening_balance

    return {
        "bank_name": "SEB",
        "period": period,
        "currency": "EUR" if "EUR" in statement_text else None,
        "account_holder": account_holder,
        "summary": {
            "total_income": round(total_income, 2) if total_income is not None else None,
            "total_expenses": round(total_expenses, 2) if total_expenses is not None else None,
            "net_balance": round(net_balance, 2) if net_balance is not None else None,
            "opening_balance": round(opening_balance, 2) if opening_balance is not None else None,
            "closing_balance": round(closing_balance, 2) if closing_balance is not None else None,
        },
    }


def apply_fallback_analysis(analysis: dict, fallback: dict):
    if not fallback:
        return analysis
    if analysis is None:
        analysis = {}

    summary = analysis.get("summary") or {}
    fallback_summary = fallback.get("summary") or {}

    has_summary_data = any(
        summary.get(key) not in (None, 0) for key in ("total_income", "total_expenses", "net_balance")
    )

    if not has_summary_data:
        summary = fallback_summary
    else:
        for key, value in fallback_summary.items():
            if summary.get(key) in (None, 0) and value not in (None, 0):
                summary[key] = value

    if summary:
        analysis["summary"] = summary

    for key in ("bank_name", "period", "currency", "account_holder"):
        if not analysis.get(key) and fallback.get(key):
            analysis[key] = fallback.get(key)

    if analysis.get("error") and summary:
        analysis.pop("error", None)
        analysis.pop("raw_response", None)

    return analysis


async def analyze_with_ai(statement_text: str) -> dict:
    """Send bank statement text to GPT for income/expense analysis."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI analysis key not configured")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"bank-analysis-{uuid.uuid4().hex[:8]}",
        system_message="""You are a financial analyst specializing in Estonian and European bank statements. 
Analyze the provided bank statement text and return a JSON response with the following structure:
{
  "bank_name": "detected bank name",
  "period": "statement period (e.g. '01.01.2025 - 31.01.2025')",
  "currency": "EUR or detected currency",
  "account_holder": "name if visible",
  "summary": {
    "total_income": 0.00,
    "total_expenses": 0.00,
    "net_balance": 0.00,
    "opening_balance": 0.00,
    "closing_balance": 0.00
  },
  "income_categories": [
    {"category": "Salary", "total": 0.00, "count": 0},
    {"category": "Transfers In", "total": 0.00, "count": 0}
  ],
  "expense_categories": [
    {"category": "Rent/Housing", "total": 0.00, "count": 0},
    {"category": "Groceries", "total": 0.00, "count": 0},
    {"category": "Transport", "total": 0.00, "count": 0},
    {"category": "Utilities", "total": 0.00, "count": 0},
    {"category": "Entertainment", "total": 0.00, "count": 0},
    {"category": "Subscriptions", "total": 0.00, "count": 0},
    {"category": "Other", "total": 0.00, "count": 0}
  ],
  "monthly_breakdown": [
    {"month": "2025-01", "income": 0.00, "expenses": 0.00}
  ],
  "risk_indicators": {
    "has_regular_income": true,
    "income_stability": "stable/unstable/unknown",
    "high_expense_ratio": false,
    "gambling_detected": false,
    "loan_payments_detected": false,
    "notes": "brief risk assessment"
  },
  "credit_recommendation": {
    "monthly_credit_amount": 0.00,
    "yearly_credit_amount": 0.00,
    "debt_to_income_ratio": 0.00,
    "disposable_income": 0.00,
    "risk_level": "low/medium/high",
    "reasoning": "Brief explanation of how the credit amount was calculated based on income, expenses, existing obligations, and risk factors. Consider that a safe monthly repayment should not exceed 30-40% of disposable income (income minus essential expenses)."
  }
}
Return ONLY valid JSON, no markdown or explanation. If a field cannot be determined, use null.
For the credit_recommendation: Calculate the maximum safe monthly loan repayment amount as 30-40% of the client's monthly disposable income (total_income minus essential recurring expenses like rent, utilities, existing loan payments). The yearly amount is monthly * 12. Consider existing debt obligations and risk factors. If income is irregular or unstable, recommend a lower amount.
Categorize ALL transactions. Supported banks: Swedbank, SEB, LHV, Coop Pank, Revolut, Paysera, Mytu, Bunq, N26, Wise."""
    ).with_model("openai", "gpt-4.1")

    # Truncate text if too long (GPT context limit)
    max_chars = 80000
    if len(statement_text) > max_chars:
        statement_text = statement_text[:max_chars] + "\n\n[Statement truncated due to length]"

    user_message = UserMessage(
        text=f"Analyze this bank statement:\n\n{statement_text}"
    )

    response = await chat.send_message(user_message)

    # Parse the JSON response
    try:
        # Clean response - remove markdown code blocks if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        logger.error(f"Failed to parse AI response as JSON: {response[:200]}")
        return {
            "error": "AI analysis returned non-structured response",
            "raw_response": response[:2000]
        }


@router.post("/bank-statements/analyze")
async def analyze_bank_statement(
    file: UploadFile = File(...),
    admin_token: str = Query(...),
    client_id: str = Query(None),
):
    """Upload and analyze a bank statement (.pdf or .asice)."""
    admin_id = await get_admin_id_from_token(admin_token)

    # Validate file type
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ("pdf", "asice"):
        raise HTTPException(status_code=400, detail="Only .pdf and .asice files are supported")

    # Read file
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 20MB)")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Extract PDF/document if .asice
    try:
        if ext == "asice":
            content, content_type = extract_pdf_from_asice(file_bytes)
            if content_type == 'pdf':
                pdf_bytes = content
            elif content_type in ('xml', 'csv', 'unknown'):
                # For non-PDF files, use the raw text directly
                try:
                    statement_text = content.decode('utf-8')
                except UnicodeDecodeError:
                    statement_text = content.decode('latin-1')
                pdf_bytes = None
            else:
                pdf_bytes = content
        else:
            pdf_bytes = file_bytes
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Extract text from PDF (if we have PDF bytes)
    if pdf_bytes is not None:
        try:
            statement_text = extract_text_from_pdf(pdf_bytes)
        except Exception as e:
            logger.error(f"PDF text extraction failed: {e}")
            raise HTTPException(status_code=400, detail="Could not extract text from PDF. The file may be image-based or corrupted.")

    if not statement_text.strip():
        raise HTTPException(status_code=400, detail="No text could be extracted from the PDF. It may be a scanned/image-based document.")

    # Extract SEB fallback summary (if applicable)
    seb_fallback = extract_seb_summary(statement_text)

    # Analyze with AI
    try:
        analysis = await analyze_with_ai(statement_text)
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")
        if seb_fallback:
            analysis = seb_fallback
        else:
            raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    analysis = apply_fallback_analysis(analysis, seb_fallback)

    # Store the analysis result
    record = {
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "client_id": client_id,
        "filename": filename,
        "file_type": ext,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "analysis": analysis,
        "text_length": len(statement_text),
    }
    await db.bank_statement_analyses.insert_one(record)
    record.pop("_id", None)

    return record


@router.get("/bank-statements/history")
async def get_analysis_history(
    admin_token: str = Query(...),
    client_id: str = Query(None),
):
    """Get past bank statement analyses."""
    admin_id = await get_admin_id_from_token(admin_token)

    query = {"admin_id": admin_id}
    if client_id:
        query["client_id"] = client_id

    records = await db.bank_statement_analyses.find(
        query, {"_id": 0}
    ).sort("analyzed_at", -1).to_list(50)

    return records
