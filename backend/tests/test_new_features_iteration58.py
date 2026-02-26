"""
Test suite for PayLock Pro 6 New Features - Iteration 58
Tests: Team Management, Bulk CSV Import, Document Storage, Telegram Bot, Plans/Limits
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paylock-features.preview.emergentagent.com').rstrip('/')

class TestAuth:
    """Authentication tests to get admin token"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login as admin and get token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    def test_admin_login(self, admin_token):
        """Verify admin login works"""
        assert admin_token is not None
        assert len(admin_token) > 0


class TestTeamManagement:
    """Team Management - Enterprise plan feature tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_enterprise_check_returns_true_for_super_admin(self, admin_token):
        """GET /api/team/enterprise-check returns has_enterprise=true for super admin"""
        response = requests.get(
            f"{BASE_URL}/api/team/enterprise-check",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["has_enterprise"] == True, f"Expected has_enterprise=true, got {data}"
        assert data["is_super_admin"] == True, f"Expected is_super_admin=true, got {data}"
        assert "enterprise_id" in data
    
    def test_get_roles_returns_5_roles(self, admin_token):
        """GET /api/team/roles returns 5 roles"""
        response = requests.get(
            f"{BASE_URL}/api/team/roles",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        roles = data["roles"]
        assert len(roles) == 5, f"Expected 5 roles, got {len(roles)}: {list(roles.keys())}"
        expected_roles = {"super_admin", "manager", "collection_agent", "accountant", "viewer"}
        assert set(roles.keys()) == expected_roles
    
    def test_create_team_member(self, admin_token):
        """POST /api/team/members creates a new team member"""
        unique_username = f"TEST_member_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token},
            json={
                "username": unique_username,
                "password": "testpass123",
                "first_name": "Test",
                "last_name": "Member",
                "email": f"{unique_username}@test.com",
                "role": "accountant"
            }
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["username"] == unique_username
        assert data["role"] == "accountant"
        assert "enterprise_id" in data
        assert data["is_super_admin"] == False
        
        # Cleanup - delete the created member
        member_id = data["id"]
        delete_resp = requests.delete(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": admin_token}
        )
        assert delete_resp.status_code == 200
    
    def test_list_team_members(self, admin_token):
        """GET /api/team/members lists all enterprise members"""
        response = requests.get(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "members" in data
        assert "total" in data
        assert isinstance(data["members"], list)
        # Should have at least the super admin
        assert data["total"] >= 1
    
    def test_update_team_member_role(self, admin_token):
        """PUT /api/team/members/{id} updates member role"""
        # First create a member
        unique_username = f"TEST_update_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token},
            json={
                "username": unique_username,
                "password": "testpass123",
                "role": "viewer"
            }
        )
        assert create_resp.status_code == 200
        member_id = create_resp.json()["id"]
        
        # Update to manager
        update_resp = requests.put(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": admin_token},
            json={"role": "manager", "first_name": "Updated"}
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert data["role"] == "manager"
        assert data["first_name"] == "Updated"
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": admin_token}
        )
    
    def test_delete_team_member(self, admin_token):
        """DELETE /api/team/members/{id} removes a member"""
        # Create a member to delete
        unique_username = f"TEST_delete_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token},
            json={
                "username": unique_username,
                "password": "testpass123",
                "role": "viewer"
            }
        )
        assert create_resp.status_code == 200
        member_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = requests.delete(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": admin_token}
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["deleted"] == True
        
        # Verify deleted - should not appear in list
        list_resp = requests.get(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token}
        )
        member_ids = [m["id"] for m in list_resp.json()["members"]]
        assert member_id not in member_ids
    
    def test_non_super_admin_cannot_create_member(self, admin_token):
        """Non-super-admin cannot create team members (403)"""
        # Create a non-super-admin user
        unique_username = f"TEST_nonsuperadmin_{uuid.uuid4().hex[:8]}"
        create_resp = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": admin_token},
            json={
                "username": unique_username,
                "password": "testpass123",
                "role": "viewer"
            }
        )
        member_id = create_resp.json()["id"]
        
        # Login as this user
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": unique_username, "password": "testpass123"}
        )
        non_admin_token = login_resp.json()["token"]
        
        # Try to create another member - should fail
        forbidden_resp = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": non_admin_token},
            json={
                "username": "should_fail",
                "password": "test123",
                "role": "viewer"
            }
        )
        assert forbidden_resp.status_code == 403, f"Expected 403, got {forbidden_resp.status_code}"
        assert "error" in forbidden_resp.json()
        
        # Try to delete - should also fail
        delete_forbidden = requests.delete(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": non_admin_token}
        )
        assert delete_forbidden.status_code == 403
        
        # Cleanup with admin token
        requests.delete(
            f"{BASE_URL}/api/team/members/{member_id}",
            params={"admin_token": admin_token}
        )


class TestBulkCSVImport:
    """Bulk CSV Import feature tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_get_csv_template(self, admin_token):
        """GET /api/import/template returns CSV template"""
        response = requests.get(
            f"{BASE_URL}/api/import/template",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "template" in data
        template = data["template"]
        # Verify expected columns
        assert "name" in template.lower()
        assert "phone" in template.lower()
        assert "email" in template.lower()
        assert "loan_amount" in template.lower()


class TestDocumentStorage:
    """Document Storage feature tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_document_stats(self, admin_token):
        """GET /api/documents/stats returns document statistics"""
        response = requests.get(
            f"{BASE_URL}/api/documents/stats",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_documents" in data
        assert "total_size_bytes" in data
        assert "total_size_mb" in data
        assert "by_type" in data
        assert isinstance(data["by_type"], dict)


class TestTelegramBot:
    """Telegram Bot feature tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_bot_info_configured(self, admin_token):
        """GET /api/telegram/bot-info returns configured=true with bot_username"""
        response = requests.get(
            f"{BASE_URL}/api/telegram/bot-info",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["configured"] == True, f"Expected configured=true, got {data}"
        assert "bot_username" in data
        assert data["bot_username"] == "Paylockpro_bot"


class TestPlanFeatures:
    """Plan Features and Limits tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_get_all_plans_features(self):
        """GET /api/plans/features returns 4 plans with new features"""
        response = requests.get(f"{BASE_URL}/api/plans/features")
        assert response.status_code == 200
        data = response.json()
        assert "plans" in data
        plans = data["plans"]
        assert len(plans) == 4, f"Expected 4 plans, got {len(plans)}"
        
        plan_ids = [p["id"] for p in plans]
        assert "starter" in plan_ids
        assert "business" in plan_ids
        assert "enterprise" in plan_ids
        assert "custom" in plan_ids
        
        # Verify enterprise has team management
        enterprise = next(p for p in plans if p["id"] == "enterprise")
        features_text = " ".join(enterprise.get("features", []))
        assert "Team" in features_text or "team" in features_text.lower()
    
    def test_plan_limits_for_super_admin(self, admin_token):
        """GET /api/plans/limits returns limits with team_management=true for super admin"""
        response = requests.get(
            f"{BASE_URL}/api/plans/limits",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "plan" in data
        assert "limits" in data
        assert data["is_super_admin"] == True
        
        limits = data["limits"]
        # Verify new feature flags
        assert limits.get("team_management") == True, f"Expected team_management=true, got {limits}"
        assert limits.get("document_storage") == True
        assert limits.get("bulk_import") == True
        assert limits.get("telegram_bot") == True
        assert limits.get("payment_scheduling") == True


class TestHealthEndpoint:
    """Basic health check"""
    
    def test_api_health(self):
        """Verify API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
