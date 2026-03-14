"""
Iteration 75 Bug Fixes Tests
- Document vault upload (local filesystem)
- Team member creation with tiered permissions
- Session management on login
- Active sessions listing
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://subscription-tier-1.preview.emergentagent.com').rstrip('/')

# Test credentials - super admin with custom plan
SUPER_ADMIN_USERNAME = "karli1987"
SUPER_ADMIN_PASSWORD = "Testpass1!"


class TestSetup:
    """Setup fixtures for all tests"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        """Login as super admin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPER_ADMIN_USERNAME,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        assert data.get("is_super_admin") == True, "User should be super admin"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def client_id(self, super_admin_token):
        """Get or create a client for testing"""
        response = requests.get(f"{BASE_URL}/api/clients", params={
            "admin_token": super_admin_token,
            "limit": 1
        })
        assert response.status_code == 200
        clients = response.json().get("clients", [])
        if clients:
            return clients[0]["id"]
        # If no clients, skip the document vault tests
        pytest.skip("No clients available for document vault testing")


class TestSessionManagement(TestSetup):
    """Test session creation and listing on login"""
    
    def test_login_creates_session(self, super_admin_token):
        """Verify that login creates a session record in admin_sessions"""
        response = requests.get(f"{BASE_URL}/api/sessions", params={
            "admin_token": super_admin_token
        })
        assert response.status_code == 200, f"Sessions endpoint failed: {response.text}"
        data = response.json()
        
        # Data assertions
        assert "sessions" in data, "Response should contain 'sessions' key"
        assert isinstance(data["sessions"], list), "Sessions should be a list"
        assert len(data["sessions"]) >= 1, "At least one session should exist after login"
        
        # Verify session structure
        session = data["sessions"][0]
        assert "id" in session, "Session should have 'id'"
        assert "admin_id" in session, "Session should have 'admin_id'"
        assert "is_active" in session, "Session should have 'is_active'"
        assert session["is_active"] == True, "Session should be active"
        assert "created_at" in session, "Session should have 'created_at'"
        assert "last_activity" in session, "Session should have 'last_activity'"
    
    def test_new_login_creates_new_session(self):
        """Verify each login creates a new session"""
        # Login fresh
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPER_ADMIN_USERNAME,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        admin_id = login_response.json()["id"]
        
        # Check sessions
        sessions_response = requests.get(f"{BASE_URL}/api/sessions", params={
            "admin_token": token
        })
        assert sessions_response.status_code == 200
        sessions = sessions_response.json()["sessions"]
        
        # Should have at least one active session
        assert len(sessions) >= 1, "Login should create at least one session"
        # All sessions should belong to the same admin
        for s in sessions:
            assert s["admin_id"] == admin_id


