"""
Loan Device Management API Tests - Testing loan_amount/loan_due_date fields
and device control endpoints (lock, unlock, generate-code, allow-uninstall, etc.)

Tests verify:
1. GET /api/device/status/{client_id} - response has loan_amount and loan_due_date (NOT emi_amount/emi_due_date)
2. POST /api/device/register - resets uninstall_allowed to false
3. POST /api/clients/{client_id}/generate-code - resets uninstall_allowed and is_registered
4. POST /api/clients/{client_id}/allow-uninstall - sets uninstall_allowed to true
5. POST /api/device/report-admin-status - updates admin_mode_active
6. POST /api/clients/{client_id}/lock - locks the device
7. POST /api/clients/{client_id}/unlock - unlocks the device
8. GET /api/device/status/{client_id} - uninstall_allowed=true after allow-uninstall
"""
import pytest
import requests
import os
import secrets

# Use environment variable for backend URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://admin-device-lock.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests"""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")


@pytest.fixture(scope="module")
def test_client(admin_token):
    """Create a test client for testing"""
    unique_suffix = secrets.token_hex(4)
    response = requests.post(
        f"{BASE_URL}/api/clients",
        params={"admin_token": admin_token},
        json={
            "name": f"TEST_LoanDevice_{unique_suffix}",
            "phone": f"+372555{unique_suffix[:6]}",
            "email": f"test_loan_{unique_suffix}@test.com",
            "loan_amount": 1500.50,
            "emi_amount": 250.00,
            "emi_due_date": "2025-02-15"
        }
    )
    assert response.status_code == 200, f"Failed to create test client: {response.text}"
    client = response.json()
    print(f"✓ Created test client: {client['id']}")
    yield client
    
    # Cleanup - delete test client after tests
    try:
        delete_response = requests.delete(
            f"{BASE_URL}/api/clients/{client['id']}",
            params={"admin_token": admin_token}
        )
        if delete_response.status_code == 200:
            print(f"✓ Cleaned up test client: {client['id']}")
    except Exception as e:
        print(f"Warning: Could not cleanup test client: {e}")


class TestClientStatusResponseFields:
    """
    Test 1: Verify GET /api/device/status/{client_id} returns loan_amount and loan_due_date
    (NOT emi_amount/emi_due_date as per the schema change)
    """
    
    def test_device_status_has_loan_amount_field(self, admin_token, test_client):
        """Verify response contains loan_amount field (not emi_amount)"""
        response = requests.get(f"{BASE_URL}/api/device/status/{test_client['id']}")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        
        # Verify loan_amount field exists (NOT emi_amount)
        assert "loan_amount" in data, "Response should contain 'loan_amount' field"
        assert "emi_amount" not in data, "Response should NOT contain 'emi_amount' field (should be loan_amount)"
        
        # Verify the value
        assert isinstance(data["loan_amount"], (int, float)), "loan_amount should be a number"
        print(f"✓ Device status has loan_amount field: {data['loan_amount']}")
    
    def test_device_status_has_loan_due_date_field(self, admin_token, test_client):
        """Verify response contains loan_due_date field (not emi_due_date)"""
        response = requests.get(f"{BASE_URL}/api/device/status/{test_client['id']}")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        
        # Verify loan_due_date field exists (NOT emi_due_date)
        assert "loan_due_date" in data, "Response should contain 'loan_due_date' field"
        assert "emi_due_date" not in data, "Response should NOT contain 'emi_due_date' field (should be loan_due_date)"
        
        print(f"✓ Device status has loan_due_date field: {data.get('loan_due_date')}")
    
    def test_device_status_full_response_structure(self, admin_token, test_client):
        """Verify full ClientStatusResponse structure according to schema"""
        response = requests.get(f"{BASE_URL}/api/device/status/{test_client['id']}")
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        
        # Verify all required fields from ClientStatusResponse model (line 177 in schemas.py)
        required_fields = ["id", "name", "is_locked", "lock_message", "warning_message", 
                          "loan_amount", "loan_due_date", "uninstall_allowed"]
        
        for field in required_fields:
            assert field in data, f"Response should contain '{field}' field"
        
        # Verify types
        assert isinstance(data["id"], str), "id should be a string"
        assert isinstance(data["name"], str), "name should be a string"
        assert isinstance(data["is_locked"], bool), "is_locked should be a boolean"
        assert isinstance(data["lock_message"], str), "lock_message should be a string"
        assert isinstance(data["warning_message"], str), "warning_message should be a string"
        assert isinstance(data["loan_amount"], (int, float)), "loan_amount should be a number"
        assert isinstance(data["uninstall_allowed"], bool), "uninstall_allowed should be a boolean"
        
        # Verify NO old fields exist
        old_fields = ["emi_amount", "emi_due_date"]
        for old_field in old_fields:
            assert old_field not in data, f"Response should NOT contain old field '{old_field}'"
        
        print(f"✓ Full ClientStatusResponse structure verified:")
        print(f"  - id: {data['id']}")
        print(f"  - name: {data['name']}")
        print(f"  - is_locked: {data['is_locked']}")
        print(f"  - loan_amount: {data['loan_amount']}")
        print(f"  - loan_due_date: {data.get('loan_due_date')}")
        print(f"  - uninstall_allowed: {data['uninstall_allowed']}")


