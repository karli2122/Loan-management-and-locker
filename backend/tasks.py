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



async def process_auto_reminders():
    """Send automated payment reminders via push notifications.
    
    Runs every hour, checks all active clients with upcoming/overdue payments.
    Default schedule: 1 day before, on due date, 1-3 days after (only if unpaid).
    Configurable per admin in admin_settings.reminder_schedule.
    """
    from routes.reminders import send_expo_push_notification
    
    while True:
        try:
            now = datetime.now(timezone.utc)
            today = now.strftime("%Y-%m-%d")
            
            # Get all admins with their reminder settings
            admins = await db.admins.find(
                {"is_deleted": {"$ne": True}},
                {"_id": 0, "id": 1, "username": 1}
            ).to_list(100)
            
            for admin in admins:
                admin_id = admin["id"]
                settings = await db.admin_settings.find_one({"admin_id": admin_id})
                
                # Default reminder schedule: [-1, 0, 1, 2, 3] (days relative to due date)
                reminder_days = [-1, 0, 1, 2, 3]
                reminders_enabled = True
                if settings:
                    reminders_enabled = settings.get("auto_reminders_enabled", True)
                    if settings.get("reminder_schedule"):
                        reminder_days = settings["reminder_schedule"]
                
                if not reminders_enabled:
                    continue
                
                # Get all active clients for this admin with outstanding balance
                clients = await db.clients.find(
                    {"admin_id": admin_id, "is_deleted": {"$ne": True}, "outstanding_balance": {"$gt": 0}},
                    {"_id": 0, "id": 1, "name": 1, "next_payment_due": 1, "expo_push_token": 1,
                     "monthly_emi": 1, "language": 1}
                ).to_list(500)
                
                for client in clients:
                    push_token = client.get("expo_push_token")
                    if not push_token:
                        continue
                    
                    due_date_str = client.get("next_payment_due")
                    if not due_date_str:
                        continue
                    
                    try:
                        if isinstance(due_date_str, datetime):
                            due_date = due_date_str.date()
                        else:
                            due_date = datetime.strptime(str(due_date_str)[:10], "%Y-%m-%d").date()
                    except (ValueError, TypeError):
                        continue
                    
                    days_until_due = (due_date - now.date()).days
                    
                    # Check if today matches any reminder day
                    should_remind = False
                    if days_until_due in reminder_days:
                        # For after-due reminders (days > 0), only send if still unpaid
                        if days_until_due <= 0:
                            should_remind = True
                        else:
                            should_remind = True  # overdue, still has balance
                    
                    # For overdue 1-3 days: only if the negative day is in schedule
                    if -days_until_due in [d for d in reminder_days if d > 0] and days_until_due < 0:
                        should_remind = True
                    
                    if not should_remind:
                        continue
                    
                    # Check if already reminded today
                    existing = await db.auto_reminders_sent.find_one({
                        "client_id": client["id"],
                        "date": today,
                    })
                    if existing:
                        continue
                    
                    # Build message based on timing
                    emi = client.get("monthly_emi", 0)
                    name = client.get("name", "Client")
                    if days_until_due > 0:
                        title = "Payment Reminder"
                        body = f"Hi {name}, your payment of {emi:.2f} EUR is due in {days_until_due} day(s). Please prepare your payment."
                    elif days_until_due == 0:
                        title = "Payment Due Today"
                        body = f"Hi {name}, your payment of {emi:.2f} EUR is due today. Please make your payment to avoid late fees."
                    else:
                        overdue_days = abs(days_until_due)
                        title = "Payment Overdue"
                        body = f"Hi {name}, your payment of {emi:.2f} EUR is {overdue_days} day(s) overdue. Please pay immediately to avoid device restrictions."
                    
                    # Send push notification
                    sent = await send_expo_push_notification(
                        push_token, title, body,
                        {"action": "payment_reminder", "client_id": client["id"], "days_until_due": days_until_due}
                    )
                    
                    if sent:
                        await db.auto_reminders_sent.insert_one({
                            "client_id": client["id"],
                            "admin_id": admin_id,
                            "date": today,
                            "days_until_due": days_until_due,
                            "sent_at": now,
                        })
                        logger.info(f"Auto reminder sent to {name} (due in {days_until_due}d)")
            
        except Exception as e:
            logger.error(f"Auto reminder error: {e}")
        
        await asyncio.sleep(3600)  # Run every hour


