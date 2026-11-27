"""Unit tests for EMI, interest, late fees, and tenure helpers."""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from utils.calculations import (
    amount_due_from_loan,
    calculate_all_methods,
    calculate_flat_rate_emi,
    calculate_interest_total,
    calculate_period_late_fee,
    calculate_setup_interest,
    calculate_setup_interest_for_dates,
    calculate_simple_interest_emi,
    money,
    resolve_principal,
    should_advance_due_date,
    should_apply_late_fee,
    tenure_months_from_dates,
)
from utils.ledger import payment_ledger_updates
from utils.timeutils import as_utc, days_between, utc_now


class TestInterestAndEmi:
    def test_principal_nets_down_payment(self):
        assert resolve_principal(1000, 200) == 800.0
        assert resolve_principal(100, 200) == 0.0

    def test_tenure_rounds_to_nearest_month_min_one(self):
        start = "2026-01-01"
        assert tenure_months_from_dates(start, "2026-01-16") == 1  # 15 days -> 1
        assert tenure_months_from_dates(start, "2026-01-31") == 1  # 30 days
        assert tenure_months_from_dates(start, "2026-04-01") == 3  # 90 days
        assert tenure_months_from_dates(start, "2026-01-01") == 1  # same day still 1

    def test_setup_interest_monthly_rate(self):
        # 200 principal, 50% monthly, 1 month -> 100 interest, 300 total
        result = calculate_setup_interest(200, 50, 1)
        assert result["total_interest"] == 100.0
        assert result["total_amount"] == 300.0

        # 3 months at 50% monthly
        result = calculate_setup_interest(200, 50, 3)
        assert result["total_interest"] == 300.0
        assert result["total_amount"] == 500.0

    def test_setup_for_dates_matches_tenure_helper(self):
        result = calculate_setup_interest_for_dates(1000, 200, 50, "2026-01-01", "2026-01-31")
        assert result["principal"] == 800.0
        assert result["tenure_months"] == 1
        assert result["total_interest"] == 400.0

    def test_annual_simple_equals_flat(self):
        simple = calculate_simple_interest_emi(1200, 12, 12)
        flat = calculate_flat_rate_emi(1200, 12, 12)
        assert simple["total_interest"] == flat["total_interest"] == 144.0
        assert simple["monthly_emi"] == flat["monthly_emi"]

    def test_emi_rejects_zero_months(self):
        with pytest.raises(ValueError, match="at least 1"):
            calculate_simple_interest_emi(1000, 10, 0)
        with pytest.raises(ValueError, match="at least 1"):
            calculate_all_methods(1000, 10, 0)

    def test_interest_total_uses_down_payment(self):
        client = {
            "loan_amount": 1000,
            "down_payment": 200,
            "interest_rate": 50,
            "loan_start_date": "2026-01-01",
            "loan_due_date": "2026-01-31",
        }
        assert calculate_interest_total(client) == 400.0


class TestLateFees:
    def test_period_fee_is_percent_of_outstanding(self):
        assert calculate_period_late_fee(1000, 5) == 50.0
        assert calculate_period_late_fee(0, 5) == 0.0
        assert calculate_period_late_fee(1000, 0) == 0.0

    def test_should_apply_after_grace_and_frequency(self):
        today = datetime(2026, 2, 10, tzinfo=timezone.utc)
        assert should_apply_late_fee(2, grace_days=3, today=today) is False
        assert should_apply_late_fee(4, grace_days=3, today=today) is True
        assert should_apply_late_fee(
            10, grace_days=3, last_late_fee_date="2026-02-08", frequency_days=7, today=today
        ) is False
        assert should_apply_late_fee(
            10, grace_days=3, last_late_fee_date="2026-02-01", frequency_days=7, today=today
        ) is True


