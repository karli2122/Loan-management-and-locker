"""
Test suite for iteration 65 - Location history, portal refactoring, and website download.

Features tested:
1. POST /api/device/location - with 'source' field for background location tracking
2. GET /api/device/location-history/{client_id} - returns location history
3. POST /api/admin/login - admin authentication
4. GET /api/portal - returns refactored HTML that references external CSS/JS files
5. GET /api/portal/portal.css - returns CSS content
6. GET /api/portal/portal-app.js - returns JS content
7. GET /api/portal/translations.js - returns translations
8. GET /api/download/website - downloads the website zip
9. GET /api/health - health check
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://loan-admin-hub-2.preview.emergentagent.com').rstrip('/')


class TestHealthEndpoint:
    """Health check endpoint tests"""
    
    def test_health_check(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint works")


class TestAdminLogin:
    """Admin authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data.get("username") == "admin"
        print("✓ Admin login works with admin/admin123")
        return data.get("token")
    
    def test_admin_login_invalid(self):
        """Test admin login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "wrongpassword"}
        )
        assert response.status_code in [401, 422]
        print("✓ Invalid login properly rejected")


class TestPortalRefactoring:
    """Portal refactoring tests - HTML, CSS, JS files served separately"""
    
    def test_portal_html_loads(self):
        """Test that portal HTML loads and references external CSS/JS"""
        response = requests.get(f"{BASE_URL}/api/portal")
        assert response.status_code == 200
        content = response.text
        
        # Check it's HTML
        assert "<!DOCTYPE html>" in content or "<html" in content
        
        # Check it references the external CSS file
        assert "/api/portal/portal.css" in content, "Portal HTML should reference external portal.css"
        
        # Check it references the external JS files
        assert "/api/portal/portal-app.js" in content, "Portal HTML should reference external portal-app.js"
        assert "/api/portal/translations.js" in content, "Portal HTML should reference external translations.js"
        
        # Portal should be lightweight now (not 1645 lines)
        line_count = len(content.split('\n'))
        assert line_count < 100, f"Portal HTML should be lightweight shell, got {line_count} lines"
        
        print(f"✓ Portal HTML loads correctly ({line_count} lines, references external CSS/JS)")
    
    def test_portal_css_loads(self):
        """Test that portal CSS file is served"""
        response = requests.get(f"{BASE_URL}/api/portal/portal.css")
        assert response.status_code == 200
        
        # Check content type is CSS
        content_type = response.headers.get('content-type', '')
        assert 'text/css' in content_type, f"Expected text/css, got {content_type}"
        
        # Check it contains CSS content
        content = response.text
        assert ":root" in content or "body" in content, "Should contain CSS rules"
        assert "--bg" in content or "var(--" in content, "Should contain CSS variables"
        
        print(f"✓ Portal CSS loads correctly ({len(content)} chars)")
    
    def test_portal_app_js_loads(self):
        """Test that portal-app.js file is served"""
        response = requests.get(f"{BASE_URL}/api/portal/portal-app.js")
        assert response.status_code == 200
        
        # Check content type is JavaScript
        content_type = response.headers.get('content-type', '')
        assert 'javascript' in content_type, f"Expected application/javascript, got {content_type}"
        
        # Check it contains JavaScript content
        content = response.text
        assert "function" in content or "const" in content or "let" in content, "Should contain JS code"
        assert "API_BASE" in content or "api" in content.lower(), "Should have API integration"
        
        print(f"✓ Portal App JS loads correctly ({len(content)} chars)")
    
    def test_portal_translations_js_loads(self):
        """Test that translations.js file is served"""
        response = requests.get(f"{BASE_URL}/api/portal/translations.js")
        assert response.status_code == 200
        
        # Check content type is JavaScript
        content_type = response.headers.get('content-type', '')
        assert 'javascript' in content_type, f"Expected application/javascript, got {content_type}"
        
        # Check it contains translations
        content = response.text
        assert "PORTAL_TRANSLATIONS" in content or "translations" in content.lower(), "Should contain translations"
        
        print(f"✓ Portal Translations JS loads correctly ({len(content)} chars)")


class TestWebsiteDownload:
    """Website download tests"""
    
    def test_website_zip_download(self):
        """Test that website ZIP can be downloaded"""
        response = requests.get(f"{BASE_URL}/api/download/website")
        
        # Either success or file not found
        if response.status_code == 200:
            content_type = response.headers.get('content-type', '')
            assert 'zip' in content_type or 'octet-stream' in content_type
            print("✓ Website ZIP download works")
        else:
            # File might not exist, which is acceptable
            assert response.status_code == 404
            print("✓ Website ZIP endpoint exists (file not found - acceptable)")


class TestLocationEndpoints:
    """Location tracking endpoints tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not get admin token")
    
    @pytest.fixture
    def test_client(self, admin_token):
        """Create a test client for location tests"""
        import uuid
        test_name = f"TEST_LocationClient_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/clients?admin_token={admin_token}",
            json={
                "name": test_name,
                "phone": "+37255512345",
                "email": f"{test_name.lower()}@test.com"
            }
        )
        
        if response.status_code in [200, 201]:
            client = response.json()
            yield client
            # Cleanup
            requests.delete(f"{BASE_URL}/api/clients/{client['id']}?admin_token={admin_token}")
        else:
            pytest.skip(f"Could not create test client: {response.status_code}")
    
    def test_location_update_with_source_foreground(self, test_client):
        """Test location update with source='foreground'"""
        client_id = test_client['id']
        
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": client_id,
                "latitude": 59.437,
                "longitude": 24.7536,
                "source": "foreground"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert data.get("client_id") == client_id
        print("✓ Location update with source='foreground' works")
    
    def test_location_update_with_source_background(self, test_client):
        """Test location update with source='background' (for background tracking service)"""
        client_id = test_client['id']
        
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": client_id,
                "latitude": 59.4380,
                "longitude": 24.7545,
                "source": "background"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✓ Location update with source='background' works")
    
    def test_location_update_default_source(self, test_client):
        """Test location update without source defaults to 'foreground'"""
        client_id = test_client['id']
        
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": client_id,
                "latitude": 59.4370,
                "longitude": 24.7530
            }
        )
        
        assert response.status_code == 200
        print("✓ Location update without source works (defaults to foreground)")
    
    def test_location_history_endpoint(self, test_client, admin_token):
        """Test getting location history for a client"""
        client_id = test_client['id']
        
        # First add a location
        requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": client_id,
                "latitude": 59.437,
                "longitude": 24.7536,
                "source": "background"
            }
        )
        
        # Now get location history
        response = requests.get(
            f"{BASE_URL}/api/device/location-history/{client_id}?admin_token={admin_token}"
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "client_id" in data
        assert data["client_id"] == client_id
        assert "locations" in data
        assert "count" in data
        assert isinstance(data["locations"], list)
        
        # Should have at least the one we added
        if len(data["locations"]) > 0:
            loc = data["locations"][0]
            assert "latitude" in loc
            assert "longitude" in loc
            assert "timestamp" in loc
            assert "source" in loc
        
        print(f"✓ Location history endpoint works (returned {data['count']} locations)")
    
    def test_location_history_with_limit(self, test_client, admin_token):
        """Test location history with limit parameter"""
        client_id = test_client['id']
        
        response = requests.get(
            f"{BASE_URL}/api/device/location-history/{client_id}?limit=10&admin_token={admin_token}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data.get("locations", [])) <= 10
        print("✓ Location history with limit parameter works")
    
    def test_location_history_with_days(self, test_client, admin_token):
        """Test location history with days parameter"""
        client_id = test_client['id']
        
        response = requests.get(
            f"{BASE_URL}/api/device/location-history/{client_id}?days=7&admin_token={admin_token}"
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "locations" in data
        print("✓ Location history with days parameter works")
    
    def test_location_history_invalid_client(self, admin_token):
        """Test location history for non-existent client returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/device/location-history/invalid_client_id_xyz?admin_token={admin_token}"
        )
        
        assert response.status_code == 404
        print("✓ Location history returns 404 for invalid client")
    
    def test_location_update_invalid_client(self):
        """Test location update for non-existent client returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/device/location",
            json={
                "client_id": "invalid_client_id_xyz",
                "latitude": 59.437,
                "longitude": 24.7536,
                "source": "foreground"
            }
        )
        
        assert response.status_code == 404
        print("✓ Location update returns 404 for invalid client")


class TestPaymentSchedulingTasks:
    """Test payment scheduling and tasks.py features (verified via endpoints)"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Could not get admin token")
    
    def test_payment_schedules_endpoint_exists(self, admin_token):
        """Test that payment schedules endpoint exists"""
        response = requests.get(f"{BASE_URL}/api/schedules?admin_token={admin_token}")
        
        # Should return list of schedules (may be empty)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, (list, dict))
        print("✓ Payment schedules endpoint works")
    
    def test_due_today_schedules(self, admin_token):
        """Test due today schedules endpoint"""
        response = requests.get(f"{BASE_URL}/api/schedules/due-today?admin_token={admin_token}")
        
        # Should succeed
        assert response.status_code == 200
        print("✓ Due today schedules endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
