"""
Credit System for Device Registration - Code Generation Tests

Tests the UPDATED credit system where credits are used when generating
a registration key from client details page, NOT during client creation:

- POST /api/clients - Creating a client should NOT deduct credits
- POST /api/clients/{client_id}/generate-code - Should deduct 1 credit for regular admin  
- POST /api/clients/{client_id}/generate-code - Should NOT deduct credit for superadmin
- POST /api/clients/{client_id}/generate-code - Should fail with 0 credits
- GET /api/admin/credits - Should return correct credit balance
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
TEST_ADMIN_USERNAME = "testadmin"
TEST_ADMIN_PASSWORD = "test123"


class TestClientCreationNoCredits:
    """Tests that client creation does NOT deduct credits"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    @pytest.fixture
    def test_regular_admin(self, superadmin_session):
        """Create or login test regular admin and clean up after test"""
        # Try to login first
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": TEST_ADMIN_USERNAME,
            "password": TEST_ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            admin_data = response.json()
            yield {"id": admin_data["id"], "token": admin_data["token"], "username": admin_data["username"]}
        else:
            # Create test admin
            response = requests.post(f"{BASE_URL}/api/admin/register", params={
                "admin_token": superadmin_session["token"]
            }, json={
                "username": f"TEST_gencode_admin_{int(time.time())}",
                "password": "testpass123",
                "role": "user"
            })
            assert response.status_code == 200, f"Failed to create test admin: {response.text}"
            admin_data = response.json()
            
            yield {"id": admin_data["id"], "token": admin_data["token"], "username": admin_data["username"]}
            
            # Cleanup - only delete if we created it
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
        print(f"Superadmin initial credits: {initial_credits}")
        
        # Create client
        client_name = f"TEST_NoCredit_SA_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "name": client_name,
            "phone": "+3725551234",
            "email": f"test_super_{int(time.time())}@example.com"
        })
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        print(f"Created client {client_id}")
        
        # Verify credits NOT deducted
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits, f"Superadmin credits should NOT be deducted on client creation. Initial: {initial_credits}, Final: {final_credits}"
        print(f"PASS: Superadmin client creation - credits unchanged ({initial_credits} -> {final_credits})")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": superadmin_session["admin_id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": superadmin_session["admin_id"]
        })
    
    def test_regular_admin_client_creation_no_credit_deduction(self, superadmin_session, test_regular_admin):
        """POST /api/clients with regular admin token should NOT deduct credits"""
        # Ensure admin has credits
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": test_regular_admin["id"],
            "credits": 5
        })
        assert response.status_code == 200
        
        # Get initial credits
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        initial_credits = response.json()["credits"]
        print(f"Regular admin initial credits: {initial_credits}")
        
        # Create client
        client_name = f"TEST_NoCredit_Reg_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "name": client_name,
            "phone": "+3725559999",
            "email": f"test_reg_{int(time.time())}@example.com"
        })
        
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        print(f"Created client {client_id}")
        
        # Verify credits NOT deducted
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits, f"Credits should NOT be deducted on client creation. Initial: {initial_credits}, Final: {final_credits}"
        print(f"PASS: Regular admin client creation - credits unchanged ({initial_credits} -> {final_credits})")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": test_regular_admin["id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": test_regular_admin["id"]
        })


