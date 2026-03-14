"""
PayLock Pro - Website, Portal, and Payment Automation Tests
Tests for iteration 67: Website pages, Portal access, Payment automation settings
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://paylock-fixes.preview.emergentagent.com"

# Admin credentials for testing
TEST_ADMIN_USER = "admin"
TEST_ADMIN_PASS = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated requests."""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": TEST_ADMIN_USER, "password": TEST_ADMIN_PASS}
    )
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin login failed - cannot run authenticated tests")


class TestHealthAndBasicAPI:
    """Basic API health checks"""
    
    def test_health_endpoint(self):
        """Health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint working")
    
    def test_api_root(self):
        """API root returns version info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "EMI Device Admin API" in data.get("message", "")
        print("✓ API root endpoint working")


class TestWebsitePages:
    """Website page routes served from backend"""
    
    def test_website_homepage(self):
        """Homepage loads at /api/website"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "PayLock Pro" in response.text
        assert 'href="/api/website/style.css"' in response.text
        assert 'src="/api/website/site.js"' in response.text
        print("✓ Website homepage loads with correct asset paths")
    
    def test_website_pricing_page(self):
        """Pricing page loads at /api/website/pricing"""
        response = requests.get(f"{BASE_URL}/api/website/pricing")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "Pricing" in response.text or "pricing" in response.text.lower()
        print("✓ Website pricing page loads")
    
    def test_website_how_it_works_page(self):
        """How It Works page loads at /api/website/how-it-works"""
        response = requests.get(f"{BASE_URL}/api/website/how-it-works")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        print("✓ Website how-it-works page loads")
    
    def test_website_contact_page(self):
        """Contact page loads at /api/website/contact"""
        response = requests.get(f"{BASE_URL}/api/website/contact")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        print("✓ Website contact page loads")
    
    def test_website_privacy_policy_page(self):
        """Privacy Policy page loads at /api/website/privacy-policy"""
        response = requests.get(f"{BASE_URL}/api/website/privacy-policy")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        print("✓ Website privacy-policy page loads")
    
    def test_website_terms_of_use_page(self):
        """Terms of Use page loads at /api/website/terms-of-use"""
        response = requests.get(f"{BASE_URL}/api/website/terms-of-use")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        print("✓ Website terms-of-use page loads")
    
    def test_website_css_loads(self):
        """CSS file loads at /api/website/style.css"""
        response = requests.get(f"{BASE_URL}/api/website/style.css")
        assert response.status_code == 200
        assert "text/css" in response.headers.get("content-type", "")
        assert len(response.text) > 1000  # Should have substantial CSS
        print("✓ Website CSS loads correctly")
    
    def test_website_js_loads(self):
        """JS file loads at /api/website/site.js"""
        response = requests.get(f"{BASE_URL}/api/website/site.js")
        assert response.status_code == 200
        assert "javascript" in response.headers.get("content-type", "")
        print("✓ Website JS loads correctly")
    
    def test_website_zip_download(self):
        """Website ZIP download at /api/download/website"""
        response = requests.get(f"{BASE_URL}/api/download/website")
        assert response.status_code == 200
        assert "application/zip" in response.headers.get("content-type", "")
        assert "paylockpro-website.zip" in response.headers.get("content-disposition", "")
        assert len(response.content) > 10000  # ZIP should have substantial size
        print("✓ Website ZIP download working")
    
    def test_website_has_portal_link(self):
        """Website homepage has link to Admin Portal at /api/portal"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        # Check that portal link is rewritten to /api/portal
        assert 'href="/api/portal"' in response.text
        print("✓ Website has portal link pointing to /api/portal")


class TestPortalAccess:
    """Portal access from website"""
    
    def test_portal_html_loads(self):
        """Portal HTML loads at /api/portal"""
        response = requests.get(f"{BASE_URL}/api/portal")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "PayLock Pro" in response.text
        print("✓ Portal HTML loads correctly (no 404)")
    
    def test_portal_css_loads(self):
        """Portal CSS loads at /api/portal/portal.css"""
        response = requests.get(f"{BASE_URL}/api/portal/portal.css")
        assert response.status_code == 200
        assert "text/css" in response.headers.get("content-type", "")
        print("✓ Portal CSS loads correctly")
    
    def test_portal_js_loads(self):
        """Portal JS loads at /api/portal/portal-app.js"""
        response = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert response.status_code == 200
        assert "javascript" in response.headers.get("content-type", "")
        print("✓ Portal JS loads correctly")
    
    def test_portal_translations_loads(self):
        """Portal translations loads at /api/portal/translations.js"""
        response = requests.get(f"{BASE_URL}/api/portal/translations.js")
        assert response.status_code == 200
        assert "javascript" in response.headers.get("content-type", "")
        print("✓ Portal translations JS loads correctly")


class TestAdminLogin:
    """Admin authentication"""
    
    def test_admin_login_success(self):
        """Admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": TEST_ADMIN_USER, "password": TEST_ADMIN_PASS}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("username") == TEST_ADMIN_USER
        print(f"✓ Admin login successful for {TEST_ADMIN_USER}")
    
    def test_admin_login_invalid_credentials(self):
        """Admin login with invalid credentials returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "invalid", "password": "wrongpass"}
        )
        assert response.status_code == 401
        print("✓ Invalid login correctly rejected with 401")


