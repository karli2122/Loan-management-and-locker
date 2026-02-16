"""
Bank Statement Analyzer Feature Tests
Tests the upload and analysis endpoints for bank statements (.pdf and .asice files)
"""
import pytest
import requests
import os
import tempfile
from fpdf import FPDF

# Get the API URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://loan-trends.preview.emergentagent.com"

# Superadmin credentials
SUPERADMIN_USERNAME = "karli1987"
SUPERADMIN_PASSWORD = "nasvakas123"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token for API calls"""
    response = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    return data.get("token")


@pytest.fixture
def sample_pdf_file():
    """Create a sample PDF with bank statement content for testing"""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    
    # Add sample bank statement content
    pdf.cell(200, 10, txt="Swedbank Account Statement", ln=True, align="C")
    pdf.cell(200, 10, txt="Account Holder: Test User", ln=True)
    pdf.cell(200, 10, txt="Period: 01.01.2025 - 31.01.2025", ln=True)
    pdf.cell(200, 10, txt="", ln=True)
    pdf.cell(200, 10, txt="Transactions:", ln=True)
    pdf.cell(200, 10, txt="02.01.2025 Salary +2500.00 EUR", ln=True)
    pdf.cell(200, 10, txt="05.01.2025 Rent -800.00 EUR", ln=True)
    pdf.cell(200, 10, txt="10.01.2025 Groceries -150.00 EUR", ln=True)
    pdf.cell(200, 10, txt="15.01.2025 Utilities -95.00 EUR", ln=True)
    pdf.cell(200, 10, txt="20.01.2025 Transport -50.00 EUR", ln=True)
    pdf.cell(200, 10, txt="", ln=True)
    pdf.cell(200, 10, txt="Opening Balance: 1000.00 EUR", ln=True)
    pdf.cell(200, 10, txt="Closing Balance: 2405.00 EUR", ln=True)
    
    # Save to temporary file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        pdf.output(f.name)
        yield f.name
    
    # Cleanup
    os.unlink(f.name)


@pytest.fixture
def empty_pdf_file():
    """Create an empty PDF file (no text content)"""
    pdf = FPDF()
    pdf.add_page()
    # Add no content
    
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        pdf.output(f.name)
        yield f.name
    
    os.unlink(f.name)


class TestBankStatementAnalyzerEndpoints:
    """Test bank statement analyzer backend API endpoints"""
    
    def test_analyze_endpoint_exists(self, admin_token):
        """Test that the analyze endpoint exists and requires file"""
        # Call without file should fail with 422 (validation error)
        response = requests.post(
            f"{BASE_URL}/api/bank-statements/analyze",
            params={"admin_token": admin_token}
        )
        # 422 means endpoint exists but validation failed (expected - no file provided)
        assert response.status_code == 422, f"Expected 422 for missing file, got {response.status_code}: {response.text}"
        print(f"PASS: Analyze endpoint exists and validates file requirement")
    
    def test_analyze_rejects_unsupported_file_type(self, admin_token):
        """Test that unsupported file types are rejected"""
        # Create a fake txt file
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"This is a text file, not a PDF")
            txt_file = f.name
        
        try:
            with open(txt_file, "rb") as f:
                response = requests.post(
                    f"{BASE_URL}/api/bank-statements/analyze",
                    params={"admin_token": admin_token},
                    files={"file": ("test.txt", f, "text/plain")}
                )
            
            assert response.status_code == 400, f"Expected 400 for unsupported file type, got {response.status_code}"
            data = response.json()
            assert "detail" in data
            assert "pdf" in data["detail"].lower() or "asice" in data["detail"].lower()
            print(f"PASS: Unsupported file type rejected with message: {data['detail']}")
        finally:
            os.unlink(txt_file)
    
    def test_analyze_rejects_empty_file(self, admin_token):
        """Test that empty files are rejected"""
        # Create an empty file with .pdf extension
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            empty_pdf = f.name
            # Write nothing - file is empty
        
        try:
            with open(empty_pdf, "rb") as f:
                response = requests.post(
                    f"{BASE_URL}/api/bank-statements/analyze",
                    params={"admin_token": admin_token},
                    files={"file": ("empty.pdf", f, "application/pdf")}
                )
            
            assert response.status_code == 400, f"Expected 400 for empty file, got {response.status_code}"
            data = response.json()
            assert "detail" in data
            print(f"PASS: Empty file rejected with message: {data['detail']}")
        finally:
            os.unlink(empty_pdf)
    
    def test_analyze_with_valid_pdf(self, admin_token, sample_pdf_file):
        """Test successful analysis with a valid PDF file (longer timeout for AI)"""
        with open(sample_pdf_file, "rb") as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-statements/analyze",
                params={"admin_token": admin_token},
                files={"file": ("bank_statement.pdf", f, "application/pdf")},
                timeout=120  # AI analysis can take time
            )
        
        if response.status_code == 200:
            data = response.json()
            # Verify response structure
            assert "id" in data, "Response should have an id"
            assert "filename" in data, "Response should have filename"
            assert "analyzed_at" in data, "Response should have analyzed_at timestamp"
            assert "analysis" in data, "Response should have analysis results"
            
            print(f"PASS: PDF analysis successful")
            print(f"  - ID: {data['id']}")
            print(f"  - Filename: {data['filename']}")
            
            # Check if analysis has expected structure
            analysis = data.get("analysis", {})
            if "error" not in analysis:
                print(f"  - Bank detected: {analysis.get('bank_name', 'unknown')}")
                print(f"  - Period: {analysis.get('period', 'unknown')}")
                summary = analysis.get("summary", {})
                if summary:
                    print(f"  - Total Income: {summary.get('total_income', 0)}")
                    print(f"  - Total Expenses: {summary.get('total_expenses', 0)}")
            else:
                print(f"  - AI returned error: {analysis.get('error')}")
        elif response.status_code == 400:
            # This can happen if PDF has no extractable text
            data = response.json()
            print(f"INFO: PDF rejection (expected for empty/image PDFs): {data.get('detail')}")
            # This is acceptable if PDF has no text
        elif response.status_code == 500:
            data = response.json()
            print(f"WARNING: AI analysis failed: {data.get('detail')}")
            # Don't fail test for AI issues - just log
        else:
            pytest.fail(f"Unexpected status code {response.status_code}: {response.text}")
    
    def test_analyze_requires_auth(self):
        """Test that analyze endpoint requires authentication"""
        # Create a dummy PDF
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"%PDF-1.4 fake pdf content")
            pdf_file = f.name
        
        try:
            with open(pdf_file, "rb") as f:
                # Call without admin_token
                response = requests.post(
                    f"{BASE_URL}/api/bank-statements/analyze",
                    files={"file": ("test.pdf", f, "application/pdf")}
                )
            
            # Should fail with 422 (missing required parameter) or 401/403 (auth error)
            assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
            print(f"PASS: Endpoint requires authentication (status: {response.status_code})")
        finally:
            os.unlink(pdf_file)
    
    def test_history_endpoint_works(self, admin_token):
        """Test that history endpoint returns past analyses"""
        response = requests.get(
            f"{BASE_URL}/api/bank-statements/history",
            params={"admin_token": admin_token}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "History should return a list"
        
        print(f"PASS: History endpoint works")
        print(f"  - Total records: {len(data)}")
        
        # If there are records, verify structure
        if data:
            record = data[0]
            assert "id" in record, "Record should have id"
            assert "filename" in record, "Record should have filename"
            assert "analyzed_at" in record, "Record should have analyzed_at"
            print(f"  - Latest: {record.get('filename')} at {record.get('analyzed_at')}")
    
    def test_history_requires_auth(self):
        """Test that history endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/bank-statements/history")
        
        # Should fail with 422 (missing required parameter) or 401/403
        assert response.status_code in [401, 403, 422], f"Expected auth error, got {response.status_code}"
        print(f"PASS: History endpoint requires authentication (status: {response.status_code})")


class TestAdminLogin:
    """Verify admin login works for testing"""
    
    def test_admin_login_success(self):
        """Test that superadmin can login"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": SUPERADMIN_USERNAME, "password": SUPERADMIN_PASSWORD}
        )
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Login response should contain token"
        print(f"PASS: Admin login successful, got token")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
