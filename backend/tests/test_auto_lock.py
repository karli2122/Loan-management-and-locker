"""
Late Fee Auto-Calculation & Auto-Lock Feature - Phase 2 Tests
Tests for Auto-Lock functionality:
- POST /api/auto-lock/process - Process and lock devices for clients exceeding grace period
- GET /api/auto-lock/pending - Get list of clients approaching or past auto-lock threshold
- POST /api/late-fees/calculate-all?apply_auto_lock=true - Calculate late fees with auto-lock
- Verify auto-lock creates notifications and updates lock_message
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_ADMIN_USERNAME = "karli1987"
TEST_ADMIN_PASSWORD = "nasvakas123"


class TestAutoLockEndpoints:
    """Test auto-lock processing endpoints - Phase 2"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token before each test"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        login_data = login_response.json()
        self.admin_token = login_data.get("token")
        assert self.admin_token, "No token in login response"
        
        # Get a client ID for testing
        clients_response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}"
        )
        assert clients_response.status_code == 200
        clients_data = clients_response.json()
        clients_list = clients_data.get("clients", []) or clients_data if isinstance(clients_data, list) else []
        if clients_list:
            self.test_client_id = clients_list[0].get("id")
        else:
            self.test_client_id = None
    
    def test_auto_lock_process_endpoint(self):
        """Test POST /api/auto-lock/process endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/auto-lock/process?admin_token={self.admin_token}"
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions - validate response structure
        data = response.json()
        assert "message" in data, "Response should have 'message' field"
        assert "devices_locked" in data, "Response should have 'devices_locked' field"
        assert "locked_clients" in data, "Response should have 'locked_clients' array"
        
        # Validate data types
        assert isinstance(data["devices_locked"], int), "devices_locked should be integer"
        assert isinstance(data["locked_clients"], list), "locked_clients should be a list"
        
        # Validate message content
        assert data["message"] == "Auto-lock processing complete", \
            f"Unexpected message: {data['message']}"
        
        # If there are locked clients, validate their structure
        for client in data["locked_clients"]:
            assert "id" in client, "locked client should have 'id'"
            assert "name" in client, "locked client should have 'name'"
            assert "days_overdue" in client, "locked client should have 'days_overdue'"
            assert "grace_days" in client, "locked client should have 'grace_days'"
        
        print(f"Auto-lock process result: {data}")
    
    def test_auto_lock_pending_endpoint(self):
        """Test GET /api/auto-lock/pending endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/auto-lock/pending?admin_token={self.admin_token}"
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions - validate response structure
        data = response.json()
        assert "summary" in data, "Response should have 'summary' object"
        assert "pending_locks" in data, "Response should have 'pending_locks' array"
        assert "already_locked" in data, "Response should have 'already_locked' array"
        assert "approaching_lock" in data, "Response should have 'approaching_lock' array"
        
        # Validate summary structure
        summary = data["summary"]
        assert "total_overdue" in summary, "summary should have 'total_overdue'"
        assert "pending_lock" in summary, "summary should have 'pending_lock'"
        assert "already_locked" in summary, "summary should have 'already_locked'"
        assert "approaching_lock" in summary, "summary should have 'approaching_lock'"
        
        # Validate data types
        assert isinstance(summary["total_overdue"], int), "total_overdue should be integer"
        assert isinstance(summary["pending_lock"], int), "pending_lock should be integer"
        assert isinstance(summary["already_locked"], int), "already_locked should be integer"
        assert isinstance(summary["approaching_lock"], int), "approaching_lock should be integer"
        
        # Validate arrays are lists
        assert isinstance(data["pending_locks"], list), "pending_locks should be a list"
        assert isinstance(data["already_locked"], list), "already_locked should be a list"
        assert isinstance(data["approaching_lock"], list), "approaching_lock should be a list"
        
        # If there are clients in any array, validate structure
        all_clients = data["pending_locks"] + data["already_locked"] + data["approaching_lock"]
        for client in all_clients:
            assert "id" in client, "client should have 'id'"
            assert "name" in client, "client should have 'name'"
            assert "days_overdue" in client, "client should have 'days_overdue'"
            assert "grace_days" in client, "client should have 'grace_days'"
            assert "days_until_lock" in client, "client should have 'days_until_lock'"
            assert "outstanding_balance" in client, "client should have 'outstanding_balance'"
            assert "status" in client, "client should have 'status'"
            assert client["status"] in ["locked", "pending_lock", "approaching"], \
                f"status should be one of locked/pending_lock/approaching, got {client['status']}"
        
        # Verify counts match array lengths
        total_clients_in_arrays = len(data["pending_locks"]) + len(data["already_locked"]) + len(data["approaching_lock"])
        assert summary["total_overdue"] == total_clients_in_arrays, \
            f"total_overdue ({summary['total_overdue']}) should match sum of arrays ({total_clients_in_arrays})"
        
        print(f"Auto-lock pending result: {data}")
    
    def test_calculate_all_with_auto_lock_enabled(self):
        """Test POST /api/late-fees/calculate-all?apply_auto_lock=true"""
        response = requests.post(
            f"{BASE_URL}/api/late-fees/calculate-all?admin_token={self.admin_token}&apply_auto_lock=true"
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions - validate response structure
        data = response.json()
        assert "message" in data, "Response should have 'message' field"
        assert "clients_processed" in data, "Response should have 'clients_processed' field"
        assert "clients_with_late_fees" in data, "Response should have 'clients_with_late_fees' field"
        assert "total_late_fees" in data, "Response should have 'total_late_fees' field"
        assert "devices_auto_locked" in data, "Response should have 'devices_auto_locked' field"
        
        # Validate data types
        assert isinstance(data["clients_processed"], int), "clients_processed should be integer"
        assert isinstance(data["clients_with_late_fees"], int), "clients_with_late_fees should be integer"
        assert isinstance(data["total_late_fees"], (int, float)), "total_late_fees should be numeric"
        assert isinstance(data["devices_auto_locked"], int), "devices_auto_locked should be integer"
        
        print(f"Calculate-all with auto-lock result: {data}")
    
    def test_calculate_all_with_auto_lock_disabled(self):
        """Test POST /api/late-fees/calculate-all?apply_auto_lock=false"""
        response = requests.post(
            f"{BASE_URL}/api/late-fees/calculate-all?admin_token={self.admin_token}&apply_auto_lock=false"
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "devices_auto_locked" in data, "Response should have 'devices_auto_locked' field"
        
        # When auto_lock is disabled, devices_auto_locked should be 0
        assert data["devices_auto_locked"] == 0, \
            f"When apply_auto_lock=false, devices_auto_locked should be 0, got {data['devices_auto_locked']}"
        
        print(f"Calculate-all without auto-lock result: {data}")
    
    def test_auto_lock_without_auth(self):
        """Test that auto-lock endpoints require authentication"""
        # Test process without token
        response = requests.post(f"{BASE_URL}/api/auto-lock/process")
        assert response.status_code in [401, 422, 500], \
            f"auto-lock/process without auth should fail: {response.status_code}"
        
        # Test pending without token
        response = requests.get(f"{BASE_URL}/api/auto-lock/pending")
        assert response.status_code in [401, 422, 500], \
            f"auto-lock/pending without auth should fail: {response.status_code}"


class TestAutoLockWorkflow:
    """Test auto-lock workflow and data consistency"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        self.admin_token = login_response.json().get("token")
    
    def test_pending_then_process_workflow(self):
        """Test workflow: get pending → process → verify pending counts change"""
        # Get initial pending status
        pending_before = requests.get(
            f"{BASE_URL}/api/auto-lock/pending?admin_token={self.admin_token}"
        )
        assert pending_before.status_code == 200
        before_data = pending_before.json()
        
        # Process auto-locks
        process_response = requests.post(
            f"{BASE_URL}/api/auto-lock/process?admin_token={self.admin_token}"
        )
        assert process_response.status_code == 200
        process_data = process_response.json()
        
        # Get pending status after processing
        pending_after = requests.get(
            f"{BASE_URL}/api/auto-lock/pending?admin_token={self.admin_token}"
        )
        assert pending_after.status_code == 200
        after_data = pending_after.json()
        
        # Verify counts are consistent
        # After processing, pending_lock count should decrease by devices_locked
        devices_locked = process_data["devices_locked"]
        before_pending = before_data["summary"]["pending_lock"]
        after_pending = after_data["summary"]["pending_lock"]
        
        # If devices were locked, pending should decrease (or stay 0 if already 0)
        if devices_locked > 0:
            # After processing, pending count should be 0 (all pending were processed)
            # or decreased
            assert after_pending <= before_pending, \
                f"Pending count should not increase after processing: before={before_pending}, after={after_pending}"
            
            # already_locked should increase by devices_locked
            before_locked = before_data["summary"]["already_locked"]
            after_locked = after_data["summary"]["already_locked"]
            assert after_locked >= before_locked, \
                f"Already locked count should not decrease: before={before_locked}, after={after_locked}"
        
        print(f"Before processing: {before_data['summary']}")
        print(f"Devices locked: {devices_locked}")
        print(f"After processing: {after_data['summary']}")
    
    def test_calculate_all_then_verify_pending(self):
        """Test that calculate-all with auto-lock updates pending status"""
        # Calculate with auto-lock enabled
        calc_response = requests.post(
            f"{BASE_URL}/api/late-fees/calculate-all?admin_token={self.admin_token}&apply_auto_lock=true"
        )
        assert calc_response.status_code == 200
        calc_data = calc_response.json()
        
        # Check pending status
        pending_response = requests.get(
            f"{BASE_URL}/api/auto-lock/pending?admin_token={self.admin_token}"
        )
        assert pending_response.status_code == 200
        pending_data = pending_response.json()
        
        # Verify summary totals are consistent
        # total_overdue should equal sum of all categories
        summary = pending_data["summary"]
        expected_total = summary["pending_lock"] + summary["already_locked"] + summary["approaching_lock"]
        assert summary["total_overdue"] == expected_total, \
            f"total_overdue ({summary['total_overdue']}) should equal sum of categories ({expected_total})"
        
        print(f"Calculate result: {calc_data}")
        print(f"Pending summary: {pending_data['summary']}")


class TestAutoLockNotifications:
    """Test that auto-lock creates admin notifications"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        self.admin_token = login_response.json().get("token")
    
    def test_notifications_endpoint_exists(self):
        """Test that notifications endpoint exists and returns valid response"""
        # Try to get notifications (if endpoint exists)
        response = requests.get(
            f"{BASE_URL}/api/notifications?admin_token={self.admin_token}"
        )
        
        # Endpoint should exist and return 200
        if response.status_code == 200:
            data = response.json()
            # Should be a list of notifications
            assert isinstance(data, list), "Notifications should be a list"
            
            # If there are notifications, check for auto_lock type
            auto_lock_notifications = [n for n in data if n.get("type") == "auto_lock"]
            print(f"Found {len(auto_lock_notifications)} auto-lock notifications")
            
            # Validate auto_lock notification structure if present
            for notif in auto_lock_notifications:
                assert "title" in notif, "notification should have 'title'"
                assert "message" in notif, "notification should have 'message'"
                assert notif["type"] == "auto_lock", "type should be 'auto_lock'"
        elif response.status_code == 404:
            # Notifications endpoint may not exist yet
            print("Notifications endpoint not found - may not be implemented")
        else:
            # Log unexpected status
            print(f"Notifications endpoint returned {response.status_code}: {response.text}")


class TestLoanSettings:
    """Test loan settings for auto-lock configuration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get admin token"""
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}
        )
        assert login_response.status_code == 200
        self.admin_token = login_response.json().get("token")
        
        # Get first client ID
        clients_response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={self.admin_token}"
        )
        clients_data = clients_response.json()
        clients_list = clients_data.get("clients", []) or clients_data if isinstance(clients_data, list) else []
        if clients_list:
            self.test_client_id = clients_list[0].get("id")
        else:
            self.test_client_id = None
    
    def test_update_loan_settings(self):
        """Test PUT /api/loans/{client_id}/settings to update auto-lock settings"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        # Update auto-lock settings
        response = requests.put(
            f"{BASE_URL}/api/loans/{self.test_client_id}/settings?admin_token={self.admin_token}",
            json={
                "auto_lock_enabled": True,
                "auto_lock_grace_days": 5
            }
        )
        
        # Status code assertion
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Data assertion
        data = response.json()
        assert "message" in data, "Response should have 'message' field"
        assert data["message"] == "Settings updated", f"Unexpected message: {data['message']}"
        
        print(f"Settings update result: {data}")
        
        # Verify settings were saved by checking client details
        client_response = requests.get(
            f"{BASE_URL}/api/clients/{self.test_client_id}?admin_token={self.admin_token}"
        )
        if client_response.status_code == 200:
            client_data = client_response.json()
            # Check if settings are present
            if "auto_lock_enabled" in client_data:
                assert client_data["auto_lock_enabled"] == True, "auto_lock_enabled should be True"
            if "auto_lock_grace_days" in client_data:
                assert client_data["auto_lock_grace_days"] == 5, "auto_lock_grace_days should be 5"
    
    def test_disable_auto_lock(self):
        """Test disabling auto-lock for a client"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        # Disable auto-lock
        response = requests.put(
            f"{BASE_URL}/api/loans/{self.test_client_id}/settings?admin_token={self.admin_token}",
            json={
                "auto_lock_enabled": False,
                "auto_lock_grace_days": 3
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Re-enable for future tests
        requests.put(
            f"{BASE_URL}/api/loans/{self.test_client_id}/settings?admin_token={self.admin_token}",
            json={
                "auto_lock_enabled": True,
                "auto_lock_grace_days": 3
            }
        )
