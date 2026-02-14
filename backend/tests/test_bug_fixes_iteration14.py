"""
Test suite for Bug Fixes - Iteration 14
Tests the following bug fixes:
1. Reports endpoints now use admin_token instead of admin_id
2. Credits assignment is now additive (7 + 10 = 17, not overwrite)
3. Loan plans endpoint works with admin_token
4. Clients endpoint works with admin_token
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://credit-system-qa.preview.emergentagent.com')

class TestLogin:
    """Test admin login functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        return data["token"]
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "id" in data
        assert data["username"] == "karli1987"
        assert data["is_super_admin"] == True


class TestReportsEndpoints:
    """Test reports endpoints with admin_token (Bug #7 fix)"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        return response.json()["token"]
    
    def test_reports_collection_with_admin_token(self, admin_token):
        """Test /api/reports/collection now accepts admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_disbursed" in data
        assert "total_collected" in data
        assert "collection_rate" in data
        assert "active_loans" in data
        assert "total_clients" in data
    
    def test_reports_clients_with_admin_token(self, admin_token):
        """Test /api/reports/clients now accepts admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/clients?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_reports_financial_with_admin_token(self, admin_token):
        """Test /api/reports/financial now accepts admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/reports/financial?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_payments" in data
        assert "payment_count" in data
        assert "monthly_breakdown" in data


class TestLoanPlansEndpoint:
    """Test loan plans endpoint (Bug #4 fix)"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        return response.json()["token"]
    
    def test_loan_plans_with_admin_token(self, admin_token):
        """Test /api/loan-plans works with admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/loan-plans?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestClientsEndpoint:
    """Test clients endpoint (Bug #5 fix)"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        return response.json()["token"]
    
    def test_clients_list_with_admin_token(self, admin_token):
        """Test /api/clients fetches clients with admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/clients?limit=500&admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have clients
        assert len(data) > 0
        # Each client should have required fields
        if len(data) > 0:
            client = data[0]
            assert "id" in client
            assert "name" in client
            assert "phone" in client


class TestCreditsAdditive:
    """Test credits assignment is additive (Bug #8 fix)"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def target_admin_id(self, admin_token):
        """Get a target admin id (non-super admin)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/list-with-credits?admin_token={admin_token}"
        )
        data = response.json()
        # Find a non-super admin
        for admin in data:
            if not admin.get("is_super_admin", False):
                return admin["id"]
        pytest.skip("No non-super admin found for testing")
    
    def test_credits_assignment_is_additive(self, admin_token, target_admin_id):
        """Test that credits assignment adds to existing balance instead of overwriting"""
        # Get current credits
        response = requests.get(
            f"{BASE_URL}/api/admin/list-with-credits?admin_token={admin_token}"
        )
        admins = response.json()
        
        # Find target admin's current credits
        current_credits = None
        for admin in admins:
            if admin["id"] == target_admin_id:
                current_credits = admin.get("credits", 0) or 0
                break
        
        assert current_credits is not None
        
        # Assign 1 credit
        assign_response = requests.post(
            f"{BASE_URL}/api/admin/credits/assign?admin_token={admin_token}",
            json={"target_admin_id": target_admin_id, "credits": 1}
        )
        assert assign_response.status_code == 200
        assign_data = assign_response.json()
        
        # Verify response shows additive behavior
        assert "previous_balance" in assign_data
        assert "added" in assign_data
        assert "new_balance" in assign_data
        
        # Verify: new_balance = previous_balance + added
        assert assign_data["new_balance"] == assign_data["previous_balance"] + assign_data["added"]
        assert assign_data["added"] == 1
        
        # Verify the credits were actually updated correctly
        verify_response = requests.get(
            f"{BASE_URL}/api/admin/list-with-credits?admin_token={admin_token}"
        )
        verify_admins = verify_response.json()
        
        new_credits = None
        for admin in verify_admins:
            if admin["id"] == target_admin_id:
                new_credits = admin.get("credits", 0)
                break
        
        # The new balance should be previous + 1
        assert new_credits == current_credits + 1


class TestDashboardAnalytics:
    """Test dashboard analytics endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        return response.json()["token"]
    
    def test_dashboard_analytics_with_admin_token(self, admin_token):
        """Test /api/analytics/dashboard works with admin_token"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "overview" in data
        assert "financial" in data
        assert "recent_activity" in data
