# ZIP File Upload Feature

## Overview

This feature allows authenticated administrators to upload ZIP archive files to the backend server. The uploaded files are stored securely in the `backend/uploads/` directory.

## Features

- ✅ Admin authentication required
- ✅ File type validation (only .zip files allowed)
- ✅ File size validation (max 100 MB)
- ✅ Automatic directory creation
- ✅ Unique filename generation to prevent overwrites
- ✅ Comprehensive error handling
- ✅ Audit logging

## API Endpoint

### Upload ZIP File

**Endpoint:** `POST /api/admin/upload-zip`

**Authentication:** Requires valid admin token

**Parameters:**
- `admin_token` (query parameter): Valid admin authentication token
- `file` (form data): ZIP file to upload

**Request Example:**

```bash
curl -X POST "http://localhost:8000/api/admin/upload-zip?admin_token=YOUR_TOKEN" \
  -F "file=@/path/to/your/archive.zip"
```

**Success Response (200):**

```json
{
  "message": "File uploaded successfully",
  "filename": "20260211_132145_a1b2c3d4_archive.zip",
  "original_filename": "archive.zip",
  "size_bytes": 1048576,
  "uploaded_by": "admin_username",
  "upload_path": "uploads/20260211_132145_a1b2c3d4_archive.zip"
}
```

**Error Responses:**

- `401 Unauthorized`: Invalid or missing admin token
- `400 Bad Request`: Invalid file type, empty file, or file too large
- `422 Unprocessable Entity`: Missing required parameters
- `500 Internal Server Error`: Server error during file save

## Configuration

The upload feature can be configured in `backend/server.py`:

```python
UPLOAD_DIR = ROOT_DIR / 'uploads'  # Upload directory location
MAX_FILE_SIZE = 100 * 1024 * 1024  # Maximum file size: 100 MB
ALLOWED_EXTENSIONS = {'.zip'}       # Allowed file extensions
```

## Security Features

1. **Authentication**: Only authenticated administrators can upload files
2. **File Type Validation**: Only ZIP files are accepted (validated by extension)
3. **File Size Limit**: Maximum file size of 100 MB prevents DoS attacks
4. **Empty File Detection**: Rejects empty files
5. **Unique Filenames**: Prevents file overwrites using timestamp + UUID
6. **Audit Logging**: All uploads are logged with admin username and file details

## File Naming Convention

Uploaded files are automatically renamed to prevent overwrites:

Format: `{timestamp}_{unique_id}_{original_filename}`

Example: `20260211_132145_a1b2c3d4_archive.zip`

Where:
- `timestamp`: YYYYmmdd_HHMMSS in UTC
- `unique_id`: 8-character random hex string
- `original_filename`: Original name of the uploaded file

## Storage

- Files are stored in: `backend/uploads/`
- Directory is automatically created on server startup
- Directory is excluded from git (in `.gitignore`)

## Testing

### Automated Tests

Run the test suite:

```bash
cd /home/runner/work/Loan-management-and-locker/Loan-management-and-locker
python -m pytest tests/test_zip_upload.py -v
```

Tests include:
- Upload without authentication
- Upload with invalid file type
- Upload endpoint registration
- Health check (existing endpoints still work)

### Manual Testing

Use the provided manual test script:

```bash
python manual_test_upload.py <admin_token> <path_to_zip_file>
```

Example:

```bash
python manual_test_upload.py abc123def456 /path/to/archive.zip
```

## Usage Example with Python

```python
import requests

url = "http://localhost:8000/api/admin/upload-zip"
admin_token = "your_admin_token_here"

with open("archive.zip", "rb") as f:
    files = {"file": ("archive.zip", f, "application/zip")}
    params = {"admin_token": admin_token}
    response = requests.post(url, files=files, params=params)
    
    if response.status_code == 200:
        print("Upload successful!")
        print(response.json())
    else:
        print(f"Upload failed: {response.json()}")
```

## Integration with Frontend

To integrate with a web frontend:

```javascript
async function uploadZipFile(file, adminToken) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(
    `/api/admin/upload-zip?admin_token=${adminToken}`,
    {
      method: 'POST',
      body: formData
    }
  );
  
  if (response.ok) {
    const data = await response.json();
    console.log('Upload successful:', data);
    return data;
  } else {
    const error = await response.json();
    throw new Error(error.detail);
  }
}
```

## Troubleshooting

### Upload fails with "File too large"
- Check file size (max 100 MB)
- Adjust `MAX_FILE_SIZE` in server.py if needed

### Upload fails with "Invalid file type"
- Ensure file has .zip extension
- Check file is actually a ZIP archive

### Upload fails with "Invalid or expired admin token"
- Verify admin token is valid
- Re-authenticate to get a new token

### "Failed to save file" error
- Check disk space on server
- Verify write permissions on `backend/uploads/` directory
- Check server logs for detailed error message

## Maintenance

### Cleaning Up Old Files

Uploaded files are not automatically deleted. To clean up old uploads:

```bash
# Remove files older than 30 days
find backend/uploads -type f -mtime +30 -delete

# Remove all uploaded files
rm -rf backend/uploads/*
```

### Monitoring

Check upload logs:

```bash
# View recent uploads in logs
grep "File uploaded" backend_log.txt
```

## Future Enhancements

Potential improvements for future versions:

- [ ] Support for multiple file types (tar.gz, rar, etc.)
- [ ] Automatic file cleanup after X days
- [ ] File download endpoint
- [ ] List uploaded files endpoint
- [ ] File metadata storage in database
- [ ] Virus scanning integration
- [ ] Direct S3/cloud storage upload
- [ ] Progress tracking for large files
- [ ] Chunked upload support
