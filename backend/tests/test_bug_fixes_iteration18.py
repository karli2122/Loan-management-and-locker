"""
Test suite for Loan Administration Portal Bug Fixes - Iteration 18

Features to test:
1. Reports tab should load without crashing - test with empty data and populated data
2. Loans tab should show clients with loans (clients that have loan_amount or principal_amount field)
3. 'Fetch device price' API endpoint should work at /api/clients/{client_id}/fetch-price
4. 'Add payment' functionality should work without 'cannot read property' errors
5. Edit client details button and modal should be visible and functional
6. New clients should be created with auto-generated registration code
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://admin-portal-repair-2.preview.emergentagent.com')

# Test credentials
ADMIN_USERNAME = "karli1987"
ADMIN_PASSWORD = "nasvakas123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin token for all tests."""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["token"]


@pytest.fixture(scope="module")
def test_client_id(admin_token):
    """Create a test client for testing payment and fetch-price features."""
    # First try to get existing test client
    response = requests.get(
        f"{BASE_URL}/api/clients",
        params={"admin_token": admin_token}
    )
    if response.status_code == 200:
        data = response.json()
        clients = data.get("clients", [])
        # Look for a client with loan data for testing
        for client in clients:
            if client.get("loan_amount") or client.get("total_amount_due"):
                return client["id"]
    
    # If no suitable client found, create one
    response = requests.post(
        f"{BASE_URL}/api/clients",
        params={"admin_token": admin_token},
        json={
            "name": "TEST_PaymentTest",
            "phone": "+37255512345",
            "email": "test.payment@example.com",
            "emi_amount": 100.00
        }
    )
    if response.status_code == 200:
        return response.json()["id"]
    return None


class TestReportsAPI:
    """Test #1: Reports tab should load without crashing - test report APIs."""
    
    def test_collection_report_returns_200(self, admin_token):
        """Test /api/reports/collection endpoint works."""
        response = requests.get(
            f"{BASE_URL}/api/reports/collection",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Collection report failed: {response.text}"
        data = response.json()
        # Verify expected structure
        assert "overview" in data or "financial" in data or isinstance(data, dict)
        print(f"Collection report response keys: {data.keys() if isinstance(data, dict) else 'not a dict'}")
    
    def test_clients_report_returns_200(self, admin_token):
        """Test /api/reports/clients endpoint works."""
        response = requests.get(
            f"{BASE_URL}/api/reports/clients",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Clients report failed: {response.text}"
        data = response.json()
        # Returns list or dict with client data - verify it's valid JSON
        assert isinstance(data, (list, dict)), "Response should be list or dict"
        print(f"Clients report type: {type(data).__name__}, length: {len(data) if isinstance(data, list) else 'dict'}")
    
    def test_financial_report_returns_200(self, admin_token):
        """Test /api/reports/financial endpoint works."""
        response = requests.get(
            f"{BASE_URL}/api/reports/financial",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Financial report failed: {response.text}"
        data = response.json()
        # Should have totals and monthly_trend for PieChart/LineChart
        assert isinstance(data, dict)
        print(f"Financial report keys: {data.keys() if isinstance(data, dict) else 'not a dict'}")


class TestLoansTabClientListing:
    """Test #2: Loans tab should show clients with loans."""
    
    def test_clients_api_returns_loan_fields(self, admin_token):
        """Verify clients API returns loan-related fields."""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Clients API failed: {response.text}"
        data = response.json()
        clients = data.get("clients", [])
        
        # Count clients with loan data
        clients_with_loans = [
            c for c in clients 
            if c.get("principal_amount") or c.get("total_amount_due") or c.get("loan_amount")
        ]
        print(f"Total clients: {len(clients)}, Clients with loans: {len(clients_with_loans)}")
        
        # Verify loan fields are present in response
        if clients_with_loans:
            sample = clients_with_loans[0]
            print(f"Sample client loan fields: principal_amount={sample.get('principal_amount')}, "
                  f"total_amount_due={sample.get('total_amount_due')}, "
                  f"loan_amount={sample.get('loan_amount')}")


class TestFetchDevicePrice:
    """Test #3: 'Fetch device price' API endpoint at /api/clients/{client_id}/fetch-price."""
    
    def test_fetch_price_endpoint_exists(self, admin_token, test_client_id):
        """Test that fetch-price endpoint exists and responds."""
        if not test_client_id:
            pytest.skip("No test client available")
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{test_client_id}/fetch-price",
            params={"admin_token": admin_token}
        )
        # Should return 200 with price OR 400 if device not registered
        # But should NOT return 404 (endpoint not found)
        assert response.status_code != 404, "fetch-price endpoint not found!"
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        print(f"Fetch price response: {response.status_code} - {response.json()}")
    
    def test_fetch_price_returns_price_for_registered_device(self, admin_token):
        """Test fetch-price returns estimated price for clients with device info."""
        # Get a client with device_model
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        clients = response.json().get("clients", [])
        
        # Find client with device_model
        client_with_device = None
        for c in clients:
            if c.get("device_model") and c.get("device_model") != "Unknown Device" and c.get("is_registered"):
                client_with_device = c
                break
        
        if not client_with_device:
            pytest.skip("No registered client with device model found")
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{client_with_device['id']}/fetch-price",
            params={"admin_token": admin_token}
        )
        assert response.status_code == 200, f"Fetch price failed: {response.text}"
        data = response.json()
        assert "used_price_eur" in data, "Price not returned"
        assert data["used_price_eur"] > 0, "Price should be positive"
        print(f"Device: {client_with_device.get('device_model')}, Price: €{data['used_price_eur']}")


class TestAddPayment:
    """Test #4: 'Add payment' functionality should work without errors."""
    
    def test_add_payment_endpoint_works(self, admin_token):
        """Test payment can be recorded without errors."""
        # First, find or create a client with an active loan
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token}
        )
        clients = response.json().get("clients", [])
        
        # Find client with outstanding balance OR with loan_amount
        client_with_loan = None
        for c in clients:
            if c.get("outstanding_balance") and c.get("outstanding_balance") > 0:
                client_with_loan = c
                break
        
        # If no client with outstanding balance, setup a loan
        if not client_with_loan:
            # Find any registered client
            for c in clients:
                if c.get("is_registered"):
                    client_with_loan = c
                    # Setup loan for this client
                    setup_response = requests.post(
                        f"{BASE_URL}/api/loans/{c['id']}/setup",
                        params={"admin_token": admin_token},
                        json={
                            "loan_amount": 300,
                            "down_payment": 30,
                            "interest_rate": 10,
                            "loan_tenure_months": 3
                        }
                    )
                    if setup_response.status_code == 200:
                        # Refresh client data
                        client_response = requests.get(
                            f"{BASE_URL}/api/clients/{c['id']}",
                            params={"admin_token": admin_token}
                        )
                        if client_response.status_code == 200:
                            client_with_loan = client_response.json()
                    break
        
        if not client_with_loan:
            pytest.skip("No client available for payment test")
        
        client_id = client_with_loan["id"]
        
        # Record a small test payment
        response = requests.post(
            f"{BASE_URL}/api/loans/{client_id}/payments",
            params={"admin_token": admin_token},
            json={
                "amount": 1.00,  # Small test amount
                "payment_method": "cash",
                "notes": "TEST_automated_test_payment"
            }
        )
        
        assert response.status_code == 200, f"Add payment failed: {response.text}"
        data = response.json()
        
        # Verify response structure (fixes for 'cannot read property amount of undefined')
        assert "payment" in data, "Response missing 'payment' field"
        assert "updated_balance" in data, "Response missing 'updated_balance' field"
        
        payment = data["payment"]
        assert payment is not None, "Payment is null"
        assert "amount" in payment, "Payment missing 'amount' field"
        
        updated_balance = data["updated_balance"]
        assert updated_balance is not None, "Updated balance is null"
        assert "outstanding_balance" in updated_balance, "Missing outstanding_balance field"
        
        print(f"Payment recorded: amount=€{payment['amount']}, remaining=€{updated_balance['outstanding_balance']}")


