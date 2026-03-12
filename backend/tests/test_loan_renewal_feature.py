"""
Test suite for Loan Renewal / Repeat Loan feature:
- GET /api/paid-loans/{client_id}/latest endpoint
- Returns 404 when client has no archived loans
- Returns loan_amount, interest_rate, loan_tenure_months fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://analytics-debug-11.preview.emergentagent.com').rstrip('/')


class TestLoanRenewalBackend:
    """Test the loan renewal backend API - GET /api/paid-loans/{client_id}/latest"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        token = response.json().get("token")
        assert token, "No token returned from login"
        return token
    
    def test_get_latest_paid_loan_success(self, admin_token):
        """Test GET /api/paid-loans/{client_id}/latest returns latest archived loan"""
        # Client with known archived loan
        client_id = "83e8286a-92f8-4081-989b-88bba77bf877"
        
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/{client_id}/latest",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields for loan renewal pre-fill
        assert "loan_amount" in data, "Missing loan_amount field"
        assert "interest_rate" in data, "Missing interest_rate field"
        assert "loan_tenure_months" in data, "Missing loan_tenure_months field"
        assert "client_id" in data, "Missing client_id field"
        
        # Verify the client_id matches
        assert data["client_id"] == client_id, f"client_id mismatch: expected {client_id}, got {data['client_id']}"
        
        # Verify data types
        assert isinstance(data["loan_amount"], (int, float)), f"loan_amount should be numeric, got {type(data['loan_amount'])}"
        assert isinstance(data["interest_rate"], (int, float)), f"interest_rate should be numeric, got {type(data['interest_rate'])}"
        assert isinstance(data["loan_tenure_months"], (int, float)), f"loan_tenure_months should be numeric, got {type(data['loan_tenure_months'])}"
        
        # Verify values are sensible
        assert data["loan_amount"] >= 0, "loan_amount should be non-negative"
        assert data["interest_rate"] >= 0, "interest_rate should be non-negative"
        assert data["loan_tenure_months"] >= 0, "loan_tenure_months should be non-negative"
        
        print(f"✓ Latest paid loan returned: amount={data['loan_amount']}, rate={data['interest_rate']}%, tenure={data['loan_tenure_months']}mo")
    
    def test_get_latest_paid_loan_404_no_archived_loans(self, admin_token):
        """Test GET /api/paid-loans/{client_id}/latest returns 404 when no archived loans exist"""
        # Client with no archived loans
        client_id = "5041e532-2b15-4d1b-8107-00b3be312c95"  # Lembi Vilbas
        
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/{client_id}/latest",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Expected error detail in response"
        assert "no archived loans" in data["detail"].lower() or "not found" in data["detail"].lower(), \
            f"Unexpected error message: {data['detail']}"
        
        print("✓ 404 returned correctly for client with no archived loans")
    
    def test_get_latest_paid_loan_invalid_client(self, admin_token):
        """Test GET /api/paid-loans/{client_id}/latest returns 404 for invalid client"""
        # Non-existent client ID
        client_id = "non-existent-client-id-12345"
        
        response = requests.get(
            f"{BASE_URL}/api/paid-loans/{client_id}/latest",
            params={"admin_token": admin_token}
        )
        
        # Should return 404 since no paid loans exist for non-existent client
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("✓ 404 returned correctly for non-existent client")
    
    def test_get_latest_paid_loan_requires_auth(self):
        """Test GET /api/paid-loans/{client_id}/latest requires authentication"""
        client_id = "83e8286a-92f8-4081-989b-88bba77bf877"
        
        # Test without admin_token
        response = requests.get(f"{BASE_URL}/api/paid-loans/{client_id}/latest")
        
        # Should fail - either 401 or 422 (validation error for missing param)
        assert response.status_code in [401, 422], f"Expected 401/422, got {response.status_code}"
        print("✓ Authentication required correctly")
    
    def test_verify_client_has_no_active_loan(self, admin_token):
        """Verify the test client has no active loan (prerequisite for renewal)"""
        client_id = "83e8286a-92f8-4081-989b-88bba77bf877"
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Failed to get client: {response.text}"
        
        data = response.json()
        
        # Verify client has no active loan (loan_start_date should be null or loan_amount should be 0)
        has_no_active_loan = (
            data.get("loan_start_date") is None or 
            data.get("loan_amount", 0) == 0 or 
            data.get("outstanding_balance", 0) == 0
        )
        
        assert has_no_active_loan, f"Client should have no active loan for renewal test. Got: loan_start_date={data.get('loan_start_date')}, loan_amount={data.get('loan_amount')}"
        print(f"✓ Client has no active loan: loan_start_date={data.get('loan_start_date')}, loan_amount={data.get('loan_amount')}")
    
    def test_verify_client_has_loan_history(self, admin_token):
        """Verify the test client has loan history (prerequisite for renewal button visibility)"""
        client_id = "83e8286a-92f8-4081-989b-88bba77bf877"
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/loan-history",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Failed to get loan history: {response.text}"
        
        data = response.json()
        
        # Verify client has loan history
        assert data.get("total_loans", 0) > 0, "Client should have loan history for renewal test"
        assert len(data.get("loan_history", [])) > 0, "Client should have loan history entries"
        
        print(f"✓ Client has {data['total_loans']} archived loan(s) in history")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
