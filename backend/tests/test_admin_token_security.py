"""
Test Suite for API Security Audit: admin_token requirement for all client management endpoints

This test suite verifies that all client management endpoints now require admin_token 
instead of admin_id, preventing guessing attacks since tokens are cryptographically random
while admin_ids can be enumerated.

Endpoints tested:
- GET /api/clients - Requires admin_token, returns 422 without it
- GET /api/clients/{client_id} - Requires admin_token
- PUT /api/clients/{client_id} - Requires admin_token
- POST /api/clients/{client_id}/lock - Requires admin_token
- POST /api/clients/{client_id}/unlock - Requires admin_token
- POST /api/clients/{client_id}/warning - Requires admin_token
- POST /api/clients/{client_id}/allow-uninstall - Requires admin_token
- DELETE /api/clients/{client_id} - Requires admin_token
"""

import pytest
import requests
import os
import uuid

# Use the public URL for testing
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://loan-admin-portal-1.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get valid admin token via login"""
    response = api_client.post(f"{BASE_URL}/api/admin/login", json={
        "username": SUPERADMIN_USERNAME,
        "password": SUPERADMIN_PASSWORD
    })
    
    if response.status_code == 200:
        return response.json().get("token")
    
    pytest.skip(f"Authentication failed - status: {response.status_code}")


@pytest.fixture(scope="module")
def test_client_id(api_client, admin_token):
    """Create a test client and return its ID for use in tests"""
    client_data = {
        "name": f"TEST_SecurityAudit_{uuid.uuid4().hex[:8]}",
        "phone": "+1234567890",
        "email": "test_security@example.com",
        "emi_amount": 500.00
    }
    
    response = api_client.post(
        f"{BASE_URL}/api/clients",
        json=client_data,
        params={"admin_token": admin_token}
    )
    
    if response.status_code in [200, 201]:
        client = response.json()
        client_id = client.get("id")
        yield client_id
        
        # Cleanup: First allow uninstall, then delete
        api_client.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        api_client.delete(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
    else:
        pytest.skip(f"Could not create test client - status: {response.status_code}")


class TestGetClientsEndpoint:
    """Tests for GET /api/clients endpoint"""
    
    def test_get_clients_without_token_returns_422(self, api_client):
        """GET /api/clients without admin_token should return 422 (Unprocessable Entity)"""
        response = api_client.get(f"{BASE_URL}/api/clients")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: GET /api/clients without admin_token returns 422")
    
    def test_get_clients_with_invalid_token_returns_401(self, api_client):
        """GET /api/clients with invalid admin_token should return 401 (Unauthorized)"""
        response = api_client.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": "invalid_token_12345"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: GET /api/clients with invalid admin_token returns 401")
    
    def test_get_clients_with_valid_token_returns_200(self, api_client, admin_token):
        """GET /api/clients with valid admin_token should return 200"""
        response = api_client.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "clients" in data, "Response should contain 'clients' key"
        assert "pagination" in data, "Response should contain 'pagination' key"
        print("PASS: GET /api/clients with valid admin_token returns 200")


