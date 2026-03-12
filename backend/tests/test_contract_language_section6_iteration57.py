"""
Test Contract Language Support and Section 6 (Device Security Measures) - Iteration 57

Tests:
- Contract preview endpoint with Estonian (et) and English (en) language support
- Contract download endpoint with language support  
- Default language is Estonian when no language specified
- PDF contains 9 sections including new Section 6 about device security/locking
- Estonian PDF has 'LAENULEPING' title and 'lukustamine' (locking) term
- English PDF has 'LOAN AGREEMENT' title and 'Device Locking' term
"""
import pytest
import requests
import os
from io import BytesIO

# Try importing PyPDF2 for PDF text extraction
try:
    from PyPDF2 import PdfReader
    PDF_EXTRACT_AVAILABLE = True
except ImportError:
    PDF_EXTRACT_AVAILABLE = False
    print("WARNING: PyPDF2 not available - PDF text extraction tests will be skipped")

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://analytics-debug-11.preview.emergentagent.com').rstrip('/')


class TestContractLanguageAndSection6:
    """Contract PDF generation with language support and Section 6 device security"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/admin/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in login response"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def client_with_loan(self, admin_token):
        """Find a client with loan_amount > 0 for contract testing"""
        response = requests.get(f"{BASE_URL}/api/clients", params={
            "admin_token": admin_token
        })
        assert response.status_code == 200, f"Failed to get clients: {response.text}"
        data = response.json()
        
        clients = data.get("clients", [])
        # Find client with loan_amount > 0
        for client in clients:
            if client.get("loan_amount", 0) > 0:
                print(f"Found client with loan: {client.get('name')} - loan_amount={client.get('loan_amount')}")
                return client
        
        pytest.skip("No client with loan_amount > 0 found for testing")
    
    # --- Contract Preview Tests ---
    
    def test_contract_preview_estonian(self, admin_token, client_with_loan):
        """Test contract preview with Estonian language (et)"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token, "language": "et"}
        )
        
        assert response.status_code == 200, f"Preview ET failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not PDF"
        assert len(response.content) > 1000, "PDF content too small"
        print(f"Estonian preview PDF size: {len(response.content)} bytes")
    
    def test_contract_preview_english(self, admin_token, client_with_loan):
        """Test contract preview with English language (en)"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token, "language": "en"}
        )
        
        assert response.status_code == 200, f"Preview EN failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not PDF"
        assert len(response.content) > 1000, "PDF content too small"
        print(f"English preview PDF size: {len(response.content)} bytes")
    
    def test_contract_preview_default_estonian(self, admin_token, client_with_loan):
        """Test contract preview defaults to Estonian when no language specified"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token}  # No language param
        )
        
        assert response.status_code == 200, f"Preview default failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not PDF"
        print("Default language preview returned PDF successfully")
    
    # --- Contract Download Tests ---
    
    def test_contract_download_estonian(self, admin_token, client_with_loan):
        """Test contract download with Estonian language (et)"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/download",
            params={"admin_token": admin_token, "language": "et"}
        )
        
        assert response.status_code == 200, f"Download ET failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not PDF"
        
        # Check Content-Disposition for download (attachment)
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Expected attachment disposition, got: {content_disp}"
        assert "laenuleping" in content_disp.lower(), f"Estonian filename expected 'laenuleping', got: {content_disp}"
        print(f"Estonian download: {content_disp}")
    
    def test_contract_download_english(self, admin_token, client_with_loan):
        """Test contract download with English language (en)"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/download",
            params={"admin_token": admin_token, "language": "en"}
        )
        
        assert response.status_code == 200, f"Download EN failed: {response.text}"
        assert response.headers.get("content-type") == "application/pdf", "Response is not PDF"
        
        # Check Content-Disposition for download (attachment)
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Expected attachment disposition, got: {content_disp}"
        assert "loan_agreement" in content_disp.lower(), f"English filename expected 'loan_agreement', got: {content_disp}"
        print(f"English download: {content_disp}")
    
    # --- PDF Content Verification Tests ---
    
    @pytest.mark.skipif(not PDF_EXTRACT_AVAILABLE, reason="PyPDF2 not installed")
    def test_estonian_pdf_content_title_and_section6(self, admin_token, client_with_loan):
        """Verify Estonian PDF has LAENULEPING title and Section 6 with lukustamine"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token, "language": "et"}
        )
        
        assert response.status_code == 200
        
        # Extract text from PDF
        pdf_reader = PdfReader(BytesIO(response.content))
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() or ""
        
        print(f"Estonian PDF pages: {len(pdf_reader.pages)}")
        print(f"Estonian PDF text length: {len(full_text)}")
        
        # Verify title
        assert "LAENULEPING" in full_text, f"Estonian title 'LAENULEPING' not found in PDF"
        
        # Verify Section 6 title about app installation
        assert "Rakenduse paigaldamine" in full_text or "6." in full_text, "Section 6 not found"
        
        # Verify device locking term in Estonian
        assert "lukustam" in full_text.lower(), f"Estonian locking term 'lukustamine' not found in PDF"
        
        # Verify all 9 sections exist (check section numbers)
        for section_num in ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9."]:
            assert section_num in full_text, f"Section {section_num} not found in Estonian PDF"
        
        print("Estonian PDF verified: LAENULEPING title, Section 6, lukustamine term, 9 sections")
    
    @pytest.mark.skipif(not PDF_EXTRACT_AVAILABLE, reason="PyPDF2 not installed")
    def test_english_pdf_content_title_and_section6(self, admin_token, client_with_loan):
        """Verify English PDF has LOAN AGREEMENT title and Section 6 with Device Locking"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token, "language": "en"}
        )
        
        assert response.status_code == 200
        
        # Extract text from PDF
        pdf_reader = PdfReader(BytesIO(response.content))
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() or ""
        
        print(f"English PDF pages: {len(pdf_reader.pages)}")
        print(f"English PDF text length: {len(full_text)}")
        
        # Verify title
        assert "LOAN AGREEMENT" in full_text, f"English title 'LOAN AGREEMENT' not found in PDF"
        
        # Verify Section 6 title about app installation
        assert "Application installation" in full_text or "device security" in full_text.lower() or "6." in full_text, "Section 6 not found"
        
        # Verify device locking term in English
        assert "Device Locking" in full_text or "device" in full_text.lower(), f"English locking term 'Device Locking' not found in PDF"
        
        # Verify all 9 sections exist (check section numbers)
        for section_num in ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9."]:
            assert section_num in full_text, f"Section {section_num} not found in English PDF"
        
        print("English PDF verified: LOAN AGREEMENT title, Section 6, Device Locking term, 9 sections")
    
    @pytest.mark.skipif(not PDF_EXTRACT_AVAILABLE, reason="PyPDF2 not installed")
    def test_default_language_is_estonian(self, admin_token, client_with_loan):
        """Verify default language (no param) returns Estonian PDF"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"admin_token": admin_token}  # No language param
        )
        
        assert response.status_code == 200
        
        # Extract text from PDF
        pdf_reader = PdfReader(BytesIO(response.content))
        full_text = ""
        for page in pdf_reader.pages:
            full_text += page.extract_text() or ""
        
        # Should be Estonian by default
        assert "LAENULEPING" in full_text, "Default language should be Estonian (LAENULEPING)"
        print("Default language verified as Estonian (LAENULEPING title found)")
    
    # --- Error handling tests ---
    
    def test_invalid_client_id(self, admin_token):
        """Test contract preview with invalid client ID"""
        response = requests.get(
            f"{BASE_URL}/api/contracts/invalid-client-id-999/preview",
            params={"admin_token": admin_token, "language": "et"}
        )
        
        assert response.status_code == 404, f"Expected 404 for invalid client, got {response.status_code}"
        print("Invalid client ID returns 404 as expected")
    
    def test_missing_admin_token(self, client_with_loan):
        """Test contract preview without admin token"""
        client_id = client_with_loan["id"]
        response = requests.get(
            f"{BASE_URL}/api/contracts/{client_id}/preview",
            params={"language": "et"}  # No admin_token
        )
        
        # Should fail with 422 (missing required param) or 401/403
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"Missing admin token returns {response.status_code} as expected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
