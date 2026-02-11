#!/usr/bin/env python
"""
Manual test script for ZIP upload functionality.
This script demonstrates how to use the ZIP upload endpoint.

Requirements:
1. Backend server must be running (python server.py)
2. You need a valid admin token (create an admin account first)

Usage:
    python manual_test_upload.py <admin_token> <path_to_zip_file>
"""

import sys
import requests
from pathlib import Path


def test_zip_upload(admin_token, zip_file_path):
    """Test uploading a ZIP file to the API"""
    
    # API endpoint
    url = "http://localhost:8000/api/admin/upload-zip"
    
    # Check if file exists
    zip_path = Path(zip_file_path)
    if not zip_path.exists():
        print(f"❌ Error: File not found: {zip_file_path}")
        return False
    
    # Check if file is a ZIP
    if zip_path.suffix.lower() != '.zip':
        print(f"⚠️  Warning: File doesn't have .zip extension: {zip_file_path}")
    
    print(f"📦 Uploading: {zip_path.name} ({zip_path.stat().st_size} bytes)")
    
    # Prepare the request
    with open(zip_path, 'rb') as f:
        files = {'file': (zip_path.name, f, 'application/zip')}
        params = {'admin_token': admin_token}
        
        try:
            response = requests.post(url, files=files, params=params)
            
            if response.status_code == 200:
                data = response.json()
                print("✅ Upload successful!")
                print(f"   Original filename: {data['original_filename']}")
                print(f"   Saved as: {data['filename']}")
                print(f"   Size: {data['size_bytes']} bytes")
                print(f"   Uploaded by: {data['uploaded_by']}")
                print(f"   Path: {data['upload_path']}")
                return True
            else:
                print(f"❌ Upload failed!")
                print(f"   Status code: {response.status_code}")
                print(f"   Error: {response.json().get('detail', 'Unknown error')}")
                return False
                
        except requests.exceptions.ConnectionError:
            print("❌ Error: Could not connect to server.")
            print("   Make sure the backend is running on http://localhost:8000")
            return False
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            return False


def main():
    if len(sys.argv) != 3:
        print("Usage: python manual_test_upload.py <admin_token> <path_to_zip_file>")
        print("\nExample:")
        print("  python manual_test_upload.py abc123def456 /path/to/file.zip")
        sys.exit(1)
    
    admin_token = sys.argv[1]
    zip_file_path = sys.argv[2]
    
    print("=" * 60)
    print("ZIP Upload Test")
    print("=" * 60)
    
    success = test_zip_upload(admin_token, zip_file_path)
    
    print("=" * 60)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
