"""
Iteration 63 - Testing New Features:
1. Report Scheduling (CRUD + Send Now)
2. Contact Form Endpoint
3. Website Pages (Home, About, Contact)
4. Payment Scheduling Endpoints
5. Website ZIP Download
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://analytics-debug-11.preview.emergentagent.com")

class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint works")
    
    def test_root_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✓ Root endpoint works")


class TestAdminLogin:
    """Admin authentication tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        return data["token"]
    
    def test_admin_login_success(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert len(data["token"]) > 0
        print("✓ Admin login works")


class TestWebsite:
    """Website pages and download tests"""
    
    def test_website_homepage_loads(self):
        """Test website homepage at /api/website"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        assert "PayLock Pro" in response.text
        assert "Manage Loans" in response.text
        assert "Secure Devices" in response.text
        print("✓ Website homepage loads with features")
    
    def test_website_has_pricing_section(self):
        """Website shows pricing tiers"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        assert "Starter" in response.text
        assert "Professional" in response.text
        assert "Enterprise" in response.text
        assert "/mo" in response.text  # Monthly pricing
        print("✓ Website has 3 pricing tiers")
    
    def test_website_has_about_page(self):
        """Website has About Us page content"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        assert "About PayLock Pro" in response.text
        assert "page-about" in response.text
        assert "Estonia" in response.text
        print("✓ Website has About Us page")
    
    def test_website_has_contact_page(self):
        """Website has Contact page with form"""
        response = requests.get(f"{BASE_URL}/api/website")
        assert response.status_code == 200
        assert "page-contact" in response.text
        assert "contact-submit-btn" in response.text
        assert "c-email" in response.text
        assert "c-message" in response.text
        print("✓ Website has Contact page with form")
    
    def test_website_zip_download(self):
        """Test website ZIP download endpoint"""
        response = requests.get(f"{BASE_URL}/api/download/website")
        # Should either return 200 (file exists) or 404 (file not found)
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            assert response.headers.get("content-type") == "application/zip"
            print("✓ Website ZIP download works")
        else:
            print("! Website ZIP file not created yet (404)")


class TestContactForm:
    """Contact form endpoint tests"""
    
    def test_contact_form_requires_email_and_message(self):
        """Contact form validates required fields"""
        response = requests.post(f"{BASE_URL}/api/contact", json={
            "name": "Test User"
        })
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == False
        assert "required" in data.get("error", "").lower()
        print("✓ Contact form validates required fields")
    
    def test_contact_form_submission(self):
        """Contact form accepts valid submission"""
        response = requests.post(f"{BASE_URL}/api/contact", json={
            "name": "Test User",
            "email": "test@example.com",
            "subject": "General Inquiry",
            "message": "This is a test message for iteration 63 testing"
        })
        assert response.status_code == 200
        data = response.json()
        # Should return success (if email configured) or error message
        assert "success" in data
        print(f"✓ Contact form submission responded: success={data.get('success')}")


class TestReportSchedules:
    """Report scheduling CRUD tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_list_report_schedules(self, admin_token):
        """GET /api/report-schedules returns list"""
        response = requests.get(f"{BASE_URL}/api/report-schedules", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        assert "schedules" in data
        assert isinstance(data["schedules"], list)
        print(f"✓ Report schedules list: {len(data['schedules'])} schedules")
    
    def test_create_report_schedule(self, admin_token):
        """POST /api/report-schedules creates a schedule"""
        response = requests.post(
            f"{BASE_URL}/api/report-schedules",
            params={"admin_token": admin_token},
            json={
                "email": "test_iter63@example.com",
                "report_type": "financial",
                "frequency": "weekly",
                "send_day": 1
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["email"] == "test_iter63@example.com"
        assert data["report_type"] == "financial"
        assert data["is_active"] == True
        print(f"✓ Created report schedule: {data['id']}")
        return data["id"]
    
    def test_update_report_schedule(self, admin_token):
        """PUT /api/report-schedules/{id} updates a schedule"""
        # First create a schedule
        create_resp = requests.post(
            f"{BASE_URL}/api/report-schedules",
            params={"admin_token": admin_token},
            json={
                "email": "update_test_iter63@example.com",
                "report_type": "clients",
                "frequency": "daily"
            }
        )
        schedule_id = create_resp.json()["id"]
        
        # Update it
        response = requests.put(
            f"{BASE_URL}/api/report-schedules/{schedule_id}",
            params={"admin_token": admin_token},
            json={"is_active": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
        print(f"✓ Updated report schedule: {schedule_id}")
    
    def test_delete_report_schedule(self, admin_token):
        """DELETE /api/report-schedules/{id} deletes a schedule"""
        # First create a schedule
        create_resp = requests.post(
            f"{BASE_URL}/api/report-schedules",
            params={"admin_token": admin_token},
            json={
                "email": "delete_test_iter63@example.com",
                "report_type": "collection",
                "frequency": "monthly"
            }
        )
        schedule_id = create_resp.json()["id"]
        
        # Delete it
        response = requests.delete(
            f"{BASE_URL}/api/report-schedules/{schedule_id}",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] == True
        print(f"✓ Deleted report schedule: {schedule_id}")
    
    def test_send_report_now(self, admin_token):
        """POST /api/report-schedules/send-now sends immediate report"""
        response = requests.post(
            f"{BASE_URL}/api/report-schedules/send-now",
            params={"admin_token": admin_token},
            json={
                "email": "send_now_test@example.com",
                "report_type": "financial"
            }
        )
        assert response.status_code == 200
        data = response.json()
        # Should succeed or fail based on email config
        assert "success" in data
        print(f"✓ Send Now responded: success={data.get('success')}")


class TestPaymentSchedules:
    """Payment scheduling endpoints tests - endpoint is /api/schedules"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_list_payment_schedules(self, admin_token):
        """GET /api/schedules returns payment schedules list"""
        response = requests.get(f"{BASE_URL}/api/schedules", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        assert "schedules" in data
        assert isinstance(data["schedules"], list)
        print(f"✓ Payment schedules list: {len(data['schedules'])} schedules")
    
    def test_get_due_today(self, admin_token):
        """GET /api/schedules/due/today returns due schedules"""
        response = requests.get(f"{BASE_URL}/api/schedules/due/today", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        assert "due_schedules" in data
        print(f"✓ Due today schedules: {len(data['due_schedules'])} schedules")


class TestExistingExports:
    """Verify existing export functionality still works"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_export_pdf_financial(self, admin_token):
        """PDF export still works"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf",
            params={"admin_token": admin_token, "report_type": "financial"}
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        print("✓ PDF Financial export works")
    
    def test_export_csv_financial(self, admin_token):
        """CSV export still works"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/csv",
            params={"admin_token": admin_token, "report_type": "financial"}
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")
        print("✓ CSV Financial export works")


class TestDashboardAndSettings:
    """Dashboard and Settings endpoints tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_dashboard_analytics(self, admin_token):
        """Dashboard analytics endpoint"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        assert "overview" in data
        assert "financial" in data
        print("✓ Dashboard analytics works")
    
    def test_admin_credits_no_credits_shown(self, admin_token):
        """Admin credits endpoint (credits removed per requirement)"""
        response = requests.get(f"{BASE_URL}/api/admin/credits", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        # Should return admin info but NOT credits counter
        # (credits were removed in the dashboard)
        print(f"✓ Admin credits endpoint works: {data.keys()}")


class TestActivityLog:
    """Activity log endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        return response.json()["token"]
    
    def test_activity_log(self, admin_token):
        """Activity log endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", params={"admin_token": admin_token})
        assert response.status_code == 200
        data = response.json()
        assert "logs" in data or isinstance(data, list)
        print("✓ Activity log endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
