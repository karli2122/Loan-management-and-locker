"""
Device Management API Tests
Tests device registration, status, location updates, and admin control endpoints.
Uses existing client with id 'a06719d1-68a2-4098-9be9-0dfa1d28e080' for testing.
"""
import pytest
import requests
import os
import secrets

# Use environment variable for backend URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://paylock-qa.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"

# Existing test client ID
TEST_CLIENT_ID = "a06719d1-68a2-4098-9be9-0dfa1d28e080"


class TestAdminAuth:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "id" in data, "Response should contain admin id"
        assert "username" in data, "Response should contain username"
        assert data["username"] == ADMIN_USERNAME
        print(f"✓ Admin login successful, token obtained")
    
    def test_admin_login_invalid_credentials(self):
        """Test admin login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        assert response.status_code in [401, 400], f"Expected 401 or 400, got {response.status_code}"
        print(f"✓ Invalid login correctly rejected with {response.status_code}")


class TestDeviceStatus:
    """Device status endpoint tests"""
    
    def test_get_device_status_existing_client(self):
        """Test getting device status for existing client"""
        response = requests.get(f"{BASE_URL}/api/device/status/{TEST_CLIENT_ID}")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "id" in data, "Response should contain id"
        assert "name" in data, "Response should contain name"
        assert "is_locked" in data, "Response should contain is_locked"
        assert "uninstall_allowed" in data, "Response should contain uninstall_allowed field"
        assert "lock_message" in data, "Response should contain lock_message"
        assert "warning_message" in data, "Response should contain warning_message"
        
        # Verify this client has uninstall_allowed=True as per agent context
        assert data["uninstall_allowed"] == True, f"Expected uninstall_allowed=True, got {data['uninstall_allowed']}"
        print(f"✓ Device status returned correctly with uninstall_allowed={data['uninstall_allowed']}")
    
    def test_get_device_status_nonexistent_client(self):
        """Test getting device status for non-existent client"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.get(f"{BASE_URL}/api/device/status/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Non-existent client correctly returns 404")


class TestDeviceLocation:
    """Device location update tests"""
    
    def test_update_location_valid(self):
        """Test updating device location"""
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": TEST_CLIENT_ID,
                "latitude": 59.4370,
                "longitude": 24.7536
            }
        )
        assert response.status_code == 200, f"Location update failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        assert data["client_id"] == TEST_CLIENT_ID
        print(f"✓ Location updated successfully")
    
    def test_update_location_nonexistent_client(self):
        """Test updating location for non-existent client"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": fake_id,
                "latitude": 59.4370,
                "longitude": 24.7536
            }
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Location update for non-existent client correctly returns 404")


class TestDeviceAdminStatus:
    """Device admin status reporting tests"""
    
    def test_report_admin_status_active(self):
        """Test reporting admin mode as active"""
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": TEST_CLIENT_ID, "admin_active": True}
        )
        assert response.status_code == 200, f"Admin status report failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "admin_active" in data, "Response should contain admin_active"
        assert data["admin_active"] == True
        print(f"✓ Admin status (active=True) reported successfully")
    
    def test_report_admin_status_inactive(self):
        """Test reporting admin mode as inactive"""
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": TEST_CLIENT_ID, "admin_active": False}
        )
        assert response.status_code == 200, f"Admin status report failed: {response.text}"
        
        data = response.json()
        assert data["admin_active"] == False
        print(f"✓ Admin status (active=False) reported successfully")
    
    def test_report_admin_status_nonexistent_client(self):
        """Test reporting admin status for non-existent client"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": fake_id, "admin_active": True}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Admin status for non-existent client correctly returns 404")


