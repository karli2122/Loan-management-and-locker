"""Tests for pre-lock reminders, dashboard aggregates, lock levels, and CSV preview."""
from datetime import date, datetime, timezone, timedelta

from utils.csv_clients import preview_clients_csv, validate_mapped_row
from utils.dashboard_home import classify_heartbeat, summarize_home, STALE_AFTER_SECONDS
from utils.lock_levels import (
    device_capabilities,
    is_effectively_locked,
    lock_signature_message,
    normalize_allowlist,
    normalize_lock_level,
    resolve_applied_lock_level,
    tamper_lock_updates,
)
from utils.prelock_reminders import (
    DEFAULT_PRELOCK_OFFSETS_DAYS,
    normalize_offsets,
    reminder_copy,
    reminder_dedupe_key,
    reminder_kinds_for_today,
)


def test_default_prelock_offsets():
    assert normalize_offsets(None) == [3, 1]
    assert normalize_offsets([]) == [3, 1]
    assert normalize_offsets([3, 1, 3, 0, -2, "x", 7]) == [3, 1, 7]
    assert list(DEFAULT_PRELOCK_OFFSETS_DAYS) == [3, 1]


def test_reminder_three_and_one_day_before():
    assert reminder_kinds_for_today(3, grace_days=3) == ["due_minus_3"]
    assert reminder_kinds_for_today(1, grace_days=3) == ["due_minus_1"]
    assert reminder_kinds_for_today(2, grace_days=3) == []
    assert reminder_kinds_for_today(0, grace_days=3) == []


def test_final_warning_on_last_grace_day():
    # Auto-lock fires when days_overdue > grace, so warn when overdue == grace.
    assert reminder_kinds_for_today(-3, grace_days=3) == ["prelock_final"]
    assert reminder_kinds_for_today(-2, grace_days=3) == []
    assert reminder_kinds_for_today(-4, grace_days=3) == []
    assert reminder_kinds_for_today(-0, grace_days=0) == ["prelock_final"]


def test_custom_offsets_and_disabled_or_locked():
    assert reminder_kinds_for_today(5, offsets=[5, 2]) == ["due_minus_5"]
    assert reminder_kinds_for_today(3, enabled=False) == []
    assert reminder_kinds_for_today(3, already_locked=True) == []


def test_dedupe_key_is_per_period_and_kind():
    a = reminder_dedupe_key("c1", "2026-12-01", "due_minus_3")
    b = reminder_dedupe_key("c1", date(2026, 12, 1), "due_minus_3")
    c = reminder_dedupe_key("c1", "2026-12-01", "due_minus_1")
    d = reminder_dedupe_key("c1", "2026-12-31", "due_minus_3")
    assert a == b
    assert a != c
    assert a != d


def test_reminder_copy_mentions_amount():
    pre = reminder_copy("due_minus_3", "Ada", 120.5, 3)
    assert "120.50" in pre["body"] and "3" in pre["body"]
    final = reminder_copy("prelock_final", "Ada", 50, -3, grace_days=3)
    assert "Final warning" in final["title"]
    assert "3-day" in final["body"]


def test_lock_level_normalization():
    assert normalize_lock_level(None, "none") == "none"
    assert normalize_lock_level("LOCK") == "full"
    assert normalize_lock_level("partial") == "restricted"
    assert normalize_lock_level("warn") == "warning"
    assert normalize_lock_level("unlock") == "none"
    assert is_effectively_locked("restricted") is True
    assert is_effectively_locked("warning") is False
    assert is_effectively_locked("none") is False
    assert is_effectively_locked("full") is True


def test_signature_includes_lock_level():
    msg = lock_signature_message("abc", True, 1700000000, "restricted")
    assert msg == "abc|1|1700000000|restricted"
    unlocked = lock_signature_message("abc", False, 1700000000, "none")
    assert unlocked == "abc|0|1700000000|none"


def test_allowlist_includes_phone_sms_and_payments():
    packages = normalize_allowlist(["com.example.bank"])
    assert "com.android.dialer" in packages or "com.google.android.dialer" in packages
    assert "com.google.android.apps.messaging" in packages or "com.android.mms" in packages
    assert "com.example.bank" in packages
    assert "com.example.bank" == packages[-1] or "com.example.bank" in packages
    # no duplicates
    assert len(packages) == len(set(packages))


def test_heartbeat_classification():
    now = datetime(2026, 11, 27, 10, 0, tzinfo=timezone.utc)
    assert classify_heartbeat(now, now) == "online"
    assert classify_heartbeat(now - timedelta(seconds=STALE_AFTER_SECONDS - 1), now) == "online"
    assert classify_heartbeat(now - timedelta(seconds=STALE_AFTER_SECONDS + 10), now) == "stale"
    assert classify_heartbeat(now - timedelta(hours=5), now) == "offline"
    assert classify_heartbeat(None, now) == "offline"


