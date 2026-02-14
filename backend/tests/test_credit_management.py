"""
Credit Management API Tests

Tests the credit-based device registration system:
- GET /api/admin/credits - Returns admin's credit balance and is_super_admin status
- POST /api/admin/credits/assign - Superadmin can assign credits to other admins
- GET /api/admin/list-with-credits - List all admins with their credits (superadmin only)
- POST /api/clients (with non-superadmin token) - Should deduct 1 credit on client creation
- POST /api/clients (with superadmin token) - Should NOT deduct credits
- Admin login response includes credits field
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://loan-admin-portal-1.preview.emergentagent.com"

# Test credentials
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"


class TestAdminLoginCreditsField:
    """Test that admin login response includes credits field"""
    
    def test_superadmin_login_includes_credits(self):
        """POST /api/admin/login - Superadmin login should include credits field"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify credits field is present
        assert "credits" in data, "Response missing 'credits' field"
        assert isinstance(data["credits"], int), "Credits should be an integer"
        assert data["credits"] >= 0, "Credits should be non-negative"
        
        # Verify other expected fields
        assert "is_super_admin" in data, "Response missing 'is_super_admin' field"
        assert data["is_super_admin"] == True, "karli1987 should be superadmin"
        assert "token" in data, "Response missing 'token' field"
        
        print(f"Superadmin login successful. Credits: {data['credits']}, is_super_admin: {data['is_super_admin']}")


class TestGetAdminCredits:
    """Tests for GET /api/admin/credits endpoint"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Login superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        return response.json()["token"]
    
    def test_get_credits_returns_balance(self, superadmin_token):
        """GET /api/admin/credits should return credit balance and is_super_admin"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_token
        })
        
        assert response.status_code == 200, f"Get credits failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "admin_id" in data, "Response missing 'admin_id'"
        assert "username" in data, "Response missing 'username'"
        assert "credits" in data, "Response missing 'credits'"
        assert "is_super_admin" in data, "Response missing 'is_super_admin'"
        
        # Verify data values for superadmin
        assert data["username"] == SUPERADMIN_USERNAME
        assert data["is_super_admin"] == True
        assert isinstance(data["credits"], int)
        
        print(f"Credits response: admin_id={data['admin_id']}, credits={data['credits']}, is_super_admin={data['is_super_admin']}")
    
    def test_get_credits_invalid_token(self):
        """GET /api/admin/credits with invalid token should return 401"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": "invalid_token_12345"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid token correctly rejected")


class TestListAdminsWithCredits:
    """Tests for GET /api/admin/list-with-credits endpoint"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Login superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_list_admins_with_credits_superadmin_only(self, superadmin_token):
        """GET /api/admin/list-with-credits should work for superadmin"""
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": superadmin_token
        })
        
        assert response.status_code == 200, f"List admins failed: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one admin"
        
        # Verify each admin has credits field
        for admin in data:
            assert "id" in admin, "Admin missing 'id'"
            assert "username" in admin, "Admin missing 'username'"
            assert "credits" in admin, "Admin missing 'credits'"
            assert "is_super_admin" in admin, "Admin missing 'is_super_admin'"
            assert isinstance(admin["credits"], int), f"Credits should be int, got {type(admin['credits'])}"
            
            print(f"Admin: {admin['username']}, credits: {admin['credits']}, is_super_admin: {admin['is_super_admin']}")
    
    def test_list_admins_with_credits_invalid_token(self):
        """GET /api/admin/list-with-credits with invalid token should return 401"""
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": "invalid_token"
        })
        
        assert response.status_code == 401
        print("Invalid token correctly rejected for list-with-credits")


