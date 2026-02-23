"""
Test Admin Settings Endpoints - Late Fee & Auto-Lock Configuration (Phase 3)
Tests for:
- GET /api/admin/settings
- PUT /api/admin/settings  
- POST /api/admin/settings/apply-to-all
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://fin-calc-debug.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for testing"""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": "karli1987", "password": "nasvakas123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


class TestAdminSettingsEndpoints:
    """Tests for admin settings CRUD operations"""
    
    def test_get_admin_settings(self, auth_token):
        """Test GET /api/admin/settings returns current settings"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
        )
        
        # Status assertion
        assert response.status_code == 200, f"Failed to get settings: {response.text}"
        
        # Data assertions - validate response structure
        data = response.json()
        assert "admin_id" in data, "Missing admin_id in response"
        assert "default_late_fee_percent" in data, "Missing default_late_fee_percent"
        assert "default_auto_lock_grace_days" in data, "Missing default_auto_lock_grace_days"
        assert "default_auto_lock_enabled" in data, "Missing default_auto_lock_enabled"
        
        # Type assertions
        assert isinstance(data["default_late_fee_percent"], (int, float)), "late_fee_percent should be numeric"
        assert isinstance(data["default_auto_lock_grace_days"], int), "grace_days should be int"
        assert isinstance(data["default_auto_lock_enabled"], bool), "auto_lock_enabled should be bool"
        
        print(f"Current settings: late_fee={data['default_late_fee_percent']}%, grace_days={data['default_auto_lock_grace_days']}, enabled={data['default_auto_lock_enabled']}")
    
    def test_update_admin_settings(self, auth_token):
        """Test PUT /api/admin/settings updates settings"""
        # Set test values
        test_late_fee = 4.5
        test_grace_days = 7
        test_enabled = True
        
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_late_fee_percent={test_late_fee}"
            f"&default_auto_lock_grace_days={test_grace_days}"
            f"&default_auto_lock_enabled={str(test_enabled).lower()}"
        )
        
        # Status assertion
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "settings" in data, "Missing settings in response"
        assert data["settings"]["default_late_fee_percent"] == test_late_fee, "Late fee percent not updated correctly"
        assert data["settings"]["default_auto_lock_grace_days"] == test_grace_days, "Grace days not updated correctly"
        assert data["settings"]["default_auto_lock_enabled"] == test_enabled, "Auto-lock enabled not updated correctly"
        
        print(f"Updated settings successfully: {data['settings']}")
    
    def test_get_settings_verify_update(self, auth_token):
        """Test GET /api/admin/settings after update persisted"""
        # First update settings to known values
        test_late_fee = 2.5
        test_grace_days = 4
        
        requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_late_fee_percent={test_late_fee}"
            f"&default_auto_lock_grace_days={test_grace_days}"
        )
        
        # Now GET to verify persistence
        response = requests.get(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["default_late_fee_percent"] == test_late_fee, "Settings not persisted correctly"
        assert data["default_auto_lock_grace_days"] == test_grace_days, "Settings not persisted correctly"
        
        print(f"Verified settings persistence: late_fee={data['default_late_fee_percent']}%, grace_days={data['default_auto_lock_grace_days']}")
    
    def test_apply_settings_to_all_clients(self, auth_token):
        """Test POST /api/admin/settings/apply-to-all applies settings to all clients"""
        response = requests.post(
            f"{BASE_URL}/api/admin/settings/apply-to-all?admin_token={auth_token}"
        )
        
        # Status assertion
        assert response.status_code == 200, f"Failed to apply settings: {response.text}"
        
        # Data assertions
        data = response.json()
        assert "message" in data, "Missing message in response"
        assert "clients_updated" in data, "Missing clients_updated count"
        assert "applied_settings" in data, "Missing applied_settings in response"
        assert isinstance(data["clients_updated"], int), "clients_updated should be integer"
        assert data["clients_updated"] >= 0, "clients_updated should be non-negative"
        
        # Verify applied_settings structure
        applied = data["applied_settings"]
        assert "auto_lock_grace_days" in applied, "Missing auto_lock_grace_days in applied_settings"
        assert "auto_lock_enabled" in applied, "Missing auto_lock_enabled in applied_settings"
        
        print(f"Applied settings to {data['clients_updated']} clients: {applied}")


class TestAdminSettingsValidation:
    """Tests for admin settings validation"""
    
    def test_late_fee_percent_validation_min(self, auth_token):
        """Test that late fee percent cannot be negative"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_late_fee_percent=-5"
        )
        
        # Should return validation error (422 is standard for validation errors)
        assert response.status_code in [400, 422], f"Expected 400/422 for negative late fee: {response.text}"
        print("Negative late fee percent correctly rejected")
    
    def test_late_fee_percent_validation_max(self, auth_token):
        """Test that late fee percent cannot exceed 100"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_late_fee_percent=150"
        )
        
        # Should return validation error (422 is standard for validation errors)
        assert response.status_code in [400, 422], f"Expected 400/422 for late fee > 100: {response.text}"
        print("Late fee percent > 100 correctly rejected")
    
    def test_grace_days_validation_min(self, auth_token):
        """Test that grace days cannot be less than 1"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_auto_lock_grace_days=0"
        )
        
        # Should return validation error (422 is standard for validation errors)
        assert response.status_code in [400, 422], f"Expected 400/422 for grace days < 1: {response.text}"
        print("Grace days < 1 correctly rejected")
    
    def test_grace_days_validation_max(self, auth_token):
        """Test that grace days cannot exceed 365"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?admin_token={auth_token}"
            f"&default_auto_lock_grace_days=500"
        )
        
        # Should return validation error (422 is standard for validation errors)
        assert response.status_code in [400, 422], f"Expected 400/422 for grace days > 365: {response.text}"
        print("Grace days > 365 correctly rejected")


class TestAdminSettingsAuth:
    """Tests for admin settings authentication"""
    
    def test_get_settings_without_token(self):
        """Test GET /api/admin/settings requires authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/settings")
        
        # Should return auth error
        assert response.status_code in [401, 422], f"Expected 401/422 without token: {response.text}"
        print("GET settings correctly requires authentication")
    
    def test_update_settings_without_token(self):
        """Test PUT /api/admin/settings requires authentication"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings?default_late_fee_percent=5"
        )
        
        # Should return auth error  
        assert response.status_code in [401, 422], f"Expected 401/422 without token: {response.text}"
        print("PUT settings correctly requires authentication")
    
    def test_apply_settings_without_token(self):
        """Test POST /api/admin/settings/apply-to-all requires authentication"""
        response = requests.post(f"{BASE_URL}/api/admin/settings/apply-to-all")
        
        # Should return auth error
        assert response.status_code in [401, 422], f"Expected 401/422 without token: {response.text}"
        print("POST apply-to-all correctly requires authentication")
    
    def test_invalid_token(self):
        """Test that invalid token is rejected"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settings?admin_token=invalid_token_12345"
        )
        
        # Should return auth error
        assert response.status_code in [401, 403], f"Expected 401/403 for invalid token: {response.text}"
        print("Invalid token correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
