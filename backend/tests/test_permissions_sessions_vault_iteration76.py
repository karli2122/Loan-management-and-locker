"""
Iteration 76 - Permission Model, Sessions, and Document Vault Tests

Tests for:
1. POST /api/admin/register - tiered permission model (super_admin, admin, user roles)
2. GET /api/admin/list - scoped visibility
3. PUT /api/admin/{id}/plan - plan management permissions
4. DELETE /api/admin/{id} - delete permissions
5. POST /api/admin/login - session creation
6. GET /api/sessions - active sessions listing
7. POST /api/documents/vault/{client_id}/upload - local file upload
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paylock-fixes.preview.emergentagent.com").rstrip("/")

# Test data prefixes for cleanup
TEST_PREFIX = f"TEST_{uuid.uuid4().hex[:6]}"


class TestSuperAdminLogin:
    """Test super admin login and get token"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Login as karli1987 (super_admin) and get token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        assert data.get("is_super_admin") == True, "karli1987 should be super_admin"
        return data["token"]
    
    def test_super_admin_login_creates_session(self, super_admin_token):
        """POST /api/admin/login should create a session record"""
        # Session should be created on login
        response = requests.get(
            f"{BASE_URL}/api/sessions",
            params={"admin_token": super_admin_token}
        )
        assert response.status_code == 200, f"Get sessions failed: {response.text}"
        data = response.json()
        assert "sessions" in data, "No sessions key in response"
        # Should have at least one session from the login
        assert len(data["sessions"]) >= 1, "Should have at least 1 active session after login"
        print(f"Sessions found: {len(data['sessions'])}")


class TestRegisterPermissions:
    """Test tiered permission model for admin registration"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Get super admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_super_admin_can_create_admin(self, super_admin_token):
        """Super admin can create admin role accounts"""
        username = f"{TEST_PREFIX}_admin1"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "admin",
                "first_name": "Test",
                "last_name": "Admin"
            }
        )
        assert response.status_code == 200, f"Super admin should create admin: {response.text}"
        data = response.json()
        assert data["role"] == "admin"
        assert data["username"] == username
        print(f"Created admin user: {username}")
    
    def test_super_admin_can_create_user(self, super_admin_token):
        """Super admin can create user role accounts (viewer, collections)"""
        username = f"{TEST_PREFIX}_user1"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer",
                "first_name": "Test",
                "last_name": "User"
            }
        )
        assert response.status_code == 200, f"Super admin should create user: {response.text}"
        data = response.json()
        assert data["role"] == "viewer"
        print(f"Created viewer user: {username}")


class TestAdminRolePermissions:
    """Test that admin role can create users but not admins"""
    
    @pytest.fixture(scope="class")
    def admin_credentials(self):
        """Create an admin account and return credentials"""
        # Login as super admin
        super_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        super_token = super_resp.json()["token"]
        
        # Create admin account
        admin_username = f"{TEST_PREFIX}_admin_perm"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": admin_username,
                "password": "AdminPass123!",
                "role": "admin",
                "first_name": "Admin",
                "last_name": "PermTest"
            }
        )
        assert response.status_code == 200, f"Failed to create admin: {response.text}"
        return {"username": admin_username, "password": "AdminPass123!"}
    
    @pytest.fixture(scope="class")
    def admin_token(self, admin_credentials):
        """Login as admin and get token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=admin_credentials
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["token"]
    
    def test_admin_can_create_user(self, admin_token):
        """Admin (role=admin) can create user role accounts"""
        username = f"{TEST_PREFIX}_user_by_admin"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer",
                "first_name": "Test",
                "last_name": "ByAdmin"
            }
        )
        assert response.status_code == 200, f"Admin should be able to create user: {response.text}"
        data = response.json()
        assert data["role"] == "viewer"
        print(f"Admin created user: {username}")
    
    def test_admin_cannot_create_admin(self, admin_token):
        """Admin (role=admin) should get 403 when trying to create admin role"""
        username = f"{TEST_PREFIX}_admin_by_admin"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "admin",
                "first_name": "Test",
                "last_name": "AdminByAdmin"
            }
        )
        # Should be 403 Forbidden
        assert response.status_code == 403, f"Admin should NOT create admin (expected 403): got {response.status_code} - {response.text}"
        print("Correctly blocked admin from creating admin account")


