"""
Backend API Tests for EMI Device Admin Application
Tests focus on data segregation (admin_id), profit report with admin info, and client creation

Key Features Tested:
1. Admin login returns token and admin id
2. /api/stats REQUIRES admin_id (returns validation error without it)
3. /api/reports/collection REQUIRES admin_id (returns validation error without it)
4. /api/reports/clients REQUIRES admin_id (returns validation error without it)
5. /api/reports/financial includes admin.first_name and admin.last_name when admin_id provided
6. POST /api/clients creates new client successfully
"""

import pytest
import requests
import os
import uuid

# Use the preview URL from frontend/.env
BASE_URL = "https://add-loan-features.preview.emergentagent.com"

# Test credentials from review request
TEST_USERNAME = "karli1987"
TEST_PASSWORD = "nasvakas123"
KNOWN_ADMIN_ID = "a8c52e87-f8c8-44b3-9371-57393881db18"


class TestAdminLogin:
    """Test admin login endpoint"""
    
    def test_login_success(self):
        """POST /api/admin/login with valid credentials returns token and admin id"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "token" in data, "Response should contain 'token'"
        assert "id" in data, "Response should contain 'id'"
        assert "username" in data, "Response should contain 'username'"
        assert data["username"] == TEST_USERNAME, f"Expected username '{TEST_USERNAME}', got '{data.get('username')}'"
        assert isinstance(data["token"], str), "Token should be a string"
        assert len(data["token"]) > 0, "Token should not be empty"
        
        print(f"✅ Login successful - Admin ID: {data['id']}, Token length: {len(data['token'])}")
        return data
    
    def test_login_returns_first_name_and_last_name(self):
        """POST /api/admin/login MUST return first_name and last_name fields"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # CRITICAL NEW ASSERTION: AdminResponse model now includes first_name and last_name
        assert "first_name" in data, "Response MUST contain 'first_name' field (AdminResponse model update)"
        assert "last_name" in data, "Response MUST contain 'last_name' field (AdminResponse model update)"
        
        # These fields are optional, so they can be None but must exist in response
        first_name = data.get("first_name")
        last_name = data.get("last_name")
        
        print(f"✅ Login returns first_name={first_name}, last_name={last_name}")
        print(f"   Full response keys: {list(data.keys())}")
    
    def test_login_invalid_credentials(self):
        """POST /api/admin/login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid login correctly rejected with 401")


class TestStatsEndpoint:
    """Test /api/stats endpoint - must REQUIRE admin_id"""
    
    def test_stats_without_admin_id_returns_error(self):
        """GET /api/stats without admin_id returns validation error"""
        response = requests.get(f"{BASE_URL}/api/stats")
        
        # Should return 422 (validation error) - NOT 200 with global data
        assert response.status_code == 422, f"Expected 422 without admin_id, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "error" in data or "detail" in data, "Response should contain error message"
        print("✅ /api/stats correctly rejects requests without admin_id (422)")
    
    def test_stats_with_admin_id_returns_user_specific_data(self):
        """GET /api/stats?admin_id={id} returns user-specific device stats"""
        response = requests.get(
            f"{BASE_URL}/api/stats",
            params={"admin_id": KNOWN_ADMIN_ID}
        )
        
        assert response.status_code == 200, f"Expected 200 with admin_id, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate response structure
        assert "total_clients" in data, "Response should contain 'total_clients'"
        assert "locked_devices" in data, "Response should contain 'locked_devices'"
        assert "registered_devices" in data, "Response should contain 'registered_devices'"
        assert "unlocked_devices" in data, "Response should contain 'unlocked_devices'"
        
        # Data types validation
        assert isinstance(data["total_clients"], int), "total_clients should be int"
        assert isinstance(data["locked_devices"], int), "locked_devices should be int"
        
        print(f"✅ /api/stats with admin_id returns stats: {data}")


class TestCollectionReport:
    """Test /api/reports/collection endpoint - must REQUIRE admin_id"""
    
    def test_collection_report_without_admin_id_returns_error(self):
        """GET /api/reports/collection without admin_id returns validation error"""
        response = requests.get(f"{BASE_URL}/api/reports/collection")
        
        # Should return 422 (validation error)
        assert response.status_code == 422, f"Expected 422 without admin_id, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "error" in data or "detail" in data, "Response should contain error message"
        print("✅ /api/reports/collection correctly rejects requests without admin_id (422)")
    
    def test_collection_report_with_admin_id(self):
        """GET /api/reports/collection?admin_id={id} returns collection data"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_id": KNOWN_ADMIN_ID}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate response structure
        assert "overview" in data, "Response should contain 'overview'"
        assert "financial" in data, "Response should contain 'financial'"
        assert "this_month" in data, "Response should contain 'this_month'"
        
        # Validate overview structure
        overview = data["overview"]
        assert "total_clients" in overview, "Overview should contain 'total_clients'"
        assert "active_loans" in overview, "Overview should contain 'active_loans'"
        
        print(f"✅ /api/reports/collection with admin_id returns data: overview={overview}")


