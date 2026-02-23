"""
Test suite for Loan Archive Features - Iteration 31
Tests:
1. Auto-archiving when payment clears outstanding balance
2. GET /api/clients/{client_id}/loan-history - client loan history
3. GET /api/paid-loans - list all archived loans
4. POST /api/loans/{client_id}/archive - manual archive endpoint
5. POST /api/clients - client creation (registration_code bug fix)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://audit-fixes-preview.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPERADMIN_CREDENTIALS = {"username": "karli1987", "password": "nasvakas123"}
ADMIN_CREDENTIALS = {"username": "testadmin", "password": "testpassword"}


class TestAuthentication:
    """Login tests to get admin token"""
    
    def test_superadmin_login(self):
        """Test superadmin login and get token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        print(f"Login response status: {response.status_code}")
        print(f"Login response: {response.json()}")
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        pytest.superadmin_token = data["token"]
        print(f"Superadmin token obtained: {pytest.superadmin_token[:20]}...")


class TestClientCreation:
    """Test client creation - registration_code bug fix"""
    
    def test_create_client_without_registration_code(self):
        """Test that client creation works without registration_code (bug fix verification)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Create a unique client for this test
        unique_name = f"TEST_RegCodeFix_{uuid.uuid4().hex[:8]}"
        client_data = {
            "name": unique_name,
            "phone": f"+372555{uuid.uuid4().hex[:4]}",
            "email": f"test_{uuid.uuid4().hex[:6]}@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={token}",
            json=client_data
        )
        print(f"Create client response status: {response.status_code}")
        print(f"Create client response: {response.text}")
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        data = response.json()
        assert data["name"] == unique_name
        assert "id" in data
        pytest.test_client_id = data["id"]
        print(f"Created client ID: {pytest.test_client_id}")
        
    def test_create_second_client_without_registration_code(self):
        """Test that multiple clients can be created without registration_code (sparse index fix)"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        unique_name = f"TEST_RegCodeFix2_{uuid.uuid4().hex[:8]}"
        client_data = {
            "name": unique_name,
            "phone": f"+372556{uuid.uuid4().hex[:4]}",
            "email": f"test2_{uuid.uuid4().hex[:6]}@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={token}",
            json=client_data
        )
        print(f"Create second client response status: {response.status_code}")
        
        # This should NOT fail with duplicate key error for registration_code
        assert response.status_code == 200, f"Second client creation failed (duplicate key bug?): {response.text}"
        pytest.test_client_id_2 = response.json()["id"]
        print(f"Created second client ID: {pytest.test_client_id_2}")


class TestLoanSetupAndAutoArchive:
    """Test loan setup and auto-archive functionality"""
    
    def test_setup_loan_for_client(self):
        """Setup a loan for testing auto-archive"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # First create a fresh test client
        unique_name = f"TEST_AutoArchive_{uuid.uuid4().hex[:8]}"
        client_data = {
            "name": unique_name,
            "phone": f"+372557{uuid.uuid4().hex[:4]}",
            "email": f"autoarchive_{uuid.uuid4().hex[:6]}@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={token}",
            json=client_data
        )
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        pytest.auto_archive_client_id = client_id
        print(f"Created auto-archive test client: {client_id}")
        
        # Setup a small loan (100 EUR) for quick testing
        loan_data = {
            "loan_amount": 100,
            "interest_rate": 0,  # No interest for simple testing
            "loan_tenure_months": 1,
            "loan_given_date": datetime.utcnow().isoformat(),
            "loan_plan_id": None
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/setup?admin_token={token}",
            json=loan_data
        )
        print(f"Loan setup response status: {response.status_code}")
        print(f"Loan setup response: {response.text}")
        
        assert response.status_code == 200, f"Loan setup failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"Loan setup successful: {data}")
        
    def test_verify_loan_setup(self):
        """Verify the loan was set up correctly"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        client_id = pytest.auto_archive_client_id
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_token={token}"
        )
        assert response.status_code == 200
        client = response.json()
        print(f"Client after loan setup: outstanding_balance={client.get('outstanding_balance')}, loan_amount={client.get('loan_amount')}")
        
        assert client.get("outstanding_balance", 0) > 0 or client.get("total_amount_due", 0) > 0, "Loan not set up properly"
        pytest.outstanding_before_payment = client.get("outstanding_balance", 0) or client.get("total_amount_due", 0)
        
    def test_full_payment_triggers_auto_archive(self):
        """Test that making a full payment auto-archives the loan"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        client_id = pytest.auto_archive_client_id
        outstanding = pytest.outstanding_before_payment
        
        # Make full payment to clear the balance
        payment_data = {
            "amount": outstanding,
            "payment_method": "cash",
            "notes": "Full payment to test auto-archive"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/payments?admin_token={token}",
            json=payment_data
        )
        print(f"Payment response status: {response.status_code}")
        print(f"Payment response: {response.text}")
        
        assert response.status_code == 200, f"Payment recording failed: {response.text}"
        data = response.json()
        
        # Key assertion: auto_archived field should be present and truthy
        assert "auto_archived" in data, f"auto_archived field missing from response: {data}"
        assert data["auto_archived"] is not None, "auto_archived should not be None when loan is fully paid"
        assert data["auto_archived"].get("archived") == True, f"Loan should be auto-archived: {data['auto_archived']}"
        print(f"Auto-archive confirmed: {data['auto_archived']}")


class TestPaidLoansEndpoint:
    """Test GET /api/paid-loans endpoint"""
    
    def test_get_paid_loans_list(self):
        """Test retrieving list of all archived loans"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/paid-loans?admin_token={token}"
        )
        print(f"Paid loans response status: {response.status_code}")
        print(f"Paid loans response: {response.text[:500] if len(response.text) > 500 else response.text}")
        
        assert response.status_code == 200, f"Failed to get paid loans: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "paid_loans" in data, "Response should have 'paid_loans' field"
        assert "total" in data, "Response should have 'total' field"
        assert isinstance(data["paid_loans"], list), "paid_loans should be a list"
        
        print(f"Total archived loans: {data['total']}")
        if len(data["paid_loans"]) > 0:
            loan = data["paid_loans"][0]
            print(f"Sample archived loan fields: {list(loan.keys())}")
            

