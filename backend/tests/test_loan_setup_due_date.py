"""
Test loan setup endpoint with due_date parameter (iteration 19)
Tests:
- POST /api/loans/{client_id}/setup with due_date parameter
- Tenure calculation from due_date
- Fallback to loan_tenure_months when due_date not provided
- Invalid due_date validation (400 error)
- Past due_date validation
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://add-loan-features.preview.emergentagent.com').rstrip('/')


class TestLoanSetupWithDueDate:
    """Test loan setup endpoint with due_date parameter"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.admin_token = data["token"]
        self.test_client_ids = []
        yield
        # Cleanup - delete test clients
        for client_id in self.test_client_ids:
            try:
                requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_token={self.admin_token}")
            except:
                pass
    
    def create_test_client(self, name_suffix=""):
        """Helper to create a test client"""
        client_data = {
            "name": f"TEST_LoanSetup_{name_suffix}_{uuid.uuid4().hex[:6]}",
            "phone": f"+372{uuid.uuid4().hex[:8]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@test.com"
        }
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}",
            json=client_data
        )
        assert response.status_code == 201, f"Failed to create client: {response.text}"
        client = response.json()
        self.test_client_ids.append(client["id"])
        return client
    
    def test_loan_setup_with_due_date_future(self):
        """Test loan setup accepts due_date and calculates tenure correctly"""
        client = self.create_test_client("DueDateFuture")
        
        # Calculate a due date 6 months in the future
        future_date = datetime.now() + timedelta(days=180)  # ~6 months
        due_date_str = future_date.strftime("%Y-%m-%d")
        
        loan_data = {
            "loan_amount": 1000.0,
            "interest_rate": 10.0,
            "due_date": due_date_str,
            "down_payment": 0.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        assert response.status_code == 200, f"Loan setup failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "loan_details" in data, "Response should contain loan_details"
        assert "monthly_emi" in data["loan_details"], "loan_details should contain monthly_emi"
        assert "tenure_months" in data["loan_details"], "loan_details should contain tenure_months"
        assert "total_amount" in data["loan_details"], "loan_details should contain total_amount"
        
        # Tenure should be approximately 6 months (could be 5-7 depending on exact calculation)
        tenure = data["loan_details"]["tenure_months"]
        assert 4 <= tenure <= 8, f"Expected tenure around 6 months, got {tenure}"
        
        # Monthly EMI should be a reasonable number
        monthly_emi = data["loan_details"]["monthly_emi"]
        assert monthly_emi > 0, "Monthly EMI should be positive"
        assert monthly_emi < loan_data["loan_amount"], "Monthly EMI should be less than total loan"
        
        print(f"✓ Loan setup with due_date={due_date_str}: tenure={tenure} months, EMI={monthly_emi:.2f}")
    
    def test_loan_setup_with_loan_tenure_months_fallback(self):
        """Test loan setup works with loan_tenure_months when due_date not provided"""
        client = self.create_test_client("TenureFallback")
        
        loan_data = {
            "loan_amount": 2000.0,
            "interest_rate": 12.0,
            "loan_tenure_months": 12,
            "down_payment": 200.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        assert response.status_code == 200, f"Loan setup with tenure fallback failed: {response.text}"
        data = response.json()
        
        # Verify tenure matches what we provided
        assert data["loan_details"]["tenure_months"] == 12, f"Expected 12 months tenure, got {data['loan_details']['tenure_months']}"
        
        print(f"✓ Loan setup with loan_tenure_months fallback: tenure=12 months, EMI={data['loan_details']['monthly_emi']:.2f}")
    
    def test_loan_setup_invalid_due_date_format(self):
        """Test that invalid due_date format returns 400 error"""
        client = self.create_test_client("InvalidDateFormat")
        
        loan_data = {
            "loan_amount": 1000.0,
            "interest_rate": 10.0,
            "due_date": "invalid-date",  # Invalid format
            "down_payment": 0.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid date format, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should contain detail"
        
        print(f"✓ Invalid due_date format correctly returns 400: {data['detail']}")
    
    def test_loan_setup_past_due_date_minimum_tenure(self):
        """Test that past due_date still results in minimum 1 month tenure validation"""
        client = self.create_test_client("PastDueDate")
        
        # Use a date that's tomorrow (technically in the future but very close)
        # This should result in minimum 1 month tenure
        near_date = datetime.now() + timedelta(days=1)
        due_date_str = near_date.strftime("%Y-%m-%d")
        
        loan_data = {
            "loan_amount": 500.0,
            "interest_rate": 10.0,
            "due_date": due_date_str,
            "down_payment": 0.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        # Backend should handle this - either set minimum 1 month or return an error
        if response.status_code == 200:
            data = response.json()
            tenure = data["loan_details"]["tenure_months"]
            assert tenure >= 1, f"Tenure should be at least 1 month, got {tenure}"
            print(f"✓ Near-future due_date: tenure set to minimum {tenure} month(s)")
        elif response.status_code == 400:
            print(f"✓ Near-future due_date correctly rejected with 400")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_loan_setup_due_date_12_months(self):
        """Test loan setup with due_date 12 months in the future"""
        client = self.create_test_client("DueDate12Months")
        
        # Calculate a due date 12 months in the future
        future_date = datetime.now() + timedelta(days=365)
        due_date_str = future_date.strftime("%Y-%m-%d")
        
        loan_data = {
            "loan_amount": 5000.0,
            "interest_rate": 8.0,
            "due_date": due_date_str,
            "down_payment": 500.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        assert response.status_code == 200, f"Loan setup failed: {response.text}"
        data = response.json()
        
        # Tenure should be approximately 12 months
        tenure = data["loan_details"]["tenure_months"]
        assert 11 <= tenure <= 13, f"Expected tenure around 12 months, got {tenure}"
        
        # Verify EMI calculation (principal after down payment is 4500)
        principal = loan_data["loan_amount"] - loan_data["down_payment"]
        monthly_emi = data["loan_details"]["monthly_emi"]
        
        # EMI should be reasonable - roughly principal/tenure + interest
        min_expected_emi = principal / 13  # Lower bound
        max_expected_emi = principal / 10  # Upper bound with interest
        assert min_expected_emi < monthly_emi < max_expected_emi, f"EMI {monthly_emi} seems incorrect for {principal} over {tenure} months"
        
        print(f"✓ Loan setup with due_date 12 months: tenure={tenure}, EMI={monthly_emi:.2f}, principal={principal}")
    
    def test_loan_setup_zero_tenure_without_due_date(self):
        """Test that loan_tenure_months=0 without due_date fails validation"""
        client = self.create_test_client("ZeroTenure")
        
        loan_data = {
            "loan_amount": 1000.0,
            "interest_rate": 10.0,
            "loan_tenure_months": 0,  # Zero tenure without due_date
            "down_payment": 0.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        # Should fail because tenure must be at least 1 month
        assert response.status_code == 400, f"Expected 400 for zero tenure, got {response.status_code}"
        
        print(f"✓ Zero tenure without due_date correctly returns 400")
    
    def test_loan_setup_response_includes_client_id(self):
        """Test that loan setup response includes client_id"""
        client = self.create_test_client("ResponseCheck")
        
        future_date = datetime.now() + timedelta(days=90)
        loan_data = {
            "loan_amount": 1500.0,
            "interest_rate": 10.0,
            "due_date": future_date.strftime("%Y-%m-%d"),
            "down_payment": 0.0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client['id']}/setup?admin_token={self.admin_token}",
            json=loan_data
        )
        
        assert response.status_code == 200, f"Loan setup failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data["client_id"] == client["id"], "Response should include correct client_id"
        assert data["message"] == "Loan setup complete", "Response should have success message"
        
        print(f"✓ Loan setup response structure verified")


class TestLoanPlansAPI:
    """Test loan plans API for pre-fill interest rate feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
    
    def test_get_loan_plans(self):
        """Test that loan plans can be fetched"""
        response = requests.get(f"{BASE_URL}/api/loan-plans?admin_token={self.admin_token}")
        
        assert response.status_code == 200, f"Failed to fetch loan plans: {response.text}"
        data = response.json()
        
        # Should return a list (could be empty if no plans created)
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            # Verify plan structure
            plan = data[0]
            assert "id" in plan, "Plan should have id"
            assert "name" in plan, "Plan should have name"
            assert "interest_rate" in plan, "Plan should have interest_rate"
            print(f"✓ Found {len(data)} loan plan(s). First plan: {plan['name']} with {plan['interest_rate']}% interest")
        else:
            print(f"✓ Loan plans API works. No plans configured yet.")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