class TestDocumentVault(TestSetup):
    """Test document vault upload and listing"""
    
    def test_document_upload(self, super_admin_token, client_id):
        """Test uploading a document to client's vault"""
        # Create a test file
        test_content = f"Test document content {uuid.uuid4()}"
        files = {"file": ("test_iter75.txt", test_content, "text/plain")}
        
        response = requests.post(
            f"{BASE_URL}/api/documents/vault/{client_id}/upload",
            params={
                "admin_token": super_admin_token,
                "doc_type": "other",
                "description": "Test document for iteration 75"
            },
            files=files
        )
        assert response.status_code == 200, f"Document upload failed: {response.text}"
        data = response.json()
        
        # Data assertions
        assert "message" in data, "Response should have 'message'"
        assert data["message"] == "Document uploaded"
        assert "document" in data, "Response should have 'document'"
        
        doc = data["document"]
        assert "id" in doc, "Document should have 'id'"
        assert doc["client_id"] == client_id, "Document should be linked to correct client"
        assert doc["doc_type"] == "other", "Document type should match"
        assert "file_path" in doc, "Document should have 'file_path'"
        assert doc["file_size"] > 0, "File size should be positive"
        
        return doc["id"]
    
    def test_list_documents(self, super_admin_token, client_id):
        """Test listing documents for a client"""
        response = requests.get(
            f"{BASE_URL}/api/documents/vault/{client_id}",
            params={"admin_token": super_admin_token}
        )
        assert response.status_code == 200, f"List documents failed: {response.text}"
        data = response.json()
        
        # Data assertions
        assert "client_id" in data, "Response should have 'client_id'"
        assert data["client_id"] == client_id
        assert "documents" in data, "Response should have 'documents'"
        assert isinstance(data["documents"], list), "Documents should be a list"
        assert "total" in data, "Response should have 'total'"
    
    def test_list_documents_by_type(self, super_admin_token, client_id):
        """Test filtering documents by type"""
        response = requests.get(
            f"{BASE_URL}/api/documents/vault/{client_id}",
            params={
                "admin_token": super_admin_token,
                "doc_type": "other"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned documents should be of type 'other'
        for doc in data.get("documents", []):
            assert doc.get("doc_type") == "other"


class TestTeamMemberCreation(TestSetup):
    """Test tiered permission model for team member creation"""
    
    @pytest.fixture(scope="class")
    def full_admin_user(self, super_admin_token):
        """Create a full_admin user for permission testing"""
        username = f"test_full_admin_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "full_admin",
                "first_name": "Test",
                "last_name": "FullAdmin"
            }
        )
        assert response.status_code == 200, f"Failed to create full_admin: {response.text}"
        return {"username": username, "password": "TestPass123!", "id": response.json()["id"]}
    
    @pytest.fixture(scope="class")
    def full_admin_token(self, full_admin_user):
        """Login as full_admin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": full_admin_user["username"],
            "password": full_admin_user["password"]
        })
        assert response.status_code == 200, f"Full admin login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def viewer_user(self, super_admin_token):
        """Create a viewer user for permission testing"""
        username = f"test_viewer_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer",
                "first_name": "Test",
                "last_name": "Viewer"
            }
        )
        assert response.status_code == 200, f"Failed to create viewer: {response.text}"
        return {"username": username, "password": "TestPass123!", "id": response.json()["id"]}
    
    @pytest.fixture(scope="class")
    def viewer_token(self, viewer_user):
        """Login as viewer and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": viewer_user["username"],
            "password": viewer_user["password"]
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_super_admin_creates_admin_role(self, super_admin_token):
        """Super admin can create admin-level members (full_admin, super_admin)"""
        username = f"test_admin_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "full_admin"
            }
        )
        assert response.status_code == 200, f"Super admin should be able to create admin: {response.text}"
        data = response.json()
        assert data["role"] == "full_admin"
        assert data["is_super_admin"] == False
    
    def test_super_admin_creates_user_role(self, super_admin_token):
        """Super admin can create user-level members (collections, viewer)"""
        username = f"test_user_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "collections"
            }
        )
        assert response.status_code == 200, f"Super admin should create user: {response.text}"
        data = response.json()
        assert data["role"] == "collections"
    
    def test_full_admin_creates_user_role(self, full_admin_token):
        """Full admin can create user-level members"""
        username = f"test_user_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": full_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer"
            }
        )
        assert response.status_code == 200, f"Full admin should create users: {response.text}"
        data = response.json()
        assert data["role"] == "viewer"
    
    def test_full_admin_cannot_create_admin_role(self, full_admin_token):
        """Full admin cannot create admin-level members"""
        username = f"test_fail_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": full_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "full_admin"
            }
        )
        assert response.status_code == 403, f"Full admin should not create admin roles: {response.text}"
        data = response.json()
        assert "error" in data
        assert "super admin" in data["error"].lower()
    
    def test_viewer_cannot_create_team_members(self, viewer_token):
        """Regular viewer user cannot create any team members"""
        username = f"test_fail_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": viewer_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer"
            }
        )
        assert response.status_code == 403, f"Viewer should not create team members: {response.text}"
        data = response.json()
        assert "error" in data
        assert "insufficient" in data["error"].lower()