def test_dashboard_home_aggregate():
    today = date(2026, 11, 27)
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    clients = [
        {
            "id": "a",
            "name": "Due Today",
            "outstanding_balance": 100,
            "next_payment_due": "2026-11-27",
            "days_overdue": 0,
            "is_locked": False,
        },
        {
            "id": "b",
            "name": "Overdue",
            "outstanding_balance": 50,
            "next_payment_due": "2026-11-20",
            "days_overdue": 7,
            "is_locked": False,
        },
        {
            "id": "c",
            "name": "Locked",
            "outstanding_balance": 20,
            "next_payment_due": "2026-11-10",
            "days_overdue": 17,
            "is_locked": True,
            "lock_level": "full",
        },
        {
            "id": "d",
            "name": "Restricted",
            "outstanding_balance": 10,
            "is_locked": True,
            "lock_level": "restricted",
            "next_payment_due": "2026-12-01",
        },
        {
            "id": "e",
            "name": "Deleted",
            "is_deleted": True,
            "outstanding_balance": 99,
            "is_locked": True,
        },
        {
            "id": "f",
            "name": "Paid off due today",
            "outstanding_balance": 0,
            "next_payment_due": "2026-11-27",
        },
    ]
    payments = [
        {"amount": 40, "payment_date": "2026-11-02"},
        {"amount": 15.5, "payment_date": "2026-11-27"},
        {"amount": 999, "payment_date": "2026-10-31"},  # previous month
    ]
    result = summarize_home(clients, payments, today=today, now=now)
    assert result["counts"]["due_today"] == 1
    assert result["due_today"][0]["id"] == "a"
    assert result["counts"]["overdue"] == 2  # b and c
    assert result["counts"]["locked_devices"] == 2  # c and d
    assert result["collected_this_month"] == 55.5


def test_csv_preview_validates_and_flags_duplicates():
    text = (
        "Name,Phone,Email,Amount,Date\n"
        "Ada Lovelace,555-0100,ada@example.com,1000,2026-01-15\n"
        ",555-0101,x@y.com,50,2026-01-16\n"
        "Ada Lovelace,555-0102,not-an-email,200,15.01.2026\n"
        "Alan Turing,555-0103,alan@example.com,-5,2026-01-17\n"
    )
    result = preview_clients_csv(text, existing_names=["Ada Lovelace"])
    assert result["ok"] is True
    assert result["summary"]["total"] == 4
    assert result["summary"]["duplicates"] == 1
    assert result["summary"]["errors"] == 3  # missing name, invalid email, negative amount
    rows = {r["row"]: r for r in result["rows"]}
    assert rows[2]["status"] == "duplicate"
    assert rows[2]["data"]["loan_amount"] == 1000.0
    assert rows[3]["status"] == "error"
    assert "Missing name" in rows[3]["errors"]
    assert rows[4]["status"] == "duplicate" or "Invalid email" in rows[4]["errors"]
    # row 4 is ada again + bad email
    assert "Invalid email" in rows[4]["errors"]
    assert rows[5]["status"] == "error"


def test_csv_preview_requires_name_column():
    result = preview_clients_csv("Phone,Amount\n555,10\n")
    assert result["ok"] is False
    assert "name" in result["error"].lower()


def test_validate_interest_bounds():
    row = validate_mapped_row({"name": "X", "interest_rate": "150"}, 2)
    assert row["status"] == "error"
    assert any("Interest" in e for e in row["errors"])


def test_sign_lock_state_covers_level():
    from utils.auth import sign_lock_state
    import hmac, hashlib
    sig = sign_lock_state("c1", True, "tok", 111, lock_level="restricted")
    expected = hmac.new(b"tok", b"c1|1|111|restricted", hashlib.sha256).hexdigest()
    assert sig == expected
    legacy_shape = hmac.new(b"tok", b"c1|1|111", hashlib.sha256).hexdigest()
    assert sig != legacy_shape


def test_device_admin_cannot_use_restricted_mode():
    caps = device_capabilities(
        lock_mode="device_admin",
        device_owner_active=False,
        device_admin_active=True,
    )
    assert caps["can_lock_now"] is True
    assert caps["can_wipe_while_admin_active"] is True
    assert caps["can_suspend_packages"] is False
    assert caps["can_lock_task_unattended"] is False
    assert caps["restricted_fallback"] == "full"
    assert "restricted" not in caps["supported_lock_levels"]
    assert "full" in caps["supported_lock_levels"]
    assert caps["gaps"]


def test_device_owner_supports_restricted():
    caps = device_capabilities(
        lock_mode="device_owner",
        device_owner_active=True,
        device_admin_active=True,
    )
    assert caps["can_suspend_packages"] is True
    assert caps["can_lock_task_unattended"] is True
    assert "restricted" in caps["supported_lock_levels"]
    assert caps["restricted_fallback"] is None
    assert caps["gaps"] == []