class TestDeviceRegistrationResetsUninstallAllowed:
    """
    Test 2: Verify POST /api/device/register resets uninstall_allowed to false
    """
    
    def test_registration_sets_uninstall_allowed_false(self, admin_token, test_client):
        """Verify device registration sets uninstall_allowed to false"""
        client_id = test_client["id"]
        
        # Step 1: First allow uninstall
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert allow_response.status_code == 200, f"Allow uninstall failed: {allow_response.text}"
        
        # Verify uninstall is allowed
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status1.json()["uninstall_allowed"] == True, "uninstall_allowed should be True after allow-uninstall"
        print(f"✓ Set uninstall_allowed=True")
        
        # Step 2: Generate registration code (which also resets uninstall_allowed)
        gen_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        assert gen_response.status_code == 200, f"Generate code failed: {gen_response.text}"
        reg_code = gen_response.json()["registration_code"]
        print(f"✓ Generated registration code: {reg_code}")
        
        # Step 3: Register device with new code
        device_id = f"test-device-{secrets.token_hex(4)}"
        register_response = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": reg_code,
                "device_id": device_id,
                "device_model": "Test Device Model"
            }
        )
        assert register_response.status_code == 200, f"Device registration failed: {register_response.text}"
        
        # Step 4: Verify uninstall_allowed is reset to False
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status2.status_code == 200
        
        data = status2.json()
        assert data["uninstall_allowed"] == False, f"uninstall_allowed should be False after registration, got {data['uninstall_allowed']}"
        print(f"✓ Device registration correctly reset uninstall_allowed to False")


class TestGenerateCodeResetsFields:
    """
    Test 3: Verify POST /api/clients/{client_id}/generate-code resets uninstall_allowed and is_registered
    """
    
    def test_generate_code_resets_uninstall_allowed(self, admin_token, test_client):
        """Verify generate-code resets uninstall_allowed to false"""
        client_id = test_client["id"]
        
        # Allow uninstall first
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert allow_response.status_code == 200
        
        # Verify uninstall is allowed
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        initial_uninstall_allowed = status1.json()["uninstall_allowed"]
        print(f"✓ Initial uninstall_allowed: {initial_uninstall_allowed}")
        
        # Generate new code
        gen_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        assert gen_response.status_code == 200, f"Generate code failed: {gen_response.text}"
        print(f"✓ Generated new registration code: {gen_response.json()['registration_code']}")
        
        # Verify uninstall_allowed is reset to False
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        data = status2.json()
        assert data["uninstall_allowed"] == False, f"uninstall_allowed should be False after generate-code, got {data['uninstall_allowed']}"
        print(f"✓ generate-code correctly reset uninstall_allowed to False")
    
    def test_generate_code_resets_is_registered(self, admin_token, test_client):
        """Verify generate-code resets is_registered to false"""
        client_id = test_client["id"]
        
        # Get client details before
        client_before = requests.get(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        assert client_before.status_code == 200
        before_data = client_before.json()
        print(f"✓ Before generate-code: is_registered={before_data.get('is_registered')}")
        
        # Generate new code
        gen_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        assert gen_response.status_code == 200, f"Generate code failed: {gen_response.text}"
        
        # Get client details after
        client_after = requests.get(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        assert client_after.status_code == 200
        after_data = client_after.json()
        
        assert after_data["is_registered"] == False, f"is_registered should be False after generate-code, got {after_data['is_registered']}"
        print(f"✓ generate-code correctly reset is_registered to False")


class TestAllowUninstall:
    """
    Test 4: Verify POST /api/clients/{client_id}/allow-uninstall sets uninstall_allowed to true
    """
    
    def test_allow_uninstall_sets_flag_true(self, admin_token, test_client):
        """Verify allow-uninstall sets uninstall_allowed to true"""
        client_id = test_client["id"]
        
        # First reset via generate-code to ensure it's False
        gen_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        assert gen_response.status_code == 200
        
        # Verify it's False
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status1.json()["uninstall_allowed"] == False, "uninstall_allowed should be False initially"
        print(f"✓ Initial uninstall_allowed=False")
        
        # Call allow-uninstall
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert allow_response.status_code == 200, f"Allow uninstall failed: {allow_response.text}"
        
        data = allow_response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        print(f"✓ allow-uninstall response: {data}")
        
        # Verify persistence
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status2.json()["uninstall_allowed"] == True, f"uninstall_allowed should be True after allow-uninstall"
        print(f"✓ allow-uninstall correctly set uninstall_allowed=True and persisted")


class TestReportAdminStatus:
    """
    Test 5: Verify POST /api/device/report-admin-status updates admin_mode_active
    """
    
    def test_report_admin_status_true(self, admin_token, test_client):
        """Verify reporting admin_active=true updates admin_mode_active"""
        client_id = test_client["id"]
        
        # Report admin_active = True
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": client_id, "admin_active": True}
        )
        assert response.status_code == 200, f"Report admin status failed: {response.text}"
        
        data = response.json()
        assert data["admin_active"] == True, f"Response should confirm admin_active=True"
        print(f"✓ Reported admin_active=True")
        
        # Verify persistence by getting client
        client_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        assert client_response.status_code == 200
        client_data = client_response.json()
        assert client_data["admin_mode_active"] == True, f"admin_mode_active should be True in database"
        print(f"✓ admin_mode_active=True persisted in database")
    
    def test_report_admin_status_false(self, admin_token, test_client):
        """Verify reporting admin_active=false updates admin_mode_active"""
        client_id = test_client["id"]
        
        # Report admin_active = False
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": client_id, "admin_active": False}
        )
        assert response.status_code == 200, f"Report admin status failed: {response.text}"
        
        data = response.json()
        assert data["admin_active"] == False, f"Response should confirm admin_active=False"
        print(f"✓ Reported admin_active=False")
        
        # Verify persistence
        client_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        assert client_response.status_code == 200
        client_data = client_response.json()
        assert client_data["admin_mode_active"] == False, f"admin_mode_active should be False in database"
        print(f"✓ admin_mode_active=False persisted in database")


