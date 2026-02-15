"""
Test Client Deletion Flow with Allow-Uninstall Guard
====================================================
Tests the new deletion flow where:
1. DELETE /api/clients/{client_id} should fail (400) if allow-uninstall was NOT called first
2. POST /api/clients/{client_id}/allow-uninstall should mark client for uninstall  
3. DELETE /api/clients/{client_id} should succeed after allow-uninstall was called
4. Full chain test - login, create client, allow-uninstall, delete
5. GET /api/clients/{client_id} should return is_registered field
6. POST /api/admin/login with credentials karli1987/nasvakas123 should return token
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://admin-portal-repair-2.preview.emergentagent.com").rstrip("/")

# Test credentials
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"


class TestAdminLogin:
    """Test admin login functionality"""
    
    def test_admin_login_with_valid_credentials(self):
        """Test: POST /api/admin/login with credentials karli1987/nasvakas123 should return token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "token" in data, "Response should contain 'token'"
        assert "id" in data, "Response should contain 'id'"
        assert "username" in data, "Response should contain 'username'"
        assert "role" in data, "Response should contain 'role'"
        
        # Verify token is non-empty
        assert len(data["token"]) > 0, "Token should not be empty"
        assert data["username"] == ADMIN_USERNAME, f"Username should match: {data['username']}"
        
        print(f"✓ Login successful - got token: {data['token'][:20]}...")

    def test_admin_login_with_invalid_credentials(self):
        """Test: POST /api/admin/login with invalid credentials should fail"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        
        assert response.status_code == 401, f"Expected 401 for invalid credentials, got {response.status_code}"
        print("✓ Invalid credentials correctly rejected with 401")


class TestClientDeleteFlow:
    """Test client deletion flow with allow-uninstall guard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.admin_id = response.json()["id"]
        yield

    def test_delete_client_without_allow_uninstall_should_fail_400(self):
        """Test: DELETE /api/clients/{client_id} should fail (400) if allow-uninstall was NOT called first"""
        # Create a test client
        client_data = {
            "name": f"TEST_delete_guard_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "test@example.com"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # Attempt to delete WITHOUT calling allow-uninstall first
        delete_response = requests.delete(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        
        # Should fail with 400
        assert delete_response.status_code == 400, f"Expected 400 for delete without allow-uninstall, got {delete_response.status_code}"
        
        # Verify error message mentions uninstall
        error_data = delete_response.json()
        assert "uninstall" in error_data.get("detail", "").lower(), \
            f"Error should mention uninstall: {error_data}"
        
        print(f"✓ Delete correctly blocked with 400 when allow-uninstall not called")
        
        # Cleanup: allow uninstall then delete
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={self.admin_id}")
        requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}")

    def test_allow_uninstall_marks_client_for_uninstall(self):
        """Test: POST /api/clients/{client_id}/allow-uninstall should mark client for uninstall"""
        # Create a test client
        client_data = {
            "name": f"TEST_uninstall_mark_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "test@example.com"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # Call allow-uninstall endpoint
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={self.admin_id}"
        )
        
        assert allow_response.status_code == 200, f"Allow-uninstall failed: {allow_response.text}"
        
        # Verify response
        allow_data = allow_response.json()
        assert "message" in allow_data, "Response should contain message"
        assert "uninstall" in allow_data["message"].lower(), \
            f"Message should mention uninstall: {allow_data}"
        
        print(f"✓ Allow-uninstall endpoint returned success")
        
        # Verify the client was marked by checking device status
        status_response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        assert status_response.status_code == 200, f"Status check failed: {status_response.text}"
        
        status_data = status_response.json()
        assert "uninstall_allowed" in status_data, "Status should contain uninstall_allowed field"
        assert status_data["uninstall_allowed"] == True, \
            f"uninstall_allowed should be True after allow-uninstall call: {status_data}"
        
        print(f"✓ Client correctly marked with uninstall_allowed=True")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}")

    def test_delete_client_succeeds_after_allow_uninstall(self):
        """Test: DELETE /api/clients/{client_id} should succeed after allow-uninstall was called"""
        # Create a test client
        client_data = {
            "name": f"TEST_delete_after_allow_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "test@example.com"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # First, call allow-uninstall
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={self.admin_id}"
        )
        assert allow_response.status_code == 200, f"Allow-uninstall failed: {allow_response.text}"
        
        # Now delete should succeed
        delete_response = requests.delete(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        
        assert delete_response.status_code == 200, \
            f"Delete should succeed after allow-uninstall, got {delete_response.status_code}: {delete_response.text}"
        
        delete_data = delete_response.json()
        assert "message" in delete_data, "Response should contain message"
        
        print(f"✓ Delete succeeded after allow-uninstall was called")
        
        # Verify client is actually deleted
        get_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        assert get_response.status_code == 404, \
            f"Client should not exist after deletion, got {get_response.status_code}"
        
        print(f"✓ Client verified as deleted (404)")

    def test_full_chain_login_create_allow_uninstall_delete(self):
        """Test: Full chain - login, create client, allow-uninstall, delete"""
        # Step 1: Login (already done in fixture, but verify)
        print("Step 1: Login...")
        assert self.token is not None and len(self.token) > 0
        print(f"✓ Login successful with token: {self.token[:20]}...")
        
        # Step 2: Create client
        print("Step 2: Create client...")
        client_data = {
            "name": f"TEST_full_chain_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "fullchain@test.com"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_id = create_response.json()["id"]
        print(f"✓ Client created with ID: {client_id}")
        
        # Step 3: Verify uninstall guard (delete should fail)
        print("Step 3: Verify uninstall guard...")
        delete_blocked_response = requests.delete(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        assert delete_blocked_response.status_code == 400, \
            f"Delete should be blocked, got {delete_blocked_response.status_code}"
        print(f"✓ Delete correctly blocked (400) without allow-uninstall")
        
        # Step 4: Call allow-uninstall
        print("Step 4: Call allow-uninstall...")
        allow_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={self.admin_id}"
        )
        assert allow_response.status_code == 200, f"Allow-uninstall failed: {allow_response.text}"
        print(f"✓ Allow-uninstall successful")
        
        # Step 5: Delete client (should now succeed)
        print("Step 5: Delete client...")
        delete_response = requests.delete(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        assert delete_response.status_code == 200, \
            f"Delete should succeed, got {delete_response.status_code}: {delete_response.text}"
        print(f"✓ Client deleted successfully")
        
        # Final verification: client should not exist
        verify_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        assert verify_response.status_code == 404, "Client should not exist after deletion"
        print(f"✓ Full chain test PASSED")


class TestClientIsRegisteredField:
    """Test that GET /api/clients/{client_id} returns is_registered field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token before each test"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.admin_id = response.json()["id"]
        yield

    def test_get_client_returns_is_registered_field(self):
        """Test: GET /api/clients/{client_id} should return is_registered field"""
        # Create a test client
        client_data = {
            "name": f"TEST_is_registered_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "registered@test.com"
        }
        create_response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={self.token}",
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        client_id = create_response.json()["id"]
        
        # Get the client and verify is_registered field
        get_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}"
        )
        assert get_response.status_code == 200, f"Get client failed: {get_response.text}"
        
        client = get_response.json()
        
        # Verify is_registered field exists
        assert "is_registered" in client, \
            f"Client response should contain is_registered field: {list(client.keys())}"
        
        # New client should have is_registered=False
        assert client["is_registered"] == False, \
            f"New client should have is_registered=False: {client['is_registered']}"
        
        print(f"✓ GET /api/clients/{{client_id}} returns is_registered field (value: {client['is_registered']})")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall?admin_id={self.admin_id}")
        requests.delete(f"{BASE_URL}/api/clients/{client_id}?admin_id={self.admin_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