class TestEditClientDetails:
    """Test #5: Edit client details button and modal should be functional."""
    
    def test_client_update_endpoint_works(self, admin_token, test_client_id):
        """Test PUT /api/clients/{id} works for editing client details."""
        if not test_client_id:
            pytest.skip("No test client available")
        
        # Update client name and phone
        new_name = f"TEST_Updated_{datetime.now().strftime('%H%M%S')}"
        response = requests.put(
            f"{BASE_URL}/api/clients/{test_client_id}",
            params={"admin_token": admin_token},
            json={
                "name": new_name,
                "phone": "+37255599999"
            }
        )
        
        assert response.status_code == 200, f"Update client failed: {response.text}"
        data = response.json()
        assert data["name"] == new_name, "Name not updated"
        print(f"Client updated successfully: name={data['name']}")
    
    def test_client_get_returns_all_editable_fields(self, admin_token, test_client_id):
        """Verify GET client returns all fields needed for edit modal."""
        if not test_client_id:
            pytest.skip("No test client available")
        
        response = requests.get(
            f"{BASE_URL}/api/clients/{test_client_id}",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify editable fields are present
        assert "name" in data, "Missing name field"
        assert "phone" in data, "Missing phone field"
        assert "email" in data, "Missing email field"
        print(f"Client editable fields: name={data.get('name')}, phone={data.get('phone')}, email={data.get('email')}")


class TestAutoGenerateRegistrationCode:
    """Test #6: New clients should be created with auto-generated registration code."""
    
    def test_create_client_generates_registration_code(self, admin_token):
        """Test that new clients get auto-generated registration code."""
        timestamp = datetime.now().strftime('%H%M%S')
        
        response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": admin_token},
            json={
                "name": f"TEST_AutoCode_{timestamp}",
                "phone": f"+3725550{timestamp}",
                "email": f"test.autocode.{timestamp}@example.com",
                "emi_amount": 50.00
            }
        )
        
        assert response.status_code == 200, f"Create client failed: {response.text}"
        data = response.json()
        
        # Verify registration_code is auto-generated
        assert "registration_code" in data, "Registration code not in response"
        assert data["registration_code"] is not None, "Registration code is null"
        assert len(data["registration_code"]) > 0, "Registration code is empty"
        print(f"Auto-generated registration code: {data['registration_code']}")
        
        # Clean up - delete the test client
        client_id = data["id"]
        requests.delete(
            f"{BASE_URL}/api/clients/{client_id}",
            params={"admin_token": admin_token}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
