"""
Iteration 53: Test backup CRUD endpoints, provisioning QR code, and re-verify Device Owner APIs.
Focus: NEW backup endpoints, provisioning QR code generation, Device Owner mode verification.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://subscription-tier-1.preview.emergentagent.com").rstrip("/")

# Test data prefix for cleanup
TEST_PREFIX = "TEST_ITER53_"


class TestAdminLogin:
    """Authentication tests - required for backup and provisioning APIs."""

    def test_health_check(self):
        """Verify health endpoint is working."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")

    def test_admin_login_success(self):
        """Login with admin/admin123 credentials."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        print(f"✓ Admin login successful, token received")
        return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests."""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "admin", "password": "admin123"}
    )
    if response.status_code != 200:
        pytest.skip("Admin login failed - skipping authenticated tests")
    return response.json()["token"]


@pytest.fixture(scope="module")
def test_client_id(admin_token):
    """Create a test client for device owner/admin tests."""
    unique_id = uuid.uuid4().hex[:8]
    client_data = {
        "name": f"{TEST_PREFIX}Client_{unique_id}",
        "phone": f"+37255{unique_id[:6]}",
        "email": f"test_{unique_id}@test.com",
        "loan_amount": 500,
        "emi_amount": 50,
    }
    response = requests.post(
        f"{BASE_URL}/api/clients",
        params={"admin_token": admin_token},
        json=client_data
    )
    if response.status_code != 200:
        pytest.skip(f"Failed to create test client: {response.text}")
    client = response.json()
    yield client["id"]
    # Cleanup: delete the test client
    requests.delete(f"{BASE_URL}/api/clients/{client['id']}", params={"admin_token": admin_token})


# ============== BACKUP CRUD TESTS ==============

class TestBackupCreate:
    """POST /api/backup/create - Create backup with stats."""

    def test_create_backup_success(self, admin_token):
        """Create a backup and verify response contains stats."""
        response = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "backup_id" in data, "Response missing 'backup_id'"
        assert "created_at" in data, "Response missing 'created_at'"
        assert "stats" in data, "Response missing 'stats'"
        assert "size_bytes" in data, "Response missing 'size_bytes'"
        
        # Verify stats structure
        stats = data["stats"]
        assert "clients" in stats, "Stats missing 'clients' count"
        assert "loans" in stats, "Stats missing 'loans' count"
        assert "payments" in stats, "Stats missing 'payments' count"
        assert "loan_history" in stats, "Stats missing 'loan_history' count"
        
        print(f"✓ Backup created: {data['backup_id']}")
        print(f"  Stats: clients={stats['clients']}, loans={stats['loans']}, payments={stats['payments']}")
        return data["backup_id"]

    def test_create_backup_without_token_fails(self):
        """Creating backup without admin_token should fail."""
        response = requests.post(f"{BASE_URL}/api/backup/create")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("✓ Backup create correctly rejects missing token")

    def test_create_backup_invalid_token_fails(self):
        """Creating backup with invalid token should fail."""
        response = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": "invalid_token_12345"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for invalid token, got {response.status_code}"
        print("✓ Backup create correctly rejects invalid token")


