"""
Iteration 54 Tests - Plan enforcement, reminders (email/telegram), bank statement file types
Focus on NEW endpoints:
- GET /api/plans/limits - plan info with client counts
- GET /api/plans/features - 4 plans with correct details
- POST /api/reminders/send-email/{id} - email reminder (Resend not configured)
- POST /api/reminders/send-telegram/{id} - telegram reminder (not configured)
- GET /api/reminders/config - reminder configuration status
- POST /api/bank-statements/analyze - validates CSV/XML file types
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

# Get BASE_URL from environment
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://loan-kiosk-mode.preview.emergentagent.com"

TEST_PREFIX = "TEST_ITER54_"


class TestAdminAuth:
    """Admin authentication to get tokens for subsequent tests"""
    
    admin_token = None
    admin_id = None
    
    @classmethod
    def setup_class(cls):
        """Login as admin to get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        cls.admin_token = data.get("token")
        cls.admin_id = data.get("id")
        assert cls.admin_token, "No admin token received"
        print(f"Admin login successful, token: {cls.admin_token[:20]}...")


class TestPlanLimits:
    """Test GET /api/plans/limits endpoint"""
    
    def test_plan_limits_returns_plan_info(self):
        """Test that /api/plans/limits returns plan info for authenticated admin"""
        response = requests.get(
            f"{BASE_URL}/api/plans/limits",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Plan limits response: {data}")
        
        # Verify required fields
        assert "plan" in data, "Response should contain 'plan' field"
        assert "limits" in data, "Response should contain 'limits' field"
        assert "is_super_admin" in data, "Response should contain 'is_super_admin' field"
        assert "current_clients" in data, "Response should contain 'current_clients' field"
        assert "can_add_client" in data, "Response should contain 'can_add_client' field"
        
        # Verify limits structure
        limits = data["limits"]
        assert "max_clients" in limits, "limits should contain 'max_clients'"
        assert "lock_unlock" in limits, "limits should contain 'lock_unlock'"
        assert "reminders" in limits, "limits should contain 'reminders'"
        assert "device_owner" in limits, "limits should contain 'device_owner'"
        
        # For superadmin, expect custom plan
        if data["is_super_admin"]:
            assert data["plan"] == "custom", "Superadmin should have 'custom' plan"
            assert limits["max_clients"] == 999999, "Custom plan should have 999999 max_clients"
        
        print(f"PASS: Plan limits returned correctly - plan: {data['plan']}, is_super_admin: {data['is_super_admin']}, current_clients: {data['current_clients']}")
    
    def test_plan_limits_requires_token(self):
        """Test that /api/plans/limits requires admin_token"""
        response = requests.get(f"{BASE_URL}/api/plans/limits")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("PASS: /api/plans/limits correctly rejects missing token")


class TestPlanFeatures:
    """Test GET /api/plans/features endpoint"""
    
    def test_plan_features_returns_all_plans(self):
        """Test that /api/plans/features returns 4 plans with correct details"""
        response = requests.get(f"{BASE_URL}/api/plans/features")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plans" in data, "Response should contain 'plans' field"
        
        plans = data["plans"]
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}"
        
        # Check plan IDs
        plan_ids = [p["id"] for p in plans]
        assert "starter" in plan_ids, "Missing 'starter' plan"
        assert "business" in plan_ids, "Missing 'business' plan"
        assert "enterprise" in plan_ids, "Missing 'enterprise' plan"
        assert "custom" in plan_ids, "Missing 'custom' plan"
        
        # Verify client limits
        for plan in plans:
            if plan["id"] == "starter":
                assert plan["max_clients"] == 20, f"Starter should have 20 clients, got {plan['max_clients']}"
                assert plan["price"] == 29, f"Starter price should be 29, got {plan['price']}"
            elif plan["id"] == "business":
                assert plan["max_clients"] == 200, f"Business should have 200 clients, got {plan['max_clients']}"
                assert plan.get("popular") == True, "Business should be marked as popular"
            elif plan["id"] == "enterprise":
                assert plan["max_clients"] == 1000, f"Enterprise should have 1000 clients, got {plan['max_clients']}"
            elif plan["id"] == "custom":
                assert plan["max_clients"] == 999999, f"Custom should have 999999 clients, got {plan['max_clients']}"
                assert plan.get("contact_sales") == True, "Custom should have contact_sales=True"
        
        print(f"PASS: All 4 plans returned with correct max_clients (starter=20, business=200, enterprise=1000, custom=999999)")
    
    def test_plan_features_structure(self):
        """Verify plan structure has all required fields"""
        response = requests.get(f"{BASE_URL}/api/plans/features")
        assert response.status_code == 200
        
        plans = response.json()["plans"]
        required_fields = ["id", "name", "price", "currency", "period", "max_clients", "features"]
        
        for plan in plans:
            for field in required_fields:
                assert field in plan, f"Plan {plan.get('id', 'unknown')} missing field: {field}"
        
        print("PASS: All plans have required structure fields")