class TestClientLoanHistory:
    """Test GET /api/clients/{client_id}/loan-history endpoint"""
    
    def test_get_client_loan_history(self):
        """Test retrieving loan history for a specific client"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Use the auto-archive client which should have archived loan
        client_id = pytest.auto_archive_client_id
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/loan-history?admin_token={token}"
        )
        print(f"Loan history response status: {response.status_code}")
        print(f"Loan history response: {response.text}")
        
        assert response.status_code == 200, f"Failed to get loan history: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "client_id" in data, "Response should have 'client_id' field"
        assert "loan_history" in data, "Response should have 'loan_history' field"
        assert "total_loans" in data, "Response should have 'total_loans' field"
        
        # Since we just auto-archived, should have at least 1 loan in history
        assert len(data["loan_history"]) >= 1, f"Should have at least 1 archived loan, got {len(data['loan_history'])}"
        print(f"Client has {data['total_loans']} archived loans")
        
    def test_get_loan_history_for_client_with_known_history(self):
        """Test loan history for a known test client with archived loans"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Use known test client from previous iterations
        test_client_ids = [
            "3258e359-ed83-4e3d-9352-f15addf78966",  # TEST_Archive_Client
            "00e22cde-07b3-4ae1-8052-a71854d8e7ed",  # TEST_UI_Archive_Client
            "83e8286a-92f8-4081-989b-88bba77bf877"   # AUTO_ARCHIVE_TEST
        ]
        
        for client_id in test_client_ids:
            response = requests.get(
                f"{BASE_URL}/api/clients/{client_id}/loan-history?admin_token={token}"
            )
            if response.status_code == 200:
                data = response.json()
                print(f"Client {client_id} has {data['total_loans']} archived loans")
                break
            else:
                print(f"Client {client_id} not found or no access")


class TestManualArchive:
    """Test POST /api/loans/{client_id}/archive - manual archive endpoint"""
    
    def test_setup_and_manual_archive(self):
        """Test manual archive endpoint for a fully paid loan"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Create a test client
        unique_name = f"TEST_ManualArchive_{uuid.uuid4().hex[:8]}"
        client_data = {
            "name": unique_name,
            "phone": f"+372558{uuid.uuid4().hex[:4]}",
            "email": f"manual_archive_{uuid.uuid4().hex[:6]}@example.com"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={token}",
            json=client_data
        )
        assert response.status_code == 200
        client_id = response.json()["id"]
        print(f"Created manual archive test client: {client_id}")
        
        # Setup a loan
        loan_data = {
            "loan_amount": 50,
            "interest_rate": 0,
            "loan_tenure_months": 1,
            "loan_given_date": datetime.utcnow().isoformat()
        }
        
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/setup?admin_token={token}",
            json=loan_data
        )
        assert response.status_code == 200, f"Loan setup failed: {response.text}"
        
        # Get outstanding balance
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_token={token}"
        )
        outstanding = response.json().get("outstanding_balance", 50)
        
        # Pay off the loan first (manual archive requires 0 outstanding)
        payment_data = {
            "amount": outstanding,
            "payment_method": "cash",
            "notes": "Full payment for manual archive test"
        }
        
        # Note: This will auto-archive due to our new feature, but let's still test the endpoint
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/payments?admin_token={token}",
            json=payment_data
        )
        assert response.status_code == 200
        
        # Now try manual archive (may return "No loan data" since auto-archive already happened)
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/archive?admin_token={token}"
        )
        print(f"Manual archive response status: {response.status_code}")
        print(f"Manual archive response: {response.text}")
        
        # Should succeed (200) or say no data to archive
        assert response.status_code in [200, 400], f"Unexpected response: {response.text}"
        

class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_clients(self):
        """Clean up test clients created during testing"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=SUPERADMIN_CREDENTIALS
        )
        if response.status_code != 200:
            print("Skipping cleanup - could not authenticate")
            return
            
        token = response.json()["token"]
        
        # Get all clients and delete TEST_ prefixed ones
        response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={token}"
        )
        if response.status_code != 200:
            print("Could not fetch clients for cleanup")
            return
            
        clients = response.json().get("clients", [])
        test_clients = [c for c in clients if c.get("name", "").startswith("TEST_")]
        
        print(f"Found {len(test_clients)} test clients to cleanup")
        for client in test_clients:
            response = requests.delete(
                f"{BASE_URL}/api/clients/{client['id']}?admin_token={token}"
            )
            if response.status_code == 200:
                print(f"Deleted test client: {client['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