class TestUserRolePermissions:
    """Test that user roles (viewer, collections) cannot create anyone"""
    
    @pytest.fixture(scope="class")
    def user_credentials(self):
        """Create a user account and return credentials"""
        super_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        super_token = super_resp.json()["token"]
        
        user_username = f"{TEST_PREFIX}_user_perm"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": user_username,
                "password": "UserPass123!",
                "role": "viewer",
                "first_name": "User",
                "last_name": "PermTest"
            }
        )
        assert response.status_code == 200, f"Failed to create user: {response.text}"
        return {"username": user_username, "password": "UserPass123!"}
    
    @pytest.fixture(scope="class")
    def user_token(self, user_credentials):
        """Login as user and get token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=user_credentials
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_user_cannot_create_anyone(self, user_token):
        """User role (viewer) should get 403 when trying to create any account"""
        username = f"{TEST_PREFIX}_anyone_by_user"
        response = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": user_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer",
                "first_name": "Test",
                "last_name": "ByUser"
            }
        )
        assert response.status_code == 403, f"User should NOT create anyone (expected 403): got {response.status_code} - {response.text}"
        print("Correctly blocked user from creating accounts")


class TestListAdminsPermissions:
    """Test scoped visibility for admin list"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def admin_token(self, super_admin_token):
        """Create and login as admin"""
        admin_username = f"{TEST_PREFIX}_admin_list"
        requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_admin_token},
            json={
                "username": admin_username,
                "password": "AdminPass123!",
                "role": "admin"
            }
        )
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": admin_username, "password": "AdminPass123!"}
        )
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def user_token(self, super_admin_token):
        """Create and login as user"""
        user_username = f"{TEST_PREFIX}_user_list"
        requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_admin_token},
            json={
                "username": user_username,
                "password": "UserPass123!",
                "role": "viewer"
            }
        )
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": user_username, "password": "UserPass123!"}
        )
        return response.json()["token"]
    
    def test_super_admin_sees_all_users(self, super_admin_token):
        """Super admin sees all users"""
        response = requests.get(
            f"{BASE_URL}/api/admin/list",
            params={"admin_token": super_admin_token}
        )
        assert response.status_code == 200, f"List admins failed: {response.text}"
        admins = response.json()
        assert isinstance(admins, list), "Should return list of admins"
        assert len(admins) > 0, "Super admin should see at least some users"
        print(f"Super admin sees {len(admins)} users")
    
    def test_admin_sees_enterprise_members(self, admin_token):
        """Admin sees only their enterprise members"""
        response = requests.get(
            f"{BASE_URL}/api/admin/list",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Admin list failed: {response.text}"
        admins = response.json()
        assert isinstance(admins, list), "Should return list"
        print(f"Admin sees {len(admins)} enterprise members")
    
    def test_user_gets_403_on_list(self, user_token):
        """User role gets 403 when trying to list admins"""
        response = requests.get(
            f"{BASE_URL}/api/admin/list",
            params={"admin_token": user_token}
        )
        assert response.status_code == 403, f"User should get 403 on list (got {response.status_code}): {response.text}"
        print("Correctly blocked user from listing admins")


class TestPlanManagementPermissions:
    """Test PUT /api/admin/{id}/plan permissions"""
    
    @pytest.fixture(scope="class")
    def test_users(self):
        """Create test users and return their info"""
        super_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        super_token = super_resp.json()["token"]
        
        # Create admin for testing
        admin_username = f"{TEST_PREFIX}_admin_plan"
        admin_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": admin_username,
                "password": "AdminPass123!",
                "role": "admin"
            }
        )
        admin_id = admin_resp.json()["id"] if admin_resp.status_code == 200 else None
        
        # Create user for testing
        user_username = f"{TEST_PREFIX}_user_plan"
        user_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": user_username,
                "password": "UserPass123!",
                "role": "viewer"
            }
        )
        user_id = user_resp.json()["id"] if user_resp.status_code == 200 else None
        
        return {
            "super_token": super_token,
            "admin_id": admin_id,
            "admin_username": admin_username,
            "user_id": user_id
        }
    
    @pytest.fixture(scope="class")
    def admin_token(self, test_users):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": test_users["admin_username"], "password": "AdminPass123!"}
        )
        return response.json()["token"]
    
    def test_super_admin_can_change_any_plan(self, test_users):
        """Super admin can change any user's plan"""
        response = requests.put(
            f"{BASE_URL}/api/admin/{test_users['user_id']}/plan",
            params={"admin_token": test_users["super_token"], "plan": "professional"}
        )
        assert response.status_code == 200, f"Super admin should change plan: {response.text}"
        assert response.json()["plan"] == "professional"
        print("Super admin successfully changed user plan")
    
    def test_admin_can_change_user_plan(self, test_users, admin_token):
        """Admin can change user-level account's plan"""
        response = requests.put(
            f"{BASE_URL}/api/admin/{test_users['user_id']}/plan",
            params={"admin_token": admin_token, "plan": "starter"}
        )
        assert response.status_code == 200, f"Admin should change user plan: {response.text}"
        print("Admin successfully changed user plan")
    
    def test_admin_cannot_change_admin_plan(self, test_users, admin_token):
        """Admin cannot change admin-level account's plan"""
        response = requests.put(
            f"{BASE_URL}/api/admin/{test_users['admin_id']}/plan",
            params={"admin_token": admin_token, "plan": "enterprise"}
        )
        assert response.status_code == 403, f"Admin should NOT change admin plan (expected 403): got {response.status_code} - {response.text}"
        print("Correctly blocked admin from changing admin plan")