async def send_daily_digest():
    """Send daily digest email to admins. Runs every 30 minutes, checks if it's time to send.
    
    Default: 8 AM in the admin's configured timezone.
    Content: overdue payments, new registrations, tamper alerts, upcoming due dates.
    """
    while True:
        try:
            now = datetime.now(timezone.utc)
            
            admins = await db.admins.find(
                {"is_deleted": {"$ne": True}},
                {"_id": 0, "id": 1, "username": 1, "email": 1}
            ).to_list(100)
            
            for admin in admins:
                admin_id = admin["id"]
                admin_email = admin.get("email")
                if not admin_email:
                    continue
                
                settings = await db.admin_settings.find_one({"admin_id": admin_id})
                digest_enabled = True
                digest_hour = 8  # Default 8 AM UTC
                if settings:
                    digest_enabled = settings.get("daily_digest_enabled", True)
                    digest_hour = settings.get("daily_digest_hour", 8)
                
                if not digest_enabled:
                    continue
                
                # Check if current hour matches and haven't sent today
                if now.hour != digest_hour:
                    continue
                
                today_str = now.strftime("%Y-%m-%d")
                already_sent = await db.daily_digest_sent.find_one({
                    "admin_id": admin_id,
                    "date": today_str,
                })
                if already_sent:
                    continue
                
                # Gather digest data
                clients = await db.clients.find(
                    {"admin_id": admin_id, "is_deleted": {"$ne": True}},
                    {"_id": 0, "id": 1, "name": 1, "outstanding_balance": 1,
                     "next_payment_due": 1, "days_overdue": 1, "is_locked": 1,
                     "created_at": 1, "tamper_attempts": 1, "last_tamper_attempt": 1,
                     "last_tamper_type": 1, "monthly_emi": 1}
                ).to_list(500)
                
                # Overdue clients
                overdue = [c for c in clients if c.get("days_overdue", 0) > 0]
                
                # New registrations (last 24h)
                yesterday = now - timedelta(hours=24)
                new_clients = [c for c in clients if c.get("created_at") and 
                              (c["created_at"] if isinstance(c["created_at"], datetime) 
                               else datetime.fromisoformat(str(c["created_at"]).replace("Z", "+00:00"))) > yesterday]
                
                # Tamper alerts (last 24h)
                tamper_clients = [c for c in clients if c.get("last_tamper_attempt") and
                                 (c["last_tamper_attempt"] if isinstance(c["last_tamper_attempt"], datetime)
                                  else datetime.fromisoformat(str(c["last_tamper_attempt"]).replace("Z", "+00:00"))) > yesterday]
                
                # Upcoming payments (next 3 days)
                upcoming = []
                for c in clients:
                    due = c.get("next_payment_due")
                    if due:
                        try:
                            if isinstance(due, str):
                                due_dt = datetime.strptime(due[:10], "%Y-%m-%d").date()
                            elif isinstance(due, datetime):
                                due_dt = due.date()
                            else:
                                continue
                            days_left = (due_dt - now.date()).days
                            if 0 <= days_left <= 3:
                                upcoming.append({**c, "days_left": days_left})
                        except (ValueError, TypeError):
                            pass
                
                total_outstanding = sum(c.get("outstanding_balance", 0) for c in clients)
                
                # Build email
                overdue_rows = ""
                for c in overdue[:10]:
                    overdue_rows += f'<tr><td style="padding:8px;border-bottom:1px solid #eee">{c.get("name","?")}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">{c.get("days_overdue",0)}d</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">{c.get("outstanding_balance",0):.2f} EUR</td></tr>'
                
                tamper_rows = ""
                for c in tamper_clients[:5]:
                    tamper_rows += f'<tr><td style="padding:8px;border-bottom:1px solid #eee">{c.get("name","?")}</td><td style="padding:8px;border-bottom:1px solid #eee">{c.get("last_tamper_type","unknown")}</td></tr>'
                
                upcoming_rows = ""
                for c in upcoming[:10]:
                    upcoming_rows += f'<tr><td style="padding:8px;border-bottom:1px solid #eee">{c.get("name","?")}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">in {c.get("days_left",0)}d</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">{c.get("monthly_emi",0):.2f} EUR</td></tr>'
                
                html = f"""<html><body style="margin:0;padding:0;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
        <div style="background:#0F172A;padding:24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:22px">PayLock Pro - Daily Digest</h1>
            <p style="color:#94A3B8;margin:4px 0 0">{now.strftime('%B %d, %Y')}</p>
        </div>
        <div style="padding:24px">
            <div style="display:flex;gap:12px;margin-bottom:24px">
                <div style="flex:1;background:#FEF2F2;padding:16px;border-radius:8px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#EF4444">{len(overdue)}</div>
                    <div style="font-size:12px;color:#666">Overdue</div>
                </div>
                <div style="flex:1;background:#F0FDF4;padding:16px;border-radius:8px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#10B981">{len(new_clients)}</div>
                    <div style="font-size:12px;color:#666">New Clients</div>
                </div>
                <div style="flex:1;background:#FEF3C7;padding:16px;border-radius:8px;text-align:center">
                    <div style="font-size:24px;font-weight:700;color:#F59E0B">{len(tamper_clients)}</div>
                    <div style="font-size:12px;color:#666">Tamper Alerts</div>
                </div>
            </div>
            <p style="color:#666;font-size:14px">Total Outstanding: <strong>{total_outstanding:.2f} EUR</strong></p>
            {'<h3 style="color:#EF4444;margin-top:24px">Overdue Payments</h3><table style="width:100%;border-collapse:collapse"><tr style="background:#f8f9fa"><th style="padding:8px;text-align:left">Client</th><th style="padding:8px;text-align:right">Days</th><th style="padding:8px;text-align:right">Amount</th></tr>' + overdue_rows + '</table>' if overdue else ''}
            {'<h3 style="color:#F59E0B;margin-top:24px">Tamper Alerts (24h)</h3><table style="width:100%;border-collapse:collapse"><tr style="background:#f8f9fa"><th style="padding:8px;text-align:left">Client</th><th style="padding:8px;text-align:left">Type</th></tr>' + tamper_rows + '</table>' if tamper_clients else ''}
            {'<h3 style="color:#2563EB;margin-top:24px">Upcoming Payments</h3><table style="width:100%;border-collapse:collapse"><tr style="background:#f8f9fa"><th style="padding:8px;text-align:left">Client</th><th style="padding:8px;text-align:right">Due</th><th style="padding:8px;text-align:right">Amount</th></tr>' + upcoming_rows + '</table>' if upcoming else ''}
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;font-size:12px;color:#999">
            This is an automated digest from PayLock Pro. Configure in Settings.
        </div>
    </div></body></html>"""
                
                try:
                    resend.Emails.send({
                        "from": SENDER_EMAIL,
                        "to": admin_email,
                        "subject": f"PayLock Daily Digest - {len(overdue)} overdue, {len(tamper_clients)} alerts",
                        "html": html,
                    })
                    logger.info(f"Daily digest sent to {admin_email}")
                except Exception as email_err:
                    logger.error(f"Failed to send digest to {admin_email}: {email_err}")
                
                await db.daily_digest_sent.insert_one({
                    "admin_id": admin_id,
                    "date": today_str,
                    "sent_at": now,
                    "overdue_count": len(overdue),
                    "tamper_count": len(tamper_clients),
                })
        
        except Exception as e:
            logger.error(f"Daily digest error: {e}")
        
        await asyncio.sleep(1800)  # Check every 30 minutes