def test_intended_owner_enrollment_without_report_is_admin():
    # A Device Owner *code* is not proof the phone is Device Owner yet.
    caps = device_capabilities(
        lock_mode="device_owner",
        device_owner_active=False,
        device_admin_active=True,
    )
    assert caps["can_suspend_packages"] is False
    assert any("not reported owner" in g or "not reported" in g for g in caps["gaps"])


def test_resolve_restricted_falls_back_on_device_admin():
    applied, reason = resolve_applied_lock_level("restricted", device_owner_active=False)
    assert applied == "full"
    assert reason == "device_admin_no_package_suspend"
    applied, reason = resolve_applied_lock_level("restricted", device_owner_active=True)
    assert applied == "restricted"
    assert reason is None
    applied, reason = resolve_applied_lock_level("warning", device_owner_active=False)
    assert applied == "warning"
    assert reason is None


def test_tamper_admin_disable_locks_unless_uninstall_allowed():
    locked = tamper_lock_updates("admin_disabled", uninstall_allowed=False)
    assert locked["admin_mode_active"] is False
    assert locked["device_owner_active"] is False
    assert locked["is_locked"] is True
    assert locked["lock_level"] == "full"
    allowed = tamper_lock_updates("admin_disabled", uninstall_allowed=True)
    assert allowed == {"admin_mode_active": False, "device_owner_active": False}
    other = tamper_lock_updates("unknown", uninstall_allowed=False)
    assert other == {}


def test_new_registration_codes_are_8_and_9_chars():
    from utils.registration_codes import generate_registration_code_value, lock_mode_from_registration_code
    admin_code = generate_registration_code_value("device_admin")
    owner_code = generate_registration_code_value("device_owner")
    assert len(admin_code) == 8
    assert len(owner_code) == 9
    assert admin_code == admin_code.upper()
    assert owner_code == owner_code.upper()
    assert lock_mode_from_registration_code(admin_code) == "device_admin"
    assert lock_mode_from_registration_code(owner_code) == "device_owner"


def test_existing_16_and_17_char_codes_still_resolve():
    from utils.registration_codes import lock_mode_from_registration_code
    assert lock_mode_from_registration_code("AABBCCDDEEFF0011") == "device_admin"
    assert len("AABBCCDDEEFF0011") == 16
    assert lock_mode_from_registration_code("AABBCCDDEEFF00112") == "device_owner"
    assert len("AABBCCDDEEFF00112") == 17
    # Explicit stored mode always wins, even if the length disagrees.
    assert lock_mode_from_registration_code("AABBCCDD", "device_owner") == "device_owner"
    assert lock_mode_from_registration_code("AABBCCDDE", "device_admin") == "device_admin"


def test_loan_countdown_percent_and_days():
    from utils.loan_countdown import loan_countdown
    d = loan_countdown({
        "total_amount": 1000,
        "total_paid": 250,
        "outstanding_balance": 750,
        "next_payment_amount": 100,
        "due_date": "2026-12-01",
    }, today=date(2026, 11, 27))
    assert d["percent_paid"] == 25.0
    assert d["days_until_due"] == 4
    assert d["next_payment_amount"] == 100.0
    assert d["outstanding_balance"] == 750.0
    assert d["next_payment_due"] == "2026-12-01"
    assert d["total_paid"] == 250.0
    assert d["total_amount"] == 1000.0


def test_loan_countdown_overdue_paid_and_derived_total():
    from utils.loan_countdown import loan_countdown
    overdue = loan_countdown({
        "total_amount": 500,
        "total_paid": 100,
        "outstanding_balance": 400,
        "monthly_emi": 50,
        "due_date": "2026-11-20",
    }, today=date(2026, 11, 27))
    assert overdue["days_until_due"] == -7
    assert overdue["percent_paid"] == 20.0
    assert overdue["next_payment_amount"] == 50.0

    paid = loan_countdown({
        "total_amount": 500,
        "total_paid": 500,
        "outstanding_balance": 0,
        "due_date": "2026-12-01",
        "next_payment_amount": 0,
    }, today=date(2026, 11, 27))
    assert paid["percent_paid"] == 100.0
    assert paid["outstanding_balance"] == 0
    assert paid["next_payment_amount"] == 0

    derived = loan_countdown({
        "total_paid": 80,
        "outstanding_balance": 20,
        "next_payment_due": "2026-11-28",
    }, today=date(2026, 11, 27))
    assert derived["total_amount"] == 100.0
    assert derived["percent_paid"] == 80.0
    assert derived["days_until_due"] == 1
    assert derived["next_payment_amount"] == 20.0


def test_loan_countdown_missing_due_date():
    from utils.loan_countdown import loan_countdown
    d = loan_countdown({"total_amount": 200, "total_paid": 0, "outstanding_balance": 200}, today=date(2026, 11, 27))
    assert d["days_until_due"] is None
    assert d["percent_paid"] == 0.0
    assert d["next_payment_amount"] == 200.0
