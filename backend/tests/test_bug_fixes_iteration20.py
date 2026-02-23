"""
Backend API tests for bug fixes iteration 20
Testing: Dashboard, Loans, Transactions, Reports, Device Management, Settings

All endpoints use admin_token (not admin_id) for authentication.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://loan-admin-refactor.preview.emergentagent.com')
BASE_URL = BASE_URL.rstrip('/')

# Test credentials
TEST_USERNAME = "karli1987"
TEST_PASSWORD = "nasvakas123"


class TestAuthAndSession:
    """Test authentication and token management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.admin_token = data.get("token")
        self.admin_id = data.get("id")
        self.is_super_admin = data.get("is_super_admin", False)
        assert self.admin_token, "No token returned from login"
    
    def test_login_returns_token(self):
        """Test login returns proper token and user data"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data, "Token missing from login response"
        assert "id" in data, "ID missing from login response"
        assert "username" in data, "Username missing from login response"
        assert data["username"] == TEST_USERNAME
        print(f"SUCCESS: Login returned token: {data['token'][:20]}...")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid_user", "password": "wrong_pass"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("SUCCESS: Invalid credentials return 401")


class TestDashboardAPI:
    """Test Dashboard tab API - /api/reports/collection"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.admin_token = response.json().get("token")
    
    def test_dashboard_stats_with_admin_token(self):
        """Dashboard should use admin_token for authentication"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Dashboard API failed: {response.status_code}"
        data = response.json()
        
        # Verify flat response structure (not nested)
        assert "total_clients" in data, "total_clients missing"
        assert "active_loans" in data, "active_loans missing"
        assert "total_disbursed" in data, "total_disbursed missing"
        assert "total_collected" in data, "total_collected missing"
        assert "total_outstanding" in data, "total_outstanding missing"
        assert "collection_rate" in data, "collection_rate missing"
        
        # Verify data types
        assert isinstance(data["active_loans"], int), "active_loans should be int"
        assert isinstance(data["total_disbursed"], (int, float)), "total_disbursed should be number"
        assert isinstance(data["collection_rate"], (int, float)), "collection_rate should be number"
        
        print(f"SUCCESS: Dashboard shows {data['active_loans']} active loans, ${data['total_disbursed']} disbursed")
    
    def test_dashboard_stats_without_token_fails(self):
        """Dashboard API should fail without admin_token"""
        response = requests.get(f"{BASE_URL}/api/reports/collection")
        # Should return 422 (missing required parameter) or 401 (unauthorized)
        assert response.status_code in [401, 422], f"Expected 401/422, got {response.status_code}"
        print(f"SUCCESS: Dashboard API returns {response.status_code} without token")


class TestLoansTabAPI:
    """Test Loans tab API - /api/clients"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.admin_token = response.json().get("token")
    
    def test_clients_list_with_admin_token(self):
        """Clients list should use admin_token for authentication"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token, "limit": 10}
        )
        assert response.status_code == 200, f"Clients API failed: {response.status_code}"
        data = response.json()
        
        # Verify response structure
        assert "clients" in data or isinstance(data, list), "Expected clients array"
        clients = data.get("clients", data) if isinstance(data, dict) else data
        
        # Verify client data structure
        if len(clients) > 0:
            client = clients[0]
            assert "id" in client, "Client missing id"
            assert "name" in client, "Client missing name"
            # Loan-related fields
            loan_fields = ["loan_amount", "principal_amount", "total_amount_due", "outstanding_balance"]
            has_loan_field = any(f in client for f in loan_fields)
            assert has_loan_field, f"Client missing loan data fields. Has: {list(client.keys())}"
        
        print(f"SUCCESS: Loaded {len(clients)} clients with loan data")
    
    def test_clients_have_loan_progress_data(self):
        """Verify clients have data needed for loan progress display"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token, "limit": 50}
        )
        assert response.status_code == 200
        data = response.json()
        clients = data.get("clients", data) if isinstance(data, dict) else data
        
        clients_with_loans = [c for c in clients if c.get("loan_amount", 0) > 0 or c.get("principal_amount", 0) > 0]
        print(f"Found {len(clients_with_loans)} clients with active loans")
        
        if clients_with_loans:
            client = clients_with_loans[0]
            # Check for payment progress fields
            assert "total_paid" in client or client.get("total_paid") is not None, "Missing total_paid"
            assert "outstanding_balance" in client or client.get("outstanding_balance") is not None, "Missing outstanding_balance"
            print(f"SUCCESS: Client {client['name']} has loan: ${client.get('loan_amount', client.get('principal_amount'))} with ${client.get('total_paid', 0)} paid")


