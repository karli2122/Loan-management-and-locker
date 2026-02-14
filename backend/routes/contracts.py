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
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
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


def generate_loan_contract_pdf(lender: dict, client: dict, loan_amount: float, due_date: str) -> bytes:
    """Generate a loan contract PDF based on the Estonian template."""
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
    
    story = []
    
    # Title
    story.append(Paragraph("LAENULEPING", title_style))
    story.append(Spacer(1, 10))
    
    # Agreement date and location
    today = datetime.now().strftime("%d.%m.%Y")
    story.append(Paragraph(f"Käesoleva laenulepingu (edaspidi: Leping) on sõlminud {today}", normal_style))
    story.append(Paragraph("Tallinn, Eesti", normal_style))
    story.append(Spacer(1, 15))
    
    # Lender (Admin) info
    lender_name = f"{lender.get('first_name', '')} {lender.get('last_name', '')}".strip() or lender.get('username', 'N/A')
    lender_address = lender.get('address', 'N/A')
    
    story.append(Paragraph(f"<b>{lender_name}</b>", bold_style))
    story.append(Paragraph(f"elukoht: {lender_address}", normal_style))
    story.append(Paragraph("(edaspidi: Laenuandja)", normal_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("ja", normal_style))
    story.append(Spacer(1, 10))
    
    # Borrower (Client) info
    client_name = client.get('name', 'N/A')
    client_address = client.get('address', 'N/A')
    client_birth_number = client.get('birth_number', 'N/A')
    
    story.append(Paragraph(f"<b>{client_name}</b>", bold_style))
    story.append(Paragraph(f"elukoht: {client_address}", normal_style))
    story.append(Paragraph(f"isikukoodiga: {client_birth_number}", normal_style))
    story.append(Paragraph("(edaspidi: Laenusaaja)", normal_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph(", edaspidi viidatud ka kui Pool või ühiselt kui Pooled, alljärgnevas:", normal_style))
    story.append(Spacer(1, 20))
    
    # Section 1: Loan and its transfer
    story.append(Paragraph("1. Laen ja selle üleandmine", heading_style))
    story.append(Paragraph(
        f"1.1. Laenuandja annab Laenusaajale laenu <b>{loan_amount:.2f} eurot</b> (edaspidi Laen).",
        normal_style
    ))
    story.append(Paragraph(
        "1.2. Laenuandja kohustub Laenusaajale Laenu üle andma hiljemalt 1 tööpäeva jooksul.",
        normal_style
    ))
    story.append(Paragraph(
        "1.3. Laenu üleandmine toimub Laenu kandmisega Laenusaaja poolt antud arvelduskontole.",
        normal_style
    ))
    
    # Section 2: Interest and loan repayment
    story.append(Paragraph("2. Intress ja laenu tagastamine", heading_style))
    story.append(Paragraph("2.1. Laen on antud tähtajaliselt.", normal_style))
    story.append(Paragraph(
        f"2.2. Laenusaaja kohustub Laenu tagasi maksma alljärgnevalt: <b>{loan_amount:.2f} eurot</b> maksetähtpäevaks <b>{due_date}</b>.",
        normal_style
    ))
    story.append(Paragraph(
        "2.3. Laenusaaja tagastab Laenuandjale Laenu Laenuandja arvelduskontole.",
        normal_style
    ))
    story.append(Spacer(1, 5))
    story.append(Paragraph(
        "2.4. Kui Laenusaaja teeb Laenuandjale makse, millest ei piisa kõigi Lepingu alusel võlgnetavate summade tasumiseks, arvestatakse makse:",
        normal_style
    ))
    story.append(Paragraph("    • esimeses järjekorras võlgnetava intressi katteks;", normal_style))
    story.append(Paragraph("    • teises järjekorras võlgnetava viivise katteks;", normal_style))
    story.append(Paragraph("    • kolmandas järjekorras võlgnetava põhisumma katteks;", normal_style))
    story.append(Paragraph("    • neljandas järjekorras muude Lepingust tulenevate kohustuste katteks.", normal_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph(
        "2.5. Laenusaajal on õigus tagastada kogu Laen enne Lepingu punktis 2.2 nimetatud maksetähtpäeva, teavitades sellest Laenuandjat kirjalikult.",
        normal_style
    ))
    
    # Section 3: Late payment penalty
    story.append(Paragraph("3. Viivis", heading_style))
    story.append(Paragraph(
        "3.1. Laenu tagastamisega viivitamisel on Laenuandjal õigus nõuda Laenusaajalt viivise tasumist 2% päevas sissenõutavaks muutunud summalt iga tasumisega viivitatud päeva eest.",
        normal_style
    ))
    story.append(Paragraph(
        "3.2. Tasumata intressilt või viiviselt viivist ei arvestata.",
        normal_style
    ))
    
    # Section 4: Termination
    story.append(Paragraph("4. Laenuandja õigus leping üles öelda", heading_style))
    story.append(Paragraph(
        "4.1. Laenuandjal on õigus Leping üles öelda ja nõuda Laenu kohest tagastamist, kui:",
        normal_style
    ))
    story.append(Paragraph(
        "    • Lepingust tulenevaid Laenusaaja kohustusi tagava vara väärtus väheneb oluliselt ning Laenusaaja ja Laenuandja ei jõua kokkuleppele Laenu täiendava tagamise osas;",
        normal_style
    ))
    story.append(Paragraph(
        "    • Laenusaaja ei täida kohaselt Lepingust tulenevaid kohustusi või mõnda neist ning jätkab kohustuse mittetäitmist ka pärast 14 päeva möödumist Laenuandjalt vastavasisulise kirjaliku teatise saamisest.",
        normal_style
    ))
    
    # Section 5: Collateral
    story.append(Paragraph("5. Tagatised", heading_style))
    story.append(Paragraph(
        "5.1. Laenusaaja vastutab Lepingust tulenevate kohustuste täitmise eest kogu oma varaga.",
        normal_style
    ))
    
    # Section 6: Dispute resolution
    story.append(Paragraph("6. Vaidluste lahendamise kord", heading_style))
    story.append(Paragraph(
        "6.1. Lepingust tulenevad ja sellega seotud vaidlused püüavad Pooled lahendada läbirääkimiste teel.",
        normal_style
    ))
    story.append(Paragraph(
        "6.2. Kui vaidlust ei õnnestu lahendada Poolte läbirääkimiste teel, on Pooltel õigus pöörduda vaidluse lahendamiseks maakohtusse vastavalt Eesti Vabariigis kehtivatele õigusaktidele.",
        normal_style
    ))
    
    # Section 7: Entry into force
    story.append(Paragraph("7. Lepingu jõustumine", heading_style))
    story.append(Paragraph(
        "7.1. Leping jõustub alates Lepingu allkirjastamise hetkest.",
        normal_style
    ))
    
    # Section 8: Final provisions
    story.append(Paragraph("8. Lõppsätted", heading_style))
    story.append(Paragraph(
        "8.1. Leping on koostatud ja alla kirjutatud eesti keeles kahes (2) võrdset juriidilist jõudu omavas identses eksemplaris, millest üks jääb Laenuandjale ja teine Laenusaajale.",
        normal_style
    ))
    
    # Signatures section
    story.append(Spacer(1, 40))
    
    # Create signature table
    sig_data = [
        ["Laenuandja:", "Laenusaaja:"],
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
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/contracts/{client_id}/preview")
async def preview_contract(client_id: str, admin_token: str = Query(...)):
    """Generate and return a loan contract PDF for preview."""
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
    
    # Generate PDF
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=client.get("total_amount_due", client.get("loan_amount", 0)),
        due_date=due_date
    )
    
    filename = f"laenuleping_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.post("/contracts/{client_id}/send-email")
async def send_contract_email(client_id: str, admin_token: str = Query(...), test_mode: bool = Query(default=False)):
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
    
    # Check if client has an email
    if not client.get("email"):
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
    
    # Generate PDF
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=client.get("total_amount_due", client.get("loan_amount", 0)),
        due_date=due_date
    )
    
    filename = f"laenuleping_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    # Check if Resend is configured
    if not resend.api_key:
        raise ValidationException("Email service not configured. Please set RESEND_API_KEY in environment variables.")
    
    # Prepare email - admin's email as reply-to (only if valid)
    admin_email = admin.get("email", "")
    
    # Build email params
    params = {
        "from": SENDER_EMAIL,
        "to": [client["email"]],
        "subject": "Laen",
        "html": "<p>Palun alkirjastage Leping ja saadke tagasi.</p>",
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
        
        logger.info(f"Contract email sent to {client['email']} for client {client_id}")
        
        return {
            "status": "success",
            "message": f"Contract sent to {client['email']}",
            "email_id": email_result.get("id") if isinstance(email_result, dict) else str(email_result)
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
async def download_contract(client_id: str, admin_token: str = Query(...)):
    """Generate and download a loan contract PDF."""
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
    
    # Generate PDF
    pdf_bytes = generate_loan_contract_pdf(
        lender=admin,
        client=client,
        loan_amount=client.get("total_amount_due", client.get("loan_amount", 0)),
        due_date=due_date
    )
    
    filename = f"laenuleping_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