class TestBackupList:
    """GET /api/backup/list - List all backups."""

    def test_list_backups_success(self, admin_token):
        """List backups returns array with backup metadata."""
        response = requests.get(
            f"{BASE_URL}/api/backup/list",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "backups" in data, "Response missing 'backups' array"
        assert isinstance(data["backups"], list), "'backups' should be a list"
        
        # If there are backups, verify structure
        if len(data["backups"]) > 0:
            backup = data["backups"][0]
            assert "backup_id" in backup, "Backup missing 'backup_id'"
            assert "created_at" in backup, "Backup missing 'created_at'"
            assert "stats" in backup, "Backup missing 'stats'"
            print(f"✓ Found {len(data['backups'])} backup(s)")
        else:
            print("✓ Backup list returned empty (no backups yet)")
        
        return data["backups"]

    def test_list_backups_without_token_fails(self):
        """Listing backups without admin_token should fail."""
        response = requests.get(f"{BASE_URL}/api/backup/list")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("✓ Backup list correctly rejects missing token")


class TestBackupGetRestore:
    """GET /api/backup/{backup_id} and POST /api/backup/restore/{backup_id}."""

    @pytest.fixture
    def created_backup_id(self, admin_token):
        """Create a backup for testing get/restore/delete."""
        response = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": admin_token}
        )
        if response.status_code != 200:
            pytest.skip(f"Failed to create backup for testing: {response.text}")
        return response.json()["backup_id"]

    def test_get_backup_success(self, admin_token, created_backup_id):
        """Get backup by ID returns full backup data."""
        response = requests.get(
            f"{BASE_URL}/api/backup/{created_backup_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["backup_id"] == created_backup_id, "Backup ID mismatch"
        assert "created_at" in data, "Response missing 'created_at'"
        assert "stats" in data, "Response missing 'stats'"
        assert "data" in data, "Response missing 'data' (backup contents)"
        
        # Verify data structure contains expected collections
        backup_data = data["data"]
        assert "clients" in backup_data, "Backup data missing 'clients'"
        assert "loans" in backup_data, "Backup data missing 'loans'"
        assert "payments" in backup_data, "Backup data missing 'payments'"
        
        print(f"✓ Got backup {created_backup_id} with full data")

    def test_get_backup_not_found(self, admin_token):
        """Getting non-existent backup returns 404."""
        fake_id = "nonexistent-backup-12345"
        response = requests.get(
            f"{BASE_URL}/api/backup/{fake_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404 for non-existent backup, got {response.status_code}"
        print("✓ Correctly returns 404 for non-existent backup")

    def test_restore_backup_success(self, admin_token, created_backup_id):
        """Restore backup returns restored counts."""
        response = requests.post(
            f"{BASE_URL}/api/backup/restore/{created_backup_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "message" in data, "Response missing 'message'"
        assert "restored" in data, "Response missing 'restored' counts"
        
        restored = data["restored"]
        assert "clients" in restored, "Restored missing 'clients' count"
        assert "loans" in restored, "Restored missing 'loans' count"
        assert "payments" in restored, "Restored missing 'payments' count"
        
        print(f"✓ Backup restored: {data['message']}")
        print(f"  Restored counts: {restored}")

    def test_restore_backup_not_found(self, admin_token):
        """Restoring non-existent backup returns 404."""
        fake_id = "nonexistent-backup-67890"
        response = requests.post(
            f"{BASE_URL}/api/backup/restore/{fake_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404 for non-existent backup restore, got {response.status_code}"
        print("✓ Correctly returns 404 for restoring non-existent backup")


class TestBackupDelete:
    """DELETE /api/backup/{backup_id}."""

    def test_delete_backup_success(self, admin_token):
        """Delete backup returns success message."""
        # First create a backup to delete
        create_resp = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": admin_token}
        )
        assert create_resp.status_code == 200, f"Failed to create backup for delete test"
        backup_id = create_resp.json()["backup_id"]
        
        # Now delete it
        response = requests.delete(
            f"{BASE_URL}/api/backup/{backup_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, "Response missing 'message'"
        print(f"✓ Backup {backup_id} deleted successfully")
        
        # Verify it's actually deleted
        get_resp = requests.get(
            f"{BASE_URL}/api/backup/{backup_id}",
            params={"admin_token": admin_token}
        )
        assert get_resp.status_code == 404, "Deleted backup should return 404"
        print("✓ Verified backup no longer exists after deletion")

    def test_delete_backup_not_found(self, admin_token):
        """Deleting non-existent backup returns 404."""
        fake_id = "nonexistent-backup-delete-test"
        response = requests.delete(
            f"{BASE_URL}/api/backup/{fake_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404 for deleting non-existent backup, got {response.status_code}"
        print("✓ Correctly returns 404 for deleting non-existent backup")


# ============== PROVISIONING QR CODE TESTS ==============

class TestProvisioningQRCode:
    """GET /api/provisioning/qr-code - QR code generation for Device Owner provisioning."""

    def test_generate_qr_code_basic(self, admin_token):
        """Generate QR code without WiFi config."""
        response = requests.get(
            f"{BASE_URL}/api/provisioning/qr-code",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify QR code base64
        assert "qr_code_base64" in data, "Response missing 'qr_code_base64'"
        assert len(data["qr_code_base64"]) > 100, "QR code base64 seems too short"
        
        # Verify provisioning_data structure
        assert "provisioning_data" in data, "Response missing 'provisioning_data'"
        prov_data = data["provisioning_data"]
        assert "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME" in prov_data
        assert "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION" in prov_data
        
        # WiFi should NOT be in payload when not provided
        assert "android.app.extra.PROVISIONING_WIFI_SSID" not in prov_data, "WiFi SSID should not be present without wifi_ssid param"
        
        # Verify instructions
        assert "instructions" in data, "Response missing 'instructions'"
        assert "en" in data["instructions"], "Instructions missing English"
        assert "et" in data["instructions"], "Instructions missing Estonian"
        
        print("✓ QR code generated (basic, no WiFi)")
        print(f"  Component: {prov_data.get('android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME')}")

    def test_generate_qr_code_with_wifi(self, admin_token):
        """Generate QR code with WiFi config included in payload."""
        test_ssid = "TestNetwork123"
        test_password = "TestPassword456"
        
        response = requests.get(
            f"{BASE_URL}/api/provisioning/qr-code",
            params={
                "admin_token": admin_token,
                "wifi_ssid": test_ssid,
                "wifi_password": test_password,
                "wifi_security": "WPA"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify QR code
        assert "qr_code_base64" in data
        
        # Verify WiFi is included in provisioning_data
        prov_data = data["provisioning_data"]
        assert "android.app.extra.PROVISIONING_WIFI_SSID" in prov_data, "WiFi SSID missing from payload"
        assert prov_data["android.app.extra.PROVISIONING_WIFI_SSID"] == test_ssid, "WiFi SSID mismatch"
        assert "android.app.extra.PROVISIONING_WIFI_PASSWORD" in prov_data, "WiFi password missing from payload"
        assert prov_data["android.app.extra.PROVISIONING_WIFI_PASSWORD"] == test_password, "WiFi password mismatch"
        assert "android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE" in prov_data, "WiFi security type missing"
        
        print("✓ QR code generated with WiFi config")
        print(f"  WiFi SSID in payload: {prov_data['android.app.extra.PROVISIONING_WIFI_SSID']}")

    def test_generate_qr_code_without_token_fails(self):
        """Generating QR code without admin_token should fail."""
        response = requests.get(f"{BASE_URL}/api/provisioning/qr-code")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("✓ QR code generation correctly rejects missing token")

    def test_generate_qr_code_invalid_token_fails(self):
        """Generating QR code with invalid token should fail."""
        response = requests.get(
            f"{BASE_URL}/api/provisioning/qr-code",
            params={"admin_token": "invalid_token_xyz"}
        )
        assert response.status_code in [401, 403], f"Expected 401/403 for invalid token, got {response.status_code}"
        print("✓ QR code generation correctly rejects invalid token")


# ============== DEVICE OWNER MODE VERIFICATION ==============

class TestDeviceOwnerGenerateCode:
    """POST /api/clients/{id}/generate-code - 9-char for device_owner, 8-char for device_admin."""

    def test_generate_code_device_owner_9_char(self, admin_token, test_client_id):
        """Generate code with lock_mode=device_owner produces 9-char code."""
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code",
            params={"admin_token": admin_token, "lock_mode": "device_owner"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "registration_code" in data, "Response missing 'registration_code'"
        assert "lock_mode" in data, "Response missing 'lock_mode'"
        
        code = data["registration_code"]
        assert len(code) == 9, f"Expected 9-char code for device_owner, got {len(code)}-char: {code}"
        assert data["lock_mode"] == "device_owner", f"Expected lock_mode='device_owner', got '{data['lock_mode']}'"
        
        print(f"✓ Device Owner code generated: {code} (9 chars)")

    def test_generate_code_device_admin_8_char(self, admin_token, test_client_id):
        """Generate code with lock_mode=device_admin produces 8-char code."""
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code",
            params={"admin_token": admin_token, "lock_mode": "device_admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        code = data["registration_code"]
        assert len(code) == 8, f"Expected 8-char code for device_admin, got {len(code)}-char: {code}"
        assert data["lock_mode"] == "device_admin", f"Expected lock_mode='device_admin', got '{data['lock_mode']}'"
        
        print(f"✓ Device Admin code generated: {code} (8 chars)")

    def test_generate_code_invalid_lock_mode_fails(self, admin_token, test_client_id):
        """Invalid lock_mode should be rejected."""
        response = requests.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code",
            params={"admin_token": admin_token, "lock_mode": "invalid_mode"}
        )
        assert response.status_code == 422, f"Expected 422 for invalid lock_mode, got {response.status_code}"
        print("✓ Invalid lock_mode correctly rejected")


class TestDeviceRegisterLockMode:
    """POST /api/device/register - 9-digit code sets device_owner, 8-digit sets device_admin."""

    def test_register_9_digit_sets_device_owner(self, admin_token):
        """Registering with 9-digit code sets lock_mode=device_owner."""
        # Create a fresh client
        unique_id = uuid.uuid4().hex[:8]
        client_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token},
            json={
                "name": f"{TEST_PREFIX}RegisterDO_{unique_id}",
                "phone": f"+37288{unique_id[:6]}",
                "email": f"registerdo_{unique_id}@test.com",
            }
        )
        assert client_resp.status_code == 200, f"Failed to create client: {client_resp.text}"
        client_id = client_resp.json()["id"]
        
        try:
            # Generate device_owner code (9-char)
            code_resp = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/generate-code",
                params={"admin_token": admin_token, "lock_mode": "device_owner"}
            )
            assert code_resp.status_code == 200
            code = code_resp.json()["registration_code"]
            assert len(code) == 9, f"Expected 9-char code, got {len(code)}"
            
            # Register device with this code
            reg_resp = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": code,
                    "device_id": f"test_device_{unique_id}",
                    "device_model": "Test Model X"
                }
            )
            assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
            reg_data = reg_resp.json()
            
            assert reg_data.get("lock_mode") == "device_owner", f"Expected lock_mode='device_owner', got '{reg_data.get('lock_mode')}'"
            print(f"✓ 9-digit code registration sets lock_mode=device_owner")
            
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": admin_token})

    def test_register_8_digit_sets_device_admin(self, admin_token):
        """Registering with 8-digit code sets lock_mode=device_admin."""
        unique_id = uuid.uuid4().hex[:8]
        client_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token},
            json={
                "name": f"{TEST_PREFIX}RegisterDA_{unique_id}",
                "phone": f"+37299{unique_id[:6]}",
                "email": f"registerda_{unique_id}@test.com",
            }
        )
        assert client_resp.status_code == 200
        client_id = client_resp.json()["id"]
        
        try:
            # Generate device_admin code (8-char)
            code_resp = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/generate-code",
                params={"admin_token": admin_token, "lock_mode": "device_admin"}
            )
            assert code_resp.status_code == 200
            code = code_resp.json()["registration_code"]
            assert len(code) == 8, f"Expected 8-char code, got {len(code)}"
            
            # Register device
            reg_resp = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": code,
                    "device_id": f"test_device_da_{unique_id}",
                    "device_model": "Test Model Y"
                }
            )
            assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
            reg_data = reg_resp.json()
            
            assert reg_data.get("lock_mode") == "device_admin", f"Expected lock_mode='device_admin', got '{reg_data.get('lock_mode')}'"
            print(f"✓ 8-digit code registration sets lock_mode=device_admin")
            
        finally:
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": admin_token})


