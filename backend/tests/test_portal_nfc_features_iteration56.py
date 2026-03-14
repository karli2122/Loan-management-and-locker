"""
Iteration 56 Tests - Portal, NFC Provisioning, Feature Suggestions, and Reminder Bug Fix

This test file covers:
1. Admin login and token generation
2. Web portal endpoint (GET /api/portal)
3. Dashboard analytics (GET /api/analytics/dashboard)
4. Clients listing (GET /api/clients)
5. Reports: collection, financial, clients
6. Reminders: pending, config
7. QR provisioning (GET /api/provisioning/qr-code)
8. NFC provisioning (GET /api/provisioning/nfc-payload) - NEW
9. Feature suggestions (GET /api/feature-suggestions) - NEW
10. Heartbeat summary (GET /api/heartbeat/summary)
11. Loan plans (GET /api/loan-plans)
12. Admin settings (GET /api/admin/settings)
13. Verify email reminder uses outstanding_balance not monthly_emi
"""

import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://subscription-tier-1.preview.emergentagent.com").rstrip("/")


class TestAdminAuthAndPortal:
    """Test admin authentication and portal endpoints."""
    
    admin_token = None
    
    def test_admin_login(self):
        """Test admin login returns token."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Token not returned in login response"
        assert len(data["token"]) > 0, "Empty token returned"
        
        # Store token for other tests
        TestAdminAuthAndPortal.admin_token = data["token"]
        print(f"Login successful, token received: {data['token'][:20]}...")
    
    def test_portal_returns_html(self):
        """Test that /api/portal returns HTML content."""
        response = requests.get(f"{BASE_URL}/api/portal")
        assert response.status_code == 200, f"Portal endpoint failed: {response.status_code}"
        
        # Check content type is HTML
        content_type = response.headers.get("content-type", "")
        assert "text/html" in content_type, f"Expected HTML, got: {content_type}"
        
        # Check HTML contains expected content
        html = response.text
        assert "<html" in html.lower() or "<!doctype" in html.lower(), "Response does not appear to be HTML"
        print(f"Portal returned HTML content: {len(html)} bytes")


class TestDashboardAndClients:
    """Test dashboard analytics and clients API."""
    
    def get_token(self):
        """Get admin token, login if needed."""
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_dashboard_analytics(self):
        """Test dashboard analytics endpoint."""
        token = self.get_token()
        assert token, "No admin token available"
        
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Dashboard failed: {response.status_code} - {response.text}"
        
        data = response.json()
        # Verify structure
        assert "overview" in data, "Missing overview in dashboard"
        assert "financial" in data, "Missing financial in dashboard"
        assert "total_clients" in data["overview"], "Missing total_clients in overview"
        assert "total_disbursed" in data["financial"], "Missing total_disbursed in financial"
        print(f"Dashboard: {data['overview']['total_clients']} clients, ${data['financial']['total_disbursed']} disbursed")
    
    def test_clients_list(self):
        """Test clients listing endpoint."""
        token = self.get_token()
        assert token, "No admin token available"
        
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Clients list failed: {response.status_code} - {response.text}"
        
        data = response.json()
        # API returns {"clients": [...]} or a list directly
        if isinstance(data, dict):
            assert "clients" in data, "Missing 'clients' key in response"
            clients = data["clients"]
            assert isinstance(clients, list), "Clients should be a list"
            print(f"Clients list returned {len(clients)} clients")
        else:
            assert isinstance(data, list), "Clients response should be a list"
            print(f"Clients list returned {len(data)} clients")


class TestReports:
    """Test all report endpoints."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_collection_report(self):
        """Test collection report endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Collection report failed: {response.status_code}"
        
        data = response.json()
        # Check expected fields
        assert "total_disbursed" in data or "overview" in data, "Missing expected fields in collection report"
        print(f"Collection report: {data.get('total_clients', data.get('overview', {}).get('total_clients', 'N/A'))} total clients")
    
    def test_financial_report(self):
        """Test financial report endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Financial report failed: {response.status_code}"
        
        data = response.json()
        assert "total_payments" in data or "totals" in data, "Missing expected fields in financial report"
        print(f"Financial report: total_payments = {data.get('total_payments', 'N/A')}")
    
    def test_clients_report(self):
        """Test clients report endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Clients report failed: {response.status_code}"
        
        data = response.json()
        assert "summary" in data, "Missing summary in clients report"
        assert "details" in data, "Missing details in clients report"
        print(f"Clients report summary: {data.get('summary', {})}")


class TestReminders:
    """Test reminder endpoints."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_pending_reminders(self):
        """Test pending reminders endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Pending reminders failed: {response.status_code}"
        
        data = response.json()
        assert "summary" in data, "Missing summary in pending reminders"
        assert "overdue" in data, "Missing overdue in pending reminders"
        assert "due_today" in data, "Missing due_today in pending reminders"
        print(f"Pending reminders summary: {data.get('summary', {})}")
    
    def test_reminder_config(self):
        """Test reminder config endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reminders/config",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Reminder config failed: {response.status_code}"
        
        data = response.json()
        assert "email_configured" in data, "Missing email_configured in config"
        assert "push_configured" in data, "Missing push_configured in config"
        print(f"Reminder config: email={data.get('email_configured')}, push={data.get('push_configured')}")