async def check_subscription_renewals():
    """Check for expired subscriptions and handle downgrades. Runs every 6 hours."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            
            # Find admins with expired subscriptions
            expired_admins = await db.admins.find(
                {
                    "subscription_renewal_date": {"$lt": now},
                    "plan": {"$nin": ["demo", None]},
                    "subscription_status": "paid",
                },
                {"_id": 0, "id": 1, "email": 1, "plan": 1, "pending_plan": 1, "subscription_renewal_date": 1}
            ).to_list(500)
            
            for admin in expired_admins:
                admin_id = admin["id"]
                pending_plan = admin.get("pending_plan")
                
                if pending_plan:
                    # Apply pending downgrade
                    new_role = "admin" if pending_plan in ("enterprise", "custom") else "user"
                    await db.admins.update_one(
                        {"id": admin_id},
                        {
                            "$set": {
                                "plan": pending_plan,
                                "subscription_plan": pending_plan,
                                "role": new_role,
                                "subscription_status": "expired",
                            },
                            "$unset": {"pending_plan": "", "pending_plan_date": ""}
                        }
                    )
                    logger.info(f"Applied pending downgrade for admin {admin_id}: {admin.get('plan')} -> {pending_plan}")
                else:
                    # No pending downgrade — mark as expired, downgrade to demo after grace period
                    grace_cutoff = now - timedelta(days=7)
                    renewal_date = admin.get("subscription_renewal_date")
                    if isinstance(renewal_date, str):
                        renewal_date = datetime.fromisoformat(renewal_date.replace("Z", "+00:00"))
                    if renewal_date and renewal_date < grace_cutoff:
                        # 7-day grace period expired, downgrade to demo
                        await db.admins.update_one(
                            {"id": admin_id},
                            {"$set": {
                                "plan": "demo",
                                "subscription_plan": "demo",
                                "role": "user",
                                "subscription_status": "expired",
                            }}
                        )
                        logger.info(f"Admin {admin_id} downgraded to demo after grace period expired")
                    else:
                        # Within grace period — just mark as expired
                        await db.admins.update_one(
                            {"id": admin_id},
                            {"$set": {"subscription_status": "expired"}}
                        )
                        
                        # Send renewal reminder notification
                        await db.notifications.insert_one({
                            "id": str(uuid.uuid4()),
                            "admin_id": admin_id,
                            "type": "subscription_expiry",
                            "title": "Subscription Expired",
                            "message": f"Your {admin.get('plan', 'plan')} subscription has expired. Please renew to maintain access to premium features.",
                            "created_at": now.isoformat(),
                            "read": False,
                        })
                        logger.info(f"Sent renewal reminder to admin {admin_id}")
            
            if expired_admins:
                logger.info(f"Processed {len(expired_admins)} expired subscriptions")
        
        except Exception as e:
            logger.error(f"Subscription renewal check error: {e}")
        
        await asyncio.sleep(21600)  # Check every 6 hours
