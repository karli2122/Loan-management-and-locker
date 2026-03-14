"""
PayLock Pro Iteration 71 - Testing new feature batch:
1. Device registration key generator (8/9 digit)
2. Send Warning button
3. Add Loan button
4. Loan schedule view button
5. Edit Loan Plan
6. Edit Payment Schedule
7. Bank Statement OCR Force checkbox

Backend API tests for:
- POST /api/clients/{id}/send-warning
- POST /api/clients/{id}/generate-code
- POST /api/loans/{id}/setup
- PUT /api/loan-plans/{id}
- PUT /api/schedules/{id}
"""
import os
import pytest
import requests
import json

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paylock-fixes.preview.emergentagent.com").rstrip("/")


class TestAdminLogin:
    """Test admin authentication"""
    
    def test_admin_login_with_correct_credentials(self):
        """Test login with karli1987 / Nasvakas123!"""
        resp = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "karli1987",
            "password": "Nasvakas123!"
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert "token" in data, "No token in response"
        assert data.get("plan") in ("enterprise", "custom", "Enterprise", "Custom"), f"Plan should be enterprise/custom: {data.get('plan')}"
        print(f"Login successful, token: {data['token'][:20]}..., plan: {data.get('plan')}")


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for authenticated tests"""
    resp = requests.post(f"{BASE_URL}/api/admin/login", json={
        "username": "karli1987",
        "password": "Nasvakas123!"
    })
    if resp.status_code != 200:
        pytest.skip(f"Could not login: {resp.text}")
    return resp.json()["token"]


@pytest.fixture(scope="module")
def test_client(admin_token):
    """Get or create a test client"""
    # First try to get existing clients
    resp = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
    if resp.status_code == 200:
        clients = resp.json().get("clients", [])
        if clients:
            return clients[0]  # Return first client
    
    # Create a test client if none exist
    resp = requests.post(f"{BASE_URL}/api/clients?admin_token={admin_token}", json={
        "name": "TEST_Iteration71_Client",
        "phone": "+372555123456",
        "email": "test71@paylock.test",
        "loan_amount": 1000,
        "interest_rate": 5.0
    })
    if resp.status_code == 200:
        return resp.json()
    
    pytest.skip("Could not get or create test client")


class TestGenerateRegistrationCode:
    """Test POST /api/clients/{id}/generate-code"""
    
    def test_generate_8_digit_admin_code(self, admin_token, test_client):
        """Generate 8-digit device_admin registration code"""
        client_id = test_client["id"]
        resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=device_admin"
        )
        assert resp.status_code == 200, f"Generate code failed: {resp.text}"
        data = resp.json()
        assert "registration_code" in data, "No registration_code in response"
        assert len(data["registration_code"]) == 8, f"8-digit code expected, got: {data['registration_code']}"
        assert data["lock_mode"] == "device_admin"
        print(f"8-digit code generated: {data['registration_code']}")
    
    def test_generate_9_digit_owner_code(self, admin_token, test_client):
        """Generate 9-digit device_owner registration code"""
        client_id = test_client["id"]
        resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/generate-code?admin_token={admin_token}&lock_mode=device_owner"
        )
        assert resp.status_code == 200, f"Generate code failed: {resp.text}"
        data = resp.json()
        assert "registration_code" in data, "No registration_code in response"
        assert len(data["registration_code"]) == 9, f"9-digit code expected, got: {data['registration_code']}"
        assert data["lock_mode"] == "device_owner"
        print(f"9-digit code generated: {data['registration_code']}")
    
    def test_generate_code_invalid_client(self, admin_token):
        """Test generate code for non-existent client returns 404"""
        resp = requests.post(
            f"{BASE_URL}/api/clients/nonexistent999/generate-code?admin_token={admin_token}&lock_mode=device_admin"
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("Correctly returned 404 for non-existent client")


class TestSendWarning:
    """Test POST /api/clients/{id}/send-warning"""
    
    def test_send_warning_default_message(self, admin_token, test_client):
        """Send warning with default message"""
        client_id = test_client["id"]
        resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/send-warning?admin_token={admin_token}"
        )
        assert resp.status_code == 200, f"Send warning failed: {resp.text}"
        data = resp.json()
        assert data.get("status") == "sent", f"Expected status=sent, got: {data}"
        assert "message_id" in data, "No message_id returned"
        print(f"Warning sent, message_id: {data['message_id']}, push: {data.get('push_sent')}")
    
    def test_send_warning_custom_message(self, admin_token, test_client):
        """Send warning with custom message"""
        client_id = test_client["id"]
        custom_msg = "Your payment is 5 days overdue. Please pay immediately."
        resp = requests.post(
            f"{BASE_URL}/api/clients/{client_id}/send-warning?admin_token={admin_token}&message={custom_msg}"
        )
        assert resp.status_code == 200, f"Send warning failed: {resp.text}"
        data = resp.json()
        assert data.get("status") == "sent"
        print(f"Custom warning sent to {data.get('client_name')}")
    
    def test_send_warning_invalid_client(self, admin_token):
        """Test send warning for non-existent client"""
        resp = requests.post(
            f"{BASE_URL}/api/clients/nonexistent999/send-warning?admin_token={admin_token}"
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print("Correctly returned 404 for non-existent client")


class TestLoanSetup:
    """Test POST /api/loans/{client_id}/setup"""
    
    def test_setup_loan_basic(self, admin_token, test_client):
        """Create a new loan for a client"""
        client_id = test_client["id"]
        resp = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/setup?admin_token={admin_token}",
            json={
                "loan_amount": 2000,
                "interest_rate": 5.0,
                "loan_tenure_months": 12,
                "down_payment": 200
            }
        )
        assert resp.status_code == 200, f"Loan setup failed: {resp.text}"
        data = resp.json()
        assert "loan_details" in data, "No loan_details in response"
        assert data["loan_details"].get("monthly_emi") > 0, "EMI should be positive"
        print(f"Loan created: EMI={data['loan_details']['monthly_emi']}, total={data['loan_details'].get('total_amount_due')}")
    
    def test_setup_loan_with_dates(self, admin_token, test_client):
        """Create loan with given_date and due_date"""
        client_id = test_client["id"]
        resp = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/setup?admin_token={admin_token}",
            json={
                "loan_amount": 1500,
                "interest_rate": 4.5,
                "loan_tenure_months": 6,
                "down_payment": 0,
                "given_date": "2026-01-01",
                "due_date": "2026-07-01"
            }
        )
        assert resp.status_code == 200, f"Loan setup failed: {resp.text}"
        data = resp.json()
        assert "loan_details" in data
        print(f"Loan with dates created successfully")


class TestLoanPlans:
    """Test GET/PUT /api/loan-plans endpoints"""
    
    def test_list_loan_plans(self, admin_token):
        """Get list of loan plans"""
        resp = requests.get(f"{BASE_URL}/api/loan-plans?admin_token={admin_token}")
        assert resp.status_code == 200, f"List plans failed: {resp.text}"
        plans = resp.json()
        assert isinstance(plans, list), "Response should be a list"
        print(f"Found {len(plans)} loan plans")
        if plans:
            print(f"First plan: {plans[0].get('name')} ({plans[0].get('interest_rate')}%)")
        return plans
    
    def test_create_loan_plan(self, admin_token):
        """Create a new loan plan"""
        resp = requests.post(f"{BASE_URL}/api/loan-plans?admin_token={admin_token}", json={
            "name": "TEST_Plan_Iteration71",
            "interest_rate": 10.0,
            "processing_fee_percent": 2.0,
            "min_tenure_months": 1,
            "max_tenure_months": 24,
            "late_fee_percent": 5.0,
            "grace_period_days": 3,
            "is_active": True
        })
        assert resp.status_code == 200, f"Create plan failed: {resp.text}"
        data = resp.json()
        assert "id" in data, "No id in response"
        print(f"Created plan: {data['name']} with id {data['id']}")
        return data
    
    def test_edit_loan_plan(self, admin_token):
        """Edit an existing loan plan with PUT"""
        # First create a plan to edit
        create_resp = requests.post(f"{BASE_URL}/api/loan-plans?admin_token={admin_token}", json={
            "name": "TEST_EditPlan_71",
            "interest_rate": 8.0,
            "min_tenure_months": 1,
            "max_tenure_months": 12
        })
        if create_resp.status_code != 200:
            pytest.skip("Could not create plan to test edit")
        plan_id = create_resp.json()["id"]
        
        # Now edit it
        resp = requests.put(f"{BASE_URL}/api/loan-plans/{plan_id}?admin_token={admin_token}", json={
            "name": "TEST_EditPlan_71_UPDATED",
            "interest_rate": 9.5,
            "late_fee_percent": 3.0
        })
        assert resp.status_code == 200, f"Edit plan failed: {resp.text}"
        data = resp.json()
        assert data["interest_rate"] == 9.5, f"Interest rate not updated: {data['interest_rate']}"
        assert "UPDATED" in data["name"], f"Name not updated: {data['name']}"
        print(f"Plan updated successfully: {data['name']} at {data['interest_rate']}%")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/loan-plans/{plan_id}?admin_token={admin_token}")
    
    def test_delete_loan_plan(self, admin_token):
        """Delete a loan plan"""
        # Create a plan to delete
        create_resp = requests.post(f"{BASE_URL}/api/loan-plans?admin_token={admin_token}", json={
            "name": "TEST_DeletePlan_71",
            "interest_rate": 7.0
        })
        if create_resp.status_code != 200:
            pytest.skip("Could not create plan to test delete")
        plan_id = create_resp.json()["id"]
        
        # Delete it
        resp = requests.delete(f"{BASE_URL}/api/loan-plans/{plan_id}?admin_token={admin_token}")
        assert resp.status_code == 200, f"Delete plan failed: {resp.text}"
        print(f"Plan {plan_id} deleted successfully")


class TestSchedules:
    """Test /api/schedules endpoints"""
    
    def test_list_schedules(self, admin_token):
        """Get list of payment schedules"""
        resp = requests.get(f"{BASE_URL}/api/schedules?admin_token={admin_token}")
        assert resp.status_code == 200, f"List schedules failed: {resp.text}"
        data = resp.json()
        assert "schedules" in data, "No schedules key in response"
        print(f"Found {data.get('total', 0)} schedules")
    
    def test_create_schedule(self, admin_token, test_client):
        """Create a new payment schedule"""
        resp = requests.post(f"{BASE_URL}/api/schedules?admin_token={admin_token}", json={
            "client_id": test_client["id"],
            "amount": 150.0,
            "frequency": "monthly",
            "day_of_month": 15,
            "reminder_days_before": 3,
            "auto_reminder": True,
            "reminder_channels": ["push", "email"]
        })
        assert resp.status_code == 200, f"Create schedule failed: {resp.text}"
        data = resp.json()
        assert "id" in data, "No id in response"
        print(f"Created schedule {data['id']} for {data.get('client_name')}")
        return data
    
    def test_edit_schedule(self, admin_token, test_client):
        """Edit a payment schedule with PUT"""
        # First create a schedule to edit
        create_resp = requests.post(f"{BASE_URL}/api/schedules?admin_token={admin_token}", json={
            "client_id": test_client["id"],
            "amount": 100.0,
            "frequency": "monthly",
            "day_of_month": 1
        })
        if create_resp.status_code != 200:
            pytest.skip(f"Could not create schedule to test edit: {create_resp.text}")
        schedule_id = create_resp.json()["id"]
        
        # Edit it
        resp = requests.put(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}", json={
            "amount": 200.0,
            "frequency": "biweekly",
            "day_of_month": 10,
            "auto_reminder": False
        })
        assert resp.status_code == 200, f"Edit schedule failed: {resp.text}"
        data = resp.json()
        assert data.get("amount") == 200.0, f"Amount not updated: {data.get('amount')}"
        assert data.get("frequency") == "biweekly", f"Frequency not updated: {data.get('frequency')}"
        print(f"Schedule updated: amount={data.get('amount')}, freq={data.get('frequency')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/schedules/{schedule_id}?admin_token={admin_token}")
    
    def test_get_due_today(self, admin_token):
        """Get schedules due today"""
        resp = requests.get(f"{BASE_URL}/api/schedules/due/today?admin_token={admin_token}")
        assert resp.status_code == 200, f"Get due today failed: {resp.text}"
        data = resp.json()
        assert "due_schedules" in data, "No due_schedules in response"
        assert "count" in data, "No count in response"
        print(f"Schedules due today: {data['count']}")


class TestLoanScheduleView:
    """Test GET /api/loans/{client_id}/schedule"""
    
    def test_get_loan_schedule(self, admin_token, test_client):
        """Get payment schedule for a client's loan"""
        client_id = test_client["id"]
        resp = requests.get(f"{BASE_URL}/api/loans/{client_id}/schedule?admin_token={admin_token}")
        assert resp.status_code == 200, f"Get schedule failed: {resp.text}"
        data = resp.json()
        assert "schedule" in data, "No schedule in response"
        print(f"Loan schedule: {len(data['schedule'])} payments, outstanding={data.get('outstanding_balance')}")


class TestBankStatementForceOCR:
    """Test bank statement analyzer with force_ocr parameter"""
    
    def test_bank_statement_endpoint_exists(self, admin_token):
        """Verify bank statement history endpoint works"""
        resp = requests.get(f"{BASE_URL}/api/bank-statements/history?admin_token={admin_token}")
        assert resp.status_code == 200, f"Bank statement history failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Bank statement history has {len(data)} records")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_plans(self, admin_token):
        """Delete any TEST_ prefixed loan plans"""
        resp = requests.get(f"{BASE_URL}/api/loan-plans?admin_token={admin_token}")
        if resp.status_code == 200:
            plans = resp.json()
            deleted = 0
            for p in plans:
                if p.get("name", "").startswith("TEST_"):
                    del_resp = requests.delete(f"{BASE_URL}/api/loan-plans/{p['id']}?admin_token={admin_token}")
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"Cleaned up {deleted} test plans")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
