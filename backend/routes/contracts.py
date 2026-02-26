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


def generate_loan_contract_pdf(lender: dict, client: dict, loan_amount: float, due_date: str, total_repayment: float = 0, interest_rate: float = 0, language: str = "et") -> bytes:
    """Generate a loan contract PDF. Supports 'et' (Estonian) and 'en' (English)."""
    lang = language.lower()[:2] if language else "et"
    if lang not in ("et", "en"):
        lang = "et"

    # --- Translation dictionary ---
    t = {
        "et": {
            "title": "LAENULEPING",
            "header_sub": "Loan Management Platform",
            "intro": "Käesoleva laenulepingu (edaspidi: Leping) on sõlminud",
            "location": "Tallinn, Eesti",
            "residence": "elukoht",
            "id_code": "isikukoodiga",
            "lender_label": "(edaspidi: Laenuandja)",
            "and": "ja",
            "borrower_label": "(edaspidi: Laenusaaja)",
            "parties": ", edaspidi viidatud ka kui Pool või ühiselt kui Pooled, alljärgnevas:",
            "s1_title": "1. Laen ja selle üleandmine",
            "s1_1": "1.1. Laenuandja annab Laenusaajale laenu <b>{amount} eurot</b> (edaspidi Antud summa).",
            "s1_2": "1.2. Laenuandja kohustub Laenusaajale Laenu üle andma hiljemalt 1 tööpäeva jooksul.",
            "s1_3": "1.3. Laenu üleandmine toimub Laenu kandmisega Laenusaaja poolt antud arvelduskontole.",
            "s2_title": "2. Intress ja laenu tagastamine",
            "s2_1": "2.1. Laen on antud tähtajaliselt.",
            "s2_2": "2.2. Laenusaaja kohustub Laenu tagasi maksma alljärgnevalt: <b>{repay} eurot</b> maksetähtpäevaks <b>{due}</b>.",
            "s2_2_detail": "(antud summa {amount} eurot + intress {interest} eurot = {repay} eurot)",
            "s2_3": "2.3. Laenusaaja tagastab Laenuandjale Laenu Laenuandja arvelduskontole.",
            "s2_4": "2.4. Kui Laenusaaja teeb Laenuandjale makse, millest ei piisa kõigi Lepingu alusel võlgnetavate summade tasumiseks, arvestatakse makse:",
            "s2_4_a": "    • esimeses järjekorras võlgnetava intressi katteks;",
            "s2_4_b": "    • teises järjekorras võlgnetava viivise katteks;",
            "s2_4_c": "    • kolmandas järjekorras võlgnetava põhisumma katteks;",
            "s2_4_d": "    • neljandas järjekorras muude Lepingust tulenevate kohustuste katteks.",
            "s2_5": "2.5. Laenusaajal on õigus tagastada kogu Laen enne Lepingu punktis 2.2 nimetatud maksetähtpäeva, teavitades sellest Laenuandjat kirjalikult.",
            "s3_title": "3. Viivis",
            "s3_1": "3.1. Laenu tagastamisega viivitamisel on Laenuandjal õigus nõuda Laenusaajalt viivise tasumist 2% päevas sissenõutavaks muutunud summalt iga tasumisega viivitatud päeva eest.",
            "s3_2": "3.2. Tasumata intressilt või viiviselt viivist ei arvestata.",
            "s4_title": "4. Laenuandja õigus leping üles öelda",
            "s4_1": "4.1. Laenuandjal on õigus Leping üles öelda ja nõuda Laenu kohest tagastamist, kui:",
            "s4_1_a": "    • Lepingust tulenevaid Laenusaaja kohustusi tagava vara väärtus väheneb oluliselt ning Laenusaaja ja Laenuandja ei jõua kokkuleppele Laenu täiendava tagamise osas;",
            "s4_1_b": "    • Laenusaaja ei täida kohaselt Lepingust tulenevaid kohustusi või mõnda neist ning jätkab kohustuse mittetäitmist ka pärast 14 päeva möödumist Laenuandjalt vastavasisulise kirjaliku teatise saamisest.",
            "s5_title": "5. Tagatised",
            "s5_1": "5.1. Laenusaaja vastutab Lepingust tulenevate kohustuste täitmise eest kogu oma varaga.",
            "s6_title": "6. Rakenduse paigaldamine ja seadme turvameetmed",
            "s6_1": "6.1. Laenusaaja annab käesolevaga selgesõnalise nõusoleku paigaldada oma mobiiliseadmesse Laenuandja poolt pakutava rakenduse (edaspidi: Rakendus), mis on vajalik laenu haldamiseks ja maksejärelevalve teostamiseks.",
            "s6_2": "6.2. Laenusaaja kinnitab, et on teadlik Rakenduse funktsioonidest, sealhulgas võimalusest tuvastada makserikkumised reaalajas ning rakendada vastavaid turvameetmeid.",
            "s6_3": "6.3. Juhul kui Laenusaaja ei tasu Laenu või selle osa maksetähtajaks, on Laenuandjal õigus Rakenduse kaudu ajutiselt lukustada Laenusaaja mobiiliseade (edaspidi: Seadme lukustamine) kuni võlgnetava summa täieliku tasumiseni.",
            "s6_4": "6.4. Seadme lukustamine tähendab, et seade ei ole kasutatav kuni laen on makstud.",
            "s6_5": "6.5. Laenuandja avab Seadme lukustamise koheselt pärast võlgnetava summa täielikku tasumist või pärast Poolte vahelise kokkuleppe saavutamist maksegraafiku muutmise osas.",
            "s6_6": "6.6. Laenusaaja kohustub mitte desinstallima ega muul viisil kahjustama Rakenduse tööd oma seadmes kuni kõigi Lepingust tulenevate kohustuste täieliku täitmiseni. Rakenduse ebaseaduslik desinstallimine loetakse oluliseks Lepingurikkumiseks.",
            "s6_7": "6.7. Laenusaaja nõustub andma Rakendusele vajalikud õigused, sealhulgas kuid mitte ainult: seadme administreerimisõigused, asukohateenuste kasutamine, teavituste saatmine ning automaatne käivitamine seadme sisselülitamisel.",
            "s7_title": "7. Vaidluste lahendamise kord",
            "s7_1": "7.1. Lepingust tulenevad ja sellega seotud vaidlused püüavad Pooled lahendada läbirääkimiste teel.",
            "s7_2": "7.2. Kui vaidlust ei õnnestu lahendada Poolte läbirääkimiste teel, on Pooltel õigus pöörduda vaidluse lahendamiseks maakohtusse vastavalt Eesti Vabariigis kehtivatele õigusaktidele.",
            "s8_title": "8. Lepingu jõustumine",
            "s8_1": "8.1. Leping jõustub alates Lepingu allkirjastamise hetkest.",
            "s9_title": "9. Lõppsätted",
            "s9_1": "9.1. Leping on koostatud ja alla kirjutatud {lang_name} kahes (2) võrdset juriidilist jõudu omavas identses eksemplaris, millest üks jääb Laenuandjale ja teine Laenusaajale.",
            "lang_name": "eesti keeles",
            "sig_lender": "Laenuandja:",
            "sig_borrower": "Laenusaaja:",
            "footer": "Generated by PayLock Pro | Loan Management Platform",
        },
        "en": {
            "title": "LOAN AGREEMENT",
            "header_sub": "Loan Management Platform",
            "intro": "This loan agreement (hereinafter: Agreement) has been concluded on",
            "location": "Tallinn, Estonia",
            "residence": "address",
            "id_code": "personal identification code",
            "lender_label": "(hereinafter: Lender)",
            "and": "and",
            "borrower_label": "(hereinafter: Borrower)",
            "parties": ", hereinafter also referred to individually as a Party or jointly as the Parties, as follows:",
            "s1_title": "1. Loan and its transfer",
            "s1_1": "1.1. The Lender grants the Borrower a loan of <b>{amount} euros</b> (hereinafter: Granted Amount).",
            "s1_2": "1.2. The Lender undertakes to transfer the Loan to the Borrower within 1 business day at the latest.",
            "s1_3": "1.3. The Loan shall be transferred by crediting the Borrower's designated bank account.",
            "s2_title": "2. Interest and loan repayment",
            "s2_1": "2.1. The Loan is granted for a fixed term.",
            "s2_2": "2.2. The Borrower undertakes to repay the Loan as follows: <b>{repay} euros</b> by the due date of <b>{due}</b>.",
            "s2_2_detail": "(principal {amount} euros + interest {interest} euros = {repay} euros)",
            "s2_3": "2.3. The Borrower shall repay the Loan to the Lender's bank account.",
            "s2_4": "2.4. If the Borrower makes a payment insufficient to cover all amounts owed under the Agreement, the payment shall be applied:",
            "s2_4_a": "    • first, to cover the outstanding interest;",
            "s2_4_b": "    • second, to cover the outstanding default interest;",
            "s2_4_c": "    • third, to cover the outstanding principal;",
            "s2_4_d": "    • fourth, to cover other obligations arising from the Agreement.",
            "s2_5": "2.5. The Borrower has the right to repay the full Loan before the due date specified in clause 2.2 by notifying the Lender in writing.",
            "s3_title": "3. Default interest",
            "s3_1": "3.1. In case of late repayment, the Lender has the right to demand default interest of 2% per day on the outstanding amount for each day of delay.",
            "s3_2": "3.2. Default interest shall not be calculated on unpaid interest or default interest.",
            "s4_title": "4. Lender's right to terminate the Agreement",
            "s4_1": "4.1. The Lender has the right to terminate the Agreement and demand immediate repayment of the Loan if:",
            "s4_1_a": "    • the value of the assets securing the Borrower's obligations significantly decreases and the Parties fail to reach agreement on additional security;",
            "s4_1_b": "    • the Borrower fails to properly fulfill obligations under the Agreement and continues non-compliance after 14 days from receiving written notice from the Lender.",
            "s5_title": "5. Collateral",
            "s5_1": "5.1. The Borrower is liable for fulfillment of obligations under the Agreement with all of their assets.",
            "s6_title": "6. Application installation and device security measures",
            "s6_1": "6.1. The Borrower hereby gives explicit consent to install on their mobile device an application provided by the Lender (hereinafter: Application), which is necessary for loan management and payment monitoring.",
            "s6_2": "6.2. The Borrower confirms awareness of the Application's features, including the ability to detect payment violations in real time and apply corresponding security measures.",
            "s6_3": "6.3. If the Borrower fails to pay the Loan or any part thereof by the due date, the Lender has the right to temporarily lock the Borrower's mobile device through the Application (hereinafter: Device Locking) until full payment of the outstanding amount.",
            "s6_4": "6.4. Device Locking means that the device is not usable until the loan is paid.",
            "s6_5": "6.5. The Lender shall unlock the Device immediately after full payment of the outstanding amount or after the Parties reach an agreement regarding modification of the payment schedule.",
            "s6_6": "6.6. The Borrower undertakes not to uninstall or otherwise damage the Application's operation on their device until full fulfillment of all obligations under the Agreement. Unauthorized uninstallation of the Application shall be considered a material breach of the Agreement.",
            "s6_7": "6.7. The Borrower agrees to grant the Application necessary permissions, including but not limited to: device administration rights, location services, sending notifications, and automatic launch upon device startup.",
            "s7_title": "7. Dispute resolution",
            "s7_1": "7.1. Disputes arising from or related to the Agreement shall be resolved by the Parties through negotiations.",
            "s7_2": "7.2. If a dispute cannot be resolved through negotiations, the Parties have the right to refer the dispute to the county court in accordance with the legislation of the Republic of Estonia.",
            "s8_title": "8. Entry into force",
            "s8_1": "8.1. The Agreement shall enter into force upon signing.",
            "s9_title": "9. Final provisions",
            "s9_1": "9.1. The Agreement has been prepared and signed in {lang_name} in two (2) identical copies of equal legal force, one of which shall remain with the Lender and the other with the Borrower.",
            "lang_name": "English",
            "sig_lender": "Lender:",
            "sig_borrower": "Borrower:",
            "footer": "Generated by PayLock Pro | Loan Management Platform",
        },
    }

    tx = t[lang]
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
async def preview_contract(client_id: str, admin_token: str = Query(...), language: str = Query(default="et")):
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
        language=language
    )
    
    prefix = "loan_agreement" if language.lower()[:2] == "en" else "laenuleping"
    filename = f"{prefix}_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )


@router.post("/contracts/{client_id}/send-email")
async def send_contract_email(client_id: str, admin_token: str = Query(...), test_mode: bool = Query(default=False), language: str = Query(default="et")):
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
        language=language
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
async def download_contract(client_id: str, admin_token: str = Query(...), language: str = Query(default="et")):
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
        interest_rate=interest_rate_val
    )
    
    filename = f"laenuleping_{client.get('name', 'client').replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
