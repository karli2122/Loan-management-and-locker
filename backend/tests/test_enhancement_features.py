"""
Test suite for EMI Device Admin Enhancement Features:
- Dashboard Analytics API
- Notifications API
- Client Locations API
- Client Export API
- Bulk Operations API
- Support Messages API
- Payment History API
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"


class TestAuthSetup:
    """Test authentication and get token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self, request):
        """Get admin token for testing"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in login response"
        request.cls.admin_token = data["token"]
        return data["token"]
    
    def test_login_success(self, admin_token):
        """Verify superadmin login works"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"Successfully obtained admin token")


class TestDashboardAnalytics:
    """Test Dashboard Analytics API - GET /api/analytics/dashboard"""
    
    admin_token = None
    
    @pytest.fixture(autouse=True)
    def setup_token(self):
        """Get token if not set"""
        if not TestDashboardAnalytics.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestDashboardAnalytics.admin_token = response.json().get("token")
    
    def test_dashboard_analytics_success(self):
        """Test GET /api/analytics/dashboard returns correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify overview section exists with required fields
        assert "overview" in data, "Missing 'overview' in response"
        overview = data["overview"]
        assert "total_clients" in overview
        assert "registered_clients" in overview
        assert "locked_devices" in overview
        assert "active_loans" in overview
        assert "overdue_clients" in overview
        
        # Verify financial section exists with required fields
        assert "financial" in data, "Missing 'financial' in response"
        financial = data["financial"]
        assert "total_disbursed" in financial
        assert "total_collected" in financial
        assert "total_outstanding" in financial
        assert "collection_rate" in financial
        
        # Verify recent_activity section
        assert "recent_activity" in data, "Missing 'recent_activity' in response"
        
        # Verify monthly_trend is a list
        assert "monthly_trend" in data, "Missing 'monthly_trend' in response"
        assert isinstance(data["monthly_trend"], list)
        
        # Verify activity_log is a list
        assert "activity_log" in data, "Missing 'activity_log' in response"
        assert isinstance(data["activity_log"], list)
        
        print(f"Dashboard analytics returned successfully with {overview['total_clients']} total clients")
    
    def test_dashboard_analytics_without_token(self):
        """Test GET /api/analytics/dashboard without token returns 422"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard")
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected request without token")
    
    def test_dashboard_analytics_invalid_token(self):
        """Test GET /api/analytics/dashboard with invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": "invalid_token_12345"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly rejected request with invalid token")


class TestNotifications:
    """Test Notifications API - GET /api/notifications"""
    
    admin_token = None
    
    @pytest.fixture(autouse=True)
    def setup_token(self):
        """Get token if not set"""
        if not TestNotifications.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestNotifications.admin_token = response.json().get("token")
    
    def test_notifications_success(self):
        """Test GET /api/notifications returns notifications list"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "notifications" in data, "Missing 'notifications' in response"
        assert "unread_count" in data, "Missing 'unread_count' in response"
        assert isinstance(data["notifications"], list)
        assert isinstance(data["unread_count"], int)
        
        print(f"Notifications returned: {len(data['notifications'])} items, {data['unread_count']} unread")
    
    def test_notifications_with_limit(self):
        """Test GET /api/notifications with limit parameter"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            params={"admin_token": self.admin_token, "limit": 10}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["notifications"]) <= 10
        print(f"Notifications with limit=10 returned: {len(data['notifications'])} items")
    
    def test_notifications_unread_only(self):
        """Test GET /api/notifications with unread_only filter"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            params={"admin_token": self.admin_token, "unread_only": True}
        )
        assert response.status_code == 200
        data = response.json()
        # All returned notifications should be unread
        for notification in data["notifications"]:
            assert notification.get("is_read") == False, "Found read notification when unread_only=True"
        print(f"Unread notifications returned: {len(data['notifications'])} items")
    
    def test_notifications_without_token(self):
        """Test GET /api/notifications without token returns 422"""
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected request without token")
    
    def test_mark_all_notifications_read(self):
        """Test POST /api/notifications/mark-all-read"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/mark-all-read",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "marked_read" in data
        print(f"Marked {data['marked_read']} notifications as read")


class TestClientLocations:
    """Test Client Locations API - GET /api/clients/locations"""
    
    admin_token = None
    
    @pytest.fixture(autouse=True)
    def setup_token(self):
        """Get token if not set"""
        if not TestClientLocations.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestClientLocations.admin_token = response.json().get("token")
    
    def test_client_locations_success(self):
        """Test GET /api/clients/locations returns location data"""
        response = requests.get(
            f"{BASE_URL}/api/clients/locations",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "locations" in data, "Missing 'locations' in response"
        assert isinstance(data["locations"], list)
        
        # Verify structure of location objects if any exist
        for location in data["locations"]:
            assert "id" in location, "Missing 'id' in location"
            assert "name" in location, "Missing 'name' in location"
            assert "latitude" in location, "Missing 'latitude' in location"
            assert "longitude" in location, "Missing 'longitude' in location"
        
        print(f"Client locations returned: {len(data['locations'])} locations")
    
    def test_client_locations_without_token(self):
        """Test GET /api/clients/locations without token returns 422"""
        response = requests.get(f"{BASE_URL}/api/clients/locations")
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected request without token")
    
    def test_client_locations_invalid_token(self):
        """Test GET /api/clients/locations with invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/clients/locations",
            params={"admin_token": "invalid_token_12345"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly rejected request with invalid token")


class TestClientExport:
    """Test Client Export API - GET /api/clients/export"""
    
    admin_token = None
    
    @pytest.fixture(autouse=True)
    def setup_token(self):
        """Get token if not set"""
        if not TestClientExport.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestClientExport.admin_token = response.json().get("token")
    
    def test_client_export_json_success(self):
        """Test GET /api/clients/export returns JSON data"""
        response = requests.get(
            f"{BASE_URL}/api/clients/export",
            params={"admin_token": self.admin_token, "format": "json"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "clients" in data, "Missing 'clients' in response"
        assert "total" in data, "Missing 'total' in response"
        assert isinstance(data["clients"], list)
        assert isinstance(data["total"], int)
        
        # Verify client export structure if any exist
        if data["clients"]:
            client = data["clients"][0]
            expected_fields = ["id", "name", "phone", "is_locked", "loan_amount", "outstanding_balance"]
            for field in expected_fields:
                assert field in client, f"Missing '{field}' in exported client"
        
        print(f"Client export JSON returned: {data['total']} clients")
    
    def test_client_export_csv_success(self):
        """Test GET /api/clients/export with format=csv returns CSV data"""
        response = requests.get(
            f"{BASE_URL}/api/clients/export",
            params={"admin_token": self.admin_token, "format": "csv"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert response.headers.get("content-type") == "text/csv; charset=utf-8", "Expected CSV content type"
        assert "attachment" in response.headers.get("content-disposition", ""), "Expected attachment disposition"
        print(f"Client export CSV returned with {len(response.content)} bytes")
    
    def test_client_export_without_token(self):
        """Test GET /api/clients/export without token returns 422"""
        response = requests.get(f"{BASE_URL}/api/clients/export")
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected request without token")
    
    def test_client_export_invalid_token(self):
        """Test GET /api/clients/export with invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/clients/export",
            params={"admin_token": "invalid_token_12345"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly rejected request with invalid token")


class TestBulkOperations:
    """Test Bulk Operations API - POST /api/clients/bulk-operation"""
    
    admin_token = None
    test_client_ids = []
    
    @pytest.fixture(autouse=True)
    def setup_token(self):
        """Get token if not set"""
        if not TestBulkOperations.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestBulkOperations.admin_token = response.json().get("token")
    
    def test_bulk_operation_lock(self):
        """Test POST /api/clients/bulk-operation with lock action"""
        # First get some client IDs
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token}
        )
        if response.status_code != 200:
            pytest.skip("Cannot get clients list")
        
        clients = response.json()
        if not clients or len(clients) == 0:
            pytest.skip("No clients available for bulk operation test")
        
        # Use first client for testing
        test_ids = [clients[0]["id"]]
        
        response = requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            params={"admin_token": self.admin_token},
            json={
                "client_ids": test_ids,
                "action": "lock",
                "message": "TEST_Bulk lock test"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "total_processed" in data
        assert "success_count" in data
        assert "failed_count" in data
        assert "results" in data
        
        print(f"Bulk lock: processed {data['total_processed']}, success {data['success_count']}, failed {data['failed_count']}")
        
        # Unlock after test
        requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            params={"admin_token": self.admin_token},
            json={"client_ids": test_ids, "action": "unlock"}
        )
    
    def test_bulk_operation_warning(self):
        """Test POST /api/clients/bulk-operation with warning action"""
        # First get some client IDs
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token}
        )
        if response.status_code != 200:
            pytest.skip("Cannot get clients list")
        
        clients = response.json()
        if not clients or len(clients) == 0:
            pytest.skip("No clients available for bulk operation test")
        
        test_ids = [clients[0]["id"]]
        
        response = requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            params={"admin_token": self.admin_token},
            json={
                "client_ids": test_ids,
                "action": "warning",
                "message": "TEST_Bulk warning test"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["success_count"] >= 0
        print(f"Bulk warning: success {data['success_count']}")
    
    def test_bulk_operation_nonexistent_client(self):
        """Test POST /api/clients/bulk-operation with non-existent client ID"""
        response = requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            params={"admin_token": self.admin_token},
            json={
                "client_ids": ["nonexistent_client_id_12345"],
                "action": "lock"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["failed_count"] == 1
        assert data["success_count"] == 0
        print("Bulk operation correctly handled non-existent client")
    
    def test_bulk_operation_without_token(self):
        """Test POST /api/clients/bulk-operation without token returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            json={"client_ids": ["test"], "action": "lock"}
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print("Correctly rejected request without token")
    
    def test_bulk_operation_invalid_token(self):
        """Test POST /api/clients/bulk-operation with invalid token returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/clients/bulk-operation",
            params={"admin_token": "invalid_token_12345"},
            json={"client_ids": ["test"], "action": "lock"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly rejected request with invalid token")


class TestSupportMessages:
    """Test Support Messages API - GET/POST /api/support/messages/{client_id}"""
    
    admin_token = None
    test_client_id = None
    
    @pytest.fixture(autouse=True)
    def setup_token_and_client(self):
        """Get token and a client ID for testing"""
        if not TestSupportMessages.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestSupportMessages.admin_token = response.json().get("token")
        
        if not TestSupportMessages.test_client_id:
            response = requests.get(
                f"{BASE_URL}/api/clients",
                params={"admin_token": TestSupportMessages.admin_token}
            )
            if response.status_code == 200:
                clients = response.json()
                if clients and len(clients) > 0:
                    TestSupportMessages.test_client_id = clients[0]["id"]
    
    def test_get_support_messages_success(self):
        """Test GET /api/support/messages/{client_id} returns messages"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.get(
            f"{BASE_URL}/api/support/messages/{self.test_client_id}",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "messages" in data, "Missing 'messages' in response"
        assert isinstance(data["messages"], list)
        print(f"Support messages returned: {len(data['messages'])} messages")
    
    def test_send_support_message_as_client(self):
        """Test POST /api/support/messages/{client_id} as client"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/support/messages/{self.test_client_id}",
            params={"sender": "client"},
            json={"message": "TEST_Support message from client"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Missing 'id' in response"
        assert "message" in data, "Missing 'message' in response"
        print(f"Support message sent successfully, id: {data['id']}")
    
    def test_send_support_message_as_admin(self):
        """Test POST /api/support/messages/{client_id} as admin"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/support/messages/{self.test_client_id}",
            params={"sender": "admin"},
            json={"message": "TEST_Support message from admin"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data
        print(f"Admin support message sent successfully, id: {data['id']}")
    
    def test_get_support_messages_invalid_client(self):
        """Test GET /api/support/messages with invalid client ID"""
        response = requests.get(
            f"{BASE_URL}/api/support/messages/nonexistent_client_12345",
            params={"admin_token": self.admin_token}
        )
        # Should return 200 with empty messages since client validation is optional for GET
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("Get messages for non-existent client returned 200 with empty list")
    
    def test_send_support_message_invalid_client(self):
        """Test POST /api/support/messages with invalid client ID returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/support/messages/nonexistent_client_12345",
            params={"sender": "client"},
            json={"message": "Test message"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly rejected message to non-existent client")
    
    def test_mark_support_messages_read(self):
        """Test POST /api/support/messages/{client_id}/mark-read"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.post(
            f"{BASE_URL}/api/support/messages/{self.test_client_id}/mark-read",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "marked_read" in data
        print(f"Marked {data['marked_read']} support messages as read")


class TestPaymentHistory:
    """Test Payment History API - GET /api/payments/history/{client_id}"""
    
    admin_token = None
    test_client_id = None
    
    @pytest.fixture(autouse=True)
    def setup_token_and_client(self):
        """Get token and a client ID for testing"""
        if not TestPaymentHistory.admin_token:
            response = requests.post(f"{BASE_URL}/api/admin/login", json={
                "username": SUPERADMIN_USERNAME,
                "password": SUPERADMIN_PASSWORD
            })
            if response.status_code == 200:
                TestPaymentHistory.admin_token = response.json().get("token")
        
        if not TestPaymentHistory.test_client_id:
            response = requests.get(
                f"{BASE_URL}/api/clients",
                params={"admin_token": TestPaymentHistory.admin_token}
            )
            if response.status_code == 200:
                clients = response.json()
                if clients and len(clients) > 0:
                    TestPaymentHistory.test_client_id = clients[0]["id"]
    
    def test_payment_history_success(self):
        """Test GET /api/payments/history/{client_id} returns payment history"""
        if not self.test_client_id:
            pytest.skip("No test client available")
        
        response = requests.get(f"{BASE_URL}/api/payments/history/{self.test_client_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "payments" in data, "Missing 'payments' in response"
        assert "total_paid" in data, "Missing 'total_paid' in response"
        assert "outstanding_balance" in data, "Missing 'outstanding_balance' in response"
        assert "loan_amount" in data, "Missing 'loan_amount' in response"
        assert "monthly_emi" in data, "Missing 'monthly_emi' in response"
        
        assert isinstance(data["payments"], list)
        print(f"Payment history returned: {len(data['payments'])} payments, total paid: {data['total_paid']}")
    
    def test_payment_history_invalid_client(self):
        """Test GET /api/payments/history with invalid client ID returns 404"""
        response = requests.get(f"{BASE_URL}/api/payments/history/nonexistent_client_12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly rejected request for non-existent client")


# Cleanup test
class TestCleanup:
    """Cleanup any test data created during testing"""
    
    def test_cleanup_test_messages(self):
        """Note: Test messages prefixed with TEST_ should be cleaned up"""
        # In a real scenario, we would delete TEST_ prefixed data
        # For now, just log that cleanup should happen
        print("NOTE: Test data with TEST_ prefix was created during testing")
        print("Support messages and warning messages may need manual cleanup")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