class TestCreditAssignment:
    """Tests for POST /api/admin/credits/assign endpoint"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    @pytest.fixture
    def regular_admin_id(self, superadmin_session):
        """Get a regular (non-superadmin) admin ID"""
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": superadmin_session["token"]
        })
        assert response.status_code == 200
        admins = response.json()
        
        # Find a non-superadmin
        for admin in admins:
            if not admin["is_super_admin"]:
                return admin["id"]
        
        pytest.skip("No regular admin found to test credit assignment")
    
    def test_superadmin_can_assign_credits(self, superadmin_session, regular_admin_id):
        """POST /api/admin/credits/assign - Superadmin can assign credits"""
        # Get current credits
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": superadmin_session["token"]
        })
        admins = {a["id"]: a for a in response.json()}
        original_credits = admins[regular_admin_id]["credits"]
        
        # Assign new credits
        new_credits = original_credits + 10
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": regular_admin_id,
            "credits": new_credits
        })
        
        assert response.status_code == 200, f"Credit assignment failed: {response.text}"
        data = response.json()
        assert "message" in data
        assert data["target_admin_id"] == regular_admin_id
        assert data["new_credits"] == new_credits
        
        # Verify credits were actually updated
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": superadmin_session["token"]
        })
        admins = {a["id"]: a for a in response.json()}
        assert admins[regular_admin_id]["credits"] == new_credits, "Credits not updated in database"
        
        print(f"Successfully assigned {new_credits} credits to admin {regular_admin_id}")
        
        # Restore original credits
        requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": regular_admin_id,
            "credits": original_credits
        })
    
    def test_assign_negative_credits_rejected(self, superadmin_session, regular_admin_id):
        """POST /api/admin/credits/assign with negative credits should be rejected"""
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": regular_admin_id,
            "credits": -5
        })
        
        assert response.status_code == 422, f"Expected 422 for negative credits, got {response.status_code}"
        print("Negative credits correctly rejected")
    
    def test_assign_credits_invalid_admin_id(self, superadmin_session):
        """POST /api/admin/credits/assign with invalid target_admin_id should return 404"""
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": "non_existent_admin_id_12345",
            "credits": 10
        })
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Invalid admin ID correctly rejected")


class TestCreditDeductionOnClientCreation:
    """Tests for credit deduction when non-superadmin creates clients"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    @pytest.fixture
    def test_regular_admin(self, superadmin_session):
        """Create a test regular admin and clean up after test"""
        # Create test admin
        response = requests.post(f"{BASE_URL}/api/admin/register", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "username": f"TEST_credit_admin_{int(time.time())}",
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code == 200, f"Failed to create test admin: {response.text}"
        admin_data = response.json()
        
        yield {"id": admin_data["id"], "token": admin_data["token"], "username": admin_data["username"]}
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/{admin_data['id']}", params={
            "admin_token": superadmin_session["token"]
        })
    
    def test_superadmin_client_creation_no_credit_deduction(self, superadmin_session):
        """POST /api/clients with superadmin token should NOT deduct credits"""
        # Get initial credits
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        initial_credits = response.json()["credits"]
        
        # Create client
        client_name = f"TEST_SuperadminClient_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "name": client_name,
            "phone": "+3725551234",
            "email": f"test_super_{int(time.time())}@example.com"
        })
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        
        # Verify credits NOT deducted for superadmin
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits, f"Superadmin credits should NOT be deducted. Initial: {initial_credits}, Final: {final_credits}"
        print(f"Superadmin client creation: credits unchanged ({initial_credits} -> {final_credits})")
        
        # Cleanup - allow uninstall then delete
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": superadmin_session["admin_id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": superadmin_session["admin_id"]
        })
    
    def test_regular_admin_client_creation_credit_deduction(self, superadmin_session, test_regular_admin):
        """POST /api/clients with regular admin token should deduct 1 credit"""
        # Get initial credits (should be 5 by default)
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        initial_credits = response.json()["credits"]
        assert initial_credits == 5, f"Expected 5 credits for new admin, got {initial_credits}"
        
        # Create client
        client_name = f"TEST_RegularAdminClient_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "name": client_name,
            "phone": "+3725559999",
            "email": f"test_regular_{int(time.time())}@example.com"
        })
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        
        # Verify 1 credit was deducted
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits - 1, f"Expected {initial_credits - 1} credits after deduction, got {final_credits}"
        print(f"Regular admin client creation: credits deducted ({initial_credits} -> {final_credits})")
        
        # Cleanup client
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": test_regular_admin["id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": test_regular_admin["id"]
        })
    
    def test_regular_admin_insufficient_credits_rejected(self, superadmin_session, test_regular_admin):
        """POST /api/clients with 0 credits should be rejected"""
        # Set credits to 0
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": test_regular_admin["id"],
            "credits": 0
        })
        assert response.status_code == 200
        
        # Verify credits are 0
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        assert response.json()["credits"] == 0
        
        # Try to create client - should fail
        client_name = f"TEST_ZeroCreditClient_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "name": client_name,
            "phone": "+3725558888",
            "email": f"test_zero_{int(time.time())}@example.com"
        })
        
        assert response.status_code == 422, f"Expected 422 for insufficient credits, got {response.status_code}"
        data = response.json()
        assert "Insufficient credits" in data.get("error", ""), f"Expected insufficient credits error, got: {data}"
        print(f"Insufficient credits correctly rejected: {data['error']}")


