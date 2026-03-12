"""
Test Enterprise Gate Backend Endpoints - Iteration 68
Tests the specific endpoints used by the EnterpriseGate feature for plan access:
- GET /api/payments/current-plan - returns plan_id for authenticated admin
- GET /api/admin/credits - returns is_super_admin status
- Portal login with admin/admin123
- GET /api/download/website - returns ZIP
- GET /api/website - returns marketing website HTML
- GET /api/portal - returns portal login page
- GET /api/health - returns 200
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://loan-admin-hub-2.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestHealthEndpoint:
    """Test health check endpoint."""
    
    def test_health_endpoint_returns_200(self):
        """GET /api/health returns 200 status."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "status" in data, "Response should contain 'status' field"
        assert data["status"] == "healthy", f"Expected 'healthy', got {data['status']}"
        print(f"✓ GET /api/health returned 200 with status: {data['status']}")


class TestAdminLogin:
    """Test admin login functionality."""
    
    def test_portal_login_with_admin_credentials(self):
        """Login with admin/admin123 and get valid token."""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed with status {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain 'token' field"
        assert "id" in data, "Response should contain 'id' field"
        assert data["token"], "Token should not be empty"
        print(f"✓ Admin login successful, token length: {len(data['token'])}")
        
        return data["token"]


class TestCurrentPlanEndpoint:
    """Test GET /api/payments/current-plan endpoint used by EnterpriseGate."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token."""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
        else:
            pytest.skip("Could not login to get admin token")
    
    def test_current_plan_returns_plan_id(self):
        """GET /api/payments/current-plan returns plan_id for authenticated admin."""
        response = requests.get(f"{BASE_URL}/api/payments/current-plan", params={
            "admin_token": self.admin_token
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plan_id" in data, "Response should contain 'plan_id' field"
        assert "plan_name" in data, "Response should contain 'plan_name' field"
        assert "clients_limit" in data, "Response should contain 'clients_limit' field"
        
        print(f"✓ GET /api/payments/current-plan returned:")
        print(f"  - plan_id: {data['plan_id']}")
        print(f"  - plan_name: {data['plan_name']}")
        print(f"  - clients_limit: {data['clients_limit']}")
    
    def test_current_plan_requires_auth(self):
        """GET /api/payments/current-plan requires valid admin_token."""
        response = requests.get(f"{BASE_URL}/api/payments/current-plan", params={
            "admin_token": "invalid_token_12345"
        })
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        print("✓ GET /api/payments/current-plan correctly rejects invalid token")


class TestAdminCreditsEndpoint:
    """Test GET /api/admin/credits endpoint used by EnterpriseGate."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token."""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
        else:
            pytest.skip("Could not login to get admin token")
    
    def test_credits_returns_is_super_admin(self):
        """GET /api/admin/credits returns is_super_admin status."""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": self.admin_token
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "credits" in data, "Response should contain 'credits' field"
        assert "is_super_admin" in data, "Response should contain 'is_super_admin' field"
        assert isinstance(data["is_super_admin"], bool), "is_super_admin should be a boolean"
        
        print(f"✓ GET /api/admin/credits returned:")
        print(f"  - credits: {data['credits']}")
        print(f"  - is_super_admin: {data['is_super_admin']}")
    
    def test_admin_is_super_admin(self):
        """Verify admin user has is_super_admin=True."""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": self.admin_token
        })
        assert response.status_code == 200
        
        data = response.json()
        # As per requirements, admin user is a superadmin
        assert data.get("is_super_admin") == True, "Admin user should be a superadmin"
        print("✓ Admin user confirmed as superadmin (is_super_admin=True)")
    
    def test_credits_requires_auth(self):
        """GET /api/admin/credits requires valid admin_token."""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": "invalid_token_12345"
        })
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        print("✓ GET /api/admin/credits correctly rejects invalid token")


