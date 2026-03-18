"""Contract routes - PDF generation and email sending."""
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime
from io import BytesIO
import asyncio
import os
import logging
import resend

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from database import db
from utils.auth import get_admin_id_from_token, enforce_client_scope
from utils.exceptions import ValidationException

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Contracts"])

# Initialize Resend
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


def generate_loan_contract_pdf(lender: dict, client: dict, loan_amount: float, due_date: str, total_repayment: float = 0, interest_rate: float = 0, language: str = "et", currency: str = "EUR") -> bytes:
    """Generate a loan contract PDF. Supports all app languages (et, en, no, sv, da, fi, lv, lt, de, de_at, de_ch, cs, pl, es, fr, it)."""
    from routes.contract_translations import get_contract_translation
    tx = get_contract_translation(language)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )
    
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=16,
        alignment=1,
        spaceAfter=20,
        fontName='Helvetica-Bold'
    )
    
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading2'],
        fontSize=12,
        spaceBefore=15,
        spaceAfter=8,
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'Normal',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        fontName='Helvetica'
    )
    
    bold_style = ParagraphStyle(
        'Bold',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        fontName='Helvetica-Bold'
    )
    
    # Replace currency in translation strings
    currency_label = currency.upper()
    for key in tx:
        if isinstance(tx[key], str):
            tx[key] = tx[key].replace("eurot", currency_label).replace("euros", currency_label).replace("euro", currency_label)
    
    story = []
    
    # PayLock Pro header with logo
    LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "paylock-logo.png")
    header_data = []
    if os.path.exists(LOGO_PATH):
        logo = RLImage(LOGO_PATH, width=1.5*cm, height=1.5*cm)
        header_data = [[logo, Paragraph("<b>PayLock Pro</b><br/><font size='8' color='#666666'>Loan Management Platform</font>", 
                        ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, fontName='Helvetica-Bold'))]]
    else:
        header_data = [["", Paragraph("<b>PayLock Pro</b><br/><font size='8' color='#666666'>Loan Management Platform</font>", 
                        ParagraphStyle('Header', parent=styles['Normal'], fontSize=12, fontName='Helvetica-Bold'))]]
    
    header_table = Table(header_data, colWidths=[2*cm, 14*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8))
    
    # Divider line
    divider = Table([[""]], colWidths=[16*cm])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, -1), 1, colors.HexColor('#2563EB')),
    ]))
    story.append(divider)
    story.append(Spacer(1, 15))
    
    # Title
    story.append(Paragraph(tx["title"], title_style))
    story.append(Spacer(1, 10))
    
    # Agreement date and location
    loan_start = client.get("loan_start_date")
    if loan_start:
        if isinstance(loan_start, datetime):
            contract_date = loan_start.strftime("%d.%m.%Y")
        else:
            try:
                from dateutil.parser import parse as parse_date
                contract_date = parse_date(str(loan_start)).strftime("%d.%m.%Y")
            except Exception:
                contract_date = str(loan_start)[:10]
    else:
        contract_date = datetime.now().strftime("%d.%m.%Y")
    story.append(Paragraph(f"{tx['intro']} {contract_date}", normal_style))
    story.append(Paragraph(tx["location"], normal_style))
    story.append(Spacer(1, 15))
    
    # Lender (Admin) info
    lender_name = f"{lender.get('first_name', '')} {lender.get('last_name', '')}".strip() or lender.get('username', 'N/A')
    lender_address = lender.get('address', 'N/A')
    
    story.append(Paragraph(f"<b>{lender_name}</b>", bold_style))
    story.append(Paragraph(f"{tx['residence']}: {lender_address}", normal_style))
    story.append(Paragraph(tx["lender_label"], normal_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph(tx["and"], normal_style))
    story.append(Spacer(1, 10))
    
    # Borrower (Client) info
    client_name = client.get('name', 'N/A')
    client_address = client.get('address', 'N/A')
    client_birth_number = client.get('birth_number', 'N/A')
    
    story.append(Paragraph(f"<b>{client_name}</b>", bold_style))
    story.append(Paragraph(f"{tx['residence']}: {client_address}", normal_style))
    story.append(Paragraph(f"{tx['id_code']}: {client_birth_number}", normal_style))
    story.append(Paragraph(tx["borrower_label"], normal_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph(tx["parties"], normal_style))
    story.append(Spacer(1, 20))
    
    # Section 1: Loan and its transfer
    story.append(Paragraph(tx["s1_title"], heading_style))
    story.append(Paragraph(tx["s1_1"].format(amount=f"{loan_amount:.2f}"), normal_style))
    story.append(Paragraph(tx["s1_2"], normal_style))
    story.append(Paragraph(tx["s1_3"], normal_style))
    
    # Section 2: Interest and loan repayment
    story.append(Paragraph(tx["s2_title"], heading_style))
    story.append(Paragraph(tx["s2_1"], normal_style))
    
    repay_amount = total_repayment if total_repayment > 0 else loan_amount
    interest_amount = max(repay_amount - loan_amount, 0)
    story.append(Paragraph(tx["s2_2"].format(repay=f"{repay_amount:.2f}", due=due_date), normal_style))
    if interest_amount > 0:
        story.append(Paragraph(tx["s2_2_detail"].format(amount=f"{loan_amount:.2f}", interest=f"{interest_amount:.2f}", repay=f"{repay_amount:.2f}"), normal_style))
    story.append(Paragraph(tx["s2_3"], normal_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph(tx["s2_4"], normal_style))
    story.append(Paragraph(tx["s2_4_a"], normal_style))
    story.append(Paragraph(tx["s2_4_b"], normal_style))
    story.append(Paragraph(tx["s2_4_c"], normal_style))
    story.append(Paragraph(tx["s2_4_d"], normal_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph(tx["s2_5"], normal_style))
    
    # Section 3: Late payment penalty
    story.append(Paragraph(tx["s3_title"], heading_style))
    story.append(Paragraph(tx["s3_1"], normal_style))
    story.append(Paragraph(tx["s3_2"], normal_style))
    
    # Section 4: Termination
    story.append(Paragraph(tx["s4_title"], heading_style))
    story.append(Paragraph(tx["s4_1"], normal_style))
    story.append(Paragraph(tx["s4_1_a"], normal_style))
    story.append(Paragraph(tx["s4_1_b"], normal_style))
    
    # Section 5: Collateral
    story.append(Paragraph(tx["s5_title"], heading_style))
    story.append(Paragraph(tx["s5_1"], normal_style))
    
    # Section 6: Application installation and device security measures (NEW)
    story.append(Paragraph(tx["s6_title"], heading_style))
    story.append(Paragraph(tx["s6_1"], normal_style))
    story.append(Paragraph(tx["s6_2"], normal_style))
    story.append(Paragraph(tx["s6_3"], normal_style))
    story.append(Paragraph(tx["s6_4"], normal_style))
    story.append(Paragraph(tx["s6_5"], normal_style))
    story.append(Paragraph(tx["s6_6"], normal_style))
    story.append(Paragraph(tx["s6_7"], normal_style))
    
    # Section 7: Dispute resolution (was 6)
    story.append(Paragraph(tx["s7_title"], heading_style))
    story.append(Paragraph(tx["s7_1"], normal_style))
    story.append(Paragraph(tx["s7_2"], normal_style))
    
    # Section 8: Entry into force (was 7)
    story.append(Paragraph(tx["s8_title"], heading_style))
    story.append(Paragraph(tx["s8_1"], normal_style))
    
    # Section 9: Final provisions (was 8)
    story.append(Paragraph(tx["s9_title"], heading_style))
    story.append(Paragraph(tx["s9_1"].format(lang_name=tx["lang_name"]), normal_style))
    
    # Signatures section
    story.append(Spacer(1, 40))
    
    sig_data = [
        [tx["sig_lender"], tx["sig_borrower"]],
        ["", ""],
        [lender_name, client_name],
        ["_" * 30, "_" * 30],
    ]
    
    sig_table = Table(sig_data, colWidths=[8*cm, 8*cm])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    
    story.append(sig_table)
    
    # PayLock Pro footer
    story.append(Spacer(1, 30))
    footer_divider = Table([[""]], colWidths=[16*cm])
    footer_divider.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, -1), 0.5, colors.HexColor('#B0C4DE')),
    ]))
    story.append(footer_divider)
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#7A9CC6'), alignment=1)
    story.append(Paragraph("Generated by PayLock Pro | Loan Management Platform", footer_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/contracts/{client_id}/preview")
async def preview_contract(client_id: str, admin_token: str = Query(...), language: str = Query(default="et"), currency: str = Query(default="EUR")):
    """Generate and return a loan contract PDF for preview. Language: 'et' (Estonian) or 'en' (English)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get client
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Check if client has a loan set up
    if not client.get("loan_amount") or client.get("loan_amount", 0) <= 0:
        raise ValidationException("Client has no loan set up. Please set up a loan first.")
    
    # Get admin (lender) info
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Get due date
    due_date = "N/A"
    if client.get("next_payment_due"):
        due_date = client["next_payment_due"].strftime("%d.%m.%Y") if isinstance(client["next_payment_due"], datetime) else str(client["next_payment_due"])[:10]
    elif client.get("loan_start_date") and client.get("loan_tenure_months"):
        from dateutil.relativedelta import relativedelta
        start = client["loan_start_date"]
        if isinstance(start, datetime):
            end = start + relativedelta(months=client["loan_tenure_months"])
            due_date = end.strftime("%d.%m.%Y")
    
    # Calculate total repayment amount (loan + interest)
    loan_amt = client.get("loan_amount", 0)
    interest_rate_val = client.get("interest_rate", 0)  # monthly rate
    total_amount_due_val = client.get("total_amount_due", 0)
    
    if total_amount_due_val and total_amount_due_val > loan_amt:
        total_repayment = total_amount_due_val
    elif loan_amt > 0 and interest_rate_val > 0:
        total_repayment = loan_amt + (loan_amt * interest_rate_val / 100)
    else:
        total_repayment = loan_amt
    
    # Generate PDF for preview
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=loan_amt,
        due_date=due_date,
        total_repayment=round(total_repayment, 2),
        interest_rate=interest_rate_val,
        language=language,
        currency=currency
    )
    
    prefix = "loan_agreement" if language.lower()[:2] == "en" else "laenuleping"
    filename = f"{prefix}_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.post("/contracts/{client_id}/send-email")
async def send_contract_email(client_id: str, admin_token: str = Query(...), test_mode: bool = Query(default=False), language: str = Query(default="et"), currency: str = Query(default="EUR")):
    """Generate a loan contract PDF and send it to the client's email.
    
    Args:
        test_mode: If True, sends to the Resend verified email (sandbox workaround) instead of client email.
    """
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get client
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Check if client has an email (only required if not test_mode)
    if not test_mode and not client.get("email"):
        raise ValidationException("Client has no email address. Please add an email first.")
    
    # Check if client has a loan set up
    if not client.get("loan_amount") or client.get("loan_amount", 0) <= 0:
        raise ValidationException("Client has no loan set up. Please set up a loan first.")
    
    # Get admin (lender) info
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Get due date
    due_date = "N/A"
    if client.get("next_payment_due"):
        due_date = client["next_payment_due"].strftime("%d.%m.%Y") if isinstance(client["next_payment_due"], datetime) else str(client["next_payment_due"])[:10]
    elif client.get("loan_start_date") and client.get("loan_tenure_months"):
        from dateutil.relativedelta import relativedelta
        start = client["loan_start_date"]
        if isinstance(start, datetime):
            end = start + relativedelta(months=client["loan_tenure_months"])
            due_date = end.strftime("%d.%m.%Y")
    
    # Calculate total repayment amount (loan + interest)
    loan_amt = client.get("loan_amount", 0)
    interest_rate_val = client.get("interest_rate", 0)
    total_amount_due_val = client.get("total_amount_due", 0)

    if total_amount_due_val and total_amount_due_val > loan_amt:
        total_repayment = total_amount_due_val
    elif loan_amt > 0 and interest_rate_val > 0:
        total_repayment = loan_amt + (loan_amt * interest_rate_val / 100)
    else:
        total_repayment = loan_amt

    # Generate PDF
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=loan_amt,
        due_date=due_date,
        total_repayment=round(total_repayment, 2),
        interest_rate=interest_rate_val,
        language=language,
        currency=currency
    )
    
    prefix = "loan_agreement" if language.lower()[:2] == "en" else "laenuleping"
    filename = f"{prefix}_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    # Check if Resend is configured
    if not resend.api_key:
        raise ValidationException("Email service not configured. Please set RESEND_API_KEY in environment variables.")
    
    # Prepare email - admin's email as reply-to (only if valid)
    admin_email = admin.get("email", "")
    
    # Determine recipient - test_mode sends to Resend verified email
    TEST_EMAIL = os.environ.get("RESEND_TEST_EMAIL", "karlivilbas87@gmail.com")
    recipient_email = TEST_EMAIL if test_mode else client["email"]
    
    # Build email params
    params = {
        "from": SENDER_EMAIL,
        "to": [recipient_email],
        "subject": f"Laen - {client.get('name', 'Client')}" if test_mode else "Laen",
        "html": f"<p><strong>TEST MODE - Contract for: {client.get('name')}</strong></p><p>Palun alkirjastage Leping ja saadke tagasi.</p>" if test_mode else "<p>Palun alkirjastage Leping ja saadke tagasi.</p>",
        "attachments": [
            {
                "filename": filename,
                "content": list(pdf_bytes)  # Convert bytes to list of ints for JSON
            }
        ]
    }
    
    # Add reply-to only if admin has a valid email (must contain @)
    if admin_email and "@" in admin_email:
        params["reply_to"] = admin_email
    
    try:
        # Send email using async thread to avoid blocking
        email_result = await asyncio.to_thread(resend.Emails.send, params)
        
        logger.info(f"Contract email sent to {recipient_email} for client {client_id}" + (" (TEST MODE)" if test_mode else ""))
        
        return {
            "status": "success",
            "message": f"Test email sent to {recipient_email}. Forward it to {client.get('name')} ({client.get('email', 'no email')})." if test_mode else f"Contract sent to {client['email']}",
            "email_id": email_result.get("id") if isinstance(email_result, dict) else str(email_result),
            "test_mode": test_mode
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Failed to send contract email: {error_msg}")
        
        # Provide user-friendly error messages
        if "only send testing emails" in error_msg.lower() or "verify a domain" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="Email service is in sandbox mode. To send emails to clients, please verify your domain at resend.com/domains."
            )
        elif "invalid" in error_msg.lower() and "email" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"Invalid email address format for client: {client['email']}"
            )
        else:
            raise HTTPException(status_code=500, detail=f"Failed to send email: {error_msg}")


@router.get("/contracts/{client_id}/download")
async def download_contract(client_id: str, admin_token: str = Query(...), language: str = Query(default="et"), currency: str = Query(default="EUR")):
    """Generate and download a loan contract PDF. Language: 'et' (Estonian) or 'en' (English)."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get client
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Check if client has a loan set up
    if not client.get("loan_amount") or client.get("loan_amount", 0) <= 0:
        raise ValidationException("Client has no loan set up. Please set up a loan first.")
    
    # Get admin (lender) info
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Get due date
    due_date = "N/A"
    if client.get("next_payment_due"):
        due_date = client["next_payment_due"].strftime("%d.%m.%Y") if isinstance(client["next_payment_due"], datetime) else str(client["next_payment_due"])[:10]
    elif client.get("loan_start_date") and client.get("loan_tenure_months"):
        from dateutil.relativedelta import relativedelta
        start = client["loan_start_date"]
        if isinstance(start, datetime):
            end = start + relativedelta(months=client["loan_tenure_months"])
            due_date = end.strftime("%d.%m.%Y")
    
    # Calculate total repayment amount (loan + interest)
    loan_amt = client.get("loan_amount", 0)
    interest_rate_val = client.get("interest_rate", 0)
    total_amount_due_val = client.get("total_amount_due", 0)

    if total_amount_due_val and total_amount_due_val > loan_amt:
        total_repayment = total_amount_due_val
    elif loan_amt > 0 and interest_rate_val > 0:
        total_repayment = loan_amt + (loan_amt * interest_rate_val / 100)
    else:
        total_repayment = loan_amt

    # Generate PDF
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=loan_amt,
        due_date=due_date,
        total_repayment=round(total_repayment, 2),
        interest_rate=interest_rate_val,
        language=language,
        currency=currency
    )
    
    prefix = "loan_agreement" if language.lower()[:2] == "en" else "laenuleping"
    filename = f"{prefix}_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



@router.get("/contracts/loan/{loan_id}/download")
async def download_loan_contract(loan_id: str, admin_token: str = Query(...), language: str = Query(default="et"), currency: str = Query(default="EUR")):
    """Generate and download a loan contract PDF for a specific loan."""
    admin_id = await get_admin_id_from_token(admin_token)
    
    # Get the loan
    loan = await db.loans.find_one({"id": loan_id}, {"_id": 0})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    
    # Get the client
    client_id = loan.get("client_id")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await enforce_client_scope(client, admin_id)
    
    # Get admin (lender) info
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    # Get loan data
    loan_amt = loan.get("loan_amount", 0)
    interest_rate_val = loan.get("interest_rate", 0)
    total_amount = loan.get("total_amount", 0) or loan.get("total_amount_due", 0)
    if total_amount and total_amount > loan_amt:
        total_repayment = total_amount
    elif loan_amt > 0 and interest_rate_val > 0:
        tenure = loan.get("tenure_months", 1) or 1
        total_repayment = loan_amt + (loan_amt * interest_rate_val / 100 * tenure)
    else:
        total_repayment = loan_amt
    
    # Get due date
    due_date = "N/A"
    if loan.get("due_date"):
        dd = loan["due_date"]
        if isinstance(dd, datetime):
            due_date = dd.strftime("%d.%m.%Y")
        else:
            due_date = str(dd)[:10]
    
    # Generate PDF using the same generator
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=loan_amt,
        due_date=due_date,
        total_repayment=round(total_repayment, 2),
        interest_rate=interest_rate_val,
        language=language,
        currency=currency
    )
    
    prefix = "loan_agreement" if language.lower()[:2] == "en" else "laenuleping"
    filename = f"{prefix}_{client.get('name', 'client').replace(' ', '_')}_{loan_id[:8]}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
