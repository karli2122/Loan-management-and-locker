"""
Test suite for Audit Log and Credit Score Tracking features
- Tests /api/audit-logs endpoints (list, summary, action-types)
- Tests /api/clients/{id}/credit-score endpoints (get, update, history)
- Tests /api/credit-scores/overview endpoint
- Tests audit log creation on login
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials provided
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"
TEST_CLIENT_ID = "ea9e7b06-6da7-43cb-846d-850038d0ef07"


class TestSetup:
    """Setup tests - verify connectivity and authentication"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    def test_api_health(self):
        """Verify API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        print(f"API Health: {response.json()}")
    
    def test_superadmin_login(self, admin_token):
        """Verify superadmin can login"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print(f"Successfully logged in, token length: {len(admin_token)}")


class TestAuditLogLoginCreation:
    """Test that login creates an audit log entry"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token - this should create audit log"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_login_creates_audit_log(self, admin_token):
        """Verify login creates audit log entry"""
        # Fetch recent audit logs
        response = requests.get(
            f"{BASE_URL}/api/audit-logs",
            params={"admin_token": admin_token, "limit": 10}
        )
        assert response.status_code == 200, f"Get audit logs failed: {response.text}"
        
        data = response.json()
        assert "logs" in data, "No logs field in response"
        
        # Check that there's at least one login entry
        logs = data["logs"]
        assert len(logs) > 0, "No audit logs found"
        
        # Check for login action
        login_logs = [log for log in logs if log.get("action_type") == "login"]
        assert len(login_logs) > 0, "No login audit log found"
        
        # Verify login log structure
        latest_login = login_logs[0]
        assert latest_login.get("admin_username") == SUPERADMIN_USERNAME
        assert "created_at" in latest_login
        print(f"Found login audit log: {latest_login}")


class TestAuditLogsEndpoints:
    """Test /api/audit-logs endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_audit_logs(self, admin_token):
        """GET /api/audit-logs - list audit logs"""
        response = requests.get(
            f"{BASE_URL}/api/audit-logs",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Get audit logs failed: {response.text}"
        
        data = response.json()
        assert "logs" in data
        assert "total_count" in data
        assert "limit" in data
        assert "offset" in data
        assert "has_more" in data
        
        print(f"Total audit logs: {data['total_count']}")
        print(f"Retrieved: {len(data['logs'])} logs")
        
        # Verify log structure if logs exist
        if data["logs"]:
            log = data["logs"][0]
            assert "id" in log
            assert "admin_id" in log
            assert "action_type" in log
            assert "created_at" in log
    
    def test_get_audit_logs_with_pagination(self, admin_token):
        """GET /api/audit-logs - test pagination"""
        response = requests.get(
            f"{BASE_URL}/api/audit-logs",
            params={"admin_token": admin_token, "limit": 5, "offset": 0}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 5
        assert data["offset"] == 0
        print(f"Pagination test: limit={data['limit']}, offset={data['offset']}, has_more={data['has_more']}")
    
    def test_get_audit_logs_with_action_type_filter(self, admin_token):
        """GET /api/audit-logs - filter by action_type"""
        response = requests.get(
            f"{BASE_URL}/api/audit-logs",
            params={"admin_token": admin_token, "action_type": "login"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned logs should be login type
        for log in data["logs"]:
            assert log["action_type"] == "login", f"Expected login, got {log['action_type']}"
        print(f"Found {len(data['logs'])} login audit logs")
    
    def test_get_audit_logs_action_types(self, admin_token):
        """GET /api/audit-logs/action-types - get list of action types"""
        response = requests.get(
            f"{BASE_URL}/api/audit-logs/action-types",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Get action types failed: {response.text}"
        
        data = response.json()
        assert "action_types" in data
        assert isinstance(data["action_types"], list)
        
        print(f"Available action types: {data['action_types']}")
    
    def test_get_audit_logs_summary(self, admin_token):
        """GET /api/audit-logs/summary - get summary statistics"""
        response = requests.get(
            f"{BASE_URL}/api/audit-logs/summary",
            params={"admin_token": admin_token, "days": 7}
        )
        assert response.status_code == 200, f"Get summary failed: {response.text}"
        
        data = response.json()
        assert "total_actions" in data
        assert "period_days" in data
        assert "action_counts" in data
        assert "daily_activity" in data
        
        # Superadmin should see top_admins
        assert "top_admins" in data
        
        print(f"Summary - Total actions: {data['total_actions']}, Period: {data['period_days']} days")
        print(f"Action counts: {data['action_counts']}")
        print(f"Daily activity: {data['daily_activity']}")
    
    def test_get_audit_logs_requires_token(self):
        """GET /api/audit-logs - should fail without token"""
        response = requests.get(f"{BASE_URL}/api/audit-logs")
        # Should fail with 422 (validation error) or 401 (unauthorized)
        assert response.status_code in [401, 422], f"Expected auth error, got {response.status_code}"


class TestCreditScoreEndpoints:
    """Test /api/clients/{id}/credit-score endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_client_credit_score(self, admin_token):
        """GET /api/clients/{id}/credit-score - get client credit score"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Get credit score failed: {response.text}"
        
        data = response.json()
        assert "client_id" in data
        assert "score" in data
        assert "rating" in data
        assert "rating_label" in data
        assert "max_score" in data
        
        # Score should be between 0 and 1000
        assert 0 <= data["score"] <= 1000
        assert data["max_score"] == 1000
        
        print(f"Client credit score: {data['score']}, Rating: {data['rating']} ({data['rating_label']})")
    
    def test_get_credit_score_nonexistent_client(self, admin_token):
        """GET /api/clients/{id}/credit-score - should fail for nonexistent client"""
        fake_id = "nonexistent-client-id-12345"
        response = requests.get(
            f"{BASE_URL}/api/clients/{fake_id}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_update_client_credit_score(self, admin_token):
        """PUT /api/clients/{id}/credit-score - manually update credit score"""
        # First get current score
        get_response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert get_response.status_code == 200
        original_score = get_response.json()["score"]
        
        # Update to a new score
        new_score = 600 if original_score != 600 else 550
        
        response = requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": new_score, "reason": "Test adjustment"}
        )
        assert response.status_code == 200, f"Update credit score failed: {response.text}"
        
        data = response.json()
        assert "previous_score" in data
        assert "new_score" in data
        assert "change_amount" in data
        assert data["new_score"] == new_score
        
        print(f"Credit score updated: {data['previous_score']} -> {data['new_score']} (change: {data['change_amount']})")
        
        # Verify the update persisted
        verify_response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert verify_response.status_code == 200
        assert verify_response.json()["score"] == new_score
    
    def test_update_credit_score_creates_audit_log(self, admin_token):
        """Verify credit score update creates audit log"""
        # Update score
        response = requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 575, "reason": "Audit log test"}
        )
        assert response.status_code == 200
        
        # Check audit logs for credit score action
        audit_response = requests.get(
            f"{BASE_URL}/api/audit-logs",
            params={"admin_token": admin_token, "limit": 5}
        )
        assert audit_response.status_code == 200
        
        logs = audit_response.json()["logs"]
        credit_score_logs = [log for log in logs if "credit_score" in log.get("action_type", "").lower()]
        assert len(credit_score_logs) > 0, "Credit score adjustment should create audit log"
        print(f"Found credit score audit log: {credit_score_logs[0]}")
    
    def test_update_credit_score_validation(self, admin_token):
        """PUT /api/clients/{id}/credit-score - validate score bounds"""
        # Try score above max (1000)
        response = requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 1500, "reason": "Testing max bound"}
        )
        # Should either fail validation or clamp to 1000
        if response.status_code == 200:
            data = response.json()
            assert data["new_score"] <= 1000, "Score should be clamped to max 1000"
        else:
            assert response.status_code == 422, f"Expected validation error for score > 1000"
    
    def test_get_credit_score_history(self, admin_token):
        """GET /api/clients/{id}/credit-history - get credit score history"""
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-history",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Get credit history failed: {response.text}"
        
        data = response.json()
        assert "client_id" in data
        assert "current_score" in data
        assert "history_count" in data
        assert "history" in data
        
        # History should be a list
        assert isinstance(data["history"], list)
        
        print(f"Credit history count: {data['history_count']}")
        
        # Verify history entry structure if history exists
        if data["history"]:
            entry = data["history"][0]
            assert "previous_score" in entry
            assert "new_score" in entry
            assert "change_amount" in entry
            assert "reason" in entry
            assert "created_at" in entry
            print(f"Latest history entry: {entry}")
    
    def test_get_credit_score_history_nonexistent_client(self, admin_token):
        """GET /api/clients/{id}/credit-history - should fail for nonexistent client"""
        fake_id = "nonexistent-client-id-12345"
        response = requests.get(
            f"{BASE_URL}/api/clients/{fake_id}/credit-history",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestCreditScoreOverview:
    """Test /api/credit-scores/overview endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_get_credit_scores_overview(self, admin_token):
        """GET /api/credit-scores/overview - get overview of all credit scores"""
        response = requests.get(
            f"{BASE_URL}/api/credit-scores/overview",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Get overview failed: {response.text}"
        
        data = response.json()
        assert "total_clients" in data
        assert "average_score" in data
        assert "distribution" in data
        assert "top_clients" in data
        assert "low_score_clients" in data
        
        # Verify distribution structure
        distribution = data["distribution"]
        assert "excellent" in distribution
        assert "good" in distribution
        assert "fair" in distribution
        assert "poor" in distribution
        assert "very_poor" in distribution
        
        print(f"Credit scores overview:")
        print(f"  Total clients: {data['total_clients']}")
        print(f"  Average score: {data['average_score']}")
        print(f"  Distribution: {distribution}")
        print(f"  Top clients: {len(data['top_clients'])}")
        print(f"  Low score clients: {len(data['low_score_clients'])}")
    
    def test_overview_requires_token(self):
        """GET /api/credit-scores/overview - should fail without token"""
        response = requests.get(f"{BASE_URL}/api/credit-scores/overview")
        assert response.status_code in [401, 422], f"Expected auth error, got {response.status_code}"


class TestCreditScoreRatings:
    """Test credit score rating calculations"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_excellent_rating(self, admin_token):
        """Score >= 800 should be 'excellent'"""
        # Set score to 850
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 850, "reason": "Testing excellent rating"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == "excellent", f"Expected 'excellent' for score 850, got {data['rating']}"
        print(f"Score 850 = Rating: {data['rating']} ({data['rating_label']})")
    
    def test_good_rating(self, admin_token):
        """Score 650-799 should be 'good'"""
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 700, "reason": "Testing good rating"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == "good", f"Expected 'good' for score 700, got {data['rating']}"
        print(f"Score 700 = Rating: {data['rating']} ({data['rating_label']})")
    
    def test_fair_rating(self, admin_token):
        """Score 500-649 should be 'fair'"""
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 550, "reason": "Testing fair rating"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == "fair", f"Expected 'fair' for score 550, got {data['rating']}"
        print(f"Score 550 = Rating: {data['rating']} ({data['rating_label']})")
    
    def test_poor_rating(self, admin_token):
        """Score 350-499 should be 'poor'"""
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 400, "reason": "Testing poor rating"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == "poor", f"Expected 'poor' for score 400, got {data['rating']}"
        print(f"Score 400 = Rating: {data['rating']} ({data['rating_label']})")
    
    def test_very_poor_rating(self, admin_token):
        """Score < 350 should be 'very_poor'"""
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 200, "reason": "Testing very_poor rating"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["rating"] == "very_poor", f"Expected 'very_poor' for score 200, got {data['rating']}"
        print(f"Score 200 = Rating: {data['rating']} ({data['rating_label']})")
    
    def test_restore_default_score(self, admin_token):
        """Restore score to 500 (default)"""
        requests.put(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token},
            json={"score": 500, "reason": "Restoring default score after tests"}
        )
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/credit-score",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["score"] == 500
        print(f"Score restored to default: {data['score']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