class TestWebsiteEndpoint:
    """Test GET /api/website returns marketing website HTML."""
    
    def test_website_returns_html(self):
        """GET /api/website returns HTML content."""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/html" in content_type, f"Expected text/html, got {content_type}"
        
        html_content = response.text
        assert "<html" in html_content.lower(), "Response should contain HTML tags"
        assert "paylock" in html_content.lower() or "PayLock" in html_content, "Response should mention PayLock"
        
        print(f"✓ GET /api/website returned HTML ({len(html_content)} bytes)")


class TestPortalEndpoint:
    """Test GET /api/portal returns portal login page."""
    
    def test_portal_returns_html(self):
        """GET /api/portal returns HTML content."""
        response = requests.get(f"{BASE_URL}/api/portal")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/html" in content_type, f"Expected text/html, got {content_type}"
        
        html_content = response.text
        assert "<html" in html_content.lower() or "<!DOCTYPE" in html_content, "Response should contain HTML"
        
        print(f"✓ GET /api/portal returned HTML ({len(html_content)} bytes)")
    
    def test_portal_is_not_404(self):
        """GET /api/portal should NOT return 404."""
        response = requests.get(f"{BASE_URL}/api/portal")
        assert response.status_code != 404, "Portal should not return 404"
        print("✓ GET /api/portal is accessible (not 404)")


class TestWebsiteDownloadEndpoint:
    """Test GET /api/download/website returns ZIP file."""
    
    def test_website_download_returns_zip(self):
        """GET /api/download/website returns ZIP file."""
        response = requests.get(f"{BASE_URL}/api/download/website")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "application/zip" in content_type or "octet-stream" in content_type, f"Expected ZIP content type, got {content_type}"
        
        # Check content disposition header
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower(), "Should have attachment disposition"
        assert "zip" in content_disp.lower(), "Should indicate zip file"
        
        # Verify it's a valid ZIP by checking magic bytes (PK header)
        content = response.content
        assert len(content) > 0, "ZIP file should not be empty"
        assert content[:2] == b'PK', "Content should start with PK (ZIP magic bytes)"
        
        print(f"✓ GET /api/download/website returned ZIP file ({len(content)} bytes)")


class TestEnterpriseGateIntegration:
    """Test the combined flow used by useEnterpriseAccess hook."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get admin token."""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
        else:
            pytest.skip("Could not login to get admin token")
    
    def test_enterprise_access_flow(self):
        """Test the combined API calls made by useEnterpriseAccess hook."""
        # This tests the exact flow from useEnterpriseAccess.ts:
        # const [planRes, creditsRes] = await Promise.all([
        #     fetch(`${API_URL}/api/payments/current-plan?admin_token=${token}`),
        #     fetch(`${API_URL}/api/admin/credits?admin_token=${token}`),
        # ]);
        
        # Call both endpoints (simulating parallel fetch)
        plan_response = requests.get(f"{BASE_URL}/api/payments/current-plan", params={
            "admin_token": self.admin_token
        })
        credits_response = requests.get(f"{BASE_URL}/api/admin/credits", params={
            "admin_token": self.admin_token
        })
        
        # Both should succeed
        assert plan_response.status_code == 200, f"Plan endpoint failed: {plan_response.status_code}"
        assert credits_response.status_code == 200, f"Credits endpoint failed: {credits_response.status_code}"
        
        plan_data = plan_response.json()
        credits_data = credits_response.json()
        
        # Verify fields used by the hook
        plan_id = plan_data.get("plan_id", "starter")
        is_super_admin = credits_data.get("is_super_admin", False)
        
        # Calculate hasEnterprise as per the hook logic:
        # const hasEnterprise = isSuperAdmin || ENTERPRISE_PLANS.includes(plan);
        ENTERPRISE_PLANS = ["enterprise", "custom"]
        has_enterprise = is_super_admin or plan_id in ENTERPRISE_PLANS
        
        print(f"✓ Enterprise Gate Access Check:")
        print(f"  - plan_id: {plan_id}")
        print(f"  - is_super_admin: {is_super_admin}")
        print(f"  - hasEnterprise: {has_enterprise}")
        
        # Admin user should have enterprise access (as superadmin)
        assert has_enterprise == True, "Admin user should have enterprise access"
        print("✓ Admin user correctly has enterprise feature access")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