class TestPaymentAutomationSettingsAPI:
    """Payment automation settings GET/PUT endpoints"""
    
    def test_get_settings_returns_automation_fields(self, admin_token):
        """GET /api/admin/settings returns payment automation fields"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check all payment automation fields exist
        assert "payment_auto_reminder_enabled" in data
        assert "payment_auto_reminder_days_before" in data
        assert "payment_auto_lock_enabled" in data
        assert "payment_auto_late_fee_enabled" in data
        assert "payment_late_fee_frequency_days" in data
        assert "payment_reminder_channels" in data
        
        # Verify types
        assert isinstance(data["payment_auto_reminder_enabled"], bool)
        assert isinstance(data["payment_auto_reminder_days_before"], int)
        assert isinstance(data["payment_auto_lock_enabled"], bool)
        assert isinstance(data["payment_auto_late_fee_enabled"], bool)
        assert isinstance(data["payment_late_fee_frequency_days"], int)
        assert isinstance(data["payment_reminder_channels"], list)
        
        print("✓ GET /api/admin/settings returns all payment automation fields with correct types")
    
    def test_update_payment_auto_reminder_enabled(self, admin_token):
        """PUT /api/admin/settings can update payment_auto_reminder_enabled"""
        # Disable it first
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_reminder_enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_auto_reminder_enabled"] == False
        
        # Re-enable it
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_reminder_enabled": True}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_auto_reminder_enabled"] == True
        
        print("✓ PUT /api/admin/settings can toggle payment_auto_reminder_enabled")
    
    def test_update_payment_auto_reminder_days_before(self, admin_token):
        """PUT /api/admin/settings can update payment_auto_reminder_days_before"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_reminder_days_before": 5}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_auto_reminder_days_before"] == 5
        
        # Reset to default
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_reminder_days_before": 3}
        )
        assert response.status_code == 200
        print("✓ PUT /api/admin/settings can update payment_auto_reminder_days_before")
    
    def test_update_payment_auto_lock_enabled(self, admin_token):
        """PUT /api/admin/settings can update payment_auto_lock_enabled"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_lock_enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_auto_lock_enabled"] == False
        
        # Re-enable
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_lock_enabled": True}
        )
        assert response.status_code == 200
        print("✓ PUT /api/admin/settings can toggle payment_auto_lock_enabled")
    
    def test_update_payment_auto_late_fee_enabled(self, admin_token):
        """PUT /api/admin/settings can update payment_auto_late_fee_enabled"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_late_fee_enabled": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_auto_late_fee_enabled"] == False
        
        # Re-enable
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_auto_late_fee_enabled": True}
        )
        assert response.status_code == 200
        print("✓ PUT /api/admin/settings can toggle payment_auto_late_fee_enabled")
    
    def test_update_payment_late_fee_frequency_days(self, admin_token):
        """PUT /api/admin/settings can update payment_late_fee_frequency_days"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_late_fee_frequency_days": 14}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["settings"]["payment_late_fee_frequency_days"] == 14
        
        # Reset to default
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_late_fee_frequency_days": 7}
        )
        assert response.status_code == 200
        print("✓ PUT /api/admin/settings can update payment_late_fee_frequency_days")
    
    def test_update_payment_reminder_channels(self, admin_token):
        """PUT /api/admin/settings can update payment_reminder_channels"""
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_reminder_channels": "push,sms"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "push" in data["settings"]["payment_reminder_channels"]
        assert "sms" in data["settings"]["payment_reminder_channels"]
        
        # Reset to default
        response = requests.put(
            f"{BASE_URL}/api/admin/settings",
            params={"admin_token": admin_token, "payment_reminder_channels": "push,email"}
        )
        assert response.status_code == 200
        print("✓ PUT /api/admin/settings can update payment_reminder_channels")
    
    def test_settings_require_auth(self):
        """Settings endpoints require admin token"""
        # GET without token
        response = requests.get(f"{BASE_URL}/api/admin/settings")
        assert response.status_code in [401, 422]
        
        # PUT without token
        response = requests.put(f"{BASE_URL}/api/admin/settings")
        assert response.status_code in [401, 422]
        
        print("✓ Settings endpoints correctly require admin_token")


class TestPortalJSHasPaymentAutomationSection:
    """Verify portal JS has Payment Automation section in renderSettings"""
    
    def test_portal_js_has_payment_automation_ui(self):
        """Portal JS contains Payment Automation section"""
        response = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert response.status_code == 200
        js_content = response.text
        
        # Check for Payment Automation section
        assert "Payment Automation" in js_content
        assert "pa-auto-remind" in js_content
        assert "pa-auto-lock" in js_content
        assert "pa-auto-late-fee" in js_content
        assert "pa-remind-days" in js_content
        
        # Check for form submission with automation fields
        assert "payment_auto_reminder_enabled" in js_content
        assert "payment_auto_lock_enabled" in js_content
        assert "payment_auto_late_fee_enabled" in js_content
        
        print("✓ Portal JS contains Payment Automation UI section")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
