"""
Test Plan Gating - Iteration 77
Tests subscription plan-based feature gating for PayLock Pro.
Focus: Starter user restrictions vs Superadmin/custom plan access.

Features tested:
1. /api/admin/feature-access endpoint returns correct features per plan
2. Starter user gets 403 on heartbeat API
3. Starter user gets 403 on dashboard_analytics API
4. Superadmin/custom plan user can access all APIs
"""

import pytest
import requests
import os

# Use the public API URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://subscription-tier-1.preview.emergentagent.com').rstrip('/')

# Test credentials provided
SUPERADMIN_TOKEN = "8ec5e0c6e05c8dcfc2f3ea5c924fe0a118f7807412937334425e095a5ae08720"
STARTER_TOKEN = "16c94e3ccd4d46ee7860448e364a38630f4bb5b6638bcb9f9d6b6fe9267b8afa"


class TestFeatureAccessEndpoint:
    """Test /api/admin/feature-access endpoint returns correct feature access based on plan"""
    
    def test_superadmin_feature_access(self):
        """Superadmin (custom plan) should have access to ALL features"""
        response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": SUPERADMIN_TOKEN}
        )
        
        # Should return 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plan" in data, "Response should contain 'plan' field"
        assert "features" in data, "Response should contain 'features' dict"
        
        # Superadmin should have custom plan
        print(f"Superadmin plan: {data['plan']}")
        assert data['plan'] == 'custom', f"Expected 'custom' plan, got {data['plan']}"
        
        # Superadmin should have ALL features enabled
        features = data['features']
        
        # Check professional tier features
        assert features.get('heartbeat') == True, "Superadmin should have heartbeat access"
        assert features.get('dashboard_analytics') == True, "Superadmin should have dashboard_analytics access"
        assert features.get('interest_summary') == True, "Superadmin should have interest_summary access"
        assert features.get('device_lock') == True, "Superadmin should have device_lock access"
        assert features.get('reports') == True, "Superadmin should have reports access"
        
        # Check enterprise tier features
        assert features.get('credit_scoring') == True, "Superadmin should have credit_scoring access"
        assert features.get('audit_log') == True, "Superadmin should have audit_log access"
        assert features.get('api_access') == True, "Superadmin should have api_access access"
        
        print(f"Superadmin has access to {sum(1 for v in features.values() if v)} features")
    
    def test_starter_user_feature_access(self):
        """Starter user should have limited features"""
        response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": STARTER_TOKEN}
        )
        
        # Should return 200
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plan" in data, "Response should contain 'plan' field"
        assert "features" in data, "Response should contain 'features' dict"
        
        # Starter user should have starter plan
        print(f"Starter user plan: {data['plan']}")
        assert data['plan'] == 'starter', f"Expected 'starter' plan, got {data['plan']}"
        
        features = data['features']
        
        # Starter tier features should be enabled
        assert features.get('clients') == True, "Starter should have clients access"
        assert features.get('loans') == True, "Starter should have loans access"
        assert features.get('payments') == True, "Starter should have payments access"
        assert features.get('notifications') == True, "Starter should have notifications access"
        
        # Professional tier features should be DISABLED for starter
        assert features.get('heartbeat') == False, "Starter should NOT have heartbeat access"
        assert features.get('dashboard_analytics') == False, "Starter should NOT have dashboard_analytics access"
        assert features.get('interest_summary') == False, "Starter should NOT have interest_summary access"
        assert features.get('device_lock') == False, "Starter should NOT have device_lock access"
        assert features.get('reports') == False, "Starter should NOT have reports access"
        
        # Enterprise tier features should be DISABLED for starter
        assert features.get('credit_scoring') == False, "Starter should NOT have credit_scoring access"
        assert features.get('audit_log') == False, "Starter should NOT have audit_log access"
        
        enabled_count = sum(1 for v in features.values() if v)
        disabled_count = sum(1 for v in features.values() if not v)
        print(f"Starter user: {enabled_count} features enabled, {disabled_count} features disabled")