class TestGenerateCodeCreditDeduction:
    """Tests for POST /api/clients/{client_id}/generate-code endpoint"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    @pytest.fixture
    def test_regular_admin(self, superadmin_session):
        """Create or login test regular admin"""
        # Try to login first
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": TEST_ADMIN_USERNAME,
            "password": TEST_ADMIN_PASSWORD
        })
        
        if response.status_code == 200:
            admin_data = response.json()
            yield {"id": admin_data["id"], "token": admin_data["token"], "username": admin_data["username"]}
        else:
            # Create test admin
            response = requests.post(f"{BASE_URL}/api/admin/register", params={
                "admin_token": superadmin_session["token"]
            }, json={
                "username": f"TEST_gencode2_admin_{int(time.time())}",
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
    
    @pytest.fixture
    def test_client(self, superadmin_session):
        """Create a test client for generate-code tests"""
        client_name = f"TEST_GenCode_Client_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "name": client_name,
            "phone": "+3725551111",
            "email": f"test_gencode_{int(time.time())}@example.com"
        })
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client = response.json()
        
        yield {"id": client["id"], "registration_code": client["registration_code"], "admin_id": superadmin_session["admin_id"]}
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client['id']}/allow-uninstall", params={
            "admin_id": superadmin_session["admin_id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client['id']}", params={
            "admin_id": superadmin_session["admin_id"]
        })
    
    def test_regular_admin_generate_code_deducts_credit(self, superadmin_session, test_regular_admin, test_client):
        """POST /api/clients/{client_id}/generate-code should deduct 1 credit for regular admin"""
        # Assign initial credits to test admin
        initial_credit_amount = 5
        response = requests.post(f"{BASE_URL}/api/admin/credits/assign", params={
            "admin_token": superadmin_session["token"]
        }, json={
            "target_admin_id": test_regular_admin["id"],
            "credits": initial_credit_amount
        })
        assert response.status_code == 200
        
        # Verify initial credits
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        initial_credits = response.json()["credits"]
        assert initial_credits == initial_credit_amount, f"Expected {initial_credit_amount} credits, got {initial_credits}"
        print(f"Regular admin initial credits: {initial_credits}")
        
        # Create client belonging to regular admin
        client_name = f"TEST_RegAdminClient_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "name": client_name,
            "phone": "+3725552222",
            "email": f"test_reg_client_{int(time.time())}@example.com"
        })
        assert response.status_code == 200, f"Client creation failed: {response.text}"
        client_id = response.json()["id"]
        original_code = response.json()["registration_code"]
        print(f"Created client {client_id} with original code: {original_code}")
        
        # Verify credits still same (no deduction on creation)
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        credits_after_creation = response.json()["credits"]
        assert credits_after_creation == initial_credits, f"Credits should not be deducted on creation"
        
        # Generate new code - this should deduct 1 credit
        response = requests.post(f"{BASE_URL}/api/clients/{client_id}/generate-code", params={
            "admin_token": test_regular_admin["token"]
        })
        
        assert response.status_code == 200, f"Generate code failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "registration_code" in data, "Response missing 'registration_code'"
        assert "credits_remaining" in data, "Response missing 'credits_remaining'"
        assert data["registration_code"] != original_code, "New code should be different"
        print(f"Generated new code: {data['registration_code']}, credits_remaining: {data['credits_remaining']}")
        
        # Verify 1 credit was deducted
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": test_regular_admin["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits - 1, f"Expected {initial_credits - 1} credits after generate-code, got {final_credits}"
        print(f"PASS: Regular admin generate-code - credits deducted ({initial_credits} -> {final_credits})")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": test_regular_admin["id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": test_regular_admin["id"]
        })
    
    def test_superadmin_generate_code_no_credit_deduction(self, superadmin_session, test_client):
        """POST /api/clients/{client_id}/generate-code should NOT deduct credits for superadmin"""
        # Get initial credits
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        initial_credits = response.json()["credits"]
        print(f"Superadmin initial credits: {initial_credits}")
        
        original_code = test_client["registration_code"]
        
        # Generate new code
        response = requests.post(f"{BASE_URL}/api/clients/{test_client['id']}/generate-code", params={
            "admin_token": superadmin_session["token"]
        })
        
        assert response.status_code == 200, f"Generate code failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "registration_code" in data, "Response missing 'registration_code'"
        assert "credits_remaining" in data, "Response missing 'credits_remaining'"
        assert data["credits_remaining"] == "unlimited", "Superadmin should show 'unlimited' credits"
        assert data["registration_code"] != original_code, "New code should be different"
        print(f"Generated new code: {data['registration_code']}, credits_remaining: {data['credits_remaining']}")
        
        # Verify credits NOT deducted
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        final_credits = response.json()["credits"]
        
        assert final_credits == initial_credits, f"Superadmin credits should NOT be deducted. Initial: {initial_credits}, Final: {final_credits}"
        print(f"PASS: Superadmin generate-code - credits unchanged ({initial_credits} -> {final_credits})")
    
    def test_generate_code_with_zero_credits_fails(self, superadmin_session, test_regular_admin):
        """POST /api/clients/{client_id}/generate-code should fail with 0 credits"""
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
        print("Set credits to 0")
        
        # Create client
        client_name = f"TEST_ZeroCredit_{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/clients", params={
            "admin_token": test_regular_admin["token"]
        }, json={
            "name": client_name,
            "phone": "+3725553333",
            "email": f"test_zero_{int(time.time())}@example.com"
        })
        assert response.status_code == 200, f"Client creation should succeed without credits"
        client_id = response.json()["id"]
        print(f"Created client {client_id} (no credit deduction expected)")
        
        # Try to generate code - should fail
        response = requests.post(f"{BASE_URL}/api/clients/{client_id}/generate-code", params={
            "admin_token": test_regular_admin["token"]
        })
        
        assert response.status_code == 422, f"Expected 422 for insufficient credits, got {response.status_code}"
        data = response.json()
        assert "Insufficient credits" in data.get("error", ""), f"Expected insufficient credits error, got: {data}"
        print(f"PASS: Generate code with 0 credits correctly rejected: {data['error']}")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/clients/{client_id}/allow-uninstall", params={
            "admin_id": test_regular_admin["id"]
        })
        requests.delete(f"{BASE_URL}/api/clients/{client_id}", params={
            "admin_id": test_regular_admin["id"]
        })


class TestGetAdminCredits:
    """Tests for GET /api/admin/credits endpoint"""
    
    @pytest.fixture
    def superadmin_session(self):
        """Login superadmin and return token + admin_id"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": SUPERADMIN_USERNAME,
            "password": SUPERADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        return {"token": data["token"], "admin_id": data["id"]}
    
    def test_get_credits_returns_correct_balance(self, superadmin_session):
        """GET /api/admin/credits should return correct credit balance"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": superadmin_session["token"]
        })
        
        assert response.status_code == 200, f"Get credits failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "admin_id" in data, "Response missing 'admin_id'"
        assert "username" in data, "Response missing 'username'"
        assert "credits" in data, "Response missing 'credits'"
        assert "is_super_admin" in data, "Response missing 'is_super_admin'"
        
        # Verify data types
        assert isinstance(data["credits"], int), f"Credits should be int, got {type(data['credits'])}"
        assert isinstance(data["is_super_admin"], bool), "is_super_admin should be bool"
        
        # Verify superadmin status
        assert data["username"] == SUPERADMIN_USERNAME
        assert data["is_super_admin"] == True
        
        print(f"PASS: GET /api/admin/credits returns: admin_id={data['admin_id']}, credits={data['credits']}, is_super_admin={data['is_super_admin']}")
    
    def test_get_credits_invalid_token(self):
        """GET /api/admin/credits with invalid token should return 401"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": "invalid_token_12345"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASS: Invalid token correctly rejected for /api/admin/credits")


class TestGenerateCodeEndpointValidation:
    """Tests for generate-code endpoint validation"""
    
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
    
    def test_generate_code_invalid_client_id(self, superadmin_session):
        """POST /api/clients/{client_id}/generate-code with invalid client should return 404"""
        response = requests.post(f"{BASE_URL}/api/clients/nonexistent-client-id/generate-code", params={
            "admin_token": superadmin_session["token"]
        })
        
        assert response.status_code == 404, f"Expected 404 for invalid client, got {response.status_code}"
        print("PASS: Generate code with invalid client_id correctly returns 404")
    
    def test_generate_code_invalid_token(self):
        """POST /api/clients/{client_id}/generate-code with invalid token should return 401"""
        response = requests.post(f"{BASE_URL}/api/clients/any-client-id/generate-code", params={
            "admin_token": "invalid_token_xyz"
        })
        
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        print("PASS: Generate code with invalid token correctly returns 401")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
