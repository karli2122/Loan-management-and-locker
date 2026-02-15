"""
Backend API Tests for EMI Device Admin Application - Loan Plan CRUD and Auth
Tests focus on:
1. POST /api/admin/login - admin login returns token, id, role
2. POST /api/loan-plans?admin_token=TOKEN - create loan plan
3. GET /api/loan-plans?admin_id=ADMIN_ID - list loan plans
4. DELETE /api/loan-plans/{plan_id}?admin_token=TOKEN - delete loan plan
5. PUT /api/loan-plans/{plan_id}?admin_token=TOKEN - update/toggle loan plan active status
6. POST /api/clients?admin_token=TOKEN - create client
7. GET /api/admin/verify/{token} - verify admin token
8. All operations return 401 when token is invalid/expired
9. POST /api/device/report-admin-status?client_id=ID&admin_active=true - report admin status
10. GET /api/device/status/{client_id} - get device status including uninstall_allowed

IMPORTANT: Each call to /api/admin/login invalidates previous tokens (upsert=True)
So tests must use a SINGLE login per test sequence
"""

import pytest
import requests
import uuid

# Use the preview URL from review request
BASE_URL = "https://admin-portal-repair-2.preview.emergentagent.com"

# Test credentials from review request
TEST_USERNAME = "karli1987"
TEST_PASSWORD = "nasvakas123"


class TestAdminLoginAndAuth:
    """Test admin login and authentication endpoints"""
    
    def test_login_success_returns_token_id_role(self):
        """POST /api/admin/login - admin login returns token, id, role"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Required fields per the requirements
        assert "token" in data, "Response must contain 'token'"
        assert "id" in data, "Response must contain 'id'"
        assert "role" in data, "Response must contain 'role'"
        assert "username" in data, "Response must contain 'username'"
        
        # Additional fields
        assert "first_name" in data, "Response must contain 'first_name'"
        assert "last_name" in data, "Response must contain 'last_name'"
        
        # Verify data types
        assert isinstance(data["token"], str) and len(data["token"]) > 0, "Token should be non-empty string"
        assert isinstance(data["id"], str) and len(data["id"]) > 0, "ID should be non-empty string"
        assert data["role"] in ["admin", "user"], f"Role should be 'admin' or 'user', got '{data['role']}'"
        
        print(f"✅ Login successful - ID: {data['id']}, Role: {data['role']}, Token length: {len(data['token'])}")
        print(f"   first_name={data.get('first_name')}, last_name={data.get('last_name')}")
        
        return data
    
    def test_login_invalid_credentials_returns_401(self):
        """POST /api/admin/login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid_user", "password": "wrong_password"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Invalid login correctly rejected with 401")


