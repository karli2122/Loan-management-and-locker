"""
Backend Tests for Device Owner Mode Feature - Iteration 52

Tests the new Device Owner lock mode feature:
- Generate code with lock_mode=device_owner creates 9-char code
- Generate code with lock_mode=device_admin creates 8-char code  
- Device registration with 9-digit code sets lock_mode=device_owner
- Device registration with 8-digit code sets lock_mode=device_admin
- Device status returns lock_mode, outstanding_balance, monthly_emi fields
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://subscription-tier-1.preview.emergentagent.com")

class TestHealthAndAuth:
    """Test health endpoint and admin authentication"""
    
    def test_health_check(self):
        """Health endpoint should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("PASS: Health endpoint returns healthy")
    
    def test_admin_login(self):
        """Admin login with admin/admin123 credentials"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["username"] == "admin"
        print(f"PASS: Admin login successful, token: {data['token'][:20]}...")


class TestDeviceOwnerCodeGeneration:
    """Test code generation for Device Owner vs Device Admin modes"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def test_client_id(self, admin_token):
        """Create a test client and return its ID"""
        unique_id = str(uuid.uuid4())[:8]
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": f"TEST_DeviceOwner_{unique_id}",
                "phone": f"+1234{unique_id}",
                "email": f"test_deviceowner_{unique_id}@test.com",
                "loan_amount": 500.0,
                "lock_mode": "device_admin"
            }
        )
        if response.status_code != 200:
            pytest.skip(f"Failed to create test client: {response.text}")
        client = response.json()
        print(f"Created test client: {client['id']}")
        return client["id"]
    
    def test_generate_code_device_admin_creates_8_char(self, admin_token, test_client_id):
        """POST /api/clients/{id}/generate-code with lock_mode=device_admin generates 8-char code"""
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code?admin_token={admin_token}&lock_mode=device_admin"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "registration_code" in data
        code = data["registration_code"]
        assert len(code) == 8, f"Expected 8-char code for device_admin, got {len(code)}-char: {code}"
        assert data.get("lock_mode") == "device_admin"
        print(f"PASS: device_admin generates 8-char code: {code}")
        return code
    
    def test_generate_code_device_owner_creates_9_char(self, admin_token, test_client_id):
        """POST /api/clients/{id}/generate-code with lock_mode=device_owner generates 9-char code"""
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code?admin_token={admin_token}&lock_mode=device_owner"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "registration_code" in data
        code = data["registration_code"]
        assert len(code) == 9, f"Expected 9-char code for device_owner, got {len(code)}-char: {code}"
        assert data.get("lock_mode") == "device_owner"
        print(f"PASS: device_owner generates 9-char code: {code}")
        return code


