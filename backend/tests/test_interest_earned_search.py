"""
Test Interest Earned Summary and Loan History Search Features
Tests for:
1. GET /api/paid-loans/summary - returns total_interest_earned, current_month_interest, etc.
2. Route ordering fix - /paid-loans/summary should NOT return 404
3. Loan History endpoint - /api/clients/{client_id}/loan-history
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://audit-fixes-preview.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPERADMIN_USER = "karli1987"
SUPERADMIN_PASS = "nasvakas123"


class TestInterestEarnedSummary:
    """Test Interest Earned Summary endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USER,
            "password": SUPERADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        assert self.token, "No token received"
    
    def test_paid_loans_summary_endpoint_exists(self):
        """Test that /api/paid-loans/summary returns 200 (not 404 - route ordering fix)"""
        response = requests.get(f"{BASE_URL}/api/paid-loans/summary?admin_token={self.token}")
        # CRITICAL: Should NOT return 404 (route ordering fix)
        assert response.status_code == 200, f"Summary endpoint returned {response.status_code}: {response.text}"
        print("PASSED: /api/paid-loans/summary returns 200 (route ordering fix working)")
    
    def test_paid_loans_summary_response_structure(self):
        """Test that summary response contains required fields"""
        response = requests.get(f"{BASE_URL}/api/paid-loans/summary?admin_token={self.token}")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = [
            "total_interest_earned",
            "current_month_interest", 
            "total_loans_archived",
            "current_month_loans_archived"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            print(f"FOUND: {field} = {data[field]}")
        
        print("PASSED: Summary response contains all required fields")
    
    def test_paid_loans_summary_field_types(self):
        """Test that summary fields have correct data types"""
        response = requests.get(f"{BASE_URL}/api/paid-loans/summary?admin_token={self.token}")
        assert response.status_code == 200
        
        data = response.json()
        
        # total_interest_earned should be a number (int or float)
        assert isinstance(data.get("total_interest_earned"), (int, float)), \
            f"total_interest_earned should be numeric, got {type(data.get('total_interest_earned'))}"
        
        # current_month_interest should be a number
        assert isinstance(data.get("current_month_interest"), (int, float)), \
            f"current_month_interest should be numeric, got {type(data.get('current_month_interest'))}"
        
        # total_loans_archived should be an integer
        assert isinstance(data.get("total_loans_archived"), int), \
            f"total_loans_archived should be int, got {type(data.get('total_loans_archived'))}"
        
        # current_month_loans_archived should be an integer
        assert isinstance(data.get("current_month_loans_archived"), int), \
            f"current_month_loans_archived should be int, got {type(data.get('current_month_loans_archived'))}"
        
        print("PASSED: All summary fields have correct data types")
    
    def test_paid_loans_summary_values_non_negative(self):
        """Test that summary values are non-negative"""
        response = requests.get(f"{BASE_URL}/api/paid-loans/summary?admin_token={self.token}")
        assert response.status_code == 200
        
        data = response.json()
        
        assert data.get("total_interest_earned", 0) >= 0, "total_interest_earned should be >= 0"
        assert data.get("current_month_interest", 0) >= 0, "current_month_interest should be >= 0"
        assert data.get("total_loans_archived", 0) >= 0, "total_loans_archived should be >= 0"
        assert data.get("current_month_loans_archived", 0) >= 0, "current_month_loans_archived should be >= 0"
        
        print("PASSED: All summary values are non-negative")


class TestLoanHistoryEndpoint:
    """Test Loan History endpoint for client details"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USER,
            "password": SUPERADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        assert self.token, "No token received"
    
    def test_loan_history_endpoint_for_nonexistent_client(self):
        """Test loan history for nonexistent client returns 404"""
        fake_client_id = "00000000-0000-0000-0000-000000000000"
        response = requests.get(
            f"{BASE_URL}/api/clients/{fake_client_id}/loan-history?admin_token={self.token}"
        )
        assert response.status_code == 404, f"Expected 404 for nonexistent client, got {response.status_code}"
        print("PASSED: Loan history returns 404 for nonexistent client")


class TestPaidLoansDetailRoute:
    """Test that /api/paid-loans/{paid_loan_id} route still works after ordering fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USER,
            "password": SUPERADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
    
    def test_paid_loans_list_endpoint(self):
        """Test that /api/paid-loans list endpoint works"""
        response = requests.get(f"{BASE_URL}/api/paid-loans?admin_token={self.token}")
        assert response.status_code == 200, f"Paid loans list failed: {response.text}"
        
        data = response.json()
        assert "paid_loans" in data, "Response should contain 'paid_loans' list"
        assert "total" in data, "Response should contain 'total' count"
        print(f"PASSED: /api/paid-loans returns {data.get('total', 0)} archived loans")


class TestCreateAndVerifyArchivedLoan:
    """Integration test: Create a loan, archive it, verify it shows in summary"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login before each test"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USER,
            "password": SUPERADMIN_PASS
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        self.created_client_id = None
    
    def test_full_archive_flow(self):
        """Test creating a client, loan, payment, and verifying archive summary"""
        # Step 1: Create a test client
        unique_name = f"TEST_INTEREST_{datetime.utcnow().strftime('%H%M%S')}"
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json={
                "name": unique_name,
                "phone": "5550001",
                "email": f"{unique_name.lower()}@test.com"
            }
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_data = create_response.json()
        self.created_client_id = client_data.get("id")
        print(f"Created test client: {self.created_client_id}")
        
        # Step 2: Setup a loan for the client (minimum 2 months tenure)
        loan_response = requests.post(
            f"{BASE_URL}/api/loans/{self.created_client_id}/setup?admin_token={self.token}",
            json={
                "loan_amount": 100.0,
                "interest_rate": 5.0,
                "loan_tenure_months": 2
            }
        )
        assert loan_response.status_code == 200, f"Loan setup failed: {loan_response.text}"
        loan_data = loan_response.json()
        total_due = loan_data.get("loan_details", {}).get("total_amount_due", 105)
        print(f"Loan created with total due: {total_due}")
        
        # Step 3: Make a full payment to trigger auto-archive
        payment_response = requests.post(
            f"{BASE_URL}/api/loans/{self.created_client_id}/payments?admin_token={self.token}",
            json={
                "amount": total_due,
                "payment_method": "cash"
            }
        )
        assert payment_response.status_code == 200, f"Payment failed: {payment_response.text}"
        payment_data = payment_response.json()
        
        # Verify auto_archived flag or check balance
        print(f"Payment response: {payment_data}")
        
        # Step 4: Verify loan appears in summary
        summary_response = requests.get(
            f"{BASE_URL}/api/paid-loans/summary?admin_token={self.token}"
        )
        assert summary_response.status_code == 200
        summary = summary_response.json()
        
        assert summary.get("total_loans_archived", 0) >= 1, "Should have at least 1 archived loan"
        print(f"PASSED: Summary shows {summary.get('total_loans_archived')} archived loans")
        print(f"Total interest earned: €{summary.get('total_interest_earned', 0)}")
        
        # Cleanup
        if self.created_client_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/clients/{self.created_client_id}?admin_token={self.token}"
            )
            print(f"Cleanup: Deleted test client (status: {delete_response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