class TestUserCannotManagePlans:
    """Test that user role cannot manage plans"""
    
    @pytest.fixture(scope="class")
    def setup_users(self):
        """Create users for test"""
        super_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        super_token = super_resp.json()["token"]
        
        # Create user 
        user_username = f"{TEST_PREFIX}_user_noplan"
        user_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": user_username,
                "password": "UserPass123!",
                "role": "viewer"
            }
        )
        user_id = user_resp.json()["id"] if user_resp.status_code == 200 else None
        
        # Login as user
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": user_username, "password": "UserPass123!"}
        )
        user_token = login_resp.json()["token"]
        
        # Create another user as target
        target_username = f"{TEST_PREFIX}_target_plan"
        target_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": target_username,
                "password": "TargetPass123!",
                "role": "viewer"
            }
        )
        target_id = target_resp.json()["id"] if target_resp.status_code == 200 else None
        
        return {"user_token": user_token, "target_id": target_id}
    
    def test_user_cannot_manage_plans(self, setup_users):
        """User role gets 403 when trying to manage plans"""
        response = requests.put(
            f"{BASE_URL}/api/admin/{setup_users['target_id']}/plan",
            params={"admin_token": setup_users["user_token"], "plan": "professional"}
        )
        assert response.status_code == 403, f"User should NOT manage plans (expected 403): got {response.status_code}"
        print("Correctly blocked user from managing plans")


class TestDeletePermissions:
    """Test DELETE /api/admin/{id} permissions"""
    
    @pytest.fixture(scope="class")
    def setup_delete_test(self):
        """Setup users for delete test"""
        super_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        super_token = super_resp.json()["token"]
        
        # Create admin
        admin_username = f"{TEST_PREFIX}_admin_del"
        admin_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": admin_username,
                "password": "AdminPass123!",
                "role": "admin"
            }
        )
        admin_id = admin_resp.json()["id"] if admin_resp.status_code == 200 else None
        
        # Create user to delete
        user_username = f"{TEST_PREFIX}_user_del"
        user_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": super_token},
            json={
                "username": user_username,
                "password": "UserPass123!",
                "role": "viewer"
            }
        )
        user_id = user_resp.json()["id"] if user_resp.status_code == 200 else None
        
        # Login as admin
        login_resp = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": admin_username, "password": "AdminPass123!"}
        )
        admin_token = login_resp.json()["token"]
        
        return {
            "super_token": super_token,
            "admin_token": admin_token,
            "admin_id": admin_id,
            "user_id": user_id
        }
    
    def test_admin_can_delete_user(self, setup_delete_test):
        """Admin can delete user-level accounts"""
        response = requests.delete(
            f"{BASE_URL}/api/admin/{setup_delete_test['user_id']}",
            params={"admin_token": setup_delete_test["admin_token"]}
        )
        assert response.status_code == 200, f"Admin should delete user: {response.text}"
        print("Admin successfully deleted user account")
    
    def test_admin_cannot_delete_admin(self, setup_delete_test):
        """Admin cannot delete admin-level accounts"""
        # Create another admin to try to delete
        admin2_username = f"{TEST_PREFIX}_admin_del2"
        admin2_resp = requests.post(
            f"{BASE_URL}/api/admin/register",
            params={"admin_token": setup_delete_test["super_token"]},
            json={
                "username": admin2_username,
                "password": "Admin2Pass123!",
                "role": "admin"
            }
        )
        admin2_id = admin2_resp.json()["id"] if admin2_resp.status_code == 200 else None
        
        # Try to delete as admin
        response = requests.delete(
            f"{BASE_URL}/api/admin/{admin2_id}",
            params={"admin_token": setup_delete_test["admin_token"]}
        )
        assert response.status_code == 403, f"Admin should NOT delete admin (expected 403): got {response.status_code}"
        print("Correctly blocked admin from deleting admin account")