class TestNonSuperadminAuthorizationRejection:
    """Tests that non-superadmin users are rejected from superadmin-only endpoints"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    @pytest.fixture
    def test_regular_admin(self, superadmin_session):
        """Create a test regular admin and clean up after test"""
        response = requests.post(f"{BASE_URL}/api/admin/register", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "username": f"TEST_auth_admin_{int(time.time())}",
            "password": "testpass123",
            "role": "user"
        })
        assert response.status_code == 200
        admin_data = response.json()
        
        yield {"id": admin_data["id"], "token": admin_data["token"]}
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/{admin_data['id']}", params={
            "admin_token": superadmin_session["token"]
        })
    
    def test_non_superadmin_cannot_list_admins_with_credits(self, test_regular_admin):
        """GET /api/admin/list-with-credits should reject non-superadmin"""
        response = requests.get(f"{BASE_URL}/api/admin/list-with-credits", params={
            "admin_token": test_regular_admin["token"]
        })
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert data.get("code") == "AUTHORIZATION_ERROR"
        assert "superadmin" in data.get("error", "").lower()
        print(f"Non-superadmin correctly rejected from list-with-credits: {data['error']}")
    
    def test_non_superadmin_cannot_assign_credits(self, test_regular_admin, superadmin_session):
        """POST /api/admin/credits/assign should reject non-superadmin"""
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "target_admin_id": superadmin_session["admin_id"],
            "credits": 100
        })
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert data.get("code") == "AUTHORIZATION_ERROR"
        assert "superadmin" in data.get("error", "").lower()
        print(f"Non-superadmin correctly rejected from assigning credits: {data['error']}")


class TestSilentClients:
    """Tests for GET /api/clients/silent endpoint (kadunud filter)"""
    
    @pytest.fixture
    def superadmin_token(self):
        """Login superadmin and get token"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_silent_clients_endpoint(self, superadmin_token):
        """GET /api/clients/silent should return silent clients"""
        response = requests.get(f"{BASE_URL}/api/clients/silent", params={
            "admin_token": superadmin_token,
            "minutes": 60
        })
        
        assert response.status_code == 200, f"Silent clients failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "silent_clients" in data, "Response missing 'silent_clients'"
        assert "count" in data, "Response missing 'count'"
        assert "cutoff_minutes" in data, "Response missing 'cutoff_minutes'"
        
        assert isinstance(data["silent_clients"], list)
        assert data["cutoff_minutes"] == 60
        
        print(f"Silent clients count: {data['count']}, cutoff: {data['cutoff_minutes']} minutes")
        
        # Verify client structure if any exist
        for client in data["silent_clients"]:
            assert "id" in client
            assert "name" in client
            print(f"  - Silent client: {client['name']}")
    
    def test_silent_clients_requires_token(self):
        """GET /api/clients/silent without token should fail"""
        response = requests.get(f"{BASE_URL}/api/clients/silent")
        
        # Should require admin_token
        assert response.status_code in [401, 422], f"Expected auth error, got {response.status_code}"
        print("Silent clients correctly requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
