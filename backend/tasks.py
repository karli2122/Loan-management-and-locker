"""Background tasks - Payment scheduling auto-processing and scheduled report emails."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

import resend

from database import db

logger = logging.getLogger(__name__)
resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def process_due_payments():
    """Auto-process payments that are due today. Runs every hour.
    
    Full logic:
    - Find all active schedules with due dates <= today
    - For each, create a reminder notification
    - Check if client has overdue payments and apply late fees
    - Auto-lock devices if grace period exceeded
    - Update schedule counters and calculate next due date
    """
    while True:
        try:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            today_dt = datetime.now(timezone.utc)
            
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

                admin_id = client.get("admin_id")
                client_name = client.get("name", "Unknown")

                # Fetch admin automation settings
                admin_settings = None
                if admin_id:
                    admin_settings = await db.admin_settings.find_one({"admin_id": admin_id}, {"_id": 0})
                if not admin_settings:
                    admin_settings = {
                        "payment_auto_reminder_enabled": True,
                        "payment_auto_lock_enabled": True,
                        "payment_auto_late_fee_enabled": True,
                        "payment_late_fee_frequency_days": 7,
                        "payment_reminder_channels": ["push", "email"],
                        "payment_auto_charge_enabled": False,
                    }

                # ---- STRIPE AUTO-CHARGE ----
                auto_charge = admin_settings.get("payment_auto_charge_enabled", False)
                if auto_charge and client.get("auto_pay_enabled"):
                    charge_amount = s.get("amount", 0)
                    if charge_amount > 0:
                        from routes.client_payments import create_auto_payment_link
                        payment_url, pay_status = await create_auto_payment_link(
                            client, charge_amount, currency="eur", schedule_id=s["id"]
                        )
                        if payment_url:
                            # Send payment link to client via notification
                            if admin_id:
                                await db.notifications.insert_one({
                                    "id": str(uuid.uuid4()),
                                    "admin_id": admin_id,
                                    "type": "auto_payment_link",
                                    "title": "Payment Link Sent",
                                    "message": f"Auto-payment link for {charge_amount:.2f} EUR sent to {client_name}.",
                                    "client_id": s["client_id"],
                                    "client_name": client_name,
                                    "is_read": False,
                                    "created_at": today_dt.isoformat(),
                                    "payment_url": payment_url,
                                })

                            # Send email with payment link if client has email
                            client_email = client.get("email")
                            if client_email and resend.api_key:
                                try:
                                    await asyncio.to_thread(resend.Emails.send, {
                                        "from": SENDER_EMAIL,
                                        "to": [client_email],
                                        "subject": f"PayLock Pro - Payment Due ({charge_amount:.2f} EUR)",
                                        "html": f"""
                                        <html><body style="font-family:Arial,sans-serif;padding:20px">
                                        <div style="max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee">
                                            <div style="background:#0B1527;padding:20px;text-align:center">
                                                <h2 style="color:#fff;margin:0">PayLock Pro</h2>
                                            </div>
                                            <div style="padding:24px">
                                                <p>Dear {client_name},</p>
                                                <p>Your payment of <strong>{charge_amount:.2f} EUR</strong> is now due.</p>
                                                <p style="text-align:center;margin:24px 0">
                                                    <a href="{payment_url}" style="background:#2563EB;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">Pay Now</a>
                                                </p>
                                                <p style="font-size:13px;color:#666">If the button doesn't work, copy this link: {payment_url}</p>
                                            </div>
                                        </div></body></html>
                                        """,
                                    })
                                    logger.info(f"Sent payment link email to {client_email} for {charge_amount} EUR")
                                except Exception as email_err:
                                    logger.error(f"Failed to email payment link to {client_email}: {email_err}")

                            # Update schedule with payment link status
                            from routes.schedules import _calc_next_due
                            new_next = _calc_next_due(s)
                            await db.payment_schedules.update_one(
                                {"id": s["id"]},
                                {"$set": {
                                    "last_processed_date": today,
                                    "next_due_date": new_next,
                                    "total_scheduled": s.get("total_scheduled", 0) + 1,
                                    "last_payment_status": "link_sent",
                                    "last_payment_url": payment_url,
                                }}
                            )
                            logger.info(f"Auto-payment link created for schedule {s['id']}, client {s['client_id']}")
                            continue
                        else:
                            # Link creation failed - notify admin, proceed with overdue logic
                            if admin_id:
                                await db.notifications.insert_one({
                                    "id": str(uuid.uuid4()),
                                    "admin_id": admin_id,
                                    "type": "auto_payment_failed",
                                    "title": "Auto Payment Link Failed",
                                    "message": f"Failed to create payment link for {client_name}: {pay_status}",
                                    "client_id": s["client_id"],
                                    "client_name": client_name,
                                    "is_read": False,
                                    "created_at": today_dt.isoformat(),
                                })
                            logger.warning(f"Auto-payment link failed for client {s['client_id']}: {pay_status}")

                # Send reminder notification to admin
                auto_remind = admin_settings.get("payment_auto_reminder_enabled", True)
                if s.get("auto_reminder", True) and admin_id and auto_remind:
                    await db.notifications.insert_one({
                        "id": str(uuid.uuid4()),
                        "admin_id": admin_id,
                        "type": "payment_due",
                        "title": "Payment Due",
                        "message": f"Payment of {s['amount']:.2f} EUR due from {client_name} on {next_due}",
                        "client_id": s["client_id"],
                        "client_name": client_name,
                        "is_read": False,
                        "created_at": today_dt.isoformat(),
                    })

                # Check overdue days and apply late fees
                try:
                    due_date = datetime.strptime(next_due, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    days_overdue = (today_dt - due_date).days
                    
                    if days_overdue > 0:
                        # Update days_overdue on client
                        await db.clients.update_one(
                            {"id": s["client_id"]},
                            {"$set": {
                                "days_overdue": days_overdue,
                                "is_late": True,
                            }}
                        )
                        
                        # Auto-lock if grace period exceeded
                        grace_days = client.get("auto_lock_grace_days", 3)
                        auto_lock = client.get("auto_lock_enabled", True)
                        auto_lock_setting = admin_settings.get("payment_auto_lock_enabled", True)
                        if auto_lock and auto_lock_setting and days_overdue > grace_days and not client.get("is_locked", False):
                            await db.clients.update_one(
                                {"id": s["client_id"]},
                                {"$set": {
                                    "is_locked": True,
                                    "lock_message": f"Device locked: Payment of {s['amount']:.2f} EUR is {days_overdue} days overdue.",
                                }}
                            )
                            # Notify admin about auto-lock
                            if admin_id:
                                await db.notifications.insert_one({
                                    "id": str(uuid.uuid4()),
                                    "admin_id": admin_id,
                                    "type": "auto_lock",
                                    "title": "Auto-Lock Triggered",
                                    "message": f"{client_name}'s device has been auto-locked ({days_overdue} days overdue).",
                                    "client_id": s["client_id"],
                                    "client_name": client_name,
                                    "is_read": False,
                                    "created_at": today_dt.isoformat(),
                                })
                            logger.info(f"Auto-locked client {s['client_id']} ({days_overdue} days overdue)")
                        
                        # Apply late fees based on admin settings
                        auto_late_fee = admin_settings.get("payment_auto_late_fee_enabled", True)
                        fee_freq = admin_settings.get("payment_late_fee_frequency_days", 7)
                        last_late_fee = client.get("last_late_fee_date")
                        should_apply_fee = True
                        if last_late_fee:
                            try:
                                last_fee_dt = datetime.fromisoformat(last_late_fee).replace(tzinfo=timezone.utc)
                                if (today_dt - last_fee_dt).days < fee_freq:
                                    should_apply_fee = False
                            except Exception:
                                pass
                        
                        if auto_late_fee and should_apply_fee and days_overdue > grace_days:
                            outstanding = client.get("outstanding_balance", 0)
                            late_fee_pct = 2.0  # Default 2%
                            # Try to get from loan plan
                            plan_id = client.get("loan_plan_id")
                            if plan_id:
                                plan = await db.loan_plans.find_one({"id": plan_id}, {"_id": 0})
                                if plan:
                                    late_fee_pct = plan.get("late_fee_percent", 2.0)
                            
                            late_fee = round(outstanding * late_fee_pct / 100, 2)
                            if late_fee > 0:
                                await db.clients.update_one(
                                    {"id": s["client_id"]},
                                    {"$inc": {
                                        "late_fees_accumulated": late_fee,
                                        "outstanding_balance": late_fee,
                                        "total_amount_due": late_fee,
                                    },
                                    "$set": {
                                        "last_late_fee_date": today_dt.isoformat(),
                                    }}
                                )
                                logger.info(f"Applied late fee of {late_fee} to client {s['client_id']}")
                except Exception as e:
                    logger.error(f"Error processing overdue for {s['client_id']}: {e}")

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

            # Also check all clients for overdue payments (not just scheduled ones)
            await _check_all_overdue_clients()
            
            # Auto-unlock temporary locks that have expired
            await _process_temporary_unlocks()

        except Exception as e:
            logger.error(f"Error processing due payments: {e}")

        await asyncio.sleep(3600)  # Run every hour


async def _check_all_overdue_clients():
    """Check all clients with active loans for overdue status."""
    try:
        today_dt = datetime.now(timezone.utc)
        
        clients = await db.clients.find(
            {
                "outstanding_balance": {"$gt": 0},
                "is_deleted": {"$ne": True},
                "next_payment_due": {"$exists": True, "$ne": None},
            },
            {"_id": 0, "id": 1, "next_payment_due": 1, "auto_lock_enabled": 1,
             "auto_lock_grace_days": 1, "is_locked": 1, "admin_id": 1, "name": 1,
             "outstanding_balance": 1}
        ).to_list(1000)
        
        for client in clients:
            try:
                due = client.get("next_payment_due")
                if not due:
                    continue
                
                if isinstance(due, str):
                    due_dt = datetime.fromisoformat(due).replace(tzinfo=timezone.utc)
                elif isinstance(due, datetime):
                    due_dt = due.replace(tzinfo=timezone.utc) if due.tzinfo is None else due
                else:
                    continue
                
                days_overdue = (today_dt - due_dt).days
                if days_overdue > 0:
                    await db.clients.update_one(
                        {"id": client["id"]},
                        {"$set": {"days_overdue": days_overdue, "is_late": True}}
                    )
                elif days_overdue <= 0:
                    await db.clients.update_one(
                        {"id": client["id"]},
                        {"$set": {"days_overdue": 0, "is_late": False}}
                    )
            except Exception as e:
                logger.error(f"Error checking overdue for client {client.get('id')}: {e}")
    except Exception as e:
        logger.error(f"Error in _check_all_overdue_clients: {e}")


async def _process_temporary_unlocks():
    """Auto-unlock clients whose temporary lock period has expired."""
    try:
        now = datetime.now(timezone.utc).isoformat()
        
        # Find all clients with temporary locks that have expired
        clients = await db.clients.find(
            {
                "is_locked": True,
                "is_temporary_lock": True,
                "auto_unlock_at": {"$lte": now},
            },
            {"_id": 0, "id": 1, "name": 1, "admin_id": 1, "expo_push_token": 1}
        ).to_list(100)
        
        for client in clients:
            await db.clients.update_one(
                {"id": client["id"]},
                {"$set": {
                    "is_locked": False,
                    "lock_reason": None,
                    "lock_message": None,
                    "auto_unlock_at": None,
                    "is_temporary_lock": False,
                    "unlocked_at": now,
                }}
            )
            
            # Record in audit log
            await db.lock_audit_log.insert_one({
                "client_id": client["id"],
                "admin_id": "system",
                "action": "unlock",
                "reason": "temporary_lock_expired",
                "timestamp": now,
            })
            
            # Notify admin
            admin_id = client.get("admin_id")
            if admin_id:
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "admin_id": admin_id,
                    "type": "auto_unlock",
                    "title": "Temporary Lock Expired",
                    "message": f"{client.get('name', 'Client')}'s temporary lock has expired. Device auto-unlocked.",
                    "client_id": client["id"],
                    "is_read": False,
                    "created_at": now,
                })
            
            logger.info(f"Auto-unlocked client {client['id']} (temporary lock expired)")
    except Exception as e:
        logger.error(f"Error processing temporary unlocks: {e}")



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