class TestPlanManagement(TestSetup):
    """Test subscription plan management permissions"""
    
    @pytest.fixture(scope="class")
    def test_user_for_plan_update(self, super_admin_token):
        """Create a user to test plan updates"""
        username = f"test_plan_user_{uuid.uuid4().hex[:8]}"
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": username,
                "password": "TestPass123!",
                "role": "viewer"
            }
        )
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_super_admin_updates_user_plan(self, super_admin_token, test_user_for_plan_update):
        """Super admin can update subscription plan of any member"""
        response = requests.put(
            f"{BASE_URL}/api/team/members/{test_user_for_plan_update}",
            params={"admin_token": super_admin_token},
            json={"subscription_plan": "professional"}
        )
        assert response.status_code == 200, f"Super admin should update plan: {response.text}"
        data = response.json()
        assert data.get("subscription_plan") == "professional" or data.get("plan") == "professional"
    
    def test_full_admin_updates_user_plan(self, super_admin_token):
        """Full admin can update subscription plan of user-level members"""
        # First create a full admin
        fa_username = f"test_fa_{uuid.uuid4().hex[:8]}"
        fa_response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_admin_token},
            json={
                "username": fa_username,
                "password": "TestPass123!",
                "role": "full_admin"
            }
        )
        assert fa_response.status_code == 200
        
        # Login as full admin
        login_response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": fa_username,
            "password": "TestPass123!"
        })
        assert login_response.status_code == 200
        fa_token = login_response.json()["token"]
        
        # Create a user-level member
        user_username = f"test_user_{uuid.uuid4().hex[:8]}"
        user_response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": fa_token},
            json={
                "username": user_username,
                "password": "TestPass123!",
                "role": "collections"
            }
        )
        assert user_response.status_code == 200
        user_id = user_response.json()["id"]
        
        # Full admin updates user's plan
        update_response = requests.put(
            f"{BASE_URL}/api/team/members/{user_id}",
            params={"admin_token": fa_token},
            json={"subscription_plan": "enterprise"}
        )
        assert update_response.status_code == 200, f"Full admin should update user plan: {update_response.text}"
        data = update_response.json()
        assert data.get("subscription_plan") == "enterprise" or data.get("plan") == "enterprise"


class TestRolesEndpoint(TestSetup):
    """Test the roles endpoint returns correct roles based on user type"""
    
    def test_super_admin_sees_all_roles(self, super_admin_token):
        """Super admin should see all roles including admin-level"""
        response = requests.get(f"{BASE_URL}/api/team/roles", params={
            "admin_token": super_admin_token
        })
        assert response.status_code == 200
        data = response.json()
        roles = data.get("roles", {})
        
        # Super admin should see admin roles
        assert "super_admin" in roles, "Super admin should see super_admin role"
        assert "full_admin" in roles, "Super admin should see full_admin role"
        assert "collections" in roles, "Super admin should see collections role"
        assert "viewer" in roles, "Super admin should see viewer role"
    
    def test_non_super_admin_sees_user_roles_only(self):
        """Non-super admin should only see user-level roles"""
        # Create and login as full_admin
        super_login = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPER_ADMIN_USERNAME,
            "password": SUPER_ADMIN_PASSWORD
        })
        super_token = super_login.json()["token"]
        
        fa_username = f"test_fa_roles_{uuid.uuid4().hex[:8]}"
        requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": super_token},
            json={
                "username": fa_username,
                "password": "TestPass123!",
                "role": "full_admin"
            }
        )
        
        fa_login = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": fa_username,
            "password": "TestPass123!"
        })
        fa_token = fa_login.json()["token"]
        
        response = requests.get(f"{BASE_URL}/api/team/roles", params={
            "admin_token": fa_token
        })
        assert response.status_code == 200
        data = response.json()
        roles = data.get("roles", {})
        
        # Non-super admin should NOT see admin roles
        assert "super_admin" not in roles, "Non-super should not see super_admin role"
        assert "full_admin" not in roles, "Non-super should not see full_admin role"
        # But should see user roles
        assert "collections" in roles, "Should see collections role"
        assert "viewer" in roles, "Should see viewer role"
