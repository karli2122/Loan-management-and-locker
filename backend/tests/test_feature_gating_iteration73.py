"""
Test Feature Gating Implementation - Iteration 73
Tests subscription-based feature gating for PayLock Pro

Plan hierarchy: starter(0) < business(1) < enterprise(2) < custom(3)

Business features: collection_trends, bulk_import, loan_restructure, document_vault, device_lock, reminders, daily_digest
Enterprise features: role_permissions, session_management, revenue_forecast, audit_log, bank_ocr, portfolio_health, risk_score_tracking, comparative_analytics
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://paylock-fixes.preview.emergentagent.com")

# Test credentials
TEST_USERS = {
    "super_admin": {"username": "karli1987", "password": "Testpass1!"},
    "starter": {"username": "madis123", "password": "Testpass1!"},
    "business": {"username": "lembi123", "password": "Testpass1!"},  # Updated to business plan
}


class TestSetup:
    """Test environment setup and login"""
    
    @pytest.fixture(scope="class")
    def session(self):
        return requests.Session()
    
    def test_api_health(self, session):
        """Verify API is accessible"""
        response = session.get(f"{BASE_URL}/api/")
        assert response.status_code == 200, f"API not accessible: {response.status_code}"
        print(f"API health check: {response.json()}")
    
    def test_login_super_admin(self, session):
        """Login as super admin (karli1987 - custom plan)"""
        response = session.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["super_admin"])
        assert response.status_code == 200, f"Super admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert data.get("plan") == "custom" or data.get("is_super_admin") == True, f"Expected custom plan or super_admin, got: {data}"
        print(f"Super admin login successful: plan={data.get('plan')}, is_super_admin={data.get('is_super_admin')}")
        return data["token"]
    
    def test_login_starter_user(self, session):
        """Login as starter plan user (madis123)"""
        response = session.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["starter"])
        assert response.status_code == 200, f"Starter user login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        print(f"Starter user login successful: plan={data.get('plan')}")
        return data["token"]


class TestFeatureAccessEndpoint:
    """Test GET /api/admin/feature-access endpoint for different plans"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["super_admin"])
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def starter_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["starter"])
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_feature_access_super_admin(self, super_admin_token):
        """Super admin (custom plan) should have access to ALL features"""
        response = requests.get(f"{BASE_URL}/api/admin/feature-access", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Feature access failed: {response.text}"
        data = response.json()
        
        assert "plan" in data, "Missing 'plan' in response"
        assert "features" in data, "Missing 'features' in response"
        assert data["plan"] == "custom", f"Expected plan=custom, got: {data['plan']}"
        
        features = data["features"]
        # All features should be accessible for custom plan
        for feature, accessible in features.items():
            assert accessible == True, f"Super admin should have access to {feature}"
        print(f"Super admin feature access verified: {len(features)} features, all accessible")
    
    def test_feature_access_starter_plan(self, starter_token):
        """Starter plan user should have limited feature access"""
        response = requests.get(f"{BASE_URL}/api/admin/feature-access", params={"admin_token": starter_token})
        assert response.status_code == 200, f"Feature access failed: {response.text}"
        data = response.json()
        
        assert "plan" in data, "Missing 'plan' in response"
        assert "features" in data, "Missing 'features' in response"
        assert data["plan"] == "starter", f"Expected plan=starter, got: {data['plan']}"
        
        features = data["features"]
        
        # Starter features should be accessible
        starter_features = ["clients", "loans", "payments", "messaging", "reports", "notifications", "contracts", "loan_plans", "calculator"]
        for feature in starter_features:
            if feature in features:
                assert features[feature] == True, f"Starter should have access to {feature}"
        
        # Business features should NOT be accessible
        business_features = ["collection_trends", "bulk_import", "loan_restructure", "document_vault", "device_lock", "reminders", "daily_digest"]
        for feature in business_features:
            if feature in features:
                assert features[feature] == False, f"Starter should NOT have access to business feature: {feature}"
        
        # Enterprise features should NOT be accessible
        enterprise_features = ["role_permissions", "session_management", "revenue_forecast", "audit_log", "bank_ocr", "portfolio_health", "risk_score_tracking", "comparative_analytics"]
        for feature in enterprise_features:
            if feature in features:
                assert features[feature] == False, f"Starter should NOT have access to enterprise feature: {feature}"
        
        print(f"Starter plan feature access verified: plan={data['plan']}")


class TestStarterPlanGating:
    """Test that starter plan users get 403 on business and enterprise tier endpoints"""
    
    @pytest.fixture(scope="class")
    def starter_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["starter"])
        assert response.status_code == 200
        return response.json()["token"]
    
    # === BUSINESS TIER ENDPOINTS (starter should get 403) ===
    
    def test_starter_blocked_collection_trends(self, starter_token):
        """Starter plan should be blocked from /api/analytics/collection-trends (Business tier)"""
        response = requests.get(f"{BASE_URL}/api/analytics/collection-trends", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "business" in data.get("detail", "").lower() or "business" in str(data).lower(), f"Error should mention Business plan: {data}"
        print(f"Starter correctly blocked from collection-trends: {data}")
    
    def test_starter_blocked_bulk_import_csv(self, starter_token):
        """Starter plan should be blocked from /api/import/clients/csv (Business tier)"""
        # Create a dummy CSV file
        csv_content = "name,phone\nTest,+1234567890"
        files = {"file": ("test.csv", csv_content, "text/csv")}
        response = requests.post(
            f"{BASE_URL}/api/import/clients/csv",
            data={"admin_token": starter_token},
            files=files
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "business" in data.get("detail", "").lower() or "business" in str(data).lower(), f"Error should mention Business plan: {data}"
        print(f"Starter correctly blocked from bulk import: {data}")
    
    def test_starter_blocked_loan_restructure(self, starter_token):
        """Starter plan should be blocked from loan restructuring (Business tier)"""
        # Use a dummy client_id - we should get 403 before even checking if client exists
        response = requests.post(
            f"{BASE_URL}/api/loans/dummy-client-id/restructure",
            params={"admin_token": starter_token},
            json={"new_emi": 100, "reason": "Test"}
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "business" in data.get("detail", "").lower() or "business" in str(data).lower(), f"Error should mention Business plan: {data}"
        print(f"Starter correctly blocked from loan restructure: {data}")
    
    def test_starter_blocked_restructure_history(self, starter_token):
        """Starter plan should be blocked from restructure history (Business tier)"""
        response = requests.get(
            f"{BASE_URL}/api/loans/dummy-client-id/restructure-history",
            params={"admin_token": starter_token}
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "business" in data.get("detail", "").lower() or "business" in str(data).lower(), f"Error should mention Business plan: {data}"
        print(f"Starter correctly blocked from restructure history: {data}")
    
    def test_starter_blocked_document_vault_list(self, starter_token):
        """Starter plan should be blocked from document vault (Business tier)"""
        response = requests.get(
            f"{BASE_URL}/api/documents/vault/dummy-client-id",
            params={"admin_token": starter_token}
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "business" in data.get("detail", "").lower() or "business" in str(data).lower(), f"Error should mention Business plan: {data}"
        print(f"Starter correctly blocked from document vault: {data}")
    
    # === ENTERPRISE TIER ENDPOINTS (starter should get 403) ===
    
    def test_starter_blocked_audit_logs(self, starter_token):
        """Starter plan should be blocked from /api/audit-logs (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from audit logs: {data}")
    
    def test_starter_blocked_revenue_forecast(self, starter_token):
        """Starter plan should be blocked from /api/forecasting/revenue (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/forecasting/revenue", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from revenue forecast: {data}")
    
    def test_starter_blocked_sessions(self, starter_token):
        """Starter plan should be blocked from /api/sessions (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/sessions", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from sessions: {data}")
    
    def test_starter_blocked_add_team_member(self, starter_token):
        """Starter plan should be blocked from /api/team/members POST (Enterprise tier)"""
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": starter_token},
            json={"username": "testuser", "password": "test123", "role": "viewer"}
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        # role_permissions feature - should mention enterprise
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower() or "role_permissions" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from team members: {data}")
    
    def test_starter_blocked_portfolio_health(self, starter_token):
        """Starter plan should be blocked from /api/analytics/portfolio-health (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/analytics/portfolio-health", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from portfolio health: {data}")
    
    def test_starter_blocked_comparative_analytics(self, starter_token):
        """Starter plan should be blocked from /api/analytics/comparative (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/analytics/comparative", params={"admin_token": starter_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "enterprise" in data.get("detail", "").lower() or "enterprise" in str(data).lower(), f"Error should mention Enterprise plan: {data}"
        print(f"Starter correctly blocked from comparative analytics: {data}")


class TestSuperAdminAccess:
    """Test that super admin (custom plan) can access ALL endpoints"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["super_admin"])
        assert response.status_code == 200
        return response.json()["token"]
    
    # === BUSINESS TIER ENDPOINTS ===
    
    def test_super_admin_access_collection_trends(self, super_admin_token):
        """Super admin should access /api/analytics/collection-trends"""
        response = requests.get(f"{BASE_URL}/api/analytics/collection-trends", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "period" in data or "data" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed collection-trends successfully")
    
    def test_super_admin_access_portfolio_health(self, super_admin_token):
        """Super admin should access /api/analytics/portfolio-health"""
        response = requests.get(f"{BASE_URL}/api/analytics/portfolio-health", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "total_loans" in data or "aging_analysis" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed portfolio-health successfully")
    
    def test_super_admin_access_comparative_analytics(self, super_admin_token):
        """Super admin should access /api/analytics/comparative"""
        response = requests.get(f"{BASE_URL}/api/analytics/comparative", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "team_members" in data or "total_members" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed comparative analytics successfully")
    
    # === ENTERPRISE TIER ENDPOINTS ===
    
    def test_super_admin_access_audit_logs(self, super_admin_token):
        """Super admin should access /api/audit-logs"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "logs" in data or "total_count" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed audit logs successfully")
    
    def test_super_admin_access_revenue_forecast(self, super_admin_token):
        """Super admin should access /api/forecasting/revenue"""
        response = requests.get(f"{BASE_URL}/api/forecasting/revenue", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "forecast_days" in data or "weekly_forecast" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed revenue forecast successfully")
    
    def test_super_admin_access_sessions(self, super_admin_token):
        """Super admin should access /api/sessions"""
        response = requests.get(f"{BASE_URL}/api/sessions", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "sessions" in data or "total" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed sessions successfully")
    
    def test_super_admin_access_team_members_list(self, super_admin_token):
        """Super admin should access /api/team/members GET"""
        response = requests.get(f"{BASE_URL}/api/team/members", params={"admin_token": super_admin_token})
        assert response.status_code == 200, f"Expected 200, got: {response.status_code} - {response.text}"
        data = response.json()
        assert "members" in data or "total" in data, f"Unexpected response: {data}"
        print(f"Super admin accessed team members list successfully")


class TestErrorMessageContent:
    """Test that error messages include correct plan names"""
    
    @pytest.fixture(scope="class")
    def starter_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["starter"])
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_error_mentions_business_plan(self, starter_token):
        """Error for business features should mention 'Business' plan"""
        response = requests.get(f"{BASE_URL}/api/analytics/collection-trends", params={"admin_token": starter_token})
        assert response.status_code == 403
        data = response.json()
        # Error message can be in 'error' or 'detail' field depending on exception handler
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "business" in error_msg, f"Error should mention Business plan: {data}"
        print(f"Business plan error message verified: {data.get('error') or data.get('detail')}")
    
    def test_error_mentions_enterprise_plan(self, starter_token):
        """Error for enterprise features should mention 'Enterprise' plan"""
        response = requests.get(f"{BASE_URL}/api/forecasting/revenue", params={"admin_token": starter_token})
        assert response.status_code == 403
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Enterprise plan error message verified: {data.get('error') or data.get('detail')}")
    
    def test_error_includes_current_plan(self, starter_token):
        """Error should mention current plan"""
        response = requests.get(f"{BASE_URL}/api/forecasting/revenue", params={"admin_token": starter_token})
        assert response.status_code == 403
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        # Should mention current plan: starter
        assert "starter" in error_msg, f"Error should mention current plan (starter): {data}"
        print(f"Current plan mentioned in error: {data.get('error') or data.get('detail')}")


class TestPlanHierarchy:
    """Test the plan hierarchy logic: starter(0) < business(1) < enterprise(2) < custom(3)"""
    
    @pytest.fixture(scope="class")
    def super_admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["super_admin"])
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def starter_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["starter"])
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_starter_has_basic_features(self, starter_token):
        """Verify starter plan has access to basic features"""
        response = requests.get(f"{BASE_URL}/api/admin/feature-access", params={"admin_token": starter_token})
        assert response.status_code == 200
        data = response.json()
        features = data.get("features", {})
        
        # Starter features should be True
        assert features.get("clients") == True, "Starter should have clients access"
        assert features.get("loans") == True, "Starter should have loans access"
        assert features.get("payments") == True, "Starter should have payments access"
        print("Starter has basic features verified")
    
    def test_custom_plan_has_all_features(self, super_admin_token):
        """Verify custom plan (super admin) has access to ALL features"""
        response = requests.get(f"{BASE_URL}/api/admin/feature-access", params={"admin_token": super_admin_token})
        assert response.status_code == 200
        data = response.json()
        features = data.get("features", {})
        
        # ALL features should be True for custom plan
        for feature, accessible in features.items():
            assert accessible == True, f"Custom plan should have access to {feature}"
        print(f"Custom plan has all {len(features)} features verified")


class TestBusinessPlanGating:
    """Test that business plan users CAN access business-tier but NOT enterprise-tier endpoints"""
    
    @pytest.fixture(scope="class")
    def business_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["business"])
        assert response.status_code == 200
        data = response.json()
        assert data.get("plan") == "business", f"Expected business plan, got: {data.get('plan')}"
        print(f"Business user logged in: plan={data.get('plan')}")
        return data["token"]
    
    def test_business_login_returns_correct_plan(self):
        """Verify business user login returns correct plan"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json=TEST_USERS["business"])
        assert response.status_code == 200
        data = response.json()
        assert data.get("plan") == "business", f"Expected business plan, got: {data}"
        print(f"Business user login verified: plan={data.get('plan')}")
    
    def test_business_feature_access_shows_correct_permissions(self, business_token):
        """Verify business user has correct feature permissions"""
        response = requests.get(f"{BASE_URL}/api/admin/feature-access", params={"admin_token": business_token})
        assert response.status_code == 200
        data = response.json()
        
        assert data["plan"] == "business", f"Expected plan=business, got: {data['plan']}"
        features = data["features"]
        
        # Business features should be accessible
        business_features = ["collection_trends", "bulk_import", "loan_restructure", "document_vault"]
        for feature in business_features:
            if feature in features:
                assert features[feature] == True, f"Business should have access to {feature}"
        
        # Enterprise features should NOT be accessible
        enterprise_features = ["role_permissions", "session_management", "revenue_forecast", "audit_log"]
        for feature in enterprise_features:
            if feature in features:
                assert features[feature] == False, f"Business should NOT have access to {feature}"
        
        print("Business plan feature access verified")
    
    # === BUSINESS TIER ENDPOINTS (business plan should have access) ===
    
    def test_business_can_access_collection_trends(self, business_token):
        """Business plan should access /api/analytics/collection-trends"""
        response = requests.get(f"{BASE_URL}/api/analytics/collection-trends", params={"admin_token": business_token})
        assert response.status_code == 200, f"Business should access collection-trends: {response.status_code} - {response.text}"
        print("Business accessed collection-trends successfully")
    
    def test_business_can_access_restructure_history(self, business_token):
        """Business plan should access loan restructure history (with dummy client)"""
        # This will fail with 400/404 if client not found, but NOT 403
        response = requests.get(
            f"{BASE_URL}/api/loans/dummy-client-id/restructure-history",
            params={"admin_token": business_token}
        )
        # Should NOT be 403 - plan check passes, then fails on client validation
        assert response.status_code != 403, f"Business should pass plan check for restructure history: {response.status_code}"
        print(f"Business passed plan check for restructure history (got {response.status_code} as expected)")
    
    def test_business_can_access_document_vault(self, business_token):
        """Business plan should access document vault (with dummy client)"""
        response = requests.get(
            f"{BASE_URL}/api/documents/vault/dummy-client-id",
            params={"admin_token": business_token}
        )
        # Should NOT be 403 - plan check passes
        assert response.status_code != 403, f"Business should pass plan check for document vault: {response.status_code}"
        print(f"Business passed plan check for document vault (got {response.status_code} as expected)")
    
    # === ENTERPRISE TIER ENDPOINTS (business plan should get 403) ===
    
    def test_business_blocked_from_audit_logs(self, business_token):
        """Business plan should be blocked from /api/audit-logs (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", params={"admin_token": business_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Business correctly blocked from audit logs: {data.get('error') or data.get('detail')}")
    
    def test_business_blocked_from_revenue_forecast(self, business_token):
        """Business plan should be blocked from /api/forecasting/revenue (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/forecasting/revenue", params={"admin_token": business_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Business correctly blocked from revenue forecast: {data.get('error') or data.get('detail')}")
    
    def test_business_blocked_from_sessions(self, business_token):
        """Business plan should be blocked from /api/sessions (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/sessions", params={"admin_token": business_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Business correctly blocked from sessions: {data.get('error') or data.get('detail')}")
    
    def test_business_blocked_from_team_member_add(self, business_token):
        """Business plan should be blocked from adding team members (Enterprise tier)"""
        response = requests.post(
            f"{BASE_URL}/api/team/members",
            params={"admin_token": business_token},
            json={"username": "testuser", "password": "test123", "role": "viewer"}
        )
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg or "role_permissions" in error_msg.lower(), f"Error should mention Enterprise: {data}"
        print(f"Business correctly blocked from team members: {data.get('error') or data.get('detail')}")
    
    def test_business_blocked_from_portfolio_health(self, business_token):
        """Business plan should be blocked from /api/analytics/portfolio-health (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/analytics/portfolio-health", params={"admin_token": business_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Business correctly blocked from portfolio health: {data.get('error') or data.get('detail')}")
    
    def test_business_blocked_from_comparative_analytics(self, business_token):
        """Business plan should be blocked from /api/analytics/comparative (Enterprise tier)"""
        response = requests.get(f"{BASE_URL}/api/analytics/comparative", params={"admin_token": business_token})
        assert response.status_code == 403, f"Expected 403, got: {response.status_code} - {response.text}"
        data = response.json()
        error_msg = (data.get("error", "") or data.get("detail", "")).lower()
        assert "enterprise" in error_msg, f"Error should mention Enterprise plan: {data}"
        print(f"Business correctly blocked from comparative analytics: {data.get('error') or data.get('detail')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
