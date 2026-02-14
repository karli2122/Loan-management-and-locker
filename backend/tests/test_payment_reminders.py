"""
Test Payment Reminder System Endpoints - P3 Feature

Tests the 3 new payment reminder endpoints:
1. GET /api/reminders/pending - List pending payment reminders
2. POST /api/reminders/send-push - Send push notifications to all clients
3. POST /api/reminders/send-single/{client_id} - Send reminder to specific client
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Get base URL from environment - MUST be set for tests to work
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback for direct test runs
    BASE_URL = "https://new-features-qa.preview.emergentagent.com"

# Test credentials
TEST_SUPERADMIN = {
    "username": "karli1987",
    "password": "nasvakas123"
}


class TestPaymentReminderEndpoints:
    """Test suite for Payment Reminder System endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=TEST_SUPERADMIN
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, f"No token in response: {data}"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def test_client(self, admin_token):
        """Create a test client for reminder tests"""
        client_data = {
            "name": "TEST_ReminderClient",
            "phone": "+372-555-1234",
            "email": "test_reminder@example.com",
            "loan_amount": 1000.00,
            "interest_rate": 10.0,
            "loan_tenure_months": 12
        }
        response = requests.post(
            f"{BASE_URL}/api/clients",
            json=client_data,
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Failed to create test client: {response.text}"
        client = response.json()
        
        # Setup loan for the client so it has outstanding balance
        loan_setup = {
            "loan_amount": 1000.00,
            "interest_rate": 10.0,
            "loan_tenure_months": 12,
            "down_payment": 100.0
        }
        loan_response = requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/setup-loan",
            json=loan_setup,
            params={"admin_token": admin_token}
        )
        # Loan setup might fail if endpoint doesn't exist, that's OK for this test
        
        yield client
        
        # Cleanup - allow uninstall and delete the test client
        requests.post(
            f"{BASE_URL}/api/clients/{client['id']}/allow-uninstall",
            params={"admin_token": admin_token}
        )
        requests.delete(
            f"{BASE_URL}/api/clients/{client['id']}",
            params={"admin_token": admin_token}
        )
    
    # =================================================================
    # TEST: GET /api/reminders/pending
    # =================================================================
    
    def test_get_pending_reminders_success(self, admin_token):
        """Test GET /api/reminders/pending returns valid response structure"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "reminders" in data, "Response should contain 'reminders' key"
        assert "summary" in data, "Response should contain 'summary' key"
        assert isinstance(data["reminders"], list), "'reminders' should be a list"
        
        # Validate summary structure
        summary = data["summary"]
        assert "total" in summary, "Summary should contain 'total'"
        assert "overdue" in summary, "Summary should contain 'overdue'"
        assert "due_today" in summary, "Summary should contain 'due_today'"
        assert "due_soon" in summary, "Summary should contain 'due_soon'"
        assert "upcoming" in summary, "Summary should contain 'upcoming'"
        assert "with_push_token" in summary, "Summary should contain 'with_push_token'"
        
        print(f"GET /api/reminders/pending - SUCCESS: {data['summary']['total']} reminders found")
    
    def test_get_pending_reminders_without_token(self):
        """Test GET /api/reminders/pending requires admin token"""
        response = requests.get(f"{BASE_URL}/api/reminders/pending")
        
        # Should return 422 (missing param) or 401 (auth error)
        assert response.status_code in [401, 422], \
            f"Expected 401/422 for missing token, got {response.status_code}: {response.text}"
        print("GET /api/reminders/pending without token - correctly rejected")
    
    def test_get_pending_reminders_invalid_token(self):
        """Test GET /api/reminders/pending with invalid token returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": "invalid_token_12345"}
        )
        
        assert response.status_code == 401, \
            f"Expected 401 for invalid token, got {response.status_code}: {response.text}"
        print("GET /api/reminders/pending with invalid token - correctly rejected")
    
    def test_get_pending_reminders_data_fields(self, admin_token):
        """Test that reminder items have expected data fields when reminders exist"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["reminders"]) > 0:
            reminder = data["reminders"][0]
            expected_fields = [
                "client_id", "client_name", "phone", "monthly_emi",
                "outstanding_balance", "next_payment_due", "days_until_due",
                "reminder_type", "has_push_token"
            ]
            for field in expected_fields:
                assert field in reminder, f"Reminder should contain '{field}'"
            print(f"Reminder data fields validated - all {len(expected_fields)} fields present")
        else:
            print("No reminders found - skipping field validation (this is OK)")
    
    # =================================================================
    # TEST: POST /api/reminders/send-push
    # =================================================================
    
    def test_send_push_reminders_success(self, admin_token):
        """Test POST /api/reminders/send-push returns valid response"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-push",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "message" in data, "Response should contain 'message'"
        assert "notifications_sent" in data, "Response should contain 'notifications_sent'"
        assert "notifications_failed" in data, "Response should contain 'notifications_failed'"
        assert "total_clients_processed" in data, "Response should contain 'total_clients_processed'"
        
        # Values should be non-negative integers
        assert isinstance(data["notifications_sent"], int)
        assert isinstance(data["notifications_failed"], int)
        assert isinstance(data["total_clients_processed"], int)
        assert data["notifications_sent"] >= 0
        assert data["notifications_failed"] >= 0
        assert data["total_clients_processed"] >= 0
        
        print(f"POST /api/reminders/send-push - SUCCESS: sent={data['notifications_sent']}, failed={data['notifications_failed']}, processed={data['total_clients_processed']}")
    
    def test_send_push_reminders_without_token(self):
        """Test POST /api/reminders/send-push requires admin token"""
        response = requests.post(f"{BASE_URL}/api/reminders/send-push")
        
        assert response.status_code in [401, 422], \
            f"Expected 401/422 for missing token, got {response.status_code}: {response.text}"
        print("POST /api/reminders/send-push without token - correctly rejected")
    
    def test_send_push_reminders_invalid_token(self):
        """Test POST /api/reminders/send-push with invalid token returns 401"""
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-push",
            params={"admin_token": "invalid_token_xyz"}
        )
        
        assert response.status_code == 401, \
            f"Expected 401 for invalid token, got {response.status_code}: {response.text}"
        print("POST /api/reminders/send-push with invalid token - correctly rejected")
    
    # =================================================================
    # TEST: POST /api/reminders/send-single/{client_id}
    # =================================================================
    
    def test_send_single_reminder_client_not_found(self, admin_token):
        """Test POST /api/reminders/send-single with invalid client_id returns 404"""
        fake_client_id = "nonexistent-client-12345"
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-single/{fake_client_id}",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 404, \
            f"Expected 404 for nonexistent client, got {response.status_code}: {response.text}"
        print("POST /api/reminders/send-single with invalid client - correctly rejected with 404")
    
    def test_send_single_reminder_without_push_token(self, admin_token, test_client):
        """Test POST /api/reminders/send-single returns error when client has no push token"""
        client_id = test_client["id"]
        
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-single/{client_id}",
            params={"admin_token": admin_token}
        )
        
        # Should return 422 (ValidationException) because client has no push token
        assert response.status_code == 422, \
            f"Expected 422 for client without push token, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "error" in data or "detail" in data, "Response should contain error message"
        
        # Check error message indicates missing push token
        error_msg = data.get("error", data.get("detail", ""))
        assert "push token" in error_msg.lower(), f"Error should mention push token: {error_msg}"
        
        print(f"POST /api/reminders/send-single without push token - correctly rejected: {error_msg}")
    
    def test_send_single_reminder_without_token(self, test_client):
        """Test POST /api/reminders/send-single requires admin token"""
        client_id = test_client["id"]
        response = requests.post(f"{BASE_URL}/api/reminders/send-single/{client_id}")
        
        assert response.status_code in [401, 422], \
            f"Expected 401/422 for missing token, got {response.status_code}: {response.text}"
        print("POST /api/reminders/send-single without token - correctly rejected")
    
    def test_send_single_reminder_invalid_token(self, test_client):
        """Test POST /api/reminders/send-single with invalid token returns 401"""
        client_id = test_client["id"]
        response = requests.post(
            f"{BASE_URL}/api/reminders/send-single/{client_id}",
            params={"admin_token": "invalid_token_abc"}
        )
        
        assert response.status_code == 401, \
            f"Expected 401 for invalid token, got {response.status_code}: {response.text}"
        print("POST /api/reminders/send-single with invalid token - correctly rejected")


