"""
Test iteration 66 - Enhanced lock/unlock features:
- POST /api/clients/{id}/lock with reason, message, temporary, unlock_after_hours
- POST /api/clients/{id}/unlock - clears all lock fields, creates audit entry
- GET /api/clients/{id}/lock-history - returns lock/unlock audit trail
- Portal functionality with showLockHistory and enhanced toggleLock
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paylock-qa.preview.emergentagent.com").rstrip("/")


class TestLockFeaturesIteration66:
    """Test enhanced lock/unlock features for iteration 66"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token and create test client"""
        # Login
        resp = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        self.token = data.get("token")
        assert self.token, "No token in login response"
        
        # Create a test client for lock/unlock testing
        self.test_client_id = None
        client_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.token},
            json={
                "name": f"TEST_LockClient_{uuid.uuid4().hex[:8]}",
                "phone": "123456789",
                "email": "test@test.com",
                "address": "Test Address"
            }
        )
        if client_resp.status_code == 200:
            self.test_client_id = client_resp.json().get("id")
        
        yield
        
        # Cleanup: delete test client
        if self.test_client_id:
            requests.delete(
                f"{BASE_URL}/api/clients/{self.test_client_id}",
                params={"admin_token": self.token}
            )
            requests.delete(
                f"{BASE_URL}/api/clients/{self.test_client_id}/purge",
                params={"admin_token": self.token}
            )
    
    # =================== BASIC HEALTH & AUTH TESTS ===================
    
    def test_health_endpoint(self):
        """Health endpoint should return healthy status"""
        resp = requests.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint returns healthy")
    
    def test_admin_login(self):
        """Admin login with admin/admin123 should work"""
        resp = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        print("✓ Admin login works with admin/admin123")
    
    # =================== ENHANCED LOCK ENDPOINT TESTS ===================
    
    def test_lock_with_default_reason(self):
        """POST /api/clients/{id}/lock should default to 'manual' reason"""
        assert self.test_client_id, "Test client not created"
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token}
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("reason") == "manual", f"Expected reason='manual', got: {data.get('reason')}"
        assert data.get("temporary") == False
        print("✓ Lock with default reason='manual' works")
    
    def test_lock_with_reason_overdue_payment(self):
        """POST /api/clients/{id}/lock with reason=overdue_payment"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "overdue_payment"}
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("reason") == "overdue_payment"
        print("✓ Lock with reason='overdue_payment' works")
    
    def test_lock_with_reason_policy_violation(self):
        """POST /api/clients/{id}/lock with reason=policy_violation"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "policy_violation"}
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("reason") == "policy_violation"
        print("✓ Lock with reason='policy_violation' works")
    
    def test_lock_with_reason_suspicious_activity(self):
        """POST /api/clients/{id}/lock with reason=suspicious_activity"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "suspicious_activity"}
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("reason") == "suspicious_activity"
        print("✓ Lock with reason='suspicious_activity' works")
    
    def test_lock_with_reason_auto_lock(self):
        """POST /api/clients/{id}/lock with reason=auto_lock"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "auto_lock"}
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("reason") == "auto_lock"
        print("✓ Lock with reason='auto_lock' works")
    
    def test_lock_with_custom_message(self):
        """POST /api/clients/{id}/lock with custom message"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        custom_msg = "Your payment is 5 days overdue. Please pay immediately."
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={
                "admin_token": self.token, 
                "reason": "overdue_payment",
                "message": custom_msg
            }
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        
        # Verify the message was set by fetching client
        client_resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}",
            params={"admin_token": self.token}
        )
        client_data = client_resp.json()
        assert client_data.get("lock_message") == custom_msg
        print("✓ Lock with custom message works")
    
    def test_lock_temporary_with_unlock_after_hours(self):
        """POST /api/clients/{id}/lock with temporary=true and unlock_after_hours"""
        assert self.test_client_id, "Test client not created"
        
        # First unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={
                "admin_token": self.token, 
                "reason": "manual",
                "temporary": "true",
                "unlock_after_hours": 24
            }
        )
        assert resp.status_code == 200, f"Lock failed: {resp.text}"
        data = resp.json()
        assert data.get("temporary") == True
        assert data.get("auto_unlock_at") is not None, "auto_unlock_at should be set"
        print("✓ Temporary lock with unlock_after_hours works")
    
    def test_lock_invalid_reason_rejected(self):
        """POST /api/clients/{id}/lock with invalid reason should be rejected"""
        assert self.test_client_id, "Test client not created"
        
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "invalid_reason"}
        )
        # Should return 422 Unprocessable Entity for invalid enum value
        assert resp.status_code == 422, f"Expected 422 for invalid reason, got: {resp.status_code}"
        print("✓ Invalid lock reason is rejected with 422")
    
    # =================== UNLOCK ENDPOINT TESTS ===================
    
    def test_unlock_clears_all_lock_fields(self):
        """POST /api/clients/{id}/unlock should clear all lock fields"""
        assert self.test_client_id, "Test client not created"
        
        # First lock the client with various fields
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={
                "admin_token": self.token,
                "reason": "overdue_payment",
                "message": "Test lock message",
                "temporary": "true",
                "unlock_after_hours": 48
            }
        )
        
        # Now unlock
        resp = requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        assert resp.status_code == 200, f"Unlock failed: {resp.text}"
        
        # Verify all lock fields are cleared
        client_resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}",
            params={"admin_token": self.token}
        )
        assert client_resp.status_code == 200, f"Failed to get client: {client_resp.text}"
        client = client_resp.json()
        assert client.get("is_locked") == False, f"Expected is_locked=False, got: {client.get('is_locked')}"
        assert client.get("lock_reason") is None or client.get("lock_reason") == ""
        assert client.get("lock_message") is None or client.get("lock_message") == ""
        assert client.get("auto_unlock_at") is None
        assert client.get("is_temporary_lock") == False or client.get("is_temporary_lock") is None
        print("✓ Unlock clears all lock fields correctly")
    
    def test_unlock_creates_audit_entry(self):
        """POST /api/clients/{id}/unlock should create an audit entry"""
        assert self.test_client_id, "Test client not created"
        
        # Lock first
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "manual"}
        )
        
        # Unlock
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        # Check lock history has unlock entry
        history_resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock-history",
            params={"admin_token": self.token}
        )
        assert history_resp.status_code == 200
        history_data = history_resp.json()
        history = history_data.get("history", [])
        
        # Most recent entry should be unlock
        assert len(history) > 0
        latest = history[0]
        assert latest.get("action") == "unlock"
        assert latest.get("reason") == "manual_unlock"
        print("✓ Unlock creates audit entry in lock_history")
    
    # =================== LOCK HISTORY ENDPOINT TESTS ===================
    
    def test_lock_history_returns_audit_trail(self):
        """GET /api/clients/{id}/lock-history should return audit trail"""
        assert self.test_client_id, "Test client not created"
        
        # Do a few lock/unlock operations to create history
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "manual"}
        )
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={"admin_token": self.token, "reason": "overdue_payment"}
        )
        
        resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock-history",
            params={"admin_token": self.token}
        )
        assert resp.status_code == 200, f"Lock history failed: {resp.text}"
        data = resp.json()
        assert "history" in data
        assert "count" in data
        assert "client_id" in data
        assert data.get("client_id") == self.test_client_id
        
        history = data.get("history", [])
        assert len(history) >= 3, f"Expected at least 3 entries, got {len(history)}"
        
        # Check structure of history entries
        for entry in history:
            assert "action" in entry
            assert "timestamp" in entry
            assert entry.get("action") in ["lock", "unlock"]
        
        print(f"✓ Lock history returns {len(history)} audit entries correctly")
    
    def test_lock_history_includes_reason_and_message(self):
        """Lock history entries should include reason and message"""
        assert self.test_client_id, "Test client not created"
        
        # First clear any existing locks
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/unlock",
            params={"admin_token": self.token}
        )
        
        # Lock with specific reason and message
        test_msg = "Test audit message for history"
        requests.post(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock",
            params={
                "admin_token": self.token,
                "reason": "policy_violation",
                "message": test_msg
            }
        )
        
        resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock-history",
            params={"admin_token": self.token, "limit": 5}
        )
        data = resp.json()
        history = data.get("history", [])
        
        # Find the most recent lock entry
        lock_entry = next((h for h in history if h.get("action") == "lock"), None)
        assert lock_entry is not None, "No lock entry found in history"
        assert lock_entry.get("reason") == "policy_violation"
        assert lock_entry.get("message") == test_msg
        print("✓ Lock history includes reason and message")
    
    def test_lock_history_limit_parameter(self):
        """GET /api/clients/{id}/lock-history?limit=N should limit results"""
        assert self.test_client_id, "Test client not created"
        
        resp = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}/lock-history",
            params={"admin_token": self.token, "limit": 2}
        )
        assert resp.status_code == 200
        data = resp.json()
        history = data.get("history", [])
        # Should return at most 2 entries
        assert len(history) <= 2
        print("✓ Lock history limit parameter works")
    
    def test_lock_history_for_nonexistent_client(self):
        """Lock history for nonexistent client should return 404"""
        resp = requests.get(
            f"{BASE_URL}/api/clients/nonexistent_client_id/lock-history",
            params={"admin_token": self.token}
        )
        assert resp.status_code == 404
        print("✓ Lock history returns 404 for nonexistent client")
    
    # =================== PORTAL STATIC FILES TESTS ===================
    
    def test_portal_html_loads(self):
        """GET /api/portal should return HTML"""
        resp = requests.get(f"{BASE_URL}/api/portal")
        assert resp.status_code == 200
        assert "<!DOCTYPE html>" in resp.text or "<html" in resp.text
        print("✓ Portal HTML loads correctly")
    
    def test_portal_css_loads(self):
        """GET /api/portal/portal.css should return CSS"""
        resp = requests.get(f"{BASE_URL}/api/portal/portal.css")
        assert resp.status_code == 200
        assert ":root" in resp.text or "body" in resp.text
        print("✓ Portal CSS loads correctly")
    
    def test_portal_js_loads(self):
        """GET /api/portal/portal-app.js should return JS"""
        resp = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert resp.status_code == 200
        assert "function" in resp.text
        print("✓ Portal JS loads correctly")
    
    def test_portal_js_has_showLockHistory(self):
        """Portal JS should contain showLockHistory function"""
        resp = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert resp.status_code == 200
        assert "showLockHistory" in resp.text
        print("✓ Portal JS contains showLockHistory function")
    
    def test_portal_js_has_enhanced_toggleLock(self):
        """Portal JS should have enhanced toggleLock with reason support"""
        resp = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert resp.status_code == 200
        # Check for reason parameter handling
        assert "reason" in resp.text
        assert "toggleLock" in resp.text
        print("✓ Portal JS has enhanced toggleLock with reason support")
    
    # =================== DOWNLOAD WEBSITE TEST ===================
    
    def test_download_website_zip(self):
        """GET /api/download/website should return ZIP file"""
        resp = requests.get(f"{BASE_URL}/api/download/website")
        assert resp.status_code == 200
        # Check content type is ZIP
        content_type = resp.headers.get("Content-Type", "")
        assert "zip" in content_type.lower() or "octet-stream" in content_type.lower()
        # Check it has content
        assert len(resp.content) > 0
        print("✓ Download website returns ZIP file")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