class TestHeartbeatAPIGating:
    """Test heartbeat API is restricted to Professional+ plans"""
    
    def test_starter_user_blocked_from_heartbeat(self):
        """Starter user should get 403 Forbidden on heartbeat API"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": STARTER_TOKEN}
        )
        
        # Starter user should be blocked (403)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check error message mentions plan requirement (error field used by this API)
        error_msg = data.get('error', '') or data.get('detail', '') or data.get('message', '')
        print(f"Heartbeat blocking message: {error_msg}")
        assert 'professional' in error_msg.lower() or 'plan' in error_msg.lower(), \
            f"Error should mention plan requirement, got: {error_msg}"
    
    def test_superadmin_can_access_heartbeat(self):
        """Superadmin (custom plan) should have full access to heartbeat API"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": SUPERADMIN_TOKEN}
        )
        
        # Superadmin should have access (200)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'total_registered' in data, "Response should contain total_registered"
        assert 'online_count' in data, "Response should contain online_count"
        assert 'warning_count' in data, "Response should contain warning_count"
        assert 'critical_count' in data, "Response should contain critical_count"
        
        print(f"Heartbeat data: {data['total_registered']} registered, {data['online_count']} online")


class TestDashboardAnalyticsAPIGating:
    """Test dashboard analytics API is restricted to Professional+ plans"""
    
    def test_starter_user_blocked_from_dashboard_analytics(self):
        """Starter user should get 403 Forbidden on dashboard analytics API"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": STARTER_TOKEN}
        )
        
        # Starter user should be blocked (403)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Check error message mentions plan requirement (error field used by this API)
        error_msg = data.get('error', '') or data.get('detail', '') or data.get('message', '')
        print(f"Dashboard analytics blocking message: {error_msg}")
        assert 'professional' in error_msg.lower() or 'plan' in error_msg.lower(), \
            f"Error should mention plan requirement, got: {error_msg}"
    
    def test_superadmin_can_access_dashboard_analytics(self):
        """Superadmin (custom plan) should have full access to dashboard analytics API"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": SUPERADMIN_TOKEN}
        )
        
        # Superadmin should have access (200)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'overview' in data, "Response should contain overview"
        assert 'financial' in data, "Response should contain financial"
        assert 'monthly_revenue' in data, "Response should contain monthly_revenue"
        
        print(f"Dashboard analytics: {data['overview']['total_clients']} total clients")


class TestPlanHierarchyVerification:
    """Verify plan hierarchy is correctly enforced"""
    
    def test_feature_access_consistency(self):
        """Verify feature access is consistent with plan hierarchy"""
        # Get starter features
        starter_response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": STARTER_TOKEN}
        )
        assert starter_response.status_code == 200
        starter_features = starter_response.json()['features']
        
        # Get superadmin features
        super_response = requests.get(
            f"{BASE_URL}/api/admin/feature-access",
            params={"admin_token": SUPERADMIN_TOKEN}
        )
        assert super_response.status_code == 200
        super_features = super_response.json()['features']
        
        # Superadmin should have at least as many features as starter
        starter_enabled = sum(1 for v in starter_features.values() if v)
        super_enabled = sum(1 for v in super_features.values() if v)
        
        assert super_enabled >= starter_enabled, \
            f"Superadmin should have more features ({super_enabled}) than starter ({starter_enabled})"
        
        # Any feature enabled for starter should be enabled for superadmin
        for feature, enabled in starter_features.items():
            if enabled:
                assert super_features.get(feature) == True, \
                    f"Feature '{feature}' enabled for starter should also be enabled for superadmin"
        
        print(f"Plan hierarchy verified: Starter={starter_enabled} features, Superadmin={super_enabled} features")


class TestTokenValidityForGating:
    """Test that tokens are valid and properly return user info"""
    
    def test_superadmin_token_returns_custom_plan(self):
        """Verify superadmin token returns user with custom plan"""
        response = requests.get(
            f"{BASE_URL}/api/admin/verify/{SUPERADMIN_TOKEN}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get('valid') == True, "Token should be valid"
        assert data.get('is_super_admin') == True, "User should be super admin"
        assert data.get('plan') == 'custom', f"Plan should be 'custom', got {data.get('plan')}"
        
        print(f"Superadmin token verified: user={data.get('username')}, plan={data.get('plan')}")
    
    def test_starter_token_returns_starter_plan(self):
        """Verify starter token returns user with starter plan"""
        response = requests.get(
            f"{BASE_URL}/api/admin/verify/{STARTER_TOKEN}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get('valid') == True, "Token should be valid"
        assert data.get('plan') == 'starter', f"Plan should be 'starter', got {data.get('plan')}"
        
        print(f"Starter token verified: user={data.get('username')}, plan={data.get('plan')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