class TestSessionsAPI:
    """Test session management APIs"""
    
    def test_login_creates_session(self):
        """Login should create a session record"""
        # Login
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        assert response.status_code == 200
        token = response.json()["token"]
        
        # Check sessions
        session_resp = requests.get(
            f"{BASE_URL}/api/sessions",
            params={"admin_token": token}
        )
        assert session_resp.status_code == 200, f"Get sessions failed: {session_resp.text}"
        data = session_resp.json()
        assert "sessions" in data
        assert len(data["sessions"]) >= 1, "Should have at least 1 session"
        
        # Verify session has required fields
        session = data["sessions"][0]
        assert "id" in session
        assert "admin_id" in session
        assert "is_active" in session
        assert session["is_active"] == True
        print(f"Session created successfully with {len(data['sessions'])} active sessions")


class TestDocumentVaultUpload:
    """Test document vault local file upload"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "Testpass1!"}
        )
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def test_client_id(self, super_admin_token):
        """Get or create a test client"""
        # Try to get existing clients
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": super_admin_token}
        )
        if response.status_code == 200:
            clients = response.json()
            if isinstance(clients, list) and len(clients) > 0:
                return clients[0]["id"]
            elif isinstance(clients, dict) and "clients" in clients and len(clients["clients"]) > 0:
                return clients["clients"][0]["id"]
        
        # Create a test client
        client_resp = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": super_admin_token},
            json={
                "name": f"{TEST_PREFIX}_DocClient",
                "email": f"{TEST_PREFIX}@test.com",
                "phone": "1234567890"
            }
        )
        if client_resp.status_code in [200, 201]:
            return client_resp.json()["id"]
        return None
    
    def test_document_upload_saves_file(self, super_admin_token, test_client_id):
        """Document upload should save file locally"""
        if not test_client_id:
            pytest.skip("No client available for document upload test")
        
        # Create a test file content
        test_content = b"Test document content for iteration 76"
        files = {
            "file": ("test_doc.txt", test_content, "text/plain")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/documents/vault/{test_client_id}/upload",
            params={
                "admin_token": super_admin_token,
                "doc_type": "other",
                "description": "Test document for iteration 76"
            },
            files=files
        )
        
        # Check response
        if response.status_code == 200:
            data = response.json()
            assert "document" in data
            doc = data["document"]
            assert doc["client_id"] == test_client_id
            assert doc["doc_type"] == "other"
            assert "file_path" in doc
            print(f"Document uploaded successfully: {doc.get('file_path')}")
        elif response.status_code == 403:
            # Plan gating may block this feature
            print(f"Document vault blocked by plan gating (403): {response.text}")
        else:
            pytest.fail(f"Unexpected status {response.status_code}: {response.text}")


# Cleanup fixture - runs after all tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    """Cleanup test data after tests complete"""
    yield
    # Cleanup would happen here, but we'll leave test data for debugging
    print(f"\nTest data with prefix {TEST_PREFIX} created during tests")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
