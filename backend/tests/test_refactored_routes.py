"""
Backend Route Regression Tests - Post Refactoring
Tests all endpoints from the modular route files:
- admin.py - Admin auth, credits management
- clients.py - Client CRUD, locations
- device.py - Device status
- loans.py - Loan plans, payments
- reports.py - Collection reports
- notifications.py - Notifications list
- support.py - Support chat
- reminders.py - Payment reminders
"""
import pytest
import requests
import os
from datetime import datetime

# Use the public URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://frontend-test-suite-3.preview.emergentagent.com')

# Test credentials from review request
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"
TEST_CLIENT_ID = "338fcce1-402d-4841-81eb-2f313f1cc144"


class TestAdminRoutes:
    """Tests for /api/admin/* endpoints from routes/admin.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token via login"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    def test_admin_login(self):
        """Test POST /api/admin/login - should return token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "token" in data
        assert "id" in data
        assert "username" in data
        assert data["username"] == ADMIN_USERNAME
        print(f"✓ Admin login successful, token received")
    
    def test_admin_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "wronguser", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print(f"✓ Invalid login correctly rejected with 401")
    
    def test_admin_credits(self, admin_token):
        """Test GET /api/admin/credits - should return credits info"""
        response = requests.get(
            f"{BASE_URL}/api/admin/credits",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "credits" in data
        assert "is_super_admin" in data
        assert isinstance(data["credits"], (int, float))
        print(f"✓ Admin credits: {data['credits']}, is_super_admin: {data['is_super_admin']}")
    
    def test_admin_verify_token(self, admin_token):
        """Test GET /api/admin/verify/{token}"""
        response = requests.get(f"{BASE_URL}/api/admin/verify/{admin_token}")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("valid") == True
        assert "admin_id" in data
        print(f"✓ Token verification successful")


class TestClientRoutes:
    """Tests for /api/clients/* endpoints from routes/clients.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_clients_list(self, admin_token):
        """Test GET /api/clients - should return list of clients"""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should be a list
        assert isinstance(data, list)
        print(f"✓ Clients list returned {len(data)} clients")
        
        # If there are clients, verify structure
        if len(data) > 0:
            client = data[0]
            assert "id" in client
            assert "name" in client
    
    def test_client_locations(self, admin_token):
        """Test GET /api/clients/locations - should return GPS data"""
        response = requests.get(
            f"{BASE_URL}/api/clients/locations",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Client locations returned {len(data)} clients with GPS")
        
        # Verify location fields if present
        for client in data:
            if "latitude" in client:
                assert "longitude" in client
                assert "id" in client
    
    def test_get_specific_client(self, admin_token):
        """Test GET /api/clients/{client_id}"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}",
            params={"admin_token": admin_token}
        )
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            assert "name" in data
            print(f"✓ Client details retrieved: {data.get('name')}")
        else:
            print(f"✓ Client {TEST_CLIENT_ID} not found (404 expected if not exists)")
    
    def test_silent_clients(self, admin_token):
        """Test GET /api/clients/silent"""
        response = requests.get(
            f"{BASE_URL}/api/clients/silent",
            params={"admin_token": admin_token, "minutes": 60}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Silent clients endpoint returned {len(data)} clients")


class TestDeviceRoutes:
    """Tests for /api/device/* endpoints from routes/device.py"""
    
    def test_device_status(self):
        """Test GET /api/device/status/{id} - should return lock status"""
        response = requests.get(f"{BASE_URL}/api/device/status/{TEST_CLIENT_ID}")
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            # Verify expected fields
            assert "is_locked" in data
            assert "name" in data
            print(f"✓ Device status: is_locked={data['is_locked']}")
        else:
            print(f"✓ Device status returns 404 for non-existent client")
    
    def test_device_location_update(self):
        """Test POST /api/device/location - requires existing client"""
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": TEST_CLIENT_ID,
                "latitude": 59.4370,
                "longitude": 24.7536
            }
        )
        # 200 if client exists, 404 if not
        assert response.status_code in [200, 404]
        print(f"✓ Device location update returned {response.status_code}")


