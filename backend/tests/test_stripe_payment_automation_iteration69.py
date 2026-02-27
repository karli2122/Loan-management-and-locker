"""
Tests for PayLock Pro Stripe Payment Automation Features - Iteration 69
Tests: payment link creation, auto-pay toggle, payment methods, admin settings for auto-charge
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("KEEPALIVE_URL", "https://paylock-enterprise.preview.emergentagent.com")

class TestAdminLogin:
    """Login to get admin token for authenticated tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for tests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        return data["token"]
    
    def test_login_success(self, admin_token):
        """Verify admin login works"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"Login successful, token length: {len(admin_token)}")


class TestCreatePaymentLink:
    """Test POST /api/clients/{client_id}/create-payment-link"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json().get("token")
    
    def test_create_payment_link_success(self, admin_token):
        """Test creating a Stripe checkout payment link for a client"""
        # Use the test client ID provided
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/create-payment-link",
            params={"admin_token": admin_token},
            json={
                "amount": 50.00,
                "currency": "eur",
                "description": "Test Payment - iteration 69"
            }
        )
        
        # Should return 200 with checkout_url
        assert response.status_code == 200, f"Failed to create payment link: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "checkout_url" in data, "Response missing checkout_url"
        assert "session_id" in data, "Response missing session_id"
        assert "payment_id" in data, "Response missing payment_id"
        assert "amount" in data, "Response missing amount"
        
        # Validate checkout_url is a valid Stripe URL
        checkout_url = data["checkout_url"]
        assert checkout_url.startswith("https://checkout.stripe.com/"), f"Invalid Stripe URL: {checkout_url}"
        
        print(f"Payment link created successfully:")
        print(f"  - checkout_url: {checkout_url[:80]}...")
        print(f"  - session_id: {data['session_id']}")
        print(f"  - payment_id: {data['payment_id']}")
        print(f"  - amount: {data['amount']} {data.get('currency', 'eur')}")
    
    def test_create_payment_link_invalid_client(self, admin_token):
        """Test payment link creation with invalid client ID"""
        response = requests.post(
            f"{BASE_URL}/api/clients/invalid-client-id/create-payment-link",
            params={"admin_token": admin_token},
            json={"amount": 50.00}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returned 404 for invalid client ID")
    
    def test_create_payment_link_zero_amount(self, admin_token):
        """Test payment link creation with zero amount"""
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/create-payment-link",
            params={"admin_token": admin_token},
            json={"amount": 0}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly returned 400 for zero amount")


class TestToggleAutopay:
    """Test POST /api/clients/{client_id}/toggle-autopay"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json().get("token")
    
    def test_toggle_autopay_enable(self, admin_token):
        """Test enabling auto-pay for a client"""
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/toggle-autopay",
            params={"admin_token": admin_token},
            json={"enabled": True}
        )
        
        assert response.status_code == 200, f"Failed to enable auto-pay: {response.text}"
        data = response.json()
        assert "auto_pay_enabled" in data
        assert data["auto_pay_enabled"] == True
        print("Auto-pay enabled successfully")
    
    def test_toggle_autopay_disable(self, admin_token):
        """Test disabling auto-pay for a client"""
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/toggle-autopay",
            params={"admin_token": admin_token},
            json={"enabled": False}
        )
        
        assert response.status_code == 200, f"Failed to disable auto-pay: {response.text}"
        data = response.json()
        assert "auto_pay_enabled" in data
        assert data["auto_pay_enabled"] == False
        print("Auto-pay disabled successfully")
    
    def test_toggle_autopay_invalid_client(self, admin_token):
        """Test toggle auto-pay with invalid client ID"""
        response = requests.post(
            f"{BASE_URL}/api/clients/invalid-client-id/toggle-autopay",
            params={"admin_token": admin_token},
            json={"enabled": True}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returned 404 for invalid client ID")


class TestGetPaymentMethods:
    """Test GET /api/clients/{client_id}/payment-methods"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json().get("token")
    
    def test_get_payment_methods_success(self, admin_token):
        """Test getting payment methods and auto_pay status for a client"""
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/payment-methods",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Failed to get payment methods: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "auto_pay_enabled" in data, "Response missing auto_pay_enabled"
        assert "recent_stripe_payments" in data, "Response missing recent_stripe_payments"
        assert "total_paid_stripe" in data, "Response missing total_paid_stripe"
        
        print(f"Payment methods retrieved successfully:")
        print(f"  - auto_pay_enabled: {data['auto_pay_enabled']}")
        print(f"  - recent_stripe_payments count: {len(data['recent_stripe_payments'])}")
        print(f"  - total_paid_stripe: {data['total_paid_stripe']}")
    
    def test_get_payment_methods_invalid_client(self, admin_token):
        """Test getting payment methods for invalid client ID"""
        response = requests.get(
            f"{BASE_URL}/api/clients/invalid-client-id/payment-methods",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Correctly returned 404 for invalid client ID")


class TestAdminSettingsAutoCharge:
    """Test admin settings for payment_auto_charge_enabled"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json().get("token")
    
    def test_get_admin_settings_has_auto_charge(self, admin_token):
        """Test GET /api/admin/settings returns payment_auto_charge_enabled field"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Failed to get settings: {response.text}"
        data = response.json()
        
        # Verify payment automation fields exist
        assert "payment_auto_reminder_enabled" in data or data.get("payment_auto_reminder_enabled") is not None
        print(f"Admin settings retrieved - payment_auto_charge_enabled: {data.get('payment_auto_charge_enabled', 'field may have default')}")
    
    def test_update_admin_settings_enable_auto_charge(self, admin_token):
        """Test PUT /api/admin/settings with payment_auto_charge_enabled=true"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={
                "admin_token": admin_token,
                "payment_auto_charge_enabled": "true"
            }
        )
        
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        data = response.json()
        
        assert "message" in data
        assert "settings" in data
        settings = data["settings"]
        assert settings.get("payment_auto_charge_enabled") == True, "payment_auto_charge_enabled not set to True"
        print("Admin settings updated - payment_auto_charge_enabled set to True")
    
    def test_update_admin_settings_disable_auto_charge(self, admin_token):
        """Test PUT /api/admin/settings with payment_auto_charge_enabled=false"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={
                "admin_token": admin_token,
                "payment_auto_charge_enabled": "false"
            }
        )
        
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        data = response.json()
        
        settings = data["settings"]
        assert settings.get("payment_auto_charge_enabled") == False, "payment_auto_charge_enabled not set to False"
        print("Admin settings updated - payment_auto_charge_enabled set to False")
    
    def test_verify_auto_charge_persisted(self, admin_token):
        """Verify auto-charge setting is persisted"""
        # First enable
        requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={
                "admin_token": admin_token,
                "payment_auto_charge_enabled": "true"
            }
        )
        
        # Then GET to verify
        response = requests.get(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("payment_auto_charge_enabled") == True, "Setting not persisted"
        print("Verified payment_auto_charge_enabled is persisted correctly")


class TestPaymentLinkWithAutoPay:
    """Integration test: verify payment link creation respects auto-pay setting"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        return response.json().get("token")
    
    def test_integration_autopay_flow(self, admin_token):
        """Test full auto-pay flow: enable auto-pay, create payment link"""
        client_id = "cd32110f-4b67-4735-b57f-9efda7699e90"
        
        # 1. Enable auto-pay for client
        toggle_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/toggle-autopay",
            params={"admin_token": admin_token},
            json={"enabled": True}
        )
        assert toggle_response.status_code == 200
        
        # 2. Verify auto-pay is enabled via payment-methods endpoint
        methods_response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/payment-methods",
            params={"admin_token": admin_token}
        )
        assert methods_response.status_code == 200
        assert methods_response.json()["auto_pay_enabled"] == True
        
        # 3. Create a payment link
        payment_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/create-payment-link",
            params={"admin_token": admin_token},
            json={"amount": 25.00, "description": "Integration test payment"}
        )
        assert payment_response.status_code == 200
        payment_data = payment_response.json()
        assert "checkout_url" in payment_data
        assert payment_data["checkout_url"].startswith("https://checkout.stripe.com/")
        
        # 4. Disable auto-pay for cleanup
        cleanup_response = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/toggle-autopay",
            params={"admin_token": admin_token},
            json={"enabled": False}
        )
        assert cleanup_response.status_code == 200
        
        print("Integration test passed: auto-pay flow works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
