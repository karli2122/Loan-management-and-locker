"""
Test iteration 59: New PayLock Pro features
- Dashboard Chart.js charts (Revenue, Profit, Collection, Distribution)
- Payment Scheduling CRUD (POST/GET/PUT/DELETE /schedules)
- Activity Log (GET /audit-logs with filtering)
- Role-based sidebar (login response includes permissions)
- Verify endpoint improvements (is_super_admin, permissions)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paylock-features.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    """Login as admin and get token."""
    response = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture(scope="module")
def admin_data(admin_token):
    """Get admin data from login including permissions."""
    response = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    return response.json()


class TestDashboardCharts:
    """Test dashboard analytics endpoints that provide data for Chart.js charts."""
    
    def test_analytics_dashboard_endpoint(self, admin_token):
        """GET /analytics/dashboard - Returns overview data for charts."""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard?admin_token={admin_token}")
        assert response.status_code == 200, f"Analytics dashboard failed: {response.text}"
        data = response.json()
        assert "overview" in data, "Missing 'overview' in analytics dashboard response"
        assert "financial" in data, "Missing 'financial' in analytics dashboard response"
        # These are used for Loan Distribution chart
        overview = data["overview"]
        assert "total_clients" in overview
        assert "active_loans" in overview
        assert "overdue" in overview
    
    def test_reports_financial_endpoint(self, admin_token):
        """GET /reports/financial - Returns monthly_trend for Revenue/Profit charts."""
        response = requests.get(f"{BASE_URL}/api/reports/financial?admin_token={admin_token}")
        assert response.status_code == 200, f"Reports financial failed: {response.text}"
        data = response.json()
        # monthly_trend is used for Revenue Trends, Profit Trends, Collection Rates charts
        assert "monthly_trend" in data, "Missing 'monthly_trend' in financial report"
        assert isinstance(data["monthly_trend"], list)
    
    def test_reports_collection_endpoint(self, admin_token):
        """GET /reports/collection - Returns collection data."""
        response = requests.get(f"{BASE_URL}/api/reports/collection?admin_token={admin_token}")
        assert response.status_code == 200, f"Reports collection failed: {response.text}"
        data = response.json()
        # Used for dashboard stats
        assert "financial" in data or "this_month" in data


class TestPaymentSchedulingCRUD:
    """Test payment scheduling CRUD operations."""
    
    def test_create_schedule(self, admin_token):
        """POST /schedules - Create a new payment schedule."""
        # First need a client ID - get from clients list or use test data
        clients_response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        clients_data = clients_response.json()
        clients = clients_data.get("clients", [])
        
        if not clients:
            pytest.skip("No clients available to create schedule for")
        
        client_id = clients[0]["id"]
        
        payload = {
            "client_id": client_id,
            "amount": 100.00,
            "frequency": "monthly",
            "day_of_month": 15,
            "reminder_days_before": 3,
            "auto_reminder": True,
            "reminder_channels": ["push", "email"]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/schedules?admin_token={admin_token}",
            json=payload
        )
        assert response.status_code == 200, f"Create schedule failed: {response.text}"
        data = response.json()
        assert "id" in data, "Created schedule should have an ID"
        assert data["client_id"] == client_id
        assert data["frequency"] == "monthly"
        assert data["is_active"] == True
        
        # Store for cleanup
        return data["id"]
    
    def test_list_schedules(self, admin_token):
        """GET /schedules - List all payment schedules."""
        response = requests.get(f"{BASE_URL}/api/schedules?admin_token={admin_token}")
        assert response.status_code == 200, f"List schedules failed: {response.text}"
        data = response.json()
        assert "schedules" in data, "Missing 'schedules' key in response"
        assert "total" in data, "Missing 'total' key in response"
        assert isinstance(data["schedules"], list)
    
    def test_get_due_today(self, admin_token):
        """GET /schedules/due/today - Get schedules due today."""
        response = requests.get(f"{BASE_URL}/api/schedules/due/today?admin_token={admin_token}")
        assert response.status_code == 200, f"Get due today failed: {response.text}"
        data = response.json()
        assert "due_schedules" in data
        assert "count" in data
    
    def test_schedule_crud_full_flow(self, admin_token):
        """Full CRUD flow: Create -> Read -> Update -> Delete a schedule."""
        # Get a client
        clients_response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        clients_data = clients_response.json()
        clients = clients_data.get("clients", [])
        
        if not clients:
            pytest.skip("No clients available to create schedule for")
        
        client_id = clients[0]["id"]
        
        # CREATE
        create_payload = {
            "client_id": client_id,
            "amount": 50.00,
            "frequency": "weekly",
            "day_of_month": 5,
            "auto_reminder": False
        }
        create_response = requests.post(
            f"{BASE_URL}/api/schedules?admin_token={admin_token}",
            json=create_payload
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        schedule_id = created["id"]
        
        # READ - Get specific schedule
        get_response = requests.get(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}")
        assert get_response.status_code == 200, f"Get schedule failed: {get_response.text}"
        fetched = get_response.json()
        assert fetched["id"] == schedule_id
        assert fetched["amount"] == 50.00
        
        # UPDATE - Toggle active status
        update_response = requests.put(
            f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}",
            json={"is_active": False}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["is_active"] == False
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        delete_data = delete_response.json()
        assert delete_data.get("deleted") == True
        
        # Verify deleted - should return error or not found
        verify_response = requests.get(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}")
        # Either 404 or returns error object
        if verify_response.status_code == 200:
            data = verify_response.json()
            assert "error" in data or data.get("id") is None


class TestActivityLog:
    """Test audit/activity log endpoints."""
    
    def test_get_audit_logs(self, admin_token):
        """GET /audit-logs - Get audit logs list."""
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={admin_token}")
        assert response.status_code == 200, f"Get audit logs failed: {response.text}"
        data = response.json()
        assert "logs" in data, "Missing 'logs' in response"
        assert "total_count" in data, "Missing 'total_count' in response"
        assert isinstance(data["logs"], list)
    
    def test_audit_logs_filter_by_action_type(self, admin_token):
        """GET /audit-logs?action_type=login - Filter by action type."""
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={admin_token}&action_type=login")
        assert response.status_code == 200, f"Filter by action type failed: {response.text}"
        data = response.json()
        assert "logs" in data
        # All returned logs should have action_type=login (if any)
        for log in data["logs"]:
            assert log.get("action_type") == "login"
    
    def test_audit_logs_filter_by_member(self, admin_token, admin_data):
        """GET /audit-logs?admin_id_filter=X - Filter by team member."""
        admin_id = admin_data.get("id")
        if not admin_id:
            pytest.skip("No admin ID in login response")
        
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={admin_token}&admin_id_filter={admin_id}")
        assert response.status_code == 200, f"Filter by member failed: {response.text}"
        data = response.json()
        assert "logs" in data
    
    def test_audit_action_types(self, admin_token):
        """GET /audit-logs/action-types - Get list of action types."""
        response = requests.get(f"{BASE_URL}/api/audit-logs/action-types?admin_token={admin_token}")
        assert response.status_code == 200, f"Get action types failed: {response.text}"
        data = response.json()
        assert "action_types" in data
        assert isinstance(data["action_types"], list)
    
    def test_audit_summary(self, admin_token):
        """GET /audit-logs/summary - Get audit summary statistics."""
        response = requests.get(f"{BASE_URL}/api/audit-logs/summary?admin_token={admin_token}")
        assert response.status_code == 200, f"Get audit summary failed: {response.text}"
        data = response.json()
        assert "total_actions" in data
        assert "period_days" in data


class TestRoleBasedSidebar:
    """Test role-based sidebar access via login and verify endpoints."""
    
    def test_login_response_includes_permissions(self, admin_data):
        """Login response should include 'permissions' field."""
        # Check that admin_data (from login) has permissions
        assert "permissions" in admin_data, "Login response missing 'permissions' field"
    
    def test_login_response_includes_is_super_admin(self, admin_data):
        """Login response should include 'is_super_admin' field."""
        assert "is_super_admin" in admin_data, "Login response missing 'is_super_admin' field"
        # Admin user should be super admin
        assert admin_data["is_super_admin"] == True, "Admin should be super admin"
    
    def test_verify_endpoint_returns_user_info(self, admin_token):
        """GET /admin/verify/{token} - Returns user info with permissions."""
        response = requests.get(f"{BASE_URL}/api/admin/verify/{admin_token}")
        assert response.status_code == 200, f"Verify endpoint failed: {response.text}"
        data = response.json()
        
        assert "valid" in data and data["valid"] == True
        assert "is_super_admin" in data, "Verify response missing 'is_super_admin'"
        assert "permissions" in data, "Verify response missing 'permissions'"
        assert "username" in data
        assert "role" in data
    
    def test_roles_endpoint(self, admin_token):
        """GET /team/roles - Get available roles with permissions."""
        response = requests.get(f"{BASE_URL}/api/team/roles?admin_token={admin_token}")
        assert response.status_code == 200, f"Get roles failed: {response.text}"
        data = response.json()
        
        assert "roles" in data
        roles = data["roles"]
        
        # Expected roles
        expected_roles = ["super_admin", "manager", "collection_agent", "accountant", "viewer"]
        for role in expected_roles:
            assert role in roles, f"Missing role: {role}"
            assert "label" in roles[role], f"Role {role} missing label"
            assert "permissions" in roles[role], f"Role {role} missing permissions"
        
        # Verify specific permission sets
        assert "all" in roles["super_admin"]["permissions"]
        assert "clients" in roles["viewer"]["permissions"]
        assert "reports" in roles["viewer"]["permissions"]


class TestViewerRoleSidebarAccess:
    """Test that viewer role only has limited sidebar access."""
    
    def test_create_viewer_user_and_check_permissions(self, admin_token):
        """Create a viewer user and verify their limited permissions."""
        # Create a test viewer user
        test_username = f"TEST_viewer_{uuid.uuid4().hex[:8]}"
        
        create_response = requests.post(
            f"{BASE_URL}/api/team/members?admin_token={admin_token}",
            json={
                "username": test_username,
                "password": "testpass123",
                "role": "viewer",
                "first_name": "Test",
                "last_name": "Viewer"
            }
        )
        assert create_response.status_code == 200, f"Create viewer failed: {create_response.text}"
        viewer_data = create_response.json()
        viewer_id = viewer_data["id"]
        
        # Verify viewer permissions
        assert viewer_data["role"] == "viewer"
        assert "permissions" in viewer_data
        viewer_perms = viewer_data["permissions"]
        assert "clients" in viewer_perms, "Viewer should have clients permission"
        assert "reports" in viewer_perms, "Viewer should have reports permission"
        # Viewer should NOT have these permissions
        assert "all" not in viewer_perms
        
        # Login as viewer to verify login response
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": test_username,
            "password": "testpass123"
        })
        assert login_response.status_code == 200, f"Viewer login failed: {login_response.text}"
        viewer_login = login_response.json()
        
        assert viewer_login.get("is_super_admin") == False, "Viewer should not be super admin"
        assert "permissions" in viewer_login
        assert viewer_login["role"] == "viewer"
        
        # Cleanup - delete the test viewer
        delete_response = requests.delete(
            f"{BASE_URL}/api/team/members/{viewer_id}?admin_token={admin_token}"
        )
        assert delete_response.status_code == 200


class TestSuperAdminNavAccess:
    """Test that super admin sees all 14 nav items."""
    
    def test_super_admin_has_all_permissions(self, admin_token, admin_data):
        """Super admin should have access to all sidebar items."""
        # Verify via verify endpoint
        verify_response = requests.get(f"{BASE_URL}/api/admin/verify/{admin_token}")
        verify_data = verify_response.json()
        
        assert verify_data["is_super_admin"] == True, "Admin should be super admin"
        
        # Super admin should see Team and Activity Log (which require __super_admin__)
        # These are determined by is_super_admin flag, not permissions list
        
    def test_enterprise_check_for_super_admin(self, admin_token):
        """Super admin should have enterprise access."""
        response = requests.get(f"{BASE_URL}/api/team/enterprise-check?admin_token={admin_token}")
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("is_super_admin") == True
        assert data.get("has_enterprise") == True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
