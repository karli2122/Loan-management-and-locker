"""Background tasks - Payment scheduling auto-processing and scheduled report emails."""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from io import BytesIO

import resend

from database import db

logger = logging.getLogger(__name__)
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def process_due_payments():
    """Auto-process payments that are due today. Runs every hour."""
    while True:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            schedules = await db.payment_schedules.find(
                {"is_active": True, "next_due_date": {"$lte": today}},
                {"_id": 0}
            ).to_list(500)

            for s in schedules:
                next_due = s.get("next_due_date")
                if not next_due:
                    continue

                # Check if already processed today
                if s.get("last_processed_date") == today:
                    continue

                client = await db.clients.find_one({"id": s["client_id"]}, {"_id": 0})
                if not client:
                    continue

                # Send reminder if auto_reminder is enabled
                if s.get("auto_reminder", True):
                    await db.notifications.insert_one({
                        "id": f"sched-{s['id']}-{today}",
                        "client_id": s["client_id"],
                        "type": "payment_due",
                        "message": f"Payment of {s['amount']:.2f} EUR due on {next_due}",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "read": False,
                    })

                # Update schedule: mark processed, increment counters, calculate next due
                from routes.schedules import _calc_next_due
                new_next = _calc_next_due(s)
                await db.payment_schedules.update_one(
                    {"id": s["id"]},
                    {"$set": {
                        "last_processed_date": today,
                        "next_due_date": new_next,
                        "total_scheduled": s.get("total_scheduled", 0) + 1,
                    }}
                )

                logger.info(f"Processed schedule {s['id']} for client {s['client_id']}, next due: {new_next}")

        except Exception as e:
            logger.error(f"Error processing due payments: {e}")

        await asyncio.sleep(3600)  # Run every hour


async def send_scheduled_reports():
    """Send scheduled report emails. Runs daily at midnight."""
    while True:
        try:
            # Check for active report schedules
            report_schedules = await db.report_schedules.find(
                {"is_active": True}, {"_id": 0}
            ).to_list(100)

            today = datetime.now(timezone.utc)
            day_of_week = today.weekday()  # 0=Monday
            day_of_month = today.day

            for rs in report_schedules:
                frequency = rs.get("frequency", "weekly")
                should_send = False

                if frequency == "daily":
                    should_send = True
                elif frequency == "weekly" and day_of_week == rs.get("send_day", 0):
                    should_send = True
                elif frequency == "monthly" and day_of_month == rs.get("send_day", 1):
                    should_send = True

                if not should_send:
                    continue

                # Check last sent
                last_sent = rs.get("last_sent")
                if last_sent and last_sent == today.strftime("%Y-%m-%d"):
                    continue

                email = rs.get("email")
                if not email or not resend.api_key:
                    continue

                # Generate report
                report_type = rs.get("report_type", "financial")
                admin_id = rs.get("admin_id")

                from routes.exports import _get_clients_data
                from routes.reports import calculate_interest_total
                clients = await _get_clients_data(admin_id)

                # Build HTML report
                html = _build_report_html(report_type, clients, today)

                try:
                    await asyncio.to_thread(resend.Emails.send, {
                        "from": SENDER_EMAIL,
                        "to": [email],
                        "subject": f"PayLock Pro - {report_type.title()} Report ({today.strftime('%Y-%m-%d')})",
                        "html": html,
                    })
                    await db.report_schedules.update_one(
                        {"id": rs["id"]},
                        {"$set": {"last_sent": today.strftime("%Y-%m-%d")}}
                    )
                    logger.info(f"Sent {report_type} report to {email}")
                except Exception as e:
                    logger.error(f"Failed to send report email to {email}: {e}")

        except Exception as e:
            logger.error(f"Error in scheduled reports: {e}")

        await asyncio.sleep(86400)  # Run daily


def _build_report_html(report_type: str, clients: list, now: datetime) -> str:
    """Build an HTML email body for the report."""
    total_disbursed = sum(c.get("loan_amount", 0) for c in clients)
    total_collected = sum(c.get("total_paid", 0) for c in clients)
    total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
    total_late_fees = sum(c.get("late_fees_accumulated", 0) for c in clients)
    active = sum(1 for c in clients if c.get("outstanding_balance", 0) > 0)
    overdue = sum(1 for c in clients if c.get("days_overdue", 0) > 0)
    rate = (total_collected / total_disbursed * 100) if total_disbursed > 0 else 0

    return f"""
    <html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:20px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden">
        <div style="background:#0B1527;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">PayLock Pro</h1>
            <p style="color:#94A3B8;margin:4px 0 0">{report_type.title()} Report - {now.strftime('%B %d, %Y')}</p>
        </div>
        <div style="padding:24px">
            <table style="width:100%;border-collapse:collapse">
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Total Clients</td><td style="padding:12px 0;text-align:right;font-weight:600">{len(clients)}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Active Loans</td><td style="padding:12px 0;text-align:right;font-weight:600">{active}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Overdue</td><td style="padding:12px 0;text-align:right;font-weight:600;color:#EF4444">{overdue}</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Total Disbursed</td><td style="padding:12px 0;text-align:right;font-weight:600">{total_disbursed:.2f} EUR</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Total Collected</td><td style="padding:12px 0;text-align:right;font-weight:600;color:#10B981">{total_collected:.2f} EUR</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Outstanding</td><td style="padding:12px 0;text-align:right;font-weight:600;color:#F59E0B">{total_outstanding:.2f} EUR</td></tr>
                <tr style="border-bottom:1px solid #eee"><td style="padding:12px 0;color:#666">Late Fees</td><td style="padding:12px 0;text-align:right;font-weight:600">{total_late_fees:.2f} EUR</td></tr>
                <tr><td style="padding:12px 0;color:#666">Collection Rate</td><td style="padding:12px 0;text-align:right;font-weight:600;color:#2563EB">{rate:.1f}%</td></tr>
            </table>
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;font-size:12px;color:#999">
            This is an automated report from PayLock Pro. Do not reply to this email.
        </div>
    </div></body></html>"""