class TestDeviceRegistrationLockMode:
    """Test device registration sets lock_mode based on code length"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def device_admin_client_and_code(self, admin_token):
        """Create client with device_admin code (8-char)"""
        unique_id = str(uuid.uuid4())[:8]
        # Create client
        create_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": f"TEST_DevAdmin_{unique_id}",
                "phone": f"+1111{unique_id}",
                "email": f"test_devadmin_{unique_id}@test.com",
                "loan_amount": 300.0
            }
        )
        if create_resp.status_code != 200:
            pytest.skip(f"Failed to create client: {create_resp.text}")
        
        client_id = create_resp.json()["id"]
        
        # Generate device_admin code (8-char)
        code_resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=device_admin"
        )
        if code_resp.status_code != 200:
            pytest.skip(f"Failed to generate code: {code_resp.text}")
        
        code = code_resp.json()["registration_code"]
        print(f"Created device_admin client {client_id} with 8-char code: {code}")
        return client_id, code
    
    @pytest.fixture
    def device_owner_client_and_code(self, admin_token):
        """Create client with device_owner code (9-char)"""
        unique_id = str(uuid.uuid4())[:8]
        # Create client
        create_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": f"TEST_DevOwner_{unique_id}",
                "phone": f"+2222{unique_id}",
                "email": f"test_devowner_{unique_id}@test.com",
                "loan_amount": 400.0,
                "interest_rate": 10.0
            }
        )
        if create_resp.status_code != 200:
            pytest.skip(f"Failed to create client: {create_resp.text}")
        
        client_id = create_resp.json()["id"]
        
        # Generate device_owner code (9-char)
        code_resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=device_owner"
        )
        if code_resp.status_code != 200:
            pytest.skip(f"Failed to generate code: {code_resp.text}")
        
        code = code_resp.json()["registration_code"]
        print(f"Created device_owner client {client_id} with 9-char code: {code}")
        return client_id, code
    
    def test_register_with_8_digit_code_sets_device_admin(self, device_admin_client_and_code):
        """POST /api/device/register with 8-digit code sets lock_mode=device_admin"""
        client_id, code = device_admin_client_and_code
        
        # Verify code is 8 chars
        assert len(code) == 8, f"Expected 8-char code, got {len(code)}"
        
        # Register device
        register_resp = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": code,
                "device_id": f"TEST_DEVICE_{uuid.uuid4().hex[:8]}",
                "device_model": "Test Phone Admin"
            }
        )
        assert register_resp.status_code == 200, f"Registration failed: {register_resp.text}"
        
        data = register_resp.json()
        assert data.get("lock_mode") == "device_admin", f"Expected lock_mode=device_admin, got {data.get('lock_mode')}"
        assert data.get("is_registered") == True
        print(f"PASS: 8-digit code registration sets lock_mode=device_admin for client {client_id}")
    
    def test_register_with_9_digit_code_sets_device_owner(self, device_owner_client_and_code):
        """POST /api/device/register with 9-digit code sets lock_mode=device_owner"""
        client_id, code = device_owner_client_and_code
        
        # Verify code is 9 chars
        assert len(code) == 9, f"Expected 9-char code, got {len(code)}"
        
        # Register device
        register_resp = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": code,
                "device_id": f"TEST_DEVICE_{uuid.uuid4().hex[:8]}",
                "device_model": "Test Phone Owner"
            }
        )
        assert register_resp.status_code == 200, f"Registration failed: {register_resp.text}"
        
        data = register_resp.json()
        assert data.get("lock_mode") == "device_owner", f"Expected lock_mode=device_owner, got {data.get('lock_mode')}"
        assert data.get("is_registered") == True
        print(f"PASS: 9-digit code registration sets lock_mode=device_owner for client {client_id}")


class TestDeviceStatusFields:
    """Test device status endpoint returns lock_mode, outstanding_balance, monthly_emi"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    @pytest.fixture
    def registered_device_owner_client(self, admin_token):
        """Create and register a device_owner client with loan data"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create client with loan details
        create_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": f"TEST_Status_{unique_id}",
                "phone": f"+3333{unique_id}",
                "email": f"test_status_{unique_id}@test.com",
                "loan_amount": 1000.0,
                "interest_rate": 15.0,
            }
        )
        if create_resp.status_code != 200:
            pytest.skip(f"Failed to create client: {create_resp.text}")
        
        client_id = create_resp.json()["id"]
        
        # Generate device_owner code (9-char)
        code_resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=device_owner"
        )
        if code_resp.status_code != 200:
            pytest.skip(f"Failed to generate code: {code_resp.text}")
        
        code = code_resp.json()["registration_code"]
        
        # Register device
        register_resp = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": code,
                "device_id": f"TEST_DEVICE_{uuid.uuid4().hex[:8]}",
                "device_model": "Test Phone Status"
            }
        )
        if register_resp.status_code != 200:
            pytest.skip(f"Registration failed: {register_resp.text}")
        
        print(f"Created and registered client {client_id} with device_owner mode")
        return client_id
    
    def test_device_status_returns_lock_mode(self, registered_device_owner_client):
        """GET /api/device/status/{id} returns lock_mode field"""
        client_id = registered_device_owner_client
        
        response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        assert "lock_mode" in data, f"Response missing lock_mode field: {data.keys()}"
        assert data["lock_mode"] in ["device_admin", "device_owner"], f"Invalid lock_mode: {data['lock_mode']}"
        print(f"PASS: Device status returns lock_mode={data['lock_mode']}")
    
    def test_device_status_returns_outstanding_balance(self, registered_device_owner_client):
        """GET /api/device/status/{id} returns outstanding_balance field"""
        client_id = registered_device_owner_client
        
        response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "outstanding_balance" in data, f"Response missing outstanding_balance field: {data.keys()}"
        assert isinstance(data["outstanding_balance"], (int, float)), f"outstanding_balance should be numeric"
        print(f"PASS: Device status returns outstanding_balance={data['outstanding_balance']}")
    
    def test_device_status_returns_monthly_emi(self, registered_device_owner_client):
        """GET /api/device/status/{id} returns monthly_emi field"""
        client_id = registered_device_owner_client
        
        response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "monthly_emi" in data, f"Response missing monthly_emi field: {data.keys()}"
        assert isinstance(data["monthly_emi"], (int, float)), f"monthly_emi should be numeric"
        print(f"PASS: Device status returns monthly_emi={data['monthly_emi']}")
    
    def test_device_status_returns_all_required_fields(self, registered_device_owner_client):
        """GET /api/device/status/{id} returns all required fields"""
        client_id = registered_device_owner_client
        
        response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert response.status_code == 200
        
        data = response.json()
        required_fields = ["id", "name", "is_locked", "lock_mode", "outstanding_balance", "monthly_emi"]
        missing_fields = [f for f in required_fields if f not in data]
        
        assert not missing_fields, f"Missing required fields: {missing_fields}"
        print(f"PASS: Device status returns all required fields: {required_fields}")
        print(f"  - id: {data['id']}")
        print(f"  - name: {data['name']}")
        print(f"  - is_locked: {data['is_locked']}")
        print(f"  - lock_mode: {data['lock_mode']}")
        print(f"  - outstanding_balance: {data['outstanding_balance']}")
        print(f"  - monthly_emi: {data['monthly_emi']}")


class TestInvalidInputHandling:
    """Test error handling for invalid inputs"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["token"]
    
    def test_invalid_lock_mode_rejected(self, admin_token):
        """Generate code with invalid lock_mode should be rejected"""
        # First create a client
        unique_id = str(uuid.uuid4())[:8]
        create_resp = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": f"TEST_Invalid_{unique_id}",
                "phone": f"+4444{unique_id}",
                "email": f"test_invalid_{unique_id}@test.com"
            }
        )
        if create_resp.status_code != 200:
            pytest.skip("Failed to create test client")
        
        client_id = create_resp.json()["id"]
        
        # Try to generate code with invalid lock_mode
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=invalid_mode"
        )
        # Should fail with 422 validation error due to regex constraint
        assert response.status_code == 422, f"Expected 422 for invalid lock_mode, got {response.status_code}"
        print("PASS: Invalid lock_mode correctly rejected with 422")
    
    def test_register_with_invalid_code(self):
        """Registration with invalid code should be rejected"""
        response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": "INVALIDCODE123",
                "device_id": "test_device",
                "device_model": "Test Phone"
            }
        )
        # Should fail with 422 validation error
        assert response.status_code == 422, f"Expected 422 for invalid code, got {response.status_code}"
        print("PASS: Invalid registration code correctly rejected")
    
    def test_device_status_nonexistent_client(self):
        """Device status for non-existent client should return 404"""
        response = requests.get(f"{BASE_URL}/api/device/status/nonexistent-client-id-12345")
        assert response.status_code == 404, f"Expected 404 for nonexistent client, got {response.status_code}"
        print("PASS: Non-existent client correctly returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
