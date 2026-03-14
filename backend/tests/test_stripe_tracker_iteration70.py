"""
Test Stripe Payment Tracker Dashboard Widget (Iteration 70)
- GET /api/stripe/payment-tracker - returns list of Stripe payments with summary stats
- POST /api/stripe/refresh-payment/{id} - refreshes a pending payment's status from Stripe
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://paylock-fixes.preview.emergentagent.com').rstrip('/')


class TestAdminAuth:
    """Authenticate for all tests"""
    
    def test_admin_login(self):
        """Login as admin to get token for subsequent tests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["token"]
        # Store token for other tests
        pytest.admin_token = data["token"]
        print(f"✓ Admin login successful, token acquired")


class TestStripePaymentTracker:
    """Tests for GET /api/stripe/payment-tracker endpoint"""
    
    def test_payment_tracker_returns_payments_list(self):
        """Verify payment tracker returns a list of payments"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "payments" in data
        assert "summary" in data
        assert isinstance(data["payments"], list)
        print(f"✓ Payment tracker returns {len(data['payments'])} payments")
        
    def test_payment_tracker_summary_has_required_fields(self):
        """Verify summary has all required stats fields"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        summary = response.json()["summary"]
        
        # Verify summary fields
        assert "total" in summary
        assert "pending" in summary
        assert "succeeded" in summary
        assert "failed" in summary
        assert "pending_amount" in summary
        assert "succeeded_amount" in summary
        assert "failed_amount" in summary
        
        # Values should be numbers
        assert isinstance(summary["total"], int)
        assert isinstance(summary["pending"], int)
        assert isinstance(summary["succeeded"], int)
        assert isinstance(summary["failed"], int)
        assert isinstance(summary["pending_amount"], (int, float))
        assert isinstance(summary["succeeded_amount"], (int, float))
        print(f"✓ Summary: {summary['pending']} pending ({summary['pending_amount']}), {summary['succeeded']} succeeded ({summary['succeeded_amount']})")
    
    def test_payment_tracker_payment_item_structure(self):
        """Verify each payment item has required fields"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        payments = response.json()["payments"]
        
        if len(payments) > 0:
            payment = payments[0]
            required_fields = ["id", "client_id", "client_name", "amount", "currency", "status", "source", "created_at"]
            for field in required_fields:
                assert field in payment, f"Missing field: {field}"
            
            # Status should be one of expected values
            assert payment["status"] in ["pending", "succeeded", "failed", "unpaid"]
            # Source should be 'manual' or 'auto'
            assert payment["source"] in ["manual", "auto"]
            print(f"✓ Payment item structure valid: {payment['client_name']} - {payment['amount']} {payment['currency']} ({payment['status']})")
        else:
            pytest.skip("No payments found to verify structure")
    
    def test_payment_tracker_limit_parameter(self):
        """Verify limit parameter works"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token, "limit": 2}
        )
        assert response.status_code == 200
        payments = response.json()["payments"]
        assert len(payments) <= 2
        print(f"✓ Limit parameter works: returned {len(payments)} payments with limit=2")
    
    def test_payment_tracker_requires_auth(self):
        """Verify endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/stripe/payment-tracker")
        # Should return 422 (missing param) or 401 (unauthorized)
        assert response.status_code in [401, 422]
        print(f"✓ Auth required: status {response.status_code}")


class TestRefreshStripePayment:
    """Tests for POST /api/stripe/refresh-payment/{id} endpoint"""
    
    def test_refresh_payment_success(self):
        """Refresh a pending payment and get updated status"""
        # First get a payment ID
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        payments = response.json()["payments"]
        
        if not payments:
            pytest.skip("No payments to test refresh")
        
        # Get first pending payment
        pending_payments = [p for p in payments if p["status"] == "pending"]
        if not pending_payments:
            pytest.skip("No pending payments to refresh")
            
        payment_id = pending_payments[0]["id"]
        
        # Refresh it
        refresh_response = requests.post(
            f"{BASE_URL}/api/stripe/refresh-payment/{payment_id}",
            params={"admin_token": pytest.admin_token}
        )
        assert refresh_response.status_code == 200
        data = refresh_response.json()
        
        assert "status" in data
        assert "message" in data
        # Status should be valid
        assert data["status"] in ["pending", "succeeded", "failed", "unpaid"]
        print(f"✓ Refresh payment {payment_id}: status={data['status']}, message={data['message']}")
    
    def test_refresh_payment_not_found(self):
        """Test refresh with invalid payment ID returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/stripe/refresh-payment/invalid-uuid-12345",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()
        print(f"✓ Invalid payment ID returns 404: {data['detail']}")
    
    def test_refresh_payment_requires_auth(self):
        """Verify refresh endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/stripe/refresh-payment/some-id")
        assert response.status_code in [401, 422]
        print(f"✓ Refresh endpoint requires auth: status {response.status_code}")


class TestPaymentTrackerDataIntegrity:
    """Verify data integrity between endpoints"""
    
    def test_summary_counts_match_payments(self):
        """Verify summary counts match actual payment counts"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        payments = data["payments"]
        summary = data["summary"]
        
        # Count actual payments by status
        actual_pending = len([p for p in payments if p["status"] == "pending"])
        actual_succeeded = len([p for p in payments if p["status"] == "succeeded"])
        actual_failed = len([p for p in payments if p["status"] == "failed"])
        
        assert summary["total"] == len(payments), "Total count mismatch"
        assert summary["pending"] == actual_pending, "Pending count mismatch"
        assert summary["succeeded"] == actual_succeeded, "Succeeded count mismatch"
        assert summary["failed"] == actual_failed, "Failed count mismatch"
        print(f"✓ Summary counts match: total={summary['total']}, pending={actual_pending}, succeeded={actual_succeeded}, failed={actual_failed}")
    
    def test_summary_amounts_are_correct(self):
        """Verify summary amounts match summed payments"""
        response = requests.get(
            f"{BASE_URL}/api/stripe/payment-tracker",
            params={"admin_token": pytest.admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        payments = data["payments"]
        summary = data["summary"]
        
        # Calculate amounts
        pending_amount = sum(p["amount"] for p in payments if p["status"] == "pending")
        succeeded_amount = sum(p["amount"] for p in payments if p["status"] == "succeeded")
        failed_amount = sum(p["amount"] for p in payments if p["status"] == "failed")
        
        assert abs(summary["pending_amount"] - pending_amount) < 0.01, "Pending amount mismatch"
        assert abs(summary["succeeded_amount"] - succeeded_amount) < 0.01, "Succeeded amount mismatch"
        assert abs(summary["failed_amount"] - failed_amount) < 0.01, "Failed amount mismatch"
        print(f"✓ Summary amounts correct: pending={pending_amount:.2f}, succeeded={succeeded_amount:.2f}, failed={failed_amount:.2f}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