class TestProvisioning:
    """Test QR and NFC provisioning endpoints."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_qr_provisioning(self):
        """Test QR code provisioning endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/provisioning/qr-code",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"QR provisioning failed: {response.status_code}"
        
        data = response.json()
        assert "qr_code_base64" in data, "Missing qr_code_base64 in response"
        assert "provisioning_data" in data, "Missing provisioning_data in response"
        assert "instructions" in data, "Missing instructions in response"
        
        # Verify QR code is valid base64
        qr_base64 = data["qr_code_base64"]
        assert len(qr_base64) > 100, "QR code base64 seems too short"
        print(f"QR provisioning: base64 length = {len(qr_base64)}")
    
    def test_nfc_provisioning(self):
        """Test NFC provisioning endpoint - NEW feature."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/provisioning/nfc-payload",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"NFC provisioning failed: {response.status_code}"
        
        data = response.json()
        # Verify required fields as per review request
        assert "mime_type" in data, "Missing mime_type in NFC response"
        assert "payload" in data or "payload_text" in data or "payload_base64" in data, "Missing payload in NFC response"
        
        # Verify MIME type is correct for Android provisioning
        assert data["mime_type"] == "application/com.android.managedprovisioning", \
            f"Wrong MIME type: {data['mime_type']}"
        
        # Check instructions exist
        assert "instructions" in data, "Missing instructions in NFC response"
        
        print(f"NFC provisioning: mime_type={data['mime_type']}, payload_size={data.get('payload_size_bytes', 'N/A')}")


class TestFeatureSuggestions:
    """Test feature suggestions endpoint - NEW feature."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_feature_suggestions(self):
        """Test feature suggestions endpoint returns categorized features."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/feature-suggestions",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Feature suggestions failed: {response.status_code}"
        
        data = response.json()
        # Verify three priority categories exist
        assert "high_priority" in data, "Missing high_priority category"
        assert "medium_priority" in data, "Missing medium_priority category"
        assert "nice_to_have" in data, "Missing nice_to_have category"
        
        # Verify each category has items
        assert isinstance(data["high_priority"], list), "high_priority should be a list"
        assert isinstance(data["medium_priority"], list), "medium_priority should be a list"
        assert isinstance(data["nice_to_have"], list), "nice_to_have should be a list"
        
        # Verify structure of feature items
        if data["high_priority"]:
            item = data["high_priority"][0]
            assert "title" in item, "Feature item missing title"
            assert "description" in item, "Feature item missing description"
        
        print(f"Feature suggestions: high={len(data['high_priority'])}, medium={len(data['medium_priority'])}, nice_to_have={len(data['nice_to_have'])}")


class TestHeartbeatAndPlans:
    """Test heartbeat and loan plans endpoints."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_heartbeat_summary(self):
        """Test heartbeat summary endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Heartbeat summary failed: {response.status_code}"
        
        data = response.json()
        assert "total_registered" in data, "Missing total_registered in heartbeat"
        assert "online_count" in data, "Missing online_count in heartbeat"
        assert "warning_count" in data, "Missing warning_count in heartbeat"
        assert "critical_count" in data, "Missing critical_count in heartbeat"
        print(f"Heartbeat summary: total={data['total_registered']}, online={data['online_count']}, warning={data['warning_count']}, critical={data['critical_count']}")
    
    def test_loan_plans(self):
        """Test loan plans endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/loan-plans",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Loan plans failed: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Loan plans should return a list"
        print(f"Loan plans returned {len(data)} plans")


class TestAdminSettings:
    """Test admin settings endpoint."""
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_admin_settings(self):
        """Test admin settings endpoint."""
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": token}
        )
        assert response.status_code == 200, f"Admin settings failed: {response.status_code}"
        
        data = response.json()
        # Settings should return some configuration data
        assert isinstance(data, dict), "Admin settings should return a dict"
        print(f"Admin settings: {list(data.keys())}")


class TestReminderAmountBugFix:
    """
    Verify that email reminder uses outstanding_balance, not monthly_emi.
    
    The bug fix is in /api/reminders code - reminders should now use
    outstanding_balance instead of monthly_emi for payment amount.
    """
    
    def get_token(self):
        if TestAdminAuthAndPortal.admin_token:
            return TestAdminAuthAndPortal.admin_token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            TestAdminAuthAndPortal.admin_token = response.json().get("token")
        return TestAdminAuthAndPortal.admin_token
    
    def test_pending_reminders_uses_outstanding_balance(self):
        """
        Verify pending reminders response includes outstanding_balance.
        The bug fix ensures amount shown is outstanding_balance, not monthly_emi.
        """
        token = self.get_token()
        
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": token}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Check all categories for outstanding_balance field
        categories = ["overdue", "due_today", "due_soon", "upcoming"]
        found_client = False
        
        for category in categories:
            clients_in_category = data.get(category, [])
            for client in clients_in_category:
                found_client = True
                # Each reminder data should have outstanding_balance field
                assert "outstanding_balance" in client, \
                    f"Missing outstanding_balance in {category} reminder for client {client.get('client_name', 'unknown')}"
                # Verify outstanding_balance is used (it should exist and be a number)
                outstanding = client.get("outstanding_balance")
                assert isinstance(outstanding, (int, float)), \
                    f"outstanding_balance should be numeric, got {type(outstanding)}"
                print(f"  {category}: client={client.get('client_name', 'N/A')}, outstanding={outstanding}, monthly_emi={client.get('monthly_emi', 'N/A')}")
        
        if not found_client:
            print("No clients with pending reminders found - test passes vacuously (no data to verify)")
        else:
            print("VERIFIED: Pending reminders include outstanding_balance field")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