class TestTokenVerification:
    """Test token verification endpoint"""
    
    def test_verify_valid_token(self):
        """GET /api/admin/verify/{token} - verify valid admin token"""
        # First login to get a token
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json()["token"]
        admin_id = login_response.json()["id"]
        
        # Verify the token
        response = requests.get(f"{BASE_URL}/api/admin/verify/{token}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "valid" in data, "Response should contain 'valid'"
        assert data["valid"] == True, "Token should be valid"
        assert "admin_id" in data, "Response should contain 'admin_id'"
        assert data["admin_id"] == admin_id, f"Admin ID mismatch: expected {admin_id}, got {data.get('admin_id')}"
        
        print(f"✅ Token verification successful - admin_id={data['admin_id']}, expires_at={data.get('expires_at')}")
    
    def test_verify_invalid_token_returns_401(self):
        """GET /api/admin/verify/{token} - invalid token returns 401"""
        response = requests.get(f"{BASE_URL}/api/admin/verify/invalid_token_12345")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Invalid token correctly rejected with 401")


class TestLoanPlanCRUD:
    """
    Test loan plan CRUD operations
    IMPORTANT: Each login invalidates previous tokens - use single login per test sequence
    """
    
    def test_full_loan_plan_crud_flow(self):
        """
        Complete CRUD flow: login -> create plan -> list plans -> toggle plan -> delete plan
        Uses a SINGLE login to avoid token invalidation
        """
        # Step 1: Login - single login for entire flow
        print("\n📌 Step 1: Login")
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        login_data = login_response.json()
        token = login_data["token"]
        admin_id = login_data["id"]
        print(f"✅ Logged in - admin_id={admin_id}, token={token[:20]}...")
        
        # Step 2: Create a loan plan
        print("\n📌 Step 2: Create loan plan")
        unique_id = str(uuid.uuid4())[:8]
        plan_data = {
            "name": f"TEST_Plan_{unique_id}",
            "interest_rate": 12.5,
            "min_tenure_months": 6,
            "max_tenure_months": 24,
            "processing_fee_percent": 1.5,
            "late_fee_percent": 3.0,
            "description": f"Test loan plan created by automated tests"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/loan-plans",
            params={"admin_token": token},
            json=plan_data
        )
        
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        created_plan = create_response.json()
        assert "id" in created_plan, "Created plan should have 'id'"
        assert created_plan["name"] == plan_data["name"], "Name mismatch"
        assert created_plan["interest_rate"] == plan_data["interest_rate"], "Interest rate mismatch"
        assert created_plan["admin_id"] == admin_id, f"Admin ID mismatch: expected {admin_id}, got {created_plan.get('admin_id')}"
        assert created_plan["is_active"] == True, "New plan should be active by default"
        
        plan_id = created_plan["id"]
        print(f"✅ Created loan plan - id={plan_id}, name={created_plan['name']}")
        
        # Step 3: List loan plans
        print("\n📌 Step 3: List loan plans")
        list_response = requests.get(
            f"{BASE_URL}/api/loan-plans",
            params={"admin_id": admin_id}
        )
        
        assert list_response.status_code == 200, f"Expected 200, got {list_response.status_code}: {list_response.text}"
        
        plans = list_response.json()
        assert isinstance(plans, list), "Response should be a list"
        
        # Find our created plan
        found_plan = None
        for p in plans:
            if p["id"] == plan_id:
                found_plan = p
                break
        
        assert found_plan is not None, f"Created plan {plan_id} not found in list"
        print(f"✅ Found plan in list - total plans: {len(plans)}")
        
        # Step 4: Update/toggle loan plan (toggle is_active)
        print("\n📌 Step 4: Update loan plan")
        update_data = {
            "name": plan_data["name"],  # Keep the same name
            "interest_rate": 15.0,  # Updated interest rate
            "min_tenure_months": plan_data["min_tenure_months"],
            "max_tenure_months": plan_data["max_tenure_months"],
            "processing_fee_percent": plan_data["processing_fee_percent"],
            "late_fee_percent": plan_data["late_fee_percent"],
            "description": "Updated description"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/loan-plans/{plan_id}",
            params={"admin_token": token},
            json=update_data
        )
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        updated_plan = update_response.json()
        assert updated_plan["interest_rate"] == 15.0, f"Interest rate not updated: {updated_plan.get('interest_rate')}"
        print(f"✅ Updated loan plan - interest_rate changed to {updated_plan['interest_rate']}")
        
        # Step 5: Delete the loan plan
        print("\n📌 Step 5: Delete loan plan")
        delete_response = requests.delete(
            f"{BASE_URL}/api/loan-plans/{plan_id}",
            params={"admin_token": token}
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        delete_data = delete_response.json()
        assert "message" in delete_data, "Delete response should contain 'message'"
        print(f"✅ Deleted loan plan - message: {delete_data.get('message')}")
        
        # Step 6: Verify plan is deleted
        print("\n📌 Step 6: Verify plan is deleted")
        get_deleted_response = requests.get(
            f"{BASE_URL}/api/loan-plans/{plan_id}",
            params={"admin_id": admin_id}
        )
        
        assert get_deleted_response.status_code == 404, f"Expected 404, got {get_deleted_response.status_code}"
        print("✅ Confirmed plan is deleted (404)")
        
        print("\n✅✅✅ Full CRUD flow completed successfully ✅✅✅")
    
    def test_loan_plan_operations_with_invalid_token_return_401(self):
        """All loan plan operations return 401 when token is invalid/expired"""
        invalid_token = "invalid_token_12345"
        
        # Test CREATE with invalid token
        print("\n📌 Testing CREATE with invalid token")
        create_response = requests.post(
            f"{BASE_URL}/api/loan-plans",
            params={"admin_token": invalid_token},
            json={"name": "Test", "interest_rate": 10}
        )
        assert create_response.status_code == 401, f"Expected 401, got {create_response.status_code}"
        print("✅ CREATE rejected with 401 for invalid token")
        
        # Test UPDATE with invalid token
        print("\n📌 Testing UPDATE with invalid token")
        update_response = requests.put(
            f"{BASE_URL}/api/loan-plans/fake_plan_id",
            params={"admin_token": invalid_token},
            json={"name": "Test", "interest_rate": 10}
        )
        assert update_response.status_code == 401, f"Expected 401, got {update_response.status_code}"
        print("✅ UPDATE rejected with 401 for invalid token")
        
        # Test DELETE with invalid token
        print("\n📌 Testing DELETE with invalid token")
        delete_response = requests.delete(
            f"{BASE_URL}/api/loan-plans/fake_plan_id",
            params={"admin_token": invalid_token}
        )
        assert delete_response.status_code == 401, f"Expected 401, got {delete_response.status_code}"
        print("✅ DELETE rejected with 401 for invalid token")
    
    def test_list_loan_plans_requires_admin_id(self):
        """GET /api/loan-plans without admin_id returns validation error"""
        response = requests.get(f"{BASE_URL}/api/loan-plans")
        
        # Should return 422 validation error
        assert response.status_code == 422, f"Expected 422 without admin_id, got {response.status_code}: {response.text}"
        print("✅ /api/loan-plans correctly rejects requests without admin_id (422)")


class TestAddClient:
    """Test client creation endpoint"""
    
    def test_create_client_with_admin_token(self):
        """POST /api/clients?admin_token=TOKEN - create client"""
        # Login first
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json()["token"]
        admin_id = login_response.json()["id"]
        
        # Create client
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_Client_{unique_id}",
            "phone": f"+1-555-{unique_id[:3]}-{unique_id[3:7]}",
            "email": f"test_{unique_id}@example.com",
            "emi_amount": 200.00,
            "loan_amount": 5000.0,
            "down_payment": 500.0,
            "interest_rate": 12.0,
            "loan_tenure_months": 12
        }
        
        response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": token},
            json=client_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert "registration_code" in data, "Response should contain 'registration_code'"
        assert data["name"] == client_data["name"], "Name mismatch"
        assert data["admin_id"] == admin_id, f"Admin ID mismatch: expected {admin_id}, got {data.get('admin_id')}"
        
        print(f"✅ Client created - id={data['id']}, registration_code={data['registration_code']}, admin_id={data['admin_id']}")
        
        return data
    
    def test_create_client_with_invalid_token_returns_401(self):
        """POST /api/clients?admin_token=INVALID returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": "invalid_token_xyz"},
            json={"name": "Test", "phone": "123", "email": "test@test.com"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Client creation rejected with 401 for invalid token")


class TestDeviceStatusAndAdminMode:
    """Test device status and admin mode reporting endpoints"""
    
    def test_device_status_and_admin_mode_flow(self):
        """
        Test flow:
        1. Login and create a client
        2. GET device status - should include uninstall_allowed
        3. POST report admin status
        """
        # Login and create a test client
        print("\n📌 Step 1: Login")
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_USERNAME, "password": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json()["token"]
        admin_id = login_response.json()["id"]
        
        # Create a test client
        print("\n📌 Step 2: Create test client")
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "name": f"TEST_Device_{unique_id}",
            "phone": f"+1-555-{unique_id[:4]}",
            "email": f"device_{unique_id}@test.com"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": token},
            json=client_data
        )
        assert create_response.status_code == 200, f"Client creation failed: {create_response.text}"
        
        client_id = create_response.json()["id"]
        print(f"✅ Client created - id={client_id}")
        
        # Get device status
        print("\n📌 Step 3: Get device status")
        status_response = requests.get(f"{BASE_URL}/api/device/status/{client_id}")
        
        assert status_response.status_code == 200, f"Expected 200, got {status_response.status_code}: {status_response.text}"
        
        status_data = status_response.json()
        assert "id" in status_data, "Status should contain 'id'"
        assert "name" in status_data, "Status should contain 'name'"
        assert "is_locked" in status_data, "Status should contain 'is_locked'"
        assert "uninstall_allowed" in status_data, "Status should contain 'uninstall_allowed'"
        
        print(f"✅ Device status: is_locked={status_data['is_locked']}, uninstall_allowed={status_data['uninstall_allowed']}")
        
        # Report admin status
        print("\n📌 Step 4: Report admin mode status")
        admin_status_response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": client_id, "admin_active": True}
        )
        
        assert admin_status_response.status_code == 200, f"Expected 200, got {admin_status_response.status_code}: {admin_status_response.text}"
        
        admin_status_data = admin_status_response.json()
        assert "message" in admin_status_data, "Response should contain 'message'"
        assert admin_status_data.get("admin_active") == True, "admin_active should be True"
        
        print(f"✅ Admin status reported: {admin_status_data}")
        
        # Report admin status as False
        print("\n📌 Step 5: Report admin mode status (false)")
        admin_status_response2 = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": client_id, "admin_active": False}
        )
        
        assert admin_status_response2.status_code == 200, f"Expected 200, got {admin_status_response2.status_code}"
        assert admin_status_response2.json().get("admin_active") == False
        print(f"✅ Admin status reported as False")
        
        print("\n✅✅✅ Device status and admin mode flow completed ✅✅✅")
    
    def test_device_status_for_nonexistent_client_returns_404(self):
        """GET /api/device/status/{client_id} for nonexistent client returns 404"""
        response = requests.get(f"{BASE_URL}/api/device/status/nonexistent_client_id")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Device status for nonexistent client returns 404")
    
    def test_report_admin_status_for_nonexistent_client_returns_404(self):
        """POST /api/device/report-admin-status for nonexistent client returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/device/report-admin-status",
            params={"client_id": "nonexistent_client_id", "admin_active": True}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ Report admin status for nonexistent client returns 404")


class TestHealthCheck:
    """Test health check endpoint"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status'"
        assert data["status"] == "healthy", f"Expected 'healthy', got '{data.get('status')}'"
        
        print(f"✅ Health check passed: {data}")


# Run tests directly if script executed
if __name__ == "__main__":
    import sys
    
    print(f"\n{'='*60}")
    print("EMI Device Admin API Tests - Loan Plans and Auth")
    print(f"Base URL: {BASE_URL}")
    print(f"{'='*60}\n")
    
    # Run pytest with verbose output
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