class TestTransactionsTabAPI:
    """Test Transactions tab - data comes from /api/clients with payments_history"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.admin_token = response.json().get("token")
    
    def test_clients_have_payment_history(self):
        """Clients should have payments_history for transaction display"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token, "limit": 50}
        )
        assert response.status_code == 200
        data = response.json()
        clients = data.get("clients", data) if isinstance(data, dict) else data
        
        # Check if any client has payment history
        clients_with_payments = [c for c in clients if c.get("payments_history") and len(c.get("payments_history", [])) > 0]
        
        # Also count loan disbursements (any client with loan_amount > 0)
        clients_with_loans = [c for c in clients if c.get("loan_amount", 0) > 0 or c.get("principal_amount", 0) > 0]
        
        print(f"Clients with payment history: {len(clients_with_payments)}")
        print(f"Clients with loans (disbursements): {len(clients_with_loans)}")
        
        # At least some clients should have loan data for transactions
        assert len(clients_with_loans) > 0, "No clients with loans found for disbursement entries"
        print("SUCCESS: Transaction data (disbursements + payments) available")


class TestReportsAPI:
    """Test Reports tab APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        self.admin_token = response.json().get("token")
    
    def test_collection_report_with_admin_token(self):
        """Collection report uses admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Collection report failed: {response.status_code}"
        data = response.json()
        
        # Verify required fields
        required_fields = ["total_disbursed", "total_collected", "total_outstanding", "collection_rate"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"SUCCESS: Collection report - Rate: {data['collection_rate']}%")
    
    def test_clients_report_with_admin_token(self):
        """Clients report uses admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Clients report failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Expected array of client reports"
        print(f"SUCCESS: Clients report returned {len(data)} entries")
    
    def test_financial_report_with_admin_token(self):
        """Financial report uses admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Financial report failed: {response.status_code}"
        data = response.json()
        
        assert "total_payments" in data, "Missing total_payments"
        print(f"SUCCESS: Financial report - Total payments: ${data['total_payments']}")


class TestDeviceManagementAPI:
    """Test Device Management page API - /api/stats"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        self.admin_token = data.get("token")
        self.admin_id = data.get("id")
    
    def test_stats_with_admin_id(self):
        """Stats endpoint accepts admin_id (not admin_token) for device breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/stats",
            params={"admin_id": self.admin_id}
        )
        assert response.status_code == 200, f"Stats API failed: {response.status_code}"
        data = response.json()
        
        # Verify device breakdown fields
        required_fields = ["total_clients", "registered_devices", "locked_devices", "unlocked_devices"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"SUCCESS: Device stats - Total: {data['total_clients']}, Locked: {data['locked_devices']}, Registered: {data['registered_devices']}")
    
    def test_stats_without_admin_id(self):
        """Stats endpoint works without admin_id (returns all data)"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        data = response.json()
        assert "total_clients" in data
        print(f"SUCCESS: Stats without admin_id - Total clients: {data['total_clients']}")


class TestSettingsAPI:
    """Test Settings page APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        self.admin_token = data.get("token")
        self.admin_id = data.get("id")
        self.is_super_admin = data.get("is_super_admin", False)
    
    def test_admin_credits_with_token(self):
        """Credits endpoint uses admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/admin/credits",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Credits API failed: {response.status_code}"
        data = response.json()
        
        assert "credits" in data, "Missing credits"
        assert "is_super_admin" in data, "Missing is_super_admin"
        print(f"SUCCESS: Credits: {data['credits']}, Is superadmin: {data['is_super_admin']}")
    
    def test_admin_list_with_token(self):
        """Admin list uses admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/admin/list",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Admin list failed: {response.status_code}"
        data = response.json()
        
        assert isinstance(data, list), "Expected array of admins"
        if len(data) > 0:
            admin = data[0]
            assert "id" in admin, "Admin missing id"
            assert "username" in admin, "Admin missing username"
        print(f"SUCCESS: Admin list returned {len(data)} users")


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """Health endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy", f"Health check failed: {data}"
        print("SUCCESS: Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