class TestLockUnlock:
    """
    Tests 6 & 7: Verify POST /api/clients/{client_id}/lock and unlock work correctly
    """
    
    def test_lock_device(self, admin_token, test_client):
        """Verify lock endpoint locks the device"""
        client_id = test_client["id"]
        
        # First ensure unlocked
        unlock_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/unlock",
            params={"admin_token": admin_token}
        )
        assert unlock_response.status_code == 200
        
        # Verify unlocked
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status1.json()["is_locked"] == False, "Device should be unlocked initially"
        print(f"✓ Device initially unlocked")
        
        # Lock with message
        lock_message = "Device locked for testing purposes"
        lock_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/lock",
            params={"admin_token": admin_token, "message": lock_message}
        )
        assert lock_response.status_code == 200, f"Lock failed: {lock_response.text}"
        
        data = lock_response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        print(f"✓ Lock response: {data}")
        
        # Verify locked via status endpoint
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        status_data = status2.json()
        assert status_data["is_locked"] == True, f"is_locked should be True after lock, got {status_data['is_locked']}"
        assert status_data["lock_message"] == lock_message, f"lock_message should be '{lock_message}'"
        print(f"✓ Device locked successfully with message: '{status_data['lock_message']}'")
    
    def test_unlock_device(self, admin_token, test_client):
        """Verify unlock endpoint unlocks the device"""
        client_id = test_client["id"]
        
        # First ensure locked
        lock_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/lock",
            params={"admin_token": admin_token}
        )
        assert lock_response.status_code == 200
        
        # Verify locked
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status1.json()["is_locked"] == True, "Device should be locked"
        print(f"✓ Device initially locked")
        
        # Unlock
        unlock_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/unlock",
            params={"admin_token": admin_token}
        )
        assert unlock_response.status_code == 200, f"Unlock failed: {unlock_response.text}"
        
        data = unlock_response.json()
        assert "message" in data, "Response should contain message"
        assert "client_id" in data, "Response should contain client_id"
        print(f"✓ Unlock response: {data}")
        
        # Verify unlocked via status endpoint
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        status_data = status2.json()
        assert status_data["is_locked"] == False, f"is_locked should be False after unlock, got {status_data['is_locked']}"
        print(f"✓ Device unlocked successfully")


class TestUninstallAllowedAfterAllowUninstall:
    """
    Test 8: Verify GET /api/device/status/{client_id} returns uninstall_allowed=true after allow-uninstall
    """
    
    def test_status_shows_uninstall_allowed_true(self, admin_token, test_client):
        """Verify device status shows uninstall_allowed=true after calling allow-uninstall"""
        client_id = test_client["id"]
        
        # Reset via generate-code first
        gen_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        assert gen_response.status_code == 200
        
        # Verify initial state is False
        status1 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status1.json()["uninstall_allowed"] == False
        print(f"✓ Initial uninstall_allowed=False")
        
        # Call allow-uninstall
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert allow_response.status_code == 200
        print(f"✓ Called allow-uninstall")
        
        # Verify via GET /api/device/status
        status2 = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status2.status_code == 200
        
        data = status2.json()
        assert data["uninstall_allowed"] == True, f"uninstall_allowed should be True in status response, got {data['uninstall_allowed']}"
        print(f"✓ GET /api/device/status/{client_id} correctly returns uninstall_allowed=True after allow-uninstall")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"✓ API health check passed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
