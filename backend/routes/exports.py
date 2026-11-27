"""Export routes - PDF and CSV generation for reports."""
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from datetime import datetime
from io import BytesIO, StringIO
import csv
import logging

from database import db
from utils.auth import get_admin_id_from_token
from routes.reports import _get_enterprise_client_query, calculate_interest_total

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Exports"])


async def _get_clients_data(admin_id: str):
    """Fetch client data scoped to admin/enterprise."""
    query = await _get_enterprise_client_query(admin_id)
    return await db.clients.find(query, {"_id": 0}).to_list(1000)


async def _get_payments_data(client_ids: list):
    """Fetch payments for given client IDs."""
    return await db.payments.find(
        {"client_id": {"$in": client_ids}}, {"_id": 0}
    ).to_list(10000)


@router.get("/reports/export/csv")
async def export_csv(
    admin_token: str = Query(...),
    report_type: str = Query(default="financial"),
):
    """Export report data as CSV. Types: financial, clients, collection, payments."""
    admin_id = await get_admin_id_from_token(admin_token)
    clients = await _get_clients_data(admin_id)

    output = StringIO()
    writer = csv.writer(output)
    now = datetime.utcnow().strftime("%Y-%m-%d")

    if report_type == "clients":
        writer.writerow(["Name", "Phone", "ID Code", "Loan Amount", "Total Paid",
                         "Outstanding", "Days Overdue", "Status", "Device Locked"])
        for c in clients:
            outstanding = c.get("outstanding_balance", 0)
            days_overdue = c.get("days_overdue", 0)
            if outstanding <= 0 and c.get("loan_amount", 0) > 0:
                status = "Completed"
            elif days_overdue > 7:
                status = "Defaulted"
            elif days_overdue > 0:
                status = "At Risk"
            elif c.get("loan_amount", 0) > 0:
                status = "Active"
            else:
                status = "No Loan"
            writer.writerow([
                c.get("name", ""), c.get("phone", ""), c.get("id_code", ""),
                c.get("loan_amount", 0), c.get("total_paid", 0),
                outstanding, days_overdue, status, c.get("is_locked", False)
            ])

    elif report_type == "payments":
        client_ids = [c["id"] for c in clients]
        payments = await _get_payments_data(client_ids)
        client_map = {c["id"]: c.get("name", "") for c in clients}
        writer.writerow(["Date", "Client", "Amount", "Method", "Note"])
        for p in sorted(payments, key=lambda x: x.get("payment_date") or datetime.min, reverse=True):
            writer.writerow([
                p.get("payment_date", "").strftime("%Y-%m-%d") if isinstance(p.get("payment_date"), datetime) else str(p.get("payment_date", "")),
                client_map.get(p.get("client_id"), ""),
                p.get("amount", 0),
                p.get("method", ""),
                p.get("note", ""),
            ])

    elif report_type == "collection":
        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
        active = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
        overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
        rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0

        writer.writerow(["Collection Report", now])
        writer.writerow([])
        writer.writerow(["Metric", "Value"])
        writer.writerow(["Total Clients", len(clients)])
        writer.writerow(["Active Loans", active])
        writer.writerow(["Overdue Clients", overdue])
        writer.writerow(["Total Disbursed", f"{total_disbursed:.2f}"])
        writer.writerow(["Total Collected", f"{total_collected:.2f}"])
        writer.writerow(["Total Outstanding", f"{total_outstanding:.2f}"])
        writer.writerow(["Total Late Fees", f"{total_late_fees:.2f}"])
        writer.writerow(["Collection Rate", f"{rate:.1f}%"])

    else:  # financial
        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
        total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)
        total_interest = sum(calculate_interest_total(c) for c in clients)

        writer.writerow(["Financial Report", now])
        writer.writerow([])
        writer.writerow(["Metric", "Value (EUR)"])
        writer.writerow(["Total Disbursed", f"{total_disbursed:.2f}"])
        writer.writerow(["Total Collected", f"{total_collected:.2f}"])
        writer.writerow(["Total Outstanding", f"{total_outstanding:.2f}"])
        writer.writerow(["Interest Earned", f"{total_interest:.2f}"])
        writer.writerow(["Late Fees", f"{total_late_fees:.2f}"])
        writer.writerow(["Processing Fees", f"{total_processing_fees:.2f}"])
        writer.writerow(["Total Revenue", f"{total_collected + total_late_fees + total_processing_fees:.2f}"])

    output.seek(0)
    filename = f"paylock_{report_type}_{now}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )




def _client_status_label(c: dict) -> str:
    outstanding = c.get("outstanding_balance", 0)
    days_overdue = c.get("days_overdue", 0)
    if outstanding <= 0 and c.get("loan_amount", 0) > 0:
        return "Completed"
    if days_overdue > 7:
        return "Defaulted"
    if days_overdue > 0:
        return "At Risk"
    if c.get("loan_amount", 0) > 0:
        return "Active"
    return "No Loan"


async def _report_table(admin_id: str, report_type: str):
    """Return (sheet_name, headers, rows) for CSV/XLSX/PDF-adjacent tabular exports."""
    clients = await _get_clients_data(admin_id)
    now = datetime.utcnow().strftime("%Y-%m-%d")
    if report_type == "clients":
        headers = ["Name", "Phone", "ID Code", "Loan Amount", "Total Paid",
                   "Outstanding", "Days Overdue", "Status", "Device Locked"]
        rows = []
        for c in clients:
            rows.append([
                c.get("name", ""), c.get("phone", ""), c.get("id_code", ""),
                c.get("loan_amount", 0), c.get("total_paid", 0),
                c.get("outstanding_balance", 0), c.get("days_overdue", 0),
                _client_status_label(c), bool(c.get("is_locked", False)),
            ])
        return "Clients", headers, rows
    if report_type == "payments":
        client_ids = [c["id"] for c in clients]
        payments = await _get_payments_data(client_ids)
        client_map = {c["id"]: c.get("name", "") for c in clients}
        headers = ["Date", "Client", "Amount", "Method", "Note"]
        rows = []
        for pay in sorted(payments, key=lambda x: x.get("payment_date") or datetime.min, reverse=True):
            pay_date = pay.get("payment_date", "")
            if isinstance(pay_date, datetime):
                pay_date = pay_date.strftime("%Y-%m-%d")
            rows.append([
                str(pay_date),
                client_map.get(pay.get("client_id"), ""),
                pay.get("amount", 0),
                pay.get("method", ""),
                pay.get("note", ""),
            ])
        return "Payments", headers, rows
    if report_type == "collection":
        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
        active = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
        overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
        rate = (total_collected / total_disbursed * 100) if total_disbursed else 0
        headers = ["Metric", "Value"]
        rows = [
            ["Report Date", now],
            ["Total Clients", len(clients)],
            ["Active Loans", active],
            ["Overdue Clients", overdue],
            ["Total Disbursed", round(total_disbursed, 2)],
            ["Total Collected", round(total_collected, 2)],
            ["Total Outstanding", round(total_outstanding, 2)],
            ["Total Late Fees", round(total_late_fees, 2)],
            ["Collection Rate", f"{rate:.1f}%"],
        ]
        return "Collection", headers, rows
    # financial
    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)
    total_interest = sum(calculate_interest_total(c) for c in clients)
    headers = ["Metric", "Value (EUR)"]
    rows = [
        ["Report Date", now],
        ["Total Disbursed", round(total_disbursed, 2)],
        ["Total Collected", round(total_collected, 2)],
        ["Total Outstanding", round(total_outstanding, 2)],
        ["Interest Earned", round(total_interest, 2)],
        ["Late Fees", round(total_late_fees, 2)],
        ["Processing Fees", round(total_processing_fees, 2)],
        ["Total Revenue", round(total_collected + total_late_fees + total_processing_fees, 2)],
    ]
    return "Financial", headers, rows