class TestPartialPayments:
    def test_one_time_loan_keeps_due_date_and_late_fees_on_partial(self):
        client = {
            "outstanding_balance": 300,
            "total_paid": 0,
            "payment_type": "single",
            "next_payment_due": "2026-02-01",
            "late_fees_accumulated": 15,
            "is_late": True,
            "days_overdue": 5,
            "late_score_penalized": True,
            "monthly_emi": 300,
        }
        result = payment_ledger_updates(client, 50)
        assert result["outstanding_after"] == 250.0
        assert result["total_paid_after"] == 50.0
        assert result["cleared"] is False
        assert result["next_payment_due"] == "2026-02-01"
        assert result["advanced_due_date"] is False
        assert result["late_fees_accumulated"] == 15.0
        assert result["is_late"] is True

    def test_full_payment_clears_balance_and_fees(self):
        client = {
            "outstanding_balance": 100,
            "total_paid": 200,
            "payment_type": "single",
            "next_payment_due": "2026-02-01",
            "late_fees_accumulated": 15,
            "is_late": True,
            "days_overdue": 5,
            "late_score_penalized": True,
        }
        result = payment_ledger_updates(client, 100)
        assert result["outstanding_after"] == 0.0
        assert result["cleared"] is True
        assert result["late_fees_accumulated"] == 0.0
        assert result["is_late"] is False
        assert result["late_score_penalized"] is False

    def test_installment_payment_advances_due_date(self):
        client = {
            "outstanding_balance": 600,
            "total_paid": 0,
            "payment_type": "monthly",
            "next_payment_due": "2026-01-15",
            "installment_amount": 200,
            "late_fees_accumulated": 0,
            "is_late": False,
        }
        result = payment_ledger_updates(client, 200)
        assert result["outstanding_after"] == 400.0
        assert result["advanced_due_date"] is True
        assert result["next_payment_due"] == "2026-02-15"

    def test_should_advance_due_date_rules(self):
        assert should_advance_due_date("single", 50, 250, 300) is False
        assert should_advance_due_date("monthly", 200, 400, 200) is True
        assert should_advance_due_date("monthly", 50, 550, 200) is False
        assert should_advance_due_date("single", 300, 0, 300) is False


class TestPaymentToLoanSync:
    def test_ledger_prefers_loan_outstanding(self):
        client = {"outstanding_balance": 300, "total_paid": 0, "payment_type": "single"}
        loan = {"outstanding_balance": 280, "total_paid": 20, "payment_type": "single", "id": "L1"}
        result = payment_ledger_updates(client, 80, loan=loan)
        # Must use the loan ledger (the device status source of truth)
        assert result["outstanding_before"] == 280.0
        assert result["outstanding_after"] == 200.0
        assert result["total_paid_after"] == 100.0

    def test_amount_due_from_loan_uses_outstanding_and_total_amount(self):
        assert amount_due_from_loan({"outstanding_balance": 123.4}) == 123.4
        assert amount_due_from_loan({"total_amount": 500, "total_paid": 100}) == 400.0
        assert amount_due_from_loan({"total_amount_due": 500, "total_paid": 500}) == 0.0
        # Must not invent one-month interest on gross loan_amount
        assert amount_due_from_loan({"loan_amount": 1000, "interest_rate": 50, "total_paid": 0}) == 1000.0


class TestOneTimeOverdue:
    def test_days_between_date_only(self):
        assert days_between("2026-01-01", "2026-01-11") == 10

    def test_as_utc_accepts_naive_and_zulu(self):
        a = as_utc("2026-01-01")
        b = as_utc("2026-01-01T00:00:00Z")
        assert a.tzinfo is not None and b.tzinfo is not None
        assert a.date() == b.date()

    def test_should_not_apply_fee_during_grace_on_one_time_loan(self):
        # 2 days overdue, 3 day grace — no fee yet (matches auto-lock grace)
        assert should_apply_late_fee(2, grace_days=3) is False
        assert should_apply_late_fee(4, grace_days=3) is True
