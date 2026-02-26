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

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paylock-i18n.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


def get_admin_token():
    """Get fresh admin token."""
    response = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": ADMIN_USERNAME,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    return data["token"], data


class TestDashboardCharts:
    """Test dashboard analytics endpoints that provide data for Chart.js charts."""
    
    def test_analytics_dashboard_endpoint(self):
        """GET /analytics/dashboard - Returns overview data for charts."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard?admin_token={token}")
        assert response.status_code == 200, f"Analytics dashboard failed: {response.text}"
        data = response.json()
        assert "overview" in data, "Missing 'overview' in analytics dashboard response"
        assert "financial" in data, "Missing 'financial' in analytics dashboard response"
        # These are used for Loan Distribution chart
        overview = data["overview"]
        assert "total_clients" in overview
        assert "active_loans" in overview
        assert "overdue" in overview
        print(f"PASS: Analytics dashboard - total_clients={overview['total_clients']}, active_loans={overview['active_loans']}")
    
    def test_reports_financial_endpoint(self):
        """GET /reports/financial - Returns monthly_trend for Revenue/Profit charts."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/reports/financial?admin_token={token}")
        assert response.status_code == 200, f"Reports financial failed: {response.text}"
        data = response.json()
        # monthly_trend is used for Revenue Trends, Profit Trends, Collection Rates charts
        assert "monthly_trend" in data, "Missing 'monthly_trend' in financial report"
        assert isinstance(data["monthly_trend"], list)
        print(f"PASS: Reports financial - monthly_trend has {len(data['monthly_trend'])} entries")
    
    def test_reports_collection_endpoint(self):
        """GET /reports/collection - Returns collection data."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/reports/collection?admin_token={token}")
        assert response.status_code == 200, f"Reports collection failed: {response.text}"
        data = response.json()
        # Used for dashboard stats
        assert "financial" in data or "this_month" in data
        print("PASS: Reports collection endpoint working")


class TestPaymentSchedulingCRUD:
    """Test payment scheduling CRUD operations."""
    
    def test_list_schedules(self):
        """GET /schedules - List all payment schedules."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/schedules?admin_token={token}")
        assert response.status_code == 200, f"List schedules failed: {response.text}"
        data = response.json()
        assert "schedules" in data, "Missing 'schedules' key in response"
        assert "total" in data, "Missing 'total' key in response"
        assert isinstance(data["schedules"], list)
        print(f"PASS: List schedules - {data['total']} schedules found")
    
    def test_get_due_today(self):
        """GET /schedules/due/today - Get schedules due today."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/schedules/due/today?admin_token={token}")
        assert response.status_code == 200, f"Get due today failed: {response.text}"
        data = response.json()
        assert "due_schedules" in data
        assert "count" in data
        print(f"PASS: Get due today - {data['count']} schedules due")
    
    def test_schedule_crud_full_flow(self):
        """Full CRUD flow: Create -> Read -> Update -> Delete a schedule."""
        token, _ = get_admin_token()
        
        # Get a client
        clients_response = requests.get(f"{BASE_URL}/api/clients?admin_token={token}")
        clients_data = clients_response.json()
        clients = clients_data.get("clients", [])
        
        if not clients:
            pytest.skip("No clients available to create schedule for")
        
        client_id = clients[0]["id"]
        client_name = clients[0].get("name", "Unknown")
        
        # CREATE
        create_payload = {
            "client_id": client_id,
            "amount": 50.00,
            "frequency": "weekly",
            "day_of_month": 5,
            "auto_reminder": False
        }
        create_response = requests.post(
            f"{BASE_URL}/api/schedules?admin_token={token}",
            json=create_payload
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        schedule_id = created["id"]
        print(f"PASS: Created schedule {schedule_id} for client {client_name}")
        
        # READ - Get specific schedule
        get_response = requests.get(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={token}")
        assert get_response.status_code == 200, f"Get schedule failed: {get_response.text}"
        fetched = get_response.json()
        assert fetched["id"] == schedule_id
        assert fetched["amount"] == 50.00
        print(f"PASS: Read schedule - amount={fetched['amount']}, frequency={fetched['frequency']}")
        
        # UPDATE - Toggle active status
        update_response = requests.put(
            f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={token}",
            json={"is_active": False}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["is_active"] == False
        print("PASS: Updated schedule - is_active=False")
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={token}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        delete_data = delete_response.json()
        assert delete_data.get("deleted") == True
        print("PASS: Deleted schedule successfully")


class TestActivityLog:
    """Test audit/activity log endpoints."""
    
    def test_get_audit_logs(self):
        """GET /audit-logs - Get audit logs list."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={token}")
        assert response.status_code == 200, f"Get audit logs failed: {response.text}"
        data = response.json()
        assert "logs" in data, "Missing 'logs' in response"
        assert "total_count" in data, "Missing 'total_count' in response"
        assert isinstance(data["logs"], list)
        print(f"PASS: Get audit logs - {data['total_count']} logs found")
    
    def test_audit_logs_filter_by_action_type(self):
        """GET /audit-logs?action_type=login - Filter by action type."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={token}&action_type=login")
        assert response.status_code == 200, f"Filter by action type failed: {response.text}"
        data = response.json()
        assert "logs" in data
        # All returned logs should have action_type=login (if any)
        for log in data["logs"]:
            assert log.get("action_type") == "login"
        print(f"PASS: Filter by action_type=login - {len(data['logs'])} logs")
    
    def test_audit_logs_filter_by_member(self):
        """GET /audit-logs?admin_id_filter=X - Filter by team member."""
        token, admin_data = get_admin_token()
        admin_id = admin_data.get("id")
        
        response = requests.get(f"{BASE_URL}/api/audit-logs?admin_token={token}&admin_id_filter={admin_id}")
        assert response.status_code == 200, f"Filter by member failed: {response.text}"
        data = response.json()
        assert "logs" in data
        print(f"PASS: Filter by admin_id - {len(data['logs'])} logs for admin {admin_id[:8]}...")
    
    def test_audit_action_types(self):
        """GET /audit-logs/action-types - Get list of action types."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/audit-logs/action-types?admin_token={token}")
        assert response.status_code == 200, f"Get action types failed: {response.text}"
        data = response.json()
        assert "action_types" in data
        assert isinstance(data["action_types"], list)
        print(f"PASS: Get action types - {data['action_types']}")
    
    def test_audit_summary(self):
        """GET /audit-logs/summary - Get audit summary statistics."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/audit-logs/summary?admin_token={token}")
        assert response.status_code == 200, f"Get audit summary failed: {response.text}"
        data = response.json()
        assert "total_actions" in data
        assert "period_days" in data
        print(f"PASS: Audit summary - total_actions={data['total_actions']}, period_days={data['period_days']}")


class TestRoleBasedSidebar:
    """Test role-based sidebar access via login and verify endpoints."""
    
    def test_login_response_includes_permissions(self):
        """Login response should include 'permissions' field."""
        _, admin_data = get_admin_token()
        assert "permissions" in admin_data, "Login response missing 'permissions' field"
        print(f"PASS: Login includes permissions - {admin_data.get('permissions', [])}")
    
    def test_login_response_includes_is_super_admin(self):
        """Login response should include 'is_super_admin' field."""
        _, admin_data = get_admin_token()
        assert "is_super_admin" in admin_data, "Login response missing 'is_super_admin' field"
        assert admin_data["is_super_admin"] == True, "Admin should be super admin"
        print("PASS: Login includes is_super_admin=True")
    
    def test_verify_endpoint_returns_user_info(self):
        """GET /admin/verify/{token} - Returns user info with permissions."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/admin/verify/{token}")
        assert response.status_code == 200, f"Verify endpoint failed: {response.text}"
        data = response.json()
        
        assert "valid" in data and data["valid"] == True
        assert "is_super_admin" in data, "Verify response missing 'is_super_admin'"
        assert "permissions" in data, "Verify response missing 'permissions'"
        assert "username" in data
        assert "role" in data
        print(f"PASS: Verify endpoint - username={data['username']}, is_super_admin={data['is_super_admin']}")
    
    def test_roles_endpoint(self):
        """GET /team/roles - Get available roles with permissions."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/team/roles?admin_token={token}")
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
        print(f"PASS: Roles endpoint - {list(roles.keys())}")


class TestViewerRoleSidebarAccess:
    """Test that viewer role only has limited sidebar access."""
    
    def test_create_viewer_user_and_check_permissions(self):
        """Create a viewer user and verify their limited permissions."""
        token, _ = get_admin_token()
        
        # Create a test viewer user
        test_username = f"TEST_viewer_{uuid.uuid4().hex[:8]}"
        
        create_response = requests.post(
            f"{BASE_URL}/api/team/members?admin_token={token}",
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
        print(f"PASS: Created viewer with permissions: {viewer_perms}")
        
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
        print(f"PASS: Viewer login - is_super_admin={viewer_login['is_super_admin']}, role={viewer_login['role']}")
        
        # Cleanup - delete the test viewer (need admin token)
        delete_response = requests.delete(
            f"{BASE_URL}/api/team/members/{viewer_id}?admin_token={token}"
        )
        assert delete_response.status_code == 200
        print("PASS: Cleaned up test viewer")


class TestSuperAdminNavAccess:
    """Test that super admin sees all nav items."""
    
    def test_super_admin_has_all_permissions(self):
        """Super admin should have access to all sidebar items."""
        token, _ = get_admin_token()
        
        # Verify via verify endpoint
        verify_response = requests.get(f"{BASE_URL}/api/admin/verify/{token}")
        assert verify_response.status_code == 200, f"Verify failed: {verify_response.text}"
        verify_data = verify_response.json()
        
        assert verify_data["is_super_admin"] == True, "Admin should be super admin"
        print(f"PASS: Super admin verified - is_super_admin=True, username={verify_data['username']}")
        
    def test_enterprise_check_for_super_admin(self):
        """Super admin should have enterprise access."""
        token, _ = get_admin_token()
        response = requests.get(f"{BASE_URL}/api/team/enterprise-check?admin_token={token}")
        assert response.status_code == 200, f"Enterprise check failed: {response.text}"
        data = response.json()
        
        assert data.get("is_super_admin") == True
        assert data.get("has_enterprise") == True
        print(f"PASS: Enterprise check - is_super_admin={data['is_super_admin']}, has_enterprise={data['has_enterprise']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