@router.get("/reports/export/xlsx")
async def export_xlsx(
    admin_token: str = Query(...),
    report_type: str = Query(default="financial"),
):
    """Export report data as an Excel workbook. Types: financial, clients, collection, payments."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    admin_id = await get_admin_id_from_token(admin_token)
    sheet_name, headers, rows = await _report_table(admin_id, report_type)
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name[:31]
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2962FF")
    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
    for r_idx, row in enumerate(rows, start=2):
        for c_idx, value in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=value if not isinstance(value, bool) else ("Yes" if value else "No"))
    for col in ws.columns:
        max_len = 0
        letter = col[0].column_letter
        for cell in col:
            max_len = max(max_len, len(str(cell.value or "")))
        ws.column_dimensions[letter].width = min(max_len + 2, 40)
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"paylock_{report_type}_{datetime.utcnow().strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/reports/export/pdf")
async def export_pdf(
    admin_token: str = Query(...),
    report_type: str = Query(default="financial"),
):
    """Export report data as PDF. Types: financial, clients, collection."""
    from fpdf import FPDF

    admin_id = await get_admin_id_from_token(admin_token)
    clients = await _get_clients_data(admin_id)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Header
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 12, "PayLock Pro", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6, f"Generated: {now}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.ln(6)

    if report_type == "clients":
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, "Client Report", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        # Table header
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(41, 98, 255)
        pdf.set_text_color(255, 255, 255)
        cols = [("Name", 35), ("Phone", 25), ("Loan", 22), ("Paid", 22),
                ("Outstanding", 25), ("Overdue", 18), ("Status", 20), ("Locked", 15)]
        for label, w in cols:
            pdf.cell(w, 7, label, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(0, 0, 0)
        for i, c in enumerate(clients):
            outstanding = c.get("outstanding_balance", 0)
            days_overdue = c.get("days_overdue", 0)
            if outstanding <= 0 and c.get("loan_amount", 0) > 0:
                status = "Completed"
            elif days_overdue > 7:
                status = "Defaulted"
            elif days_overdue > 0:
                status = "At Risk"
            elif c.get("loan_amount", 0) > 0:
                status = "Active"
            else:
                status = "No Loan"
            if i % 2 == 0:
                pdf.set_fill_color(245, 245, 250)
            else:
                pdf.set_fill_color(255, 255, 255)
            row = [
                str(c.get("name", ""))[:20], str(c.get("phone", ""))[:15],
                f"{c.get('loan_amount', 0):.0f}", f"{c.get('total_paid', 0):.0f}",
                f"{outstanding:.0f}", str(days_overdue), status,
                "Yes" if c.get("is_locked") else "No"
            ]
            for j, (label, w) in enumerate(cols):
                pdf.cell(w, 6, row[j], border=1, fill=True)
            pdf.ln()

    elif report_type == "collection":
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, "Collection Report", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
        active = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
        overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
        rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0

        metrics = [
            ("Total Clients", str(len(clients))),
            ("Active Loans", str(active)),
            ("Overdue Clients", str(overdue)),
            ("Total Disbursed", f"{total_disbursed:.2f} EUR"),
            ("Total Collected", f"{total_collected:.2f} EUR"),
            ("Total Outstanding", f"{total_outstanding:.2f} EUR"),
            ("Total Late Fees", f"{total_late_fees:.2f} EUR"),
            ("Collection Rate", f"{rate:.1f}%"),
        ]

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(41, 98, 255)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(80, 7, "Metric", border=1, fill=True)
        pdf.cell(60, 7, "Value", border=1, fill=True)
        pdf.ln()

        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "", 9)
        for i, (metric, value) in enumerate(metrics):
            if i % 2 == 0:
                pdf.set_fill_color(245, 245, 250)
            else:
                pdf.set_fill_color(255, 255, 255)
            pdf.cell(80, 7, metric, border=1, fill=True)
            pdf.cell(60, 7, value, border=1, fill=True)
            pdf.ln()

    else:  # financial
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, "Financial Report", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

        total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
        total_collected = sum(c.get("total_paid", 0) for c in clients)
        total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
        total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
        total_processing_fees = sum(c.get("processing_fee", 0) for c in clients)
        total_interest = sum(calculate_interest_total(c) for c in clients)
        total_revenue = total_collected + total_late_fees + total_processing_fees

        metrics = [
            ("Total Disbursed", f"{total_disbursed:.2f} EUR"),
            ("Total Collected", f"{total_collected:.2f} EUR"),
            ("Total Outstanding", f"{total_outstanding:.2f} EUR"),
            ("Interest Earned", f"{total_interest:.2f} EUR"),
            ("Late Fees", f"{total_late_fees:.2f} EUR"),
            ("Processing Fees", f"{total_processing_fees:.2f} EUR"),
            ("Total Revenue", f"{total_revenue:.2f} EUR"),
        ]

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(41, 98, 255)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(80, 7, "Metric", border=1, fill=True)
        pdf.cell(60, 7, "Value", border=1, fill=True)
        pdf.ln()

        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Helvetica", "", 9)
        for i, (metric, value) in enumerate(metrics):
            if i % 2 == 0:
                pdf.set_fill_color(245, 245, 250)
            else:
                pdf.set_fill_color(255, 255, 255)
            pdf.cell(80, 7, metric, border=1, fill=True)
            pdf.cell(60, 7, value, border=1, fill=True)
            pdf.ln()

    # Generate PDF bytes
    pdf_bytes = pdf.output()
    buffer = BytesIO(pdf_bytes)
    buffer.seek(0)
    filename = f"paylock_{report_type}_{datetime.utcnow().strftime('%Y-%m-%d')}.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
