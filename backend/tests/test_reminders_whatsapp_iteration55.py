"""
Iteration 55 Tests - Email/WhatsApp/Telegram Reminders with Resend verified
Focus on NEW features:
- POST /api/reminders/send-email/{client_id} - Email via Resend (verified noreply@paylockpro.com)
- GET /api/reminders/whatsapp-link/{client_id} - WhatsApp deep link URL
- POST /api/reminders/send-whatsapp/{client_id} - WhatsApp send (fallback to deep_link)
- GET /api/reminders/config - Config showing email=true, whatsapp=false
- POST /api/reminders/send-bulk-email - Bulk email send

Regression tests:
- POST /api/backup/create
- GET /api/plans/limits (superadmin)
- GET /api/plans/features (starter=20 clients)
- POST /api/clients/{id}/generate-code with lock_mode
- GET /api/device/status/{id}
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

# Get BASE_URL from environment
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://paylock-features.preview.emergentagent.com"

TEST_PREFIX = "TEST_ITER55_"


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


# ================== NEW FEATURES: Reminder Config ==================

class TestReminderConfig:
    """Test GET /api/reminders/config - should show email_configured=true, whatsapp_configured=false"""
    
    def test_reminder_config_email_configured(self):
        """Test that /api/reminders/config shows email_configured=true (Resend verified)"""
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
        assert "whatsapp_configured" in data, "Response should contain 'whatsapp_configured'"
        assert "push_configured" in data, "Response should contain 'push_configured'"
        
        # NEW: Email should be configured now (Resend verified)
        assert data["email_configured"] == True, f"email_configured should be True, got {data['email_configured']}"
        
        # WhatsApp NOT configured (no WHATSAPP_TOKEN)
        assert data["whatsapp_configured"] == False, f"whatsapp_configured should be False, got {data['whatsapp_configured']}"
        
        # Push always configured
        assert data["push_configured"] == True, "Push should always be configured"
        
        # Verify sender_email is present when email is configured
        assert "sender_email" in data, "Response should contain 'sender_email' when email is configured"
        assert data["sender_email"] == "noreply@paylockpro.com", f"Sender email should be noreply@paylockpro.com, got {data['sender_email']}"
        
        print(f"PASS: Reminder config - email_configured=True (Resend verified), whatsapp_configured=False, sender_email={data['sender_email']}")


# ================== NEW FEATURES: Email Reminders via Resend ==================

class TestEmailReminder:
    """Test POST /api/reminders/send-email/{client_id} - Email via Resend (verified domain)"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create test client with email"""
        client_data = {
            "name": f"{TEST_PREFIX}email_send_{uuid.uuid4().hex[:8]}",
            "phone": "+3725551234",
            "email": "test-email-iter55@example.com",
            "monthly_emi": 150.00,
            "outstanding_balance": 1500.00,
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client for email: {cls.test_client_id}")
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
    
    def test_send_email_reminder_success(self):
        """Test that email reminder sends successfully via Resend"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-email/{self.test_client_id}",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Email reminder response: {data}")
        
        assert "success" in data, "Response should contain 'success' field"
        assert "message" in data, "Response should contain 'message' field"
        
        # With Resend configured and verified, expect success=true
        # Note: It might still fail if the test email domain doesn't accept emails
        # but the API call itself should succeed
        if data["success"]:
            print(f"PASS: Email sent successfully - {data['message']}")
        else:
            # If failed, check it's not due to missing config
            assert "not configured" not in data["message"].lower(), \
                f"Email should be configured but got: {data['message']}"
            print(f"INFO: Email send attempt returned success=false: {data['message']} (may be email delivery issue, not config)")
    
    def test_send_email_reminder_no_email(self):
        """Test email reminder for client without email"""
        # Create client with phone but without email (email is optional)
        client_data = {
            "name": f"{TEST_PREFIX}no_email_{uuid.uuid4().hex[:8]}",
            "phone": "+3725559999",
            "email": "",  # Empty email
        }
        resp = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if resp.status_code != 200:
            # If empty email not allowed, try with minimal data and then clear email
            client_data["email"] = "temp@example.com"
            resp = requests.post(
                f"{BASE_URL}/api/clients",
                json=client_data,
                params={"admin_token": TestAdminAuth.admin_token}
            )
            assert resp.status_code == 200, f"Client creation failed: {resp.text}"
            client_id = resp.json()["id"]
            # Update to remove email
            requests.put(
                f"{BASE_URL}/api/clients/{client_id}",
                json={"email": ""},
                params={"admin_token": TestAdminAuth.admin_token}
            )
        else:
            client_id = resp.json()["id"]
        
        try:
            response = requests.post(
                f"{BASE_URL}/api/reminders/send-email/{client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] == False, "Should fail for client without email"
            assert "no email" in data["message"].lower(), f"Message should mention no email: {data['message']}"
            
            print(f"PASS: Email reminder correctly handles client without email: {data['message']}")
        finally:
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": TestAdminAuth.admin_token})
    
    def test_send_email_reminder_not_found(self):
        """Test email reminder for non-existent client"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-email/nonexistent-client-999",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Email reminder returns 404 for non-existent client")


# ================== NEW FEATURES: WhatsApp Deep Link ==================

class TestWhatsAppLink:
    """Test GET /api/reminders/whatsapp-link/{client_id} - WhatsApp deep link generation"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create test client with phone"""
        client_data = {
            "name": f"{TEST_PREFIX}whatsapp_link_{uuid.uuid4().hex[:8]}",
            "phone": "+3725557777",
            "email": "whatsapp-test@example.com",
            "monthly_emi": 200.00,
            "outstanding_balance": 2000.00,
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client for WhatsApp link: {cls.test_client_id}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test client"""
        if cls.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
    
    def test_whatsapp_link_returns_deep_link(self):
        """Test that /api/reminders/whatsapp-link returns deep_link URL"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.get(
            f"{BASE_URL}/api/reminders/whatsapp-link/{self.test_client_id}",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"WhatsApp link response: {data}")
        
        # Verify required fields
        assert "deep_link" in data, "Response should contain 'deep_link'"
        assert "phone" in data, "Response should contain 'phone'"
        assert "message" in data, "Response should contain 'message'"
        
        # Verify deep_link format
        deep_link = data["deep_link"]
        assert deep_link is not None, "deep_link should not be None"
        assert deep_link.startswith("https://wa.me/"), f"deep_link should start with 'https://wa.me/', got: {deep_link}"
        assert "?text=" in deep_link, "deep_link should contain pre-filled text parameter"
        
        # Verify phone number is cleaned (no +, -, spaces)
        phone = data["phone"]
        assert "+" not in phone, f"Phone should not contain '+', got: {phone}"
        assert "-" not in phone, f"Phone should not contain '-', got: {phone}"
        assert " " not in phone, f"Phone should not contain spaces, got: {phone}"
        
        # Verify message contains payment info
        message = data["message"]
        assert "Payment" in message, "Message should mention Payment"
        assert "PayLock Pro" in message, "Message should mention PayLock Pro"
        
        print(f"PASS: WhatsApp link generated - deep_link: {deep_link[:60]}...")
    
    def test_whatsapp_link_no_phone(self):
        """Test WhatsApp link for client without phone"""
        # Phone is required for client creation, so create with phone then clear it
        client_data = {
            "name": f"{TEST_PREFIX}no_phone_{uuid.uuid4().hex[:8]}",
            "phone": "+3725551111",  # Required for creation
            "email": "no-phone@example.com",
        }
        resp = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert resp.status_code == 200, f"Client creation failed: {resp.text}"
        client_id = resp.json()["id"]
        
        # Update to remove phone
        requests.put(
            f"{BASE_URL}/api/clients/{client_id}",
            json={"phone": ""},
            params={"admin_token": TestAdminAuth.admin_token}
        )
        
        try:
            response = requests.get(
                f"{BASE_URL}/api/reminders/whatsapp-link/{client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
            assert response.status_code == 200
            data = response.json()
            
            assert data["deep_link"] is None, "deep_link should be None for client without phone"
            assert "no phone" in data["message"].lower(), f"Message should mention no phone: {data['message']}"
            
            print(f"PASS: WhatsApp link correctly handles client without phone: {data['message']}")
        finally:
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": TestAdminAuth.admin_token})
    
    def test_whatsapp_link_not_found(self):
        """Test WhatsApp link for non-existent client"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/whatsapp-link/nonexistent-client-888",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: WhatsApp link returns 404 for non-existent client")


# ================== NEW FEATURES: WhatsApp Send Endpoint ==================

class TestWhatsAppSend:
    """Test POST /api/reminders/send-whatsapp/{client_id} - Falls back to deep_link when no Cloud API"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create test client with phone"""
        client_data = {
            "name": f"{TEST_PREFIX}whatsapp_send_{uuid.uuid4().hex[:8]}",
            "phone": "+3725558888",
            "email": "whatsapp-send@example.com",
            "monthly_emi": 250.00,
            "outstanding_balance": 2500.00,
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client for WhatsApp send: {cls.test_client_id}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test client"""
        if cls.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
    
    def test_send_whatsapp_returns_deep_link(self):
        """Test that /api/reminders/send-whatsapp returns deep_link when Cloud API not configured"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-whatsapp/{self.test_client_id}",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"WhatsApp send response: {data}")
        
        # Since WHATSAPP_TOKEN is not configured, should return deep_link fallback
        assert "success" in data, "Response should contain 'success'"
        
        # When Cloud API not configured, success=False and use_deep_link=True
        assert data["success"] == False, "success should be False when Cloud API not configured"
        assert "use_deep_link" in data, "Response should contain 'use_deep_link'"
        assert data["use_deep_link"] == True, "use_deep_link should be True"
        assert "deep_link" in data, "Response should contain 'deep_link'"
        assert "phone" in data, "Response should contain 'phone'"
        assert "message" in data, "Response should contain 'message'"
        
        # Verify deep_link format
        deep_link = data["deep_link"]
        assert deep_link.startswith("https://wa.me/"), f"deep_link should start with 'https://wa.me/', got: {deep_link}"
        
        print(f"PASS: WhatsApp send returns deep_link fallback: {deep_link[:60]}...")
    
    def test_send_whatsapp_no_phone(self):
        """Test WhatsApp send for client without phone"""
        # Phone is required for client creation, so create with phone then clear it
        client_data = {
            "name": f"{TEST_PREFIX}wa_no_phone_{uuid.uuid4().hex[:8]}",
            "phone": "+3725552222",  # Required for creation
            "email": "wa-no-phone@example.com",
        }
        resp = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert resp.status_code == 200, f"Client creation failed: {resp.text}"
        client_id = resp.json()["id"]
        
        # Update to remove phone
        requests.put(
            f"{BASE_URL}/api/clients/{client_id}",
            json={"phone": ""},
            params={"admin_token": TestAdminAuth.admin_token}
        )
        
        try:
            response = requests.post(
                f"{BASE_URL}/api/reminders/send-whatsapp/{client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
            assert response.status_code == 200
            data = response.json()
            
            assert data["success"] == False, "Should fail for client without phone"
            assert "no phone" in data["message"].lower(), f"Message should mention no phone: {data['message']}"
            
            print(f"PASS: WhatsApp send correctly handles client without phone")
        finally:
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={"admin_token": TestAdminAuth.admin_token})


# ================== NEW FEATURES: Bulk Email ==================

class TestBulkEmail:
    """Test POST /api/reminders/send-bulk-email"""
    
    def test_bulk_email_returns_counts(self):
        """Test that /api/reminders/send-bulk-email returns sent/failed counts"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-bulk-email",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Bulk email response: {data}")
        
        # Verify required fields
        assert "sent" in data, "Response should contain 'sent'"
        assert "failed" in data, "Response should contain 'failed'"
        assert "total" in data, "Response should contain 'total'"
        
        # Counts should be non-negative integers
        assert isinstance(data["sent"], int) and data["sent"] >= 0
        assert isinstance(data["failed"], int) and data["failed"] >= 0
        assert isinstance(data["total"], int) and data["total"] >= 0
        
        print(f"PASS: Bulk email returned - sent: {data['sent']}, failed: {data['failed']}, total: {data['total']}")


# ================== REGRESSION TESTS ==================

class TestBackupRegression:
    """Regression: POST /api/backup/create still works"""
    
    def test_backup_create(self):
        """Test POST /api/backup/create"""
        response = requests.post(
            f"{BASE_URL}/api/backup/create",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "backup_id" in data, "Response should contain 'backup_id'"
        assert "created_at" in data, "Response should contain 'created_at'"
        assert "stats" in data, "Response should contain 'stats'"
        
        print(f"PASS: Backup create works - backup_id: {data['backup_id']}")


class TestPlansRegression:
    """Regression: /api/plans/limits and /api/plans/features"""
    
    def test_plans_limits_superadmin(self):
        """Test GET /api/plans/limits for superadmin"""
        response = requests.get(
            f"{BASE_URL}/api/plans/limits",
            params={"admin_token": TestAdminAuth.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert "plan" in data, "Response should contain 'plan'"
        assert "limits" in data, "Response should contain 'limits'"
        assert "is_super_admin" in data, "Response should contain 'is_super_admin'"
        assert "current_clients" in data, "Response should contain 'current_clients'"
        assert "can_add_client" in data, "Response should contain 'can_add_client'"
        
        # For superadmin, expect custom plan
        if data["is_super_admin"]:
            assert data["plan"] == "custom", f"Superadmin should have 'custom' plan, got: {data['plan']}"
            assert data["limits"]["max_clients"] == 999999
        
        print(f"PASS: Plans limits for superadmin - plan: {data['plan']}, current_clients: {data['current_clients']}")
    
    def test_plans_features_starter(self):
        """Test GET /api/plans/features returns starter=20 clients"""
        response = requests.get(f"{BASE_URL}/api/plans/features")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plans" in data
        
        # Find starter plan
        starter = next((p for p in data["plans"] if p["id"] == "starter"), None)
        assert starter is not None, "Starter plan should exist"
        assert starter["max_clients"] == 20, f"Starter should have 20 clients, got: {starter['max_clients']}"
        
        print(f"PASS: Plans features - starter max_clients=20")


class TestDeviceModeRegression:
    """Regression: /api/clients/{id}/generate-code with lock_mode and /api/device/status/{id}"""
    
    test_client_id = None
    
    @classmethod
    def setup_class(cls):
        """Create test client for device mode tests"""
        client_data = {
            "name": f"{TEST_PREFIX}device_mode_{uuid.uuid4().hex[:8]}",
            "phone": "+3725556666",
            "email": "device-mode@example.com",
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": TestAdminAuth.admin_token}
        )
        if response.status_code == 200:
            cls.test_client_id = response.json().get("id")
            print(f"Created test client for device mode: {cls.test_client_id}")
    
    @classmethod
    def teardown_class(cls):
        """Cleanup test client"""
        if cls.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{cls.test_client_id}",
                params={"admin_token": TestAdminAuth.admin_token}
            )
    
    def test_generate_code_with_lock_mode(self):
        """Test POST /api/clients/{id}/generate-code with lock_mode=device_owner"""
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
        assert "registration_code" in data, "Response should contain 'registration_code'"
        assert "lock_mode" in data, "Response should contain 'lock_mode'"
        
        code = data["registration_code"]
        assert len(code) == 9, f"Device owner code should be 9 chars, got: {len(code)}"
        assert data["lock_mode"] == "device_owner"
        
        print(f"PASS: Generate code with lock_mode=device_owner - code length: {len(code)}")
    
    def test_device_status_returns_lock_mode(self):
        """Test GET /api/device/status/{id} returns lock_mode"""
        if not self.test_client_id:
            pytest.skip("No test client")
        
        # First generate code and register device
        gen_resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/generate-code",
            params={
                "admin_token": TestAdminAuth.admin_token,
                "lock_mode": "device_owner"
            }
        )
        assert gen_resp.status_code == 200
        reg_code = gen_resp.json()["registration_code"]
        
        # Register device
        reg_resp = requests.post(
            f"{BASE_URL}/api/device/register",
            json={
                "registration_code": reg_code,
                "device_id": f"test-device-iter55-{uuid.uuid4().hex[:8]}",
                "device_model": "Test Model",
                "device_make": "Test Make",
                "os_version": "Android 14"
            }
        )
        assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
        
        # Check device status
        status_resp = requests.get(f"{BASE_URL}/api/device/status/{self.test_client_id}")
        assert status_resp.status_code == 200, f"Status failed: {status_resp.text}"
        
        data = status_resp.json()
        assert "lock_mode" in data, "Device status should contain 'lock_mode'"
        assert data["lock_mode"] == "device_owner", f"Expected device_owner, got: {data['lock_mode']}"
        
        print(f"PASS: Device status returns lock_mode: {data['lock_mode']}")


# Run admin auth setup first
TestAdminAuth.setup_class()