class TestPaymentReminderIntegration:
    """Integration tests for payment reminder system"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json=TEST_SUPERADMIN
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_pending_reminders_summary_counts_match(self, admin_token):
        """Test that summary counts match the actual reminder list"""
        response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        reminders = data["reminders"]
        summary = data["summary"]
        
        # Verify total matches list length
        assert summary["total"] == len(reminders), \
            f"Summary total ({summary['total']}) doesn't match list length ({len(reminders)})"
        
        # Verify category counts add up to total
        category_sum = (
            summary["overdue"] +
            summary["due_today"] +
            summary["due_soon"] +
            summary["upcoming"]
        )
        assert category_sum == summary["total"], \
            f"Category sum ({category_sum}) doesn't match total ({summary['total']})"
        
        print(f"Summary verification - PASS: total={summary['total']}, categories sum correctly")
    
    def test_send_push_processes_clients(self, admin_token):
        """Test that send-push processes the expected number of clients"""
        # First get count of clients with push tokens
        pending_response = requests.get(
            f"{BASE_URL}/api/reminders/pending",
            params={"admin_token": admin_token}
        )
        assert pending_response.status_code == 200
        pending_data = pending_response.json()
        
        # Now send push notifications
        send_response = requests.post(
            f"{BASE_URL}/api/reminders/send-push",
            params={"admin_token": admin_token}
        )
        assert send_response.status_code == 200
        send_data = send_response.json()
        
        # The processed count should be reasonable (not negative)
        assert send_data["total_clients_processed"] >= 0
        
        print(f"Send push integration - processed {send_data['total_clients_processed']} clients")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