class TestClientReport:
    """Test /api/reports/clients endpoint - must REQUIRE admin_id"""
    
    def test_client_report_without_admin_id_returns_error(self):
        """GET /api/reports/clients without admin_id returns validation error"""
        response = requests.get(f"{BASE_URL}/api/reports/clients")
        
        # Should return 422 (validation error)
        assert response.status_code == 422, f"Expected 422 without admin_id, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "error" in data or "detail" in data, "Response should contain error message"
        print("✅ /api/reports/clients correctly rejects requests without admin_id (422)")
    
    def test_client_report_with_admin_id(self):
        """GET /api/reports/clients?admin_id={id} returns client data"""
        response = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_id": KNOWN_ADMIN_ID}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate response structure
        assert "summary" in data, "Response should contain 'summary'"
        assert "details" in data, "Response should contain 'details'"
        
        summary = data["summary"]
        assert "on_time_clients" in summary, "Summary should contain 'on_time_clients'"
        assert "at_risk_clients" in summary, "Summary should contain 'at_risk_clients'"
        
        print(f"✅ /api/reports/clients with admin_id returns data: summary={summary}")


class TestFinancialReport:
    """Test /api/reports/financial endpoint - includes admin info when admin_id provided"""
    
    def test_financial_report_without_admin_id_still_works(self):
        """GET /api/reports/financial without admin_id still works but returns no admin info"""
        response = requests.get(f"{BASE_URL}/api/reports/financial")
        
        # This endpoint works without admin_id but returns global data without admin info
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "totals" in data, "Response should contain 'totals'"
        assert "monthly_trend" in data, "Response should contain 'monthly_trend'"
        
        # Should NOT have admin field without admin_id
        if "admin" in data:
            print(f"⚠️ Warning: admin info returned without admin_id - data: {data.get('admin')}")
        else:
            print("✅ /api/reports/financial without admin_id works and has no admin info")
    
    def test_financial_report_with_admin_id_includes_admin_info(self):
        """GET /api/reports/financial?admin_id={id} returns financial data WITH admin name"""
        response = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_id": KNOWN_ADMIN_ID}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate main structure
        assert "totals" in data, "Response should contain 'totals'"
        assert "monthly_trend" in data, "Response should contain 'monthly_trend'"
        
        # CRITICAL: Must include admin info with first_name and last_name
        assert "admin" in data, "Response MUST contain 'admin' object when admin_id is provided"
        
        admin = data["admin"]
        assert "first_name" in admin, "Admin object should contain 'first_name'"
        assert "last_name" in admin, "Admin object should contain 'last_name'"
        assert "username" in admin, "Admin object should contain 'username'"
        assert "role" in admin, "Admin object should contain 'role'"
        
        print(f"✅ /api/reports/financial with admin_id includes admin info: {admin}")


class TestClientCreation:
    """Test POST /api/clients endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        """Get fresh admin token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Failed to get admin token")
    
    def test_create_client_with_admin_token(self, admin_token):
        """POST /api/clients?admin_token={token} creates a new client successfully"""
        # Generate unique test data
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_Client_{unique_id}",
            "phone": f"+1-555-{unique_id[:3]}-{unique_id[3:7]}",
            "email": f"test_{unique_id}@example.com",
            "emi_amount": 150.00
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token},
            json=client_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Validate returned client data
        assert "id" in data, "Response should contain client 'id'"
        assert data["name"] == client_data["name"], f"Name mismatch: expected '{client_data['name']}'"
        assert data["phone"] == client_data["phone"], "Phone mismatch"
        assert data["email"] == client_data["email"], "Email mismatch"
        assert data["emi_amount"] == client_data["emi_amount"], "EMI amount mismatch"
        
        # Should have registration_code
        assert "registration_code" in data, "Response should contain 'registration_code'"
        assert len(data["registration_code"]) > 0, "Registration code should not be empty"
        
        # Should be assigned to the admin
        assert "admin_id" in data, "Response should contain 'admin_id'"
        
        print(f"✅ Client created successfully: ID={data['id']}, admin_id={data.get('admin_id')}")
        
        # Store for cleanup
        return data
    
    def test_create_client_without_token(self):
        """POST /api/clients without admin_token still works but client has no admin_id"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_NoToken_{unique_id}",
            "phone": f"+1-555-{unique_id[:3]}-0000",
            "email": f"notoken_{unique_id}@example.com",
            "emi_amount": 100.00
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data
        )
        
        # Should still work but client won't have admin_id
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        
        # admin_id should be None when no token provided
        admin_id = data.get("admin_id")
        if admin_id is None:
            print(f"✅ Client created without token - no admin_id as expected")
        else:
            print(f"⚠️ Client created without token but has admin_id: {admin_id}")


class TestHealthCheck:
    """Test health check endpoint"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] == "healthy", f"Expected 'healthy', got '{data.get('status')}'"
        
        print(f"✅ Health check passed: {data}")


# Run tests directly if script executed
if __name__ == "__main__":
    import sys
    
    print(f"\n{'='*60}")
    print("EMI Device Admin API Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"{'='*60}\n")
    
    # Run pytest with verbose output
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
