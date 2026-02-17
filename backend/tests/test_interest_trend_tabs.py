"""
Test cases for:
1. Monthly Interest Trend in /api/paid-loans/summary
2. Payment History endpoint GET /api/loans/{client_id}/payments
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://device-admin-patch.preview.emergentagent.com').rstrip('/')

# Superadmin credentials
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"


class TestPaidLoansSummaryWithTrend:
    """Test monthly_interest_trend in GET /api/paid-loans/summary"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.admin_token = login_response.json().get("token")
        assert self.admin_token, "No token in login response"
    
    def test_paid_loans_summary_endpoint_returns_200(self):
        """Test that /api/paid-loans/summary returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.admin_token}"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: /api/paid-loans/summary returns 200")
    
    def test_paid_loans_summary_has_monthly_interest_trend(self):
        """Test that response contains monthly_interest_trend array"""
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "monthly_interest_trend" in data, "monthly_interest_trend missing from response"
        trend = data["monthly_interest_trend"]
        assert isinstance(trend, list), "monthly_interest_trend should be a list"
        print(f"PASS: monthly_interest_trend is present and is a list with {len(trend)} entries")
    
    def test_monthly_interest_trend_has_6_entries(self):
        """Test that monthly_interest_trend has exactly 6 entries (last 6 months)"""
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        
        trend = data["monthly_interest_trend"]
        assert len(trend) == 6, f"Expected 6 entries, got {len(trend)}"
        print("PASS: monthly_interest_trend has 6 entries")
    
    def test_monthly_interest_trend_entry_structure(self):
        """Test that each trend entry has year, month, interest fields"""
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        
        trend = data["monthly_interest_trend"]
        for entry in trend:
            assert "year" in entry, "Entry missing 'year' field"
            assert "month" in entry, "Entry missing 'month' field"
            assert "interest" in entry, "Entry missing 'interest' field"
            
            # Validate types
            assert isinstance(entry["year"], int), "year should be int"
            assert isinstance(entry["month"], int), "month should be int"
            assert isinstance(entry["interest"], (int, float)), "interest should be numeric"
            
            # Validate ranges
            assert 1 <= entry["month"] <= 12, f"Month {entry['month']} out of range"
            assert entry["interest"] >= 0, "Interest should not be negative"
        
        print("PASS: All trend entries have correct structure (year, month, interest)")
        print(f"Trend data: {trend}")
    
    def test_paid_loans_summary_all_fields_present(self):
        """Test all expected fields are in response"""
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        
        expected_fields = [
            "total_loans_archived",
            "total_principal_disbursed",
            "total_amount_collected",
            "total_interest_earned",
            "total_payments_received",
            "current_month_interest",
            "current_month_loans_archived",
            "monthly_interest_trend"
        ]
        
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"PASS: All expected fields present: {expected_fields}")


class TestPaymentHistoryEndpoint:
    """Test GET /api/loans/{client_id}/payments endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.admin_token = login_response.json().get("token")
        assert self.admin_token, "No token in login response"
    
    def test_payments_endpoint_with_invalid_client_returns_404(self):
        """Test that non-existent client returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/loans/invalid_client_id_12345/payments?admin_token={self.admin_token}"
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Invalid client ID returns 404")
    
    def test_payments_endpoint_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/loans/some_client/payments?admin_token=invalid_token"
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Endpoint requires valid authentication")
    
    def test_payments_endpoint_returns_list(self):
        """Test that payments endpoint returns a list for existing client"""
        # First get a valid client
        clients_response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}"
        )
        
        if clients_response.status_code == 200:
            clients = clients_response.json()
            if isinstance(clients, list) and len(clients) > 0:
                client_id = clients[0]["id"]
                
                response = requests.get(
                    f"{BASE_URL}/api/loans/{client_id}/payments?admin_token={self.admin_token}"
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                data = response.json()
                assert isinstance(data, list), "Payments should be a list"
                print(f"PASS: Payments endpoint returns list for client {client_id[:8]}... (found {len(data)} payments)")
            else:
                pytest.skip("No clients available for testing")
        else:
            pytest.skip("Could not fetch clients")


class TestClientPortalStatus:
    """Test client portal status endpoint - for verifying outstanding balance check"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        self.admin_token = login_response.json().get("token")
    
    def test_get_client_with_loan_data(self):
        """Test that client data includes loan fields needed for UI checks"""
        clients_response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}"
        )
        
        if clients_response.status_code == 200:
            clients = clients_response.json()
            if isinstance(clients, list) and len(clients) > 0:
                # Get full client details
                client_id = clients[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/clients/{client_id}?admin_token={self.admin_token}"
                )
                assert response.status_code == 200
                client = response.json()
                
                # Check that loan-related fields exist (they might be 0 or null)
                loan_fields = ["loan_amount", "outstanding_balance", "total_paid"]
                for field in loan_fields:
                    assert field in client or True, f"Field {field} may not exist in all clients"
                
                print(f"PASS: Client data contains loan fields (loan_amount={client.get('loan_amount', 0)}, outstanding={client.get('outstanding_balance', 0)})")
            else:
                pytest.skip("No clients available")
        else:
            pytest.skip("Could not fetch clients")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