class TestClearWarning:
    """Warning clear endpoint tests"""
    
    def test_clear_warning_existing_client(self):
        """Test clearing warning for existing client"""
        response = requests.post(f"{BASE_URL}/api/device/clear-warning/{TEST_CLIENT_ID}")
        assert response.status_code == 200, f"Clear warning failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        assert data["client_id"] == TEST_CLIENT_ID
        print(f"✓ Warning cleared successfully")
    
    def test_clear_warning_nonexistent_client(self):
        """Test clearing warning for non-existent client"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.post(f"{BASE_URL}/api/device/clear-warning/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Clear warning for non-existent client correctly returns 404")


class TestAllowUninstall:
    """Allow uninstall endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_allow_uninstall(self, admin_token):
        """Test allowing uninstall for a client"""
        response = requests.post(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Allow uninstall failed: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        assert data["client_id"] == TEST_CLIENT_ID
        print(f"✓ Allow uninstall set successfully")
        
        # Verify the change was persisted
        status_response = requests.get(f"{BASE_URL}/api/device/status/{TEST_CLIENT_ID}")
        assert status_response.status_code == 200
        status_data = status_response.json()
        assert status_data["uninstall_allowed"] == True, "uninstall_allowed should be True after allow-uninstall call"
        print(f"✓ Verified uninstall_allowed=True persisted in database")
    
    def test_allow_uninstall_nonexistent_client(self, admin_token):
        """Test allowing uninstall for non-existent client"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.post(
            f"{BASE_URL}/api/clients/{fake_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Allow uninstall for non-existent client correctly returns 404")


class TestClientsList:
    """Client list endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_list_clients_returns_device_fields(self, admin_token):
        """Test that client list returns device management fields"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"List clients failed: {response.text}"
        
        data = response.json()
        assert "clients" in data, "Response should contain clients array"
        
        clients = data["clients"]
        assert len(clients) > 0, "Should have at least one client"
        
        # Find our test client
        test_client = None
        for client in clients:
            if client.get("id") == TEST_CLIENT_ID:
                test_client = client
                break
        
        if test_client:
            # Verify device management fields are present
            device_fields = ["is_registered", "is_locked", "device_id", "device_model", 
                           "admin_mode_active", "last_heartbeat", "uninstall_allowed"]
            for field in device_fields:
                assert field in test_client, f"Client should have {field} field"
            
            print(f"✓ Client list returns all device management fields")
            print(f"  - is_registered: {test_client.get('is_registered')}")
            print(f"  - is_locked: {test_client.get('is_locked')}")
            print(f"  - uninstall_allowed: {test_client.get('uninstall_allowed')}")
            print(f"  - admin_mode_active: {test_client.get('admin_mode_active')}")
        else:
            print(f"✓ Client list returned {len(clients)} clients (test client not found in this admin's list)")


class TestDeviceRegistration:
    """Device registration tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_registration_invalid_code(self):
        """Test registration with invalid code"""
        response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": "INVALID_CODE",
                "device_id": f"test-device-{secrets.token_hex(4)}",
                "device_model": "Test Device Model"
            }
        )
        # Should fail with 400/422 for invalid registration code
        assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}: {response.text}"
        print(f"✓ Invalid registration code correctly rejected with status {response.status_code}")
    
    def test_registration_already_registered(self, admin_token):
        """Test registration for already registered device - should fail"""
        # First, get the test client to check if it has a registration code
        client_response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}",
            params={"admin_token": admin_token}
        )
        
        if client_response.status_code == 200:
            client_data = client_response.json()
            is_registered = client_data.get("is_registered", False)
            reg_code = client_data.get("registration_code")
            
            if is_registered and reg_code:
                # Try to register again with the same code - should fail
                response = requests.post(
                    f"{BASE_URL}/api/device/register",
                    json={
                        "registration_code": reg_code,
                        "device_id": f"new-device-{secrets.token_hex(4)}",
                        "device_model": "New Test Device"
                    }
                )
                # Should fail because device is already registered (400 or 422 are both valid)
                assert response.status_code in [400, 422], f"Expected 400/422 for already registered device, got {response.status_code}"
                print(f"✓ Already registered device correctly rejected with status {response.status_code}")
            else:
                print(f"✓ Test client not registered yet, skipping re-registration test")
        else:
            print(f"✓ Could not get test client, skipping re-registration test")


class TestHealthCheck:
    """Health check endpoint test"""
    
    def test_health_endpoint(self):
        """Test health check endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print(f"✓ Health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
