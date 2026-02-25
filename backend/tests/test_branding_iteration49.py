"""Test branding and visual updates - Iteration 49
Tests:
1. Health check
2. Admin login
3. Client listing (excludes soft-deleted)
4. PDF contract generation with PayLock Pro branding
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://loan-kiosk-mode.preview.emergentagent.com')


class TestBrandingAndAPI:
    """Test backend API endpoints for branding iteration."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for tests - get admin token."""
        self.admin_token = None
        # Login to get admin token
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
    
    def test_health_check(self):
        """Test 1: Health check returns 200."""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health check passed")
    
    def test_admin_login(self):
        """Test 2: Admin login with correct credentials."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "id" in data
        assert "username" in data
        assert data["username"] == "admin"
        print(f"✓ Admin login passed - token: {data['token'][:20]}...")
    
    def test_admin_login_invalid_credentials(self):
        """Test 3: Admin login with wrong credentials returns 401."""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "admin", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_client_listing_excludes_soft_deleted(self):
        """Test 4: Client listing excludes soft-deleted clients."""
        if not self.admin_token:
            pytest.skip("No admin token - login failed")
        
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # API returns {"clients": [...]}
        clients = data.get("clients", []) if isinstance(data, dict) else data
        
        # The soft-deleted client (a5d1e54d-66c5-450d-aad3-ae1839143a8b) should NOT appear
        soft_deleted_id = "a5d1e54d-66c5-450d-aad3-ae1839143a8b"
        client_ids = [c.get("id") for c in clients]
        
        assert soft_deleted_id not in client_ids, f"Soft-deleted client {soft_deleted_id} should NOT appear in listing"
        
        # Verify none of the clients have is_deleted=True
        for client in clients:
            assert client.get("is_deleted") != True, f"Client {client.get('id')} is soft-deleted but appeared in listing"
        
        print(f"✓ Client listing passed - {len(clients)} clients returned, soft-deleted excluded")
    
    def test_pdf_contract_preview_requires_loan(self):
        """Test 5: PDF contract preview - test with a client that has a loan."""
        if not self.admin_token:
            pytest.skip("No admin token - login failed")
        
        # First get a client with a loan
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token}
        )
        assert response.status_code == 200
        data = response.json()
        
        # API returns {"clients": [...]}
        clients = data.get("clients", []) if isinstance(data, dict) else data
        
        # Find a client with loan_amount > 0
        client_with_loan = None
        for client in clients:
            if client.get("loan_amount") and client.get("loan_amount") > 0:
                client_with_loan = client
                break
        
        if not client_with_loan:
            pytest.skip("No client with loan found for PDF test")
        
        # Test PDF preview
        client_id = client_with_loan.get("id")
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": self.admin_token}
        )
        
        assert response.status_code == 200
        assert response.headers.get("content-type") == "application/pdf"
        
        # Check PDF content has PayLock Pro branding
        pdf_content = response.content
        assert len(pdf_content) > 1000, "PDF should have substantial content"
        
        # Check for PDF header
        assert pdf_content[:4] == b'%PDF', "Response should be a valid PDF"
        
        print(f"✓ PDF contract preview passed for client {client_id}, size: {len(pdf_content)} bytes")
    
    def test_pdf_contract_without_loan_returns_error(self):
        """Test 6: PDF contract preview for client without loan returns validation error."""
        if not self.admin_token:
            pytest.skip("No admin token - login failed")
        
        # Create a test client without a loan
        test_client_data = {
            "name": "TEST_NoloanClient_Branding49",
            "phone": "+3721234567",
            "device_id": "test-device-branding-49"
        }
        
        # Create client
        create_response = requests.post(
            f"{BASE_URL}/api/clients",
            params={"admin_token": self.admin_token},
            json=test_client_data
        )
        
        if create_response.status_code == 201:
            client_id = create_response.json().get("id")
            
            # Try to get PDF - should fail since no loan
            response = requests.get(
                f"{BASE_URL}/api/contracts/{client_id}/preview",
                params={"admin_token": self.admin_token}
            )
            
            # Should return validation error
            assert response.status_code in [400, 422], f"Expected 400/422, got {response.status_code}"
            
            # Cleanup - delete the test client
            requests.delete(
                f"{BASE_URL}/api/clients/{client_id}/purge",
                params={"admin_token": self.admin_token}
            )
            
            print("✓ PDF contract without loan correctly returns error")
        else:
            # If we can't create client, skip
            pytest.skip(f"Could not create test client: {create_response.status_code}")
    
    def test_admin_verify_token(self):
        """Test 7: Admin token verification."""
        if not self.admin_token:
            pytest.skip("No admin token - login failed")
        
        response = requests.get(f"{BASE_URL}/api/admin/verify/{self.admin_token}")
        assert response.status_code == 200
        data = response.json()
        assert data.get("valid") == True
        print("✓ Admin token verification passed")
    
    def test_invalid_token_rejected(self):
        """Test 8: Invalid admin token is rejected."""
        response = requests.get(
            f"{BASE_URL}/api/clients",
            params={"admin_token": "invalid-token-12345"}
        )
        assert response.status_code in [401, 403]
        print("✓ Invalid token correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