class TestNotificationRoutes:
    """Tests for /api/notifications/* endpoints from routes/notifications.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_notifications_list(self, admin_token):
        """Test GET /api/notifications - should return notifications list"""
        response = requests.get(
            f"{BASE_URL}/api/notifications",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "notifications" in data
        assert "unread_count" in data
        assert isinstance(data["notifications"], list)
        print(f"✓ Notifications: {len(data['notifications'])} total, {data['unread_count']} unread")


class TestReportsRoutes:
    """Tests for /api/reports/* endpoints from routes/reports.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token and admin_id"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        data = response.json()
        return data["token"], data["id"]
    
    def test_reports_collection(self, admin_token):
        """Test GET /api/reports/collection - should return financial summary"""
        token, admin_id = admin_token
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_id": admin_id}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total_disbursed" in data
        assert "total_collected" in data
        assert "total_outstanding" in data
        assert "collection_rate" in data
        assert "active_loans" in data
        print(f"✓ Collection report: disbursed={data['total_disbursed']}, collected={data['total_collected']}")
    
    def test_dashboard_analytics(self, admin_token):
        """Test GET /api/analytics/dashboard"""
        token, admin_id = admin_token
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "overview" in data
        assert "financial" in data
        print(f"✓ Dashboard analytics returned with {len(data)} sections")
    
    def test_stats(self, admin_token):
        """Test GET /api/stats"""
        token, admin_id = admin_token
        response = requests.get(
            f"{BASE_URL}/api/stats",
            params={"admin_id": admin_id}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "total_clients" in data
        assert "registered_clients" in data
        assert "locked_clients" in data
        print(f"✓ Stats: {data['total_clients']} total clients")


class TestRemindersRoutes:
    """Tests for /api/reminders/* endpoints from routes/reminders.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_reminders_pending(self, admin_token):
        """Test GET /api/reminders/pending - should return payment reminders"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "summary" in data
        assert "overdue" in data
        assert "due_today" in data
        assert "due_soon" in data
        assert "upcoming" in data
        
        summary = data["summary"]
        print(f"✓ Pending reminders: overdue={summary['overdue_count']}, due_today={summary['due_today_count']}")
    
    def test_reminders_list(self, admin_token):
        """Test GET /api/reminders"""
        response = requests.get(
            f"{BASE_URL}/api/reminders",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Reminders list returned {len(data)} reminders")


class TestSupportRoutes:
    """Tests for /api/support/* endpoints from routes/support.py"""
    
    def test_support_messages(self):
        """Test GET /api/support/messages/{id} - should return chat history"""
        response = requests.get(f"{BASE_URL}/api/support/messages/{TEST_CLIENT_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Support messages: {len(data)} messages for client")
    
    def test_payment_history(self):
        """Test GET /api/payments/history/{id} - should return payment records"""
        response = requests.get(f"{BASE_URL}/api/payments/history/{TEST_CLIENT_ID}")
        assert response.status_code in [200, 404]
        
        if response.status_code == 200:
            data = response.json()
            assert "payments" in data
            assert "loan_info" in data
            print(f"✓ Payment history: {len(data['payments'])} payments")
        else:
            print(f"✓ Payment history returns 404 for non-existent client")


class TestLoanRoutes:
    """Tests for /api/loans/* endpoints from routes/loans.py"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        return response.json()["token"]
    
    def test_loan_plans_list(self, admin_token):
        """Test GET /api/loan-plans"""
        response = requests.get(
            f"{BASE_URL}/api/loan-plans",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Loan plans: {len(data)} plans")
    
    def test_calculator_compare(self):
        """Test GET /api/calculator/compare"""
        response = requests.get(
            f"{BASE_URL}/api/calculator/compare",
            params={
                "principal": 10000,
                "annual_rate": 12,
                "months": 12
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have comparison data for different methods
        assert isinstance(data, dict)
        print(f"✓ Calculator comparison returned data")


class TestHealthEndpoints:
    """Test basic health and root endpoints"""
    
    def test_health_check(self):
        """Test GET /api/health"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("status") == "healthy"
        print(f"✓ Health check passed")
    
    def test_root_endpoint(self):
        """Test GET /api/"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        
        assert "message" in data
        assert "status" in data
        print(f"✓ Root endpoint: {data['message']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