class TestClientCreation:
    """Create test client for reminder tests"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create a test client with email and telegram_chat_id"""
        client_data = {
            "name": f"{TEST_PREFIX}reminder_test_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "test-reminder@example.com",  # Required field
            "address": "Test Address",
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client: {cls.test_client_id}")
            
            # Update client to add telegram_chat_id
            requests.put(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                json={"telegram_chat_id": "123456789"},
                params={"admin_token": TestAdminAuth.admin_token}
            )
        else:
            print(f"Failed to create test client: {response.status_code} - {response.text}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test client"""
        if cls.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
            print(f"Cleaned up test client: {cls.test_client_id}")


class TestReminderConfig:
    """Test GET /api/reminders/config endpoint"""
    
    def test_reminder_config_returns_status(self):
        """Test that /api/reminders/config returns configuration status"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/config",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Reminder config response: {data}")
        
        # Verify required fields
        assert "email_configured" in data, "Response should contain 'email_configured'"
        assert "telegram_configured" in data, "Response should contain 'telegram_configured'"
        assert "push_configured" in data, "Response should contain 'push_configured'"
        
        # Per the task, email and telegram are NOT configured
        assert data["push_configured"] == True, "Push should always be configured"
        
        print(f"PASS: Reminder config returned - email_configured: {data['email_configured']}, telegram_configured: {data['telegram_configured']}, push_configured: {data['push_configured']}")
    
    def test_reminder_config_requires_token(self):
        """Test that /api/reminders/config requires admin_token"""
        response = requests.get(f"{BASE_URL}/api/reminders/config")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("PASS: /api/reminders/config correctly rejects missing token")


class TestEmailReminder:
    """Test POST /api/reminders/send-email/{client_id} endpoint"""
    
    def test_email_reminder_returns_response(self):
        """Test that /api/reminders/send-email returns success/failure"""
        if not TestClientCreation.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-email/{TestClientCreation.test_client_id}",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Email reminder response: {data}")
        
        assert "success" in data, "Response should contain 'success' field"
        assert "message" in data, "Response should contain 'message' field"
        
        # Since RESEND_API_KEY is not configured, expect success=false with appropriate message
        # OR success=true if it happens to be configured
        print(f"PASS: Email reminder endpoint returned - success: {data['success']}, message: {data['message']}")
    
    def test_email_reminder_client_not_found(self):
        """Test email reminder with non-existent client"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-email/nonexistent-client-id",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Email reminder correctly returns 404 for non-existent client")
    
    def test_email_reminder_requires_token(self):
        """Test that email reminder requires admin_token"""
        response = requests.post(f"{BASE_URL}/api/reminders/send-email/any-client-id")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("PASS: Email reminder correctly rejects missing token")


class TestTelegramReminder:
    """Test POST /api/reminders/send-telegram/{client_id} endpoint"""
    
    def test_telegram_reminder_returns_response(self):
        """Test that /api/reminders/send-telegram returns success/failure"""
        if not TestClientCreation.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-telegram/{TestClientCreation.test_client_id}",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Telegram reminder response: {data}")
        
        assert "success" in data, "Response should contain 'success' field"
        assert "message" in data, "Response should contain 'message' field"
        
        # Since TELEGRAM_TOKEN is not configured, expect success=false
        print(f"PASS: Telegram reminder endpoint returned - success: {data['success']}, message: {data['message']}")
    
    def test_telegram_reminder_client_not_found(self):
        """Test telegram reminder with non-existent client"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-telegram/nonexistent-client-id",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Telegram reminder correctly returns 404 for non-existent client")
    
    def test_telegram_reminder_requires_token(self):
        """Test that telegram reminder requires admin_token"""
        response = requests.post(f"{BASE_URL}/api/reminders/send-telegram/any-client-id")
        assert response.status_code == 422, f"Expected 422 for missing token, got {response.status_code}"
        print("PASS: Telegram reminder correctly rejects missing token")


class TestBankStatementFileTypes:
    """Test POST /api/bank-statements/analyze file type validation"""
    
    def test_bank_statement_rejects_unsupported_format(self):
        """Test that unsupported file formats are rejected with proper message"""
        # Create a dummy .txt file
        files = {"file": ("test.txt", b"dummy content", "text/plain")}
        response = requests.post(
            f"{BASE_URL}/api/bank-statements/analyze",
            files=files,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 400, f"Expected 400 for unsupported format, got {response.status_code}"
        
        data = response.json()
        detail = data.get("detail", "")
        print(f"Bank statement rejection message: {detail}")
        
        # Verify the error message mentions CSV and XML
        assert ".csv" in detail.lower() or "csv" in detail.lower(), "Error should mention CSV support"
        assert ".xml" in detail.lower() or "xml" in detail.lower(), "Error should mention XML support"
        
        print(f"PASS: Bank statement analyzer shows supported formats including CSV and XML")
    
    def test_bank_statement_accepts_csv_extension(self):
        """Test that CSV files pass initial file type validation"""
        # Create a minimal CSV content
        csv_content = b"date,amount,description\n2025-01-01,100.00,Test transaction"
        files = {"file": ("statement.csv", csv_content, "text/csv")}
        response = requests.post(
            f"{BASE_URL}/api/bank-statements/analyze",
            files=files,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        
        # Should not be 400 (bad file type) - might be 422 (AI couldn't parse) or 200 (success)
        assert response.status_code != 400 or "Supported formats" not in response.text, \
            f"CSV should not be rejected for file type. Got: {response.text}"
        
        print(f"PASS: CSV file passed initial file type validation (status: {response.status_code})")
    
    def test_bank_statement_accepts_xml_extension(self):
        """Test that XML files pass initial file type validation"""
        # Create a minimal XML content
        xml_content = b"<?xml version='1.0'?><statement><transaction amount='100.00'/></statement>"
        files = {"file": ("statement.xml", xml_content, "application/xml")}
        response = requests.post(
            f"{BASE_URL}/api/bank-statements/analyze",
            files=files,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        
        # Should not be 400 (bad file type) - might be 422 (AI couldn't parse) or 200 (success)
        assert response.status_code != 400 or "Supported formats" not in response.text, \
            f"XML should not be rejected for file type. Got: {response.text}"
        
        print(f"PASS: XML file passed initial file type validation (status: {response.status_code})")


class TestDeviceCodeGeneration:
    """Verify device code generation (device_owner vs device_admin)"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create a test client for code generation"""
        client_data = {
            "name": f"{TEST_PREFIX}code_gen_{uuid.uuid4().hex[:8]}",
            "phone": "+9876543210",
            "email": "code-gen-test@example.com",  # Required field
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client for code gen: {cls.test_client_id}")
        else:
            print(f"Failed to create test client for code gen: {response.status_code} - {response.text}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test client"""
        if cls.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
    
    def test_device_owner_generates_9_char_code(self):
        """Test that lock_mode=device_owner generates 9-character code"""
        if not self.test_client_id:
            pytest.skip("No test client")
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/generate-code",
            params={
                "admin_token": TestAdminAuth.admin_token,
                "lock_mode": "device_owner"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        code = data.get("registration_code", "")
        assert len(code) == 9, f"Device owner code should be 9 chars, got {len(code)}: {code}"
        assert data.get("lock_mode") == "device_owner"
        
        print(f"PASS: Device owner generates 9-char code: {code}")
    
    def test_device_admin_generates_8_char_code(self):
        """Test that lock_mode=device_admin generates 8-character code"""
        if not self.test_client_id:
            pytest.skip("No test client")
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/generate-code",
            params={
                "admin_token": TestAdminAuth.admin_token,
                "lock_mode": "device_admin"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        code = data.get("registration_code", "")
        assert len(code) == 8, f"Device admin code should be 8 chars, got {len(code)}: {code}"
        assert data.get("lock_mode") == "device_admin"
        
        print(f"PASS: Device admin generates 8-char code: {code}")


class TestDeviceStatus:
    """Verify GET /api/device/status returns lock_mode field"""
    
    def test_device_status_returns_lock_mode(self):
        """Test that device status includes lock_mode field"""
        # First create and register a test device
        client_data = {
            "name": f"{TEST_PREFIX}device_status_{uuid.uuid4().hex[:8]}",
            "phone": "+1112223333",
            "email": "device-status-test@example.com",  # Required field
        }
        create_resp = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert create_resp.status_code == 200, f"Client creation failed: {create_resp.text}"
        client_id = create_resp.json()["id"]
        
        try:
            # Generate a registration code
            gen_resp = requests.post(
                f"{BASE_URL}/api/clients/{client_id}/generate-code",
                params={
                    "admin_token": TestAdminAuth.admin_token,
                    "lock_mode": "device_owner"
                }
            )
            assert gen_resp.status_code == 200
            reg_code = gen_resp.json()["registration_code"]
            
            # Register the device
            reg_resp = requests.post(
                f"{BASE_URL}/api/device/register",
                json={
                    "registration_code": reg_code,
                    "device_id": f"test-device-{uuid.uuid4().hex[:8]}",
                    "device_model": "Test Model",
                    "device_make": "Test Make",
                    "os_version": "Android 14"
                }
            )
            assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
            
            # Check device status using client_id (NOT device_id)
            status_resp = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
            assert status_resp.status_code == 200, f"Status failed: {status_resp.text}"
            
            status_data = status_resp.json()
            assert "lock_mode" in status_data, "Device status should contain 'lock_mode' field"
            assert status_data["lock_mode"] == "device_owner", f"Expected device_owner, got {status_data['lock_mode']}"
            
            print(f"PASS: Device status returns lock_mode: {status_data['lock_mode']}")
            
        finally:
            # Cleanup
            requests.delete(
                f"{BASE_URL}/api/clients/{client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )


class TestBackupEndpoints:
    """Verify backup endpoints still work (regression)"""
    
    def test_backup_create(self):
        """Test POST /api/backup/create"""
        response = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "backup_id" in data, "Response should contain 'backup_id'"
        assert "stats" in data, "Response should contain 'stats'"
        
        print(f"PASS: Backup create returns backup_id: {data['backup_id']}")
        return data["backup_id"]
    
    def test_backup_list(self):
        """Test GET /api/backup/list"""
        response = requests.get(
            f"{BASE_URL}/api/backup/list",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "backups" in data, "Response should contain 'backups'"
        
        print(f"PASS: Backup list returns {len(data['backups'])} backups")


class TestProvisioningQRCode:
    """Verify provisioning QR code endpoint (regression)"""
    
    def test_qr_code_generation(self):
        """Test GET /api/provisioning/qr-code"""
        response = requests.get(
            f"{BASE_URL}/api/provisioning/qr-code",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "qr_code_base64" in data, "Response should contain 'qr_code_base64'"
        assert "provisioning_data" in data, "Response should contain 'provisioning_data'"
        
        print(f"PASS: Provisioning QR code generated successfully")


# Run admin auth setup first
TestAdminAuth.setup_class()
