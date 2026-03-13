"""
Stripe Payment Integration Tests - Iteration 51
Tests for PayLock Pro subscription plan payments via Stripe integration.
Plans: Starter (€29/mo), Business (€79/mo), Enterprise (€199/mo), Custom (contact sales)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paylock-qa.preview.emergentagent.com").rstrip("/")


class TestHealthAndAuth:
    """Health check and admin authentication tests."""
    
    def test_health_check(self):
        """Test that health endpoint is working."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health check passed")
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "id" in data
        assert data["username"] == "admin"
        print(f"✓ Admin login successful, token received")
        return data["token"]


class TestSubscribeEndpoint:
    """Tests for POST /api/payments/subscribe endpoint."""
    
    @pytest.fixture
    def admin_token(self):
        """Get fresh admin token for tests."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_subscribe_starter_plan(self, admin_token):
        """Test creating checkout session for Starter plan (€29/mo)."""
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "starter",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "url" in data, "Response should contain Stripe checkout URL"
        assert "session_id" in data, "Response should contain session_id"
        assert data["url"].startswith("https://checkout.stripe.com"), "URL should be Stripe checkout URL"
        assert data["session_id"].startswith("cs_test_"), "Session ID should be test mode"
        print(f"✓ Starter plan checkout session created: {data['session_id']}")
    
    def test_subscribe_business_plan(self, admin_token):
        """Test creating checkout session for Business plan (€79/mo)."""
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "business",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "url" in data, "Response should contain Stripe checkout URL"
        assert "session_id" in data, "Response should contain session_id"
        assert data["url"].startswith("https://checkout.stripe.com")
        print(f"✓ Business plan checkout session created: {data['session_id']}")
    
    def test_subscribe_enterprise_plan(self, admin_token):
        """Test creating checkout session for Enterprise plan (€199/mo)."""
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "enterprise",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "url" in data, "Response should contain Stripe checkout URL"
        assert "session_id" in data, "Response should contain session_id"
        print(f"✓ Enterprise plan checkout session created: {data['session_id']}")
    
    def test_subscribe_invalid_plan_rejected(self, admin_token):
        """Test that invalid plan_id is rejected with 400 error."""
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "invalid_plan",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 400
        data = response.json()
        assert data["detail"] == "Invalid plan"
        print("✓ Invalid plan correctly rejected with 400 error")
    
    def test_subscribe_custom_plan_rejected(self, admin_token):
        """Test that custom plan is not a valid self-service plan."""
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "custom",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 400
        data = response.json()
        assert data["detail"] == "Invalid plan"
        print("✓ Custom plan correctly rejected (requires contact sales)")


class TestPaymentStatusEndpoint:
    """Tests for GET /api/payments/status/{session_id} endpoint."""
    
    @pytest.fixture
    def admin_token_and_session(self):
        """Get admin token and create a checkout session for testing."""
        # Login
        login_response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        token = login_response.json()["token"]
        
        # Create checkout session
        subscribe_response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "business",
                "origin_url": BASE_URL,
                "admin_token": token
            }
        )
        session_id = subscribe_response.json()["session_id"]
        return token, session_id
    
    def test_payment_status_returns_session_info(self, admin_token_and_session):
        """Test that payment status endpoint returns correct session information."""
        token, session_id = admin_token_and_session
        
        response = requests.get(f"{BASE_URL}/api/payments/status/{session_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "status" in data, "Response should contain status"
        assert "payment_status" in data, "Response should contain payment_status"
        assert "plan_id" in data, "Response should contain plan_id"
        assert "plan_name" in data, "Response should contain plan_name"
        
        # Verify values (unpaid session)
        assert data["plan_id"] == "business"
        assert data["plan_name"] == "Business"
        assert data["payment_status"] in ["unpaid", "pending"]
        print(f"✓ Payment status retrieved: {data['status']}, payment_status: {data['payment_status']}")
    
    def test_payment_status_invalid_session_returns_404(self):
        """Test that non-existent session returns 404."""
        response = requests.get(f"{BASE_URL}/api/payments/status/cs_test_invalid_session_12345")
        assert response.status_code == 404
        data = response.json()
        assert data["detail"] == "Transaction not found"
        print("✓ Invalid session correctly returns 404")


class TestCurrentPlanEndpoint:
    """Tests for GET /api/payments/current-plan endpoint."""
    
    @pytest.fixture
    def admin_token(self):
        """Get fresh admin token for tests."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_current_plan_returns_subscription_info(self, admin_token):
        """Test that current plan endpoint returns admin's subscription."""
        response = requests.get(
            f"{BASE_URL}/api/payments/current-plan?admin_token={admin_token}"
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "plan_id" in data, "Response should contain plan_id"
        assert "plan_name" in data, "Response should contain plan_name"
        assert "clients_limit" in data, "Response should contain clients_limit"
        
        # Default plan should be starter
        assert data["plan_id"] == "starter"
        assert data["plan_name"] == "Starter"
        assert data["clients_limit"] == 50
        print(f"✓ Current plan retrieved: {data['plan_id']} ({data['plan_name']})")
    
    def test_current_plan_invalid_token_returns_401(self):
        """Test that invalid token returns 401 error."""
        response = requests.get(
            f"{BASE_URL}/api/payments/current-plan?admin_token=invalid_token_12345"
        )
        assert response.status_code == 401
        data = response.json()
        assert data["detail"] == "Invalid token"
        print("✓ Invalid token correctly returns 401")


class TestPaymentTransactionStorage:
    """Tests to verify payment transactions are stored in database."""
    
    @pytest.fixture
    def admin_token(self):
        """Get fresh admin token for tests."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json()["token"]
    
    def test_subscribe_creates_transaction_record(self, admin_token):
        """Test that subscribe endpoint creates a payment_transaction record in DB."""
        # Create checkout session
        response = requests.post(
            f"{BASE_URL}/api/payments/subscribe",
            json={
                "plan_id": "enterprise",
                "origin_url": BASE_URL,
                "admin_token": admin_token
            }
        )
        assert response.status_code == 200
        session_id = response.json()["session_id"]
        
        # Verify transaction was stored by checking status endpoint
        status_response = requests.get(f"{BASE_URL}/api/payments/status/{session_id}")
        assert status_response.status_code == 200
        data = status_response.json()
        
        # If status returns data, transaction was stored
        assert data["plan_id"] == "enterprise"
        assert data["plan_name"] == "Enterprise"
        print(f"✓ Transaction record created and stored for session: {session_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
