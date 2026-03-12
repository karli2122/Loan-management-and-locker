"""
Test new features for iteration 21:
1. GET /api/heartbeat/summary - Device heartbeat monitoring with severity levels
2. GET /api/analytics/dashboard - Monthly revenue trend data
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://analytics-debug-11.preview.emergentagent.com"

# Test credentials
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token by logging in"""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "Token not in login response"
    return data["token"]


class TestHeartbeatSummaryEndpoint:
    """Tests for GET /api/heartbeat/summary"""

    def test_heartbeat_summary_returns_200(self, admin_token):
        """Verify endpoint returns 200 status"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_heartbeat_summary_has_required_fields(self, admin_token):
        """Verify response contains all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        # Check required count fields
        required_fields = ["total_registered", "online_count", "warning_count", "critical_count"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
            assert isinstance(data[field], int), f"{field} should be integer"
        
        # Check required array fields
        array_fields = ["online", "warning", "critical"]
        for field in array_fields:
            assert field in data, f"Missing required array field: {field}"
            assert isinstance(data[field], list), f"{field} should be list"
    
    def test_heartbeat_summary_counts_are_consistent(self, admin_token):
        """Verify counts match array lengths"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        assert data["online_count"] == len(data["online"]), "online_count doesn't match array length"
        assert data["warning_count"] == len(data["warning"]), "warning_count doesn't match array length"
        assert data["critical_count"] == len(data["critical"]), "critical_count doesn't match array length"
    
    def test_heartbeat_devices_have_severity_field(self, admin_token):
        """Verify each device in arrays has severity field"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        # Check devices in each array have correct severity
        for device in data.get("online", []):
            assert device.get("severity") == "online", f"Online device has wrong severity: {device}"
        
        for device in data.get("warning", []):
            assert device.get("severity") == "warning", f"Warning device has wrong severity: {device}"
        
        for device in data.get("critical", []):
            assert device.get("severity") == "critical", f"Critical device has wrong severity: {device}"
    
    def test_heartbeat_summary_requires_auth(self):
        """Verify endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/heartbeat/summary")
        assert response.status_code in [401, 422], f"Expected auth error, got {response.status_code}"
    
    def test_heartbeat_invalid_token_rejected(self):
        """Verify invalid token is rejected"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": "invalid_token_12345"}
        )
        assert response.status_code in [401, 403], f"Expected auth rejection, got {response.status_code}"
    
    def test_heartbeat_device_entries_have_required_fields(self, admin_token):
        """Verify device entries have all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        required_device_fields = ["id", "name", "device_model", "is_locked", "last_heartbeat", "severity"]
        
        all_devices = data.get("online", []) + data.get("warning", []) + data.get("critical", [])
        for device in all_devices:
            for field in required_device_fields:
                assert field in device, f"Device missing field: {field}"
    
    def test_heartbeat_thresholds_included(self, admin_token):
        """Verify threshold information is included"""
        response = requests.get(
            f"{BASE_URL}/api/heartbeat/summary",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        assert "thresholds" in data, "Missing thresholds info"
        assert "online_minutes" in data["thresholds"], "Missing online_minutes threshold"
        assert "warning_minutes" in data["thresholds"], "Missing warning_minutes threshold"


class TestDashboardAnalyticsEndpoint:
    """Tests for GET /api/analytics/dashboard - specifically monthly_revenue"""

    def test_dashboard_analytics_returns_200(self, admin_token):
        """Verify endpoint returns 200 status"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_dashboard_has_monthly_revenue_field(self, admin_token):
        """Verify response contains monthly_revenue object"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        assert "monthly_revenue" in data, "Missing monthly_revenue field"
        assert isinstance(data["monthly_revenue"], dict), "monthly_revenue should be an object"
    
    def test_monthly_revenue_keys_are_yyyy_mm_format(self, admin_token):
        """Verify monthly_revenue keys are in YYYY-MM format"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        import re
        date_pattern = re.compile(r'^\d{4}-\d{2}$')
        
        for key in data["monthly_revenue"].keys():
            assert date_pattern.match(key), f"Invalid date format for key: {key}"
    
    def test_monthly_revenue_values_are_numbers(self, admin_token):
        """Verify monthly_revenue values are numeric"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        for key, value in data["monthly_revenue"].items():
            assert isinstance(value, (int, float)), f"Value for {key} should be numeric, got {type(value)}"
    
    def test_dashboard_has_all_sections(self, admin_token):
        """Verify all dashboard sections are present"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/dashboard",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        required_sections = ["overview", "financial", "recent_activity", "monthly_revenue", "activity_log"]
        for section in required_sections:
            assert section in data, f"Missing section: {section}"
    
    def test_dashboard_requires_auth(self):
        """Verify endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/analytics/dashboard")
        assert response.status_code in [401, 422], f"Expected auth error, got {response.status_code}"


class TestCollectionReportEndpoint:
    """Tests to verify existing loan stats still work correctly"""

    def test_collection_report_returns_200(self, admin_token):
        """Verify existing collection report endpoint still works"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    def test_collection_report_data_correctness(self, admin_token):
        """Verify loan overview stats are correct"""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token}
        )
        data = response.json()
        
        # Per iteration 20: 4 active loans, 0 overdue, 0 completed, €676 collected
        assert data.get("active_loans") == 4, f"Expected 4 active loans, got {data.get('active_loans')}"
        assert data.get("overdue_loans") == 0, f"Expected 0 overdue, got {data.get('overdue_loans')}"
        assert data.get("completed_loans") == 0, f"Expected 0 completed, got {data.get('completed_loans')}"
        assert data.get("total_collected") == 676.0, f"Expected €676 collected, got {data.get('total_collected')}"
