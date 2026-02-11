import io
import zipfile
from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)


def create_test_zip():
    """Create a test ZIP file in memory"""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("test_file.txt", "This is a test file content")
        zip_file.writestr("another_file.txt", "More test content")
    zip_buffer.seek(0)
    return zip_buffer


def test_upload_zip_without_auth():
    """Test that upload without authentication fails"""
    zip_file = create_test_zip()
    
    response = client.post(
        "/api/admin/upload-zip",
        files={"file": ("test.zip", zip_file, "application/zip")}
    )
    
    # Should fail with 422 (missing required parameter)
    assert response.status_code == 422


def test_upload_non_zip_file_without_auth():
    """Test that uploading non-ZIP file without auth fails with validation error"""
    text_file = io.BytesIO(b"This is not a zip file")
    
    response = client.post(
        "/api/admin/upload-zip",
        files={"file": ("test.txt", text_file, "text/plain")}
    )
    
    # Should fail with 422 (missing required parameter)
    assert response.status_code == 422


def test_upload_endpoint_exists():
    """Test that the upload endpoint is registered"""
    # Test OPTIONS to see if endpoint exists
    response = client.options("/api/admin/upload-zip")
    
    # Endpoint should exist (not 404)
    assert response.status_code != 404


def test_health_check_still_works():
    """Test that existing endpoints still work"""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert "status" in response.json()
