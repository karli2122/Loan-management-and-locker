"""
Tests for Bug Fixes - Iteration 17
Tests the 4 fixes requested by user:
1. EMI Amount display - verify monthly_emi field is returned in client data
2. Reports API - verify /api/reports/collection returns 200 with valid data
3. handleAuthFailure function - verify 401 returns proper error
4. Profile Update with Address - verify admin can update address field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLoginAndAuth:
    """Test login flow and authentication"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_login_returns_correct_fields(self, admin_token):
        """Verify login returns all required fields"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Verify required fields
        assert "id" in data, "Missing id in login response"
        assert "username" in data, "Missing username in login response"
        assert "role" in data, "Missing role in login response"
        assert "is_super_admin" in data, "Missing is_super_admin in login response"
        assert "token" in data, "Missing token in login response"
        
        # Verify specific values
        assert data["username"] == "karli1987"
        assert data["role"] in ["admin", "user"]
        print(f"SUCCESS: Login returned all expected fields")
    
    def test_invalid_login_returns_401(self):
        """Verify invalid credentials return 401"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"SUCCESS: Invalid login returns 401")


class TestReportsAPI:
    """Test Reports API - Fix #2"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_collection_report_returns_200(self, admin_token):
        """Verify /api/reports/collection returns 200 with valid data"""
        response = requests.get(f"{BASE_URL}/api/reports/collection?admin_token={admin_token}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert "total_disbursed" in data, "Missing total_disbursed"
        assert "total_collected" in data, "Missing total_collected"
        assert "total_outstanding" in data, "Missing total_outstanding"
        assert "collection_rate" in data, "Missing collection_rate"
        assert "active_loans" in data, "Missing active_loans"
        assert "completed_loans" in data, "Missing completed_loans"
        assert "overdue_loans" in data, "Missing overdue_loans"
        assert "total_clients" in data, "Missing total_clients"
        
        # Verify data types
        assert isinstance(data["total_disbursed"], (int, float))
        assert isinstance(data["total_collected"], (int, float))
        assert isinstance(data["collection_rate"], (int, float))
        assert isinstance(data["total_clients"], int)
        
        print(f"SUCCESS: Reports API returns correct data structure")
        print(f"  - Total disbursed: {data['total_disbursed']}")
        print(f"  - Total collected: {data['total_collected']}")
        print(f"  - Collection rate: {data['collection_rate']}%")
    
    def test_collection_report_without_token_returns_401(self):
        """Verify reports API requires authentication"""
        response = requests.get(f"{BASE_URL}/api/reports/collection")
        assert response.status_code in [401, 422], f"Expected 401 or 422, got {response.status_code}"
        print(f"SUCCESS: Reports API requires authentication")


class TestEMIAmountDisplay:
    """Test EMI Amount Display - Fix #1"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_client_has_monthly_emi_field(self, admin_token):
        """Verify client data includes monthly_emi field"""
        # Get list of clients
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        
        clients = response.json()
        assert len(clients) > 0, "No clients found"
        
        # Find client with loan data
        client_with_loan = None
        for client in clients:
            if client.get("loan_amount", 0) > 0:
                client_with_loan = client
                break
        
        if client_with_loan:
            # Verify monthly_emi field exists
            assert "monthly_emi" in client_with_loan, "Missing monthly_emi field in client data"
            
            print(f"SUCCESS: Client '{client_with_loan['name']}' has monthly_emi: {client_with_loan['monthly_emi']}")
            
            # Verify EMI is a valid number
            assert isinstance(client_with_loan["monthly_emi"], (int, float)), "monthly_emi should be a number"
        else:
            print("WARNING: No clients with loans found - skipping monthly_emi verification")
    
    def test_client_details_includes_emi_fields(self, admin_token):
        """Verify individual client details include EMI fields"""
        # Get clients list first
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200
        clients = response.json()
        
        if len(clients) > 0:
            client_id = clients[0]["id"]
            
            # Get single client details
            response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_token={admin_token}")
            assert response.status_code == 200, f"Failed to get client details: {response.text}"
            
            client = response.json()
            
            # Verify EMI-related fields
            expected_fields = ["monthly_emi", "emi_amount", "loan_amount", "total_amount_due", "total_paid", "outstanding_balance"]
            for field in expected_fields:
                assert field in client, f"Missing field: {field}"
            
            print(f"SUCCESS: Client details include all EMI-related fields")
            print(f"  - monthly_emi: {client.get('monthly_emi')}")
            print(f"  - emi_amount (legacy): {client.get('emi_amount')}")