class TestGetSingleClientEndpoint:
    """Tests for GET /api/clients/{client_id} endpoint"""
    
    def test_get_client_without_token_returns_422(self, api_client, test_client_id):
        """GET /api/clients/{client_id} without admin_token should return 422"""
        response = api_client.get(f"{BASE_URL}/api/clients/{test_client_id}")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: GET /api/clients/{client_id} without admin_token returns 422")
    
    def test_get_client_with_invalid_token_returns_401(self, api_client, test_client_id):
        """GET /api/clients/{client_id} with invalid admin_token should return 401"""
        response = api_client.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            params={"admin_token": "invalid_token_xyz"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: GET /api/clients/{client_id} with invalid admin_token returns 401")
    
    def test_get_client_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """GET /api/clients/{client_id} with valid admin_token should return 200"""
        response = api_client.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["id"] == test_client_id, "Returned client ID should match"
        print("PASS: GET /api/clients/{client_id} with valid admin_token returns 200")


class TestUpdateClientEndpoint:
    """Tests for PUT /api/clients/{client_id} endpoint"""
    
    def test_update_client_without_token_returns_422(self, api_client, test_client_id):
        """PUT /api/clients/{client_id} without admin_token should return 422"""
        response = api_client.put(
            f"{BASE_URL}/api/clients/{test_client_id}",
            json={"name": "Updated Name"}
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: PUT /api/clients/{client_id} without admin_token returns 422")
    
    def test_update_client_with_invalid_token_returns_401(self, api_client, test_client_id):
        """PUT /api/clients/{client_id} with invalid admin_token should return 401"""
        response = api_client.put(
            f"{BASE_URL}/api/clients/{test_client_id}",
            json={"name": "Updated Name"},
            params={"admin_token": "invalid_token_abc"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: PUT /api/clients/{client_id} with invalid admin_token returns 401")
    
    def test_update_client_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """PUT /api/clients/{client_id} with valid admin_token should return 200"""
        response = api_client.put(
            f"{BASE_URL}/api/clients/{test_client_id}",
            json={"name": "TEST_Updated_SecurityAudit"},
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["name"] == "TEST_Updated_SecurityAudit", "Name should be updated"
        print("PASS: PUT /api/clients/{client_id} with valid admin_token returns 200")


class TestLockUnlockEndpoints:
    """Tests for lock/unlock endpoints"""
    
    def test_lock_without_token_returns_422(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/lock without admin_token should return 422"""
        response = api_client.post(f"{BASE_URL}/api/clients/{test_client_id}/lock")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/lock without admin_token returns 422")
    
    def test_lock_with_invalid_token_returns_401(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/lock with invalid admin_token should return 401"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/lock",
            params={"admin_token": "invalid_token_lock"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/lock with invalid admin_token returns 401")
    
    def test_lock_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """POST /api/clients/{client_id}/lock with valid admin_token should return 200"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/lock",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("message") == "Device locked successfully"
        print("PASS: POST /api/clients/{client_id}/lock with valid admin_token returns 200")
    
    def test_unlock_without_token_returns_422(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/unlock without admin_token should return 422"""
        response = api_client.post(f"{BASE_URL}/api/clients/{test_client_id}/unlock")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/unlock without admin_token returns 422")
    
    def test_unlock_with_invalid_token_returns_401(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/unlock with invalid admin_token should return 401"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/unlock",
            params={"admin_token": "invalid_token_unlock"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/unlock with invalid admin_token returns 401")
    
    def test_unlock_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """POST /api/clients/{client_id}/unlock with valid admin_token should return 200"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/unlock",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("message") == "Device unlocked successfully"
        print("PASS: POST /api/clients/{client_id}/unlock with valid admin_token returns 200")


class TestWarningEndpoint:
    """Tests for POST /api/clients/{client_id}/warning endpoint"""
    
    def test_warning_without_token_returns_422(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/warning without admin_token should return 422"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/warning",
            params={"message": "Test Warning"}
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/warning without admin_token returns 422")
    
    def test_warning_with_invalid_token_returns_401(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/warning with invalid admin_token should return 401"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/warning",
            params={
                "admin_token": "invalid_token_warning",
                "message": "Test Warning"
            }
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/warning with invalid admin_token returns 401")
    
    def test_warning_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """POST /api/clients/{client_id}/warning with valid admin_token should return 200"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/warning",
            params={
                "admin_token": admin_token,
                "message": "Test Warning Message"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert response.json().get("message") == "Warning sent successfully"
        print("PASS: POST /api/clients/{client_id}/warning with valid admin_token returns 200")


class TestAllowUninstallEndpoint:
    """Tests for POST /api/clients/{client_id}/allow-uninstall endpoint"""
    
    def test_allow_uninstall_without_token_returns_422(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/allow-uninstall without admin_token should return 422"""
        response = api_client.post(f"{BASE_URL}/api/clients/{test_client_id}/allow-uninstall")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/allow-uninstall without admin_token returns 422")
    
    def test_allow_uninstall_with_invalid_token_returns_401(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/allow-uninstall with invalid admin_token should return 401"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/allow-uninstall",
            params={"admin_token": "invalid_token_uninstall"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/allow-uninstall with invalid admin_token returns 401")
    
    def test_allow_uninstall_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """POST /api/clients/{client_id}/allow-uninstall with valid admin_token should return 200"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert "Device has been signaled to allow uninstall" in response.json().get("message", "")
        print("PASS: POST /api/clients/{client_id}/allow-uninstall with valid admin_token returns 200")


class TestDeleteClientEndpoint:
    """Tests for DELETE /api/clients/{client_id} endpoint"""
    
    def test_delete_without_token_returns_422(self, api_client):
        """DELETE /api/clients/{client_id} without admin_token should return 422"""
        response = api_client.delete(f"{BASE_URL}/api/clients/some-client-id")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: DELETE /api/clients/{client_id} without admin_token returns 422")
    
    def test_delete_with_invalid_token_returns_401(self, api_client):
        """DELETE /api/clients/{client_id} with invalid admin_token should return 401"""
        response = api_client.delete(
            f"{BASE_URL}/api/clients/some-client-id",
            params={"admin_token": "invalid_token_delete"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: DELETE /api/clients/{client_id} with invalid admin_token returns 401")
    
    def test_delete_with_valid_token_deletes_client(self, api_client, admin_token):
        """DELETE /api/clients/{client_id} with valid admin_token should delete the client"""
        # Create a client specifically for deletion test
        client_data = {
            "name": f"TEST_ToDelete_{uuid.uuid4().hex[:8]}",
            "phone": "+1234567890",
            "email": "delete_test@example.com"
        }
        
        create_response = api_client.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": admin_token}
        )
        
        assert create_response.status_code in [200, 201], f"Failed to create test client: {create_response.text}"
        client_id = create_response.json().get("id")
        
        # First, allow uninstall
        allow_response = api_client.post(
            f"{BASE_URL}/api/clients/{client_id}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        assert allow_response.status_code == 200, f"Failed to allow uninstall: {allow_response.text}"
        
        # Now delete
        delete_response = api_client.delete(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        assert delete_response.json().get("message") == "Client deleted successfully"
        print("PASS: DELETE /api/clients/{client_id} with valid admin_token deletes client successfully")


class TestGenerateCodeEndpoint:
    """Tests for POST /api/clients/{client_id}/generate-code endpoint"""
    
    def test_generate_code_without_token_returns_422(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/generate-code without admin_token should return 422"""
        response = api_client.post(f"{BASE_URL}/api/clients/{test_client_id}/generate-code")
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/generate-code without admin_token returns 422")
    
    def test_generate_code_with_invalid_token_returns_401(self, api_client, test_client_id):
        """POST /api/clients/{client_id}/generate-code with invalid admin_token should return 401"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code",
            params={"admin_token": "invalid_token_generate"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("PASS: POST /api/clients/{client_id}/generate-code with invalid admin_token returns 401")
    
    def test_generate_code_with_valid_token_returns_200(self, api_client, admin_token, test_client_id):
        """POST /api/clients/{client_id}/generate-code with valid admin_token should return 200"""
        response = api_client.post(
            f"{BASE_URL}/api/clients/{test_client_id}/generate-code",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "registration_code" in data, "Response should contain registration_code"
        print("PASS: POST /api/clients/{client_id}/generate-code with valid admin_token returns 200")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
