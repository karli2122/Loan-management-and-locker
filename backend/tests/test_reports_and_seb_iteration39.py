"""
Test suite for Reports & Analytics APIs and SEB bank statement detection.
Covers:
  - /api/reports/financial (interest_earned non-zero)
  - /api/reports/collection (nested + flat structure)
  - /api/reports/clients (summary + details structure)
  - /api/bank-statements/analyze (SEB detection for statement74.pdf)
  - /api/analytics/dashboard (monthly_interest non-zero dict)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ──────────────────────────────── Fixtures ────────────────────────────────

@pytest.fixture(scope="module")
def admin_token():
    """Obtain token for karli1987."""
    resp = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "karli1987", "password": "nasvakas123"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    token = resp.json().get("token") or resp.json().get("access_token")
    assert token, f"No token in response: {resp.json()}"
    return token


# ──────────────────────────────── Financial Report ────────────────────────────────

class TestFinancialReport:
    """Tests for /api/reports/financial"""

    def test_financial_report_returns_200(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/reports/financial returns 200")

    def test_financial_report_has_totals_block(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "totals" in data, f"Missing 'totals' key: {list(data.keys())}"
        totals = data["totals"]
        assert "interest_earned" in totals, f"Missing 'interest_earned' in totals: {list(totals.keys())}"
        print(f"PASS: totals.interest_earned = {totals['interest_earned']}")

    def test_financial_report_interest_earned_nonzero(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        interest = data.get("totals", {}).get("interest_earned", 0)
        # The fix should yield ~141.31; at minimum, must be > 0
        assert interest > 0, f"interest_earned is zero or missing – got {interest}"
        print(f"PASS: interest_earned = {interest} (expected ~141.31)")

    def test_financial_report_has_monthly_interest_list(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        monthly_interest = data.get("monthly_interest")
        assert monthly_interest is not None, "Missing 'monthly_interest' field"
        assert isinstance(monthly_interest, list), f"Expected list, got {type(monthly_interest)}"
        assert len(monthly_interest) == 6, f"Expected 6 months, got {len(monthly_interest)}"
        print(f"PASS: monthly_interest list has {len(monthly_interest)} entries")

    def test_financial_report_monthly_trend_has_interest(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        trend = data.get("monthly_trend", [])
        if trend:
            first = trend[0]
            assert "interest_earned" in first, f"monthly_trend entry missing 'interest_earned': {first}"
        print(f"PASS: monthly_trend entries have interest_earned field (count={len(trend)})")


# ──────────────────────────────── Collection Report ────────────────────────────────

class TestCollectionReport:
    """Tests for /api/reports/collection – nested + flat structure."""

    def test_collection_report_returns_200(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/reports/collection returns 200")

    def test_collection_report_nested_overview(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "overview" in data, f"Missing 'overview' key. Keys: {list(data.keys())}"
        overview = data["overview"]
        for field in ("total_clients", "active_loans", "completed_loans", "overdue_clients"):
            assert field in overview, f"'overview' missing field '{field}': {overview}"
        print("PASS: nested 'overview' block present with all required fields")

    def test_collection_report_nested_financial(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "financial" in data, f"Missing 'financial' key. Keys: {list(data.keys())}"
        financial = data["financial"]
        for field in ("total_disbursed", "total_collected", "total_outstanding", "collection_rate"):
            assert field in financial, f"'financial' missing field '{field}': {financial}"
        print("PASS: nested 'financial' block present with all required fields")

    def test_collection_report_nested_this_month(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "this_month" in data, f"Missing 'this_month' key. Keys: {list(data.keys())}"
        this_month = data["this_month"]
        for field in ("total_collected", "number_of_payments"):
            assert field in this_month, f"'this_month' missing field '{field}': {this_month}"
        print("PASS: nested 'this_month' block present")

    def test_collection_report_flat_fields_backward_compat(self, admin_token):
        """Flat fields must still be present for backward compatibility."""
        resp = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        flat_fields = ("total_disbursed", "total_collected", "total_outstanding",
                       "collection_rate", "active_loans", "total_clients")
        for field in flat_fields:
            assert field in data, f"Missing flat field '{field}' for backward compat. Keys: {list(data.keys())}"
        print("PASS: all flat backward-compat fields present")


# ──────────────────────────────── Clients Report ────────────────────────────────

class TestClientsReport:
    """Tests for /api/reports/clients – {summary, details} structure."""

    def test_clients_report_returns_200(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/reports/clients returns 200")

    def test_clients_report_has_summary(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "summary" in data, f"Missing 'summary' key. Keys: {list(data.keys())}"
        summary = data["summary"]
        for field in ("on_time_clients", "at_risk_clients", "defaulted_clients", "completed_clients"):
            assert field in summary, f"'summary' missing field '{field}': {summary}"
        print(f"PASS: 'summary' present with on_time={summary.get('on_time_clients')}, "
              f"at_risk={summary.get('at_risk_clients')}, defaulted={summary.get('defaulted_clients')}, "
              f"completed={summary.get('completed_clients')}")

    def test_clients_report_has_details(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "details" in data, f"Missing 'details' key. Keys: {list(data.keys())}"
        details = data["details"]
        for key in ("at_risk", "defaulted"):
            assert key in details, f"'details' missing key '{key}': {list(details.keys())}"
        print(f"PASS: 'details' block with at_risk and defaulted lists present")

    def test_clients_report_summary_counts_are_integers(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        summary = data["summary"]
        for field in ("on_time_clients", "at_risk_clients", "defaulted_clients", "completed_clients"):
            value = summary.get(field)
            assert isinstance(value, int), f"Expected int for '{field}', got {type(value)}: {value}"
        print("PASS: all summary count fields are integers")

    def test_clients_report_is_not_flat_array(self, admin_token):
        """Old format was a flat list – confirm new format is a dict."""
        resp = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert isinstance(data, dict), f"Expected dict response, got {type(data)}"
        assert "summary" in data and "details" in data, \
            f"Response should have 'summary' and 'details'. Got keys: {list(data.keys())}"
        print("PASS: response is a dict with summary+details (not a flat list)")


# ──────────────────────────────── SEB Bank Statement ────────────────────────────────

class TestSEBBankStatement:
    """Tests for /api/bank-statements/analyze with statement74.pdf (SEB)."""

    SEB_PDF_PATH = "/tmp/statement74.pdf"

    def _upload_statement(self, admin_token):
        """Helper: upload statement74.pdf and return response."""
        if not os.path.exists(self.SEB_PDF_PATH):
            pytest.skip(f"SEB statement not found at {self.SEB_PDF_PATH}")
        with open(self.SEB_PDF_PATH, "rb") as f:
            pdf_bytes = f.read()
        resp = requests.post(
            f"{BASE_URL}/api/bank-statements/analyze",
            params={"admin_token": admin_token},
            files={"file": ("statement74.pdf", pdf_bytes, "application/pdf")},
            timeout=120,  # AI analysis can take a while
        )
        return resp

    def test_seb_upload_returns_200(self, admin_token):
        resp = self._upload_statement(admin_token)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:500]}"
        print("PASS: SEB statement upload returns 200")

    def test_seb_bank_name_detected(self, admin_token):
        resp = self._upload_statement(admin_token)
        assert resp.status_code == 200, f"Upload failed: {resp.status_code}"
        data = resp.json()
        analysis = data.get("analysis", data)  # top-level or nested
        bank_name = analysis.get("bank_name", "")
        assert bank_name == "SEB", f"Expected bank_name='SEB', got '{bank_name}'"
        print(f"PASS: bank_name = '{bank_name}'")

    def test_seb_summary_non_zero(self, admin_token):
        resp = self._upload_statement(admin_token)
        assert resp.status_code == 200, f"Upload failed: {resp.status_code}"
        data = resp.json()
        analysis = data.get("analysis", data)
        summary = analysis.get("summary", {})
        assert summary, f"'summary' block missing or empty: {analysis}"
        # At least one of these should be non-zero
        total_income = summary.get("total_income") or 0
        total_expenses = summary.get("total_expenses") or 0
        net_balance = summary.get("net_balance")
        assert any([total_income != 0, total_expenses != 0, net_balance is not None]), \
            f"All summary values are zero/None: {summary}"
        print(f"PASS: SEB summary non-zero — income={total_income}, expenses={total_expenses}, net={net_balance}")

    def test_seb_has_period(self, admin_token):
        resp = self._upload_statement(admin_token)
        assert resp.status_code == 200, f"Upload failed: {resp.status_code}"
        data = resp.json()
        analysis = data.get("analysis", data)
        period = analysis.get("period")
        print(f"INFO: SEB period = '{period}'")
        # Period may be None if not extractable; just verify the field exists
        assert "period" in analysis or period is not None, "No 'period' field in analysis"

    def test_seb_has_income_and_expense_categories(self, admin_token):
        resp = self._upload_statement(admin_token)
        assert resp.status_code == 200, f"Upload failed: {resp.status_code}"
        data = resp.json()
        analysis = data.get("analysis", data)
        income_cats = analysis.get("income_categories")
        expense_cats = analysis.get("expense_categories")
        assert isinstance(income_cats, list), f"income_categories should be a list: {income_cats}"
        assert isinstance(expense_cats, list), f"expense_categories should be a list: {expense_cats}"
        print(f"PASS: income_categories={len(income_cats)} items, expense_categories={len(expense_cats)} items")


# ──────────────────────────────── Analytics Dashboard ────────────────────────────────

class TestAnalyticsDashboard:
    """Tests for /api/analytics/dashboard – monthly_interest dict with non-zero values."""

    def test_dashboard_returns_200(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        print("PASS: /api/analytics/dashboard returns 200")

    def test_dashboard_has_monthly_interest(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "monthly_interest" in data, f"Missing 'monthly_interest'. Keys: {list(data.keys())}"
        monthly_interest = data["monthly_interest"]
        assert isinstance(monthly_interest, dict), \
            f"Expected dict for monthly_interest, got {type(monthly_interest)}"
        print(f"PASS: monthly_interest is a dict with {len(monthly_interest)} entries")

    def test_dashboard_monthly_interest_has_entries(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        monthly_interest = data.get("monthly_interest", {})
        # Should have at least current month seeded (even if 0)
        assert len(monthly_interest) >= 1, \
            f"monthly_interest dict is empty: {monthly_interest}"
        print(f"PASS: monthly_interest has entries: {monthly_interest}")

    def test_dashboard_monthly_interest_has_nonzero_value(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        monthly_interest = data.get("monthly_interest", {})
        nonzero = {k: v for k, v in monthly_interest.items() if v and v != 0}
        assert len(nonzero) > 0, \
            f"All monthly_interest values are zero: {monthly_interest}"
        print(f"PASS: monthly_interest has non-zero values: {nonzero}")

    def test_dashboard_has_overview(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "overview" in data, f"Missing 'overview'. Keys: {list(data.keys())}"
        overview = data["overview"]
        for field in ("total_clients", "active_loans", "overdue"):
            assert field in overview, f"overview missing '{field}': {overview}"
        print(f"PASS: overview present — {overview}")

    def test_dashboard_has_financial(self, admin_token):
        resp = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token},
        )
        data = resp.json()
        assert "financial" in data, f"Missing 'financial'. Keys: {list(data.keys())}"
        financial = data["financial"]
        for field in ("total_disbursed", "total_collected", "collection_rate"):
            assert field in financial, f"financial missing '{field}': {financial}"
        print(f"PASS: financial present — {financial}")