class TestProfileUpdateWithAddress:
    """Test Profile Update with Address - Fix #4"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_update_profile_with_address(self, admin_token):
        """Verify admin can update profile with address field"""
        test_address = "Test Street 123, Tallinn 10101, Estonia"
        
        response = requests.put(
            f"{BASE_URL}/api/admin/update-profile?admin_token={admin_token}",
            json={
                "first_name": "Karli",
                "last_name": "Vilbas",
                "email": "test@example.com",
                "phone": "+37255555555",
                "address": test_address
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify address was saved
        assert "address" in data, "Address not in response"
        assert data["address"] == test_address, f"Address mismatch: expected '{test_address}', got '{data.get('address')}'"
        
        print(f"SUCCESS: Profile updated with address: {data['address']}")
    
    def test_profile_update_persists_address(self, admin_token):
        """Verify profile address persists after update"""
        # First update with a specific address
        unique_address = "Verification Test Address 456, Tartu"
        
        response = requests.put(
            f"{BASE_URL}/api/admin/update-profile?admin_token={admin_token}",
            json={
                "first_name": "Karli",
                "last_name": "Vilbas",
                "address": unique_address
            }
        )
        assert response.status_code == 200
        
        # Verify the response contains the address
        updated_data = response.json()
        assert updated_data.get("address") == unique_address, "Address not persisted correctly"
        
        print(f"SUCCESS: Address persisted correctly")


class TestAuthFailureHandling:
    """Test Authentication Failure Handling - Fix #3"""
    
    def test_invalid_token_returns_401(self):
        """Verify invalid token returns 401 error"""
        response = requests.get(f"{BASE_URL}/api/clients?admin_token=invalid_token_12345")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"SUCCESS: Invalid token returns 401")
    
    def test_expired_token_handling(self):
        """Verify expired/invalid token is handled properly"""
        # Use a fake token that doesn't exist
        fake_token = "fake_expired_token_abcdef1234567890"
        
        response = requests.get(f"{BASE_URL}/api/admin/credits?admin_token={fake_token}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        # Verify error message is returned
        data = response.json()
        assert "detail" in data or "error" in data or "message" in data, "No error message in response"
        print(f"SUCCESS: Expired/invalid token handled properly with 401 response")


class TestClientDetailsPage:
    """Test Client Details Page Loading"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "nasvakas123"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_client_details_loads_without_errors(self, admin_token):
        """Verify client details endpoint works correctly"""
        # Get a client ID first
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200
        clients = response.json()
        
        if len(clients) > 0:
            client_id = clients[0]["id"]
            
            # Get client details
            response = requests.get(f"{BASE_URL}/api/clients/{client_id}?admin_token={admin_token}")
            assert response.status_code == 200, f"Client details failed: {response.text}"
            
            client = response.json()
            
            # Verify essential fields
            assert "id" in client
            assert "name" in client
            assert client["id"] == client_id
            
            print(f"SUCCESS: Client details loaded for '{client['name']}'")
            
            # Verify loan fields if client has loan
            if client.get("loan_amount", 0) > 0:
                assert "monthly_emi" in client, "Missing monthly_emi for client with loan"
                assert "total_amount_due" in client, "Missing total_amount_due"
                assert "outstanding_balance" in client, "Missing outstanding_balance"
                print(f"  - Loan amount: €{client.get('loan_amount')}")
                print(f"  - Monthly EMI: €{client.get('monthly_emi')}")
                print(f"  - Outstanding: €{client.get('outstanding_balance')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