class TestDeviceStatusFields:
    """GET /api/device/status/{id} - Verify lock_mode, outstanding_balance, monthly_emi fields."""

    def test_status_returns_required_fields(self, admin_token):
        """Device status returns lock_mode, outstanding_balance, monthly_emi."""
        unique_id = uuid.uuid4().hex[:8]
        client_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token},
            json={
                "name": f"{TEST_PREFIX}StatusTest_{unique_id}",
                "phone": f"+37277{unique_id[:6]}",
                "email": f"statustest_{unique_id}@test.com",
                "loan_amount": 1000,
                "emi_amount": 100,
            }
        )
        assert client_resp.status_code == 200
        client_id = client_resp.json()["id"]
        
        try:
            # Generate code and register
            code_resp = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/generate-code",
                params={"admin_token": admin_token, "lock_mode": "device_owner"}
            )
            assert code_resp.status_code == 200
            code = code_resp.json()["registration_code"]
            
            reg_resp = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": code,
                    "device_id": f"status_test_device_{unique_id}",
                    "device_model": "Test Status Model"
                }
            )
            assert reg_resp.status_code == 200
            
            # Now get status
            status_resp = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
            assert status_resp.status_code == 200, f"Status failed: {status_resp.text}"
            status_data = status_resp.json()
            
            # Verify required fields
            assert "lock_mode" in status_data, "Status missing 'lock_mode'"
            assert "outstanding_balance" in status_data, "Status missing 'outstanding_balance'"
            assert "monthly_emi" in status_data, "Status missing 'monthly_emi'"
            
            assert status_data["lock_mode"] == "device_owner", f"Expected device_owner, got {status_data['lock_mode']}"
            assert isinstance(status_data["outstanding_balance"], (int, float)), "outstanding_balance should be numeric"
            assert isinstance(status_data["monthly_emi"], (int, float)), "monthly_emi should be numeric"
            
            print(f"✓ Device status returns all required fields:")
            print(f"  lock_mode: {status_data['lock_mode']}")
            print(f"  outstanding_balance: {status_data['outstanding_balance']}")
            print(f"  monthly_emi: {status_data['monthly_emi']}")
            
        finally:
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": admin_token})

    def test_status_not_found_for_invalid_client(self):
        """Status for non-existent client returns 404."""
        response = requests.get(f"{BASE_URL}/api/device/status/nonexistent-client-xyz")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Device status correctly returns 404 for non-existent client")


# ============== RUN ALL TESTS ==============

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
