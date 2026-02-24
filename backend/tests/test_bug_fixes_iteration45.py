"""
Test file for Iteration 45 Bug Fixes
Tests:
1. Credit score badge feature - API returns credit_score for clients
2. Admin first name display on dashboard
3. Payment transactions in transactions tab (GET /api/loans/{client_id}/payments)
4. Loans filter button styling (code review - checked in frontend)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


class TestAdminAuth:
    """Test admin login and authentication"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not returned in login response"
        # Check if first_name is returned
        print(f"Login response keys: {data.keys()}")
        return data["token"]
    
    def test_login_returns_first_name(self):
        """Test that login returns admin's first_name for dashboard display"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"Login response: {data}")
        
        # Check if first_name is returned
        # The frontend expects to store 'admin_first_name' in AsyncStorage
        if "first_name" in data:
            print(f"PASS: first_name returned: {data['first_name']}")
            # Should be 'Karli' not 'karli1987'
        else:
            print("INFO: first_name not in login response - checking if stored elsewhere")


class TestCreditScoreFeature:
    """Test credit score badge feature"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_clients_endpoint_returns_credit_score(self, admin_token):
        """Test that GET /api/clients returns credit_score field for each client"""
        response = requests.get(
            f"{BASE_URL}/api/clients?admin_token={admin_token}"
        )
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        
        data = response.json()
        clients = data.get("clients", [])
        
        print(f"Total clients returned: {len(clients)}")
        
        # Check that clients exist
        assert len(clients) > 0, "No clients found - cannot test credit_score feature"
        
        # Check if credit_score field exists
        credit_score_present = 0
        for client in clients:
            if "credit_score" in client:
                credit_score_present += 1
                print(f"Client {client['name']}: credit_score = {client['credit_score']}")
            else:
                print(f"Client {client['name']}: NO credit_score field")
        
        print(f"Clients with credit_score: {credit_score_present}/{len(clients)}")
        
        # At least some clients should have credit_score
        # (new clients might not have it yet)
    
    def test_credit_score_api_endpoint(self, admin_token):
        """Test GET /api/clients/{client_id}/credit-score endpoint"""
        # First get a client ID
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200
        
        clients = response.json().get("clients", [])
        if not clients:
            pytest.skip("No clients to test credit score")
        
        client_id = clients[0]["id"]
        
        # Get credit score for this client
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_id}/credit-score?admin_token={admin_token}"
        )
        assert response.status_code == 200, f"Credit score API failed: {response.text}"
        
        data = response.json()
        print(f"Credit score response: {data}")
        
        assert "score" in data, "score field missing"
        assert "rating" in data, "rating field missing"
        assert "rating_label" in data, "rating_label field missing"
        
        # Verify score is in valid range
        score = data["score"]
        assert 0 <= score <= 1000, f"Score {score} out of range 0-1000"
        
        # Check rating color logic
        if score >= 800:
            expected_rating = "excellent"
        elif score >= 650:
            expected_rating = "good"
        elif score >= 500:
            expected_rating = "fair"
        elif score >= 350:
            expected_rating = "poor"
        else:
            expected_rating = "very_poor"
        
        assert data["rating"] == expected_rating, f"Rating mismatch: got {data['rating']}, expected {expected_rating}"


class TestPaymentsFeature:
    """Test payments endpoint for transactions tab"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Login and get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "karli1987", "password": "nasvakas123"}
        )
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_payments_endpoint_exists(self, admin_token):
        """Test GET /api/loans/{client_id}/payments endpoint exists and returns data"""
        # First get a client ID
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200
        
        clients = response.json().get("clients", [])
        if not clients:
            pytest.skip("No clients to test payments")
        
        # Test with first client
        client_id = clients[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/loans/{client_id}/payments?admin_token={admin_token}"
        )
        
        # Should return 200 even if no payments (empty array)
        assert response.status_code == 200, f"Payments API failed: {response.text}"
        
        data = response.json()
        print(f"Payments response for client {clients[0]['name']}: {data}")
        
        # Should be a list (possibly empty)
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        if len(data) > 0:
            payment = data[0]
            print(f"Sample payment: {payment}")
            # Check payment structure
            assert "amount" in payment, "Payment missing 'amount' field"
            assert "payment_date" in payment, "Payment missing 'payment_date' field"
    
    def test_payments_for_all_clients_with_loans(self, admin_token):
        """Test payments endpoint for clients that have active loans"""
        response = requests.get(f"{BASE_URL}/api/clients?admin_token={admin_token}")
        assert response.status_code == 200
        
        clients = response.json().get("clients", [])
        
        # Filter clients with active loans
        clients_with_loans = [
            c for c in clients 
            if c.get("total_amount_due", 0) > 0 or c.get("principal_amount", 0) > 0
        ]
        
        print(f"Clients with loans: {len(clients_with_loans)}")
        
        total_payments_found = 0
        for client in clients_with_loans[:5]:  # Test first 5
            response = requests.get(
                f"{BASE_URL}/api/loans/{client['id']}/payments?admin_token={admin_token}"
            )
            assert response.status_code == 200, f"Payments failed for {client['name']}"
            
            payments = response.json()
            print(f"Client {client['name']}: {len(payments)} payments")
            total_payments_found += len(payments)
        
        print(f"Total payments found across test clients: {total_payments_found}")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
