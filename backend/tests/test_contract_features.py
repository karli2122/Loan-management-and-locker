"""
Contract Features Test - PDF Preview and Email Sending
Tests for: Regenerate Key button (uses 1 credit), Contract PDF preview, Contract email send
Test client with loan: TEST_Client_b6d4dc59 (ID: 765f8799-fd16-4656-8f64-15c1c7eb3ef0)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://loan-admin-portal-1.preview.emergentagent.com').rstrip('/')

# Test credentials
SUPERADMIN = {"username": "karli1987", "password": "nasvakas123"}
TEST_CLIENT_ID = "765f8799-fd16-4656-8f64-15c1c7eb3ef0"


@pytest.fixture(scope="module")
def admin_session():
    """Create authenticated admin session."""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    
    # Login
    response = session.post(f"{BASE_URL}/api/admin/login", json=SUPERADMIN)
    assert response.status_code == 200, f"Login failed: {response.text}"
    
    data = response.json()
    session.token = data["token"]
    session.admin_id = data["id"]
    session.is_super_admin = data.get("is_super_admin", False)
    
    return session


class TestAdminLogin:
    """Test POST /api/admin/login - admin authentication"""
    
    def test_admin_login_success(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json=SUPERADMIN)
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert "id" in data
        assert data["username"] == "karli1987"
        assert "is_super_admin" in data
        print(f"✓ Admin login success: is_super_admin={data['is_super_admin']}")
    
    def test_admin_login_invalid_credentials(self):
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "wrong_user",
            "password": "wrong_pass"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")


class TestClientsList:
    """Test GET /api/clients - list clients"""
    
    def test_list_clients(self, admin_session):
        response = admin_session.get(f"{BASE_URL}/api/clients?admin_token={admin_session.token}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} clients")
        
        # Check if test client exists
        test_client = next((c for c in data if c.get("id") == TEST_CLIENT_ID), None)
        if test_client:
            print(f"✓ Found test client: {test_client.get('name')}")
    
    def test_list_clients_no_token(self):
        response = requests.get(f"{BASE_URL}/api/clients")
        # Should fail without admin_token
        assert response.status_code in [401, 422], f"Expected 401/422 without token, got {response.status_code}"
        print("✓ Clients list correctly requires authentication")


class TestSingleClient:
    """Test GET /api/clients/{id} - get single client"""
    
    def test_get_client_by_id(self, admin_session):
        response = admin_session.get(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}?admin_token={admin_session.token}")
        
        if response.status_code == 404:
            pytest.skip(f"Test client {TEST_CLIENT_ID} not found - may have been deleted")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "id" in data
        assert "name" in data
        print(f"✓ Got client: {data.get('name')}")
        
        # Check loan fields if present
        if data.get("loan_amount"):
            print(f"  - loan_amount: {data.get('loan_amount')}")
            print(f"  - total_amount_due: {data.get('total_amount_due')}")
    
    def test_get_client_not_found(self, admin_session):
        response = admin_session.get(f"{BASE_URL}/api/clients/nonexistent-id?admin_token={admin_session.token}")
        assert response.status_code == 404
        print("✓ Nonexistent client correctly returns 404")


class TestAdminCredits:
    """Test GET /api/admin/credits - check admin credits"""
    
    def test_get_admin_credits(self, admin_session):
        response = admin_session.get(f"{BASE_URL}/api/admin/credits?admin_token={admin_session.token}")
        assert response.status_code == 200
        
        data = response.json()
        assert "credits" in data
        assert "is_super_admin" in data
        
        print(f"✓ Admin credits: {data['credits']}, is_super_admin: {data['is_super_admin']}")
        
        # For superadmin, verify is_super_admin flag
        if admin_session.is_super_admin:
            assert data["is_super_admin"] == True
    
    def test_credits_without_token(self):
        response = requests.get(f"{BASE_URL}/api/admin/credits")
        assert response.status_code in [401, 422]
        print("✓ Credits endpoint correctly requires authentication")


class TestGenerateCode:
    """Test POST /api/clients/{id}/generate-code - regenerate registration key"""
    
    def test_generate_code_for_client(self, admin_session):
        """Test that superadmin can regenerate code (should show 'unlimited' credits)"""
        # First get client to verify it exists
        client_response = admin_session.get(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}?admin_token={admin_session.token}")
        if client_response.status_code == 404:
            pytest.skip("Test client not found")
        
        # Generate new code
        response = admin_session.post(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}/generate-code?admin_token={admin_session.token}")
        assert response.status_code == 200
        
        data = response.json()
        assert "registration_code" in data
        assert "credits_remaining" in data
        
        print(f"✓ Generated new registration code: {data['registration_code']}")
        print(f"  - credits_remaining: {data['credits_remaining']}")
        
        # For superadmin, credits_remaining should be "unlimited"
        if admin_session.is_super_admin:
            assert data["credits_remaining"] == "unlimited", f"Expected 'unlimited' for superadmin, got {data['credits_remaining']}"
            print("✓ Superadmin correctly shows 'unlimited' credits")
    
    def test_generate_code_nonexistent_client(self, admin_session):
        response = admin_session.post(f"{BASE_URL}/api/clients/nonexistent-id/generate-code?admin_token={admin_session.token}")
        assert response.status_code == 404
        print("✓ Generate code for nonexistent client returns 404")


class TestContractPreview:
    """Test GET /api/contracts/{client_id}/preview - PDF contract generation"""
    
    def test_contract_preview_returns_pdf(self, admin_session):
        """Test that preview endpoint returns PDF content"""
        # First verify client exists and has loan
        client_response = admin_session.get(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}?admin_token={admin_session.token}")
        if client_response.status_code == 404:
            pytest.skip("Test client not found")
        
        client_data = client_response.json()
        if not client_data.get("loan_amount") or client_data.get("loan_amount", 0) <= 0:
            pytest.skip("Test client has no loan setup")
        
        # Request PDF preview
        response = admin_session.get(f"{BASE_URL}/api/contracts/{TEST_CLIENT_ID}/preview?admin_token={admin_session.token}")
        
        if response.status_code == 422:
            # Validation error - likely no loan set up
            print(f"⚠ Validation error (expected if no loan): {response.text}")
            pytest.skip("Client has no loan set up")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify PDF content
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content-type, got {content_type}"
        
        # Check PDF starts with PDF signature
        pdf_content = response.content
        assert pdf_content[:4] == b'%PDF', "Response does not contain valid PDF data"
        
        print(f"✓ Contract preview returns valid PDF ({len(pdf_content)} bytes)")
        
        # Check Content-Disposition header
        content_disp = response.headers.get("content-disposition", "")
        assert "laenuleping" in content_disp.lower() or "inline" in content_disp.lower()
        print(f"✓ PDF filename in header: {content_disp}")
    
    def test_contract_preview_nonexistent_client(self, admin_session):
        response = admin_session.get(f"{BASE_URL}/api/contracts/nonexistent-id/preview?admin_token={admin_session.token}")
        assert response.status_code == 404
        print("✓ Contract preview for nonexistent client returns 404")


class TestContractEmail:
    """Test POST /api/contracts/{client_id}/send-email - send contract via email"""
    
    def test_send_contract_email_sandbox_error(self, admin_session):
        """Test email sending - expected to return 400 due to Resend sandbox mode"""
        # First verify client exists and has email
        client_response = admin_session.get(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}?admin_token={admin_session.token}")
        if client_response.status_code == 404:
            pytest.skip("Test client not found")
        
        client_data = client_response.json()
        if not client_data.get("email"):
            pytest.skip("Test client has no email address")
        
        if not client_data.get("loan_amount") or client_data.get("loan_amount", 0) <= 0:
            pytest.skip("Test client has no loan setup")
        
        # Attempt to send email
        response = admin_session.post(f"{BASE_URL}/api/contracts/{TEST_CLIENT_ID}/send-email?admin_token={admin_session.token}")
        
        # Expected: 400 error due to Resend sandbox mode
        if response.status_code == 400:
            data = response.json()
            detail = data.get("detail", "")
            # Should mention sandbox mode or domain verification
            assert "sandbox" in detail.lower() or "domain" in detail.lower() or "verify" in detail.lower(), \
                f"Expected sandbox-related error message, got: {detail}"
            print(f"✓ Email send correctly returns sandbox error: {detail[:100]}...")
        elif response.status_code == 200:
            # If email somehow succeeds (e.g., recipient is a verified email)
            data = response.json()
            print(f"✓ Email sent successfully (unexpected): {data}")
        elif response.status_code == 422:
            print(f"⚠ Validation error (no loan/email): {response.text}")
            pytest.skip("Validation error - client may not have loan or email")
        else:
            # Log unexpected status for debugging
            print(f"⚠ Unexpected status {response.status_code}: {response.text[:200]}")
            # Accept 400 as expected for sandbox mode
            assert response.status_code == 400, f"Expected 400 sandbox error, got {response.status_code}"
    
    def test_send_email_no_email_client(self, admin_session):
        """Test sending email to client without email address returns appropriate error"""
        # We need a client without email - this would need to be created
        # For now, just verify the endpoint exists and requires authentication
        response = requests.post(f"{BASE_URL}/api/contracts/{TEST_CLIENT_ID}/send-email")
        assert response.status_code in [401, 422]
        print("✓ Send email endpoint requires authentication")


class TestContractDownload:
    """Test GET /api/contracts/{client_id}/download - download contract PDF"""
    
    def test_contract_download(self, admin_session):
        """Test download endpoint returns PDF with attachment disposition"""
        client_response = admin_session.get(f"{BASE_URL}/api/clients/{TEST_CLIENT_ID}?admin_token={admin_session.token}")
        if client_response.status_code == 404:
            pytest.skip("Test client not found")
        
        client_data = client_response.json()
        if not client_data.get("loan_amount") or client_data.get("loan_amount", 0) <= 0:
            pytest.skip("Test client has no loan setup")
        
        response = admin_session.get(f"{BASE_URL}/api/contracts/{TEST_CLIENT_ID}/download?admin_token={admin_session.token}")
        
        if response.status_code == 422:
            pytest.skip("Client has no loan set up")
        
        assert response.status_code == 200
        
        # Verify PDF content
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type
        
        # Check download header (attachment)
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower()
        
        print(f"✓ Contract download returns PDF with attachment header")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
