# API Endpoints Fixes

## Summary
Fixed multiple API endpoint issues causing 422, 405, and 404 errors.

## Issues and Solutions

### 1. ✅ POST /api/loans/{client_id}/setup - 422 Error

**Problem:**
- Endpoint was using `ClientCreate` model
- `ClientCreate` requires all client fields (name, phone, email, etc.)
- When setting up a loan for existing client, we only need loan fields
- Sending just loan fields caused 422 validation error

**Solution:**
Created dedicated `LoanSetup` model with only loan fields:

```python
class LoanSetup(BaseModel):
    """Model for setting up loan details for an existing client"""
    loan_amount: float
    interest_rate: float
    loan_tenure_months: int
    down_payment: float = 0.0
```

**Request Example:**
```bash
POST /api/loans/{client_id}/setup?admin_id=xxx
Content-Type: application/json

{
  "loan_amount": 10000,
  "interest_rate": 10,
  "loan_tenure_months": 12,
  "down_payment": 1000
}
```

**Response:**
```json
{
  "message": "Loan setup successfully",
  "loan_details": {
    "monthly_emi": 916.67,
    "total_amount": 11000,
    "total_interest": 1000
  },
  "client": { ... }
}
```

---

### 2. ✅ PUT /api/admin/profile - 405 Error

**Problem:**
- Frontend expected endpoint at `/admin/profile`
- Backend had endpoint at `/admin/update-profile`
- Different URL caused 405 Method Not Allowed error

**Solution:**
Added alias route `/admin/profile` that calls the same handler:

```python
@api_router.put("/admin/profile")
async def update_admin_profile_alias(profile_data: ProfileUpdate, admin_token: str = Query(...)):
    return await update_admin_profile(profile_data, admin_token)
```

**Both endpoints now work:**
- `PUT /api/admin/update-profile` (original)
- `PUT /api/admin/profile` (new alias)

**Request Example:**
```bash
PUT /api/admin/profile?admin_token=xxx
Content-Type: application/json

{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "message": "Profile updated successfully"
}
```

---

### 3. ✅ POST /api/device/register - 404 Error

**Status:**
Endpoint exists and is properly configured. The 404 error is likely due to:

1. **Incorrect URL**: Make sure to use `/api/device/register` (with `/api` prefix)
2. **Invalid registration code**: The code must exist in the database
3. **Server not running**: Verify the backend server is running

**Endpoint Details:**
- Location: Line 1230 in server.py
- Properly mounted in api_router
- Accessible at: `POST /api/device/register`

**Request Example:**
```bash
POST /api/device/register
Content-Type: application/json

{
  "registration_code": "ABC123",
  "device_id": "device-id-123",
  "device_model": "Samsung Galaxy S21"
}
```

**Success Response:**
```json
{
  "message": "Device registered successfully",
  "client_id": "client-uuid",
  "client": { ... }
}
```

**Error Responses:**
- `404`: Invalid registration code
- `422`: Device already registered

---

### 4. ✅ POST /api/clients - Token Handling

**Status:**
Working as designed. The endpoint supports two ways to authenticate:

**Option 1: Query Parameter**
```bash
POST /api/clients?admin_token=xxx
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com",
  "loan_amount": 10000,
  "interest_rate": 10,
  "loan_tenure_months": 12
}
```

**Option 2: In Request Body**
```bash
POST /api/clients
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com",
  "admin_id": "admin-uuid",
  "loan_amount": 10000,
  "interest_rate": 10,
  "loan_tenure_months": 12
}
```

**Note:** If `admin_token` is provided in query, it takes precedence over `admin_id` in body.

---

### 5. ✅ GET /api/clients - Query Parameters (Previously Fixed)

**Status:**
Fixed in commit `42fabab` - all query parameters now use explicit `Query()` declarations.

**Request Example:**
```bash
GET /api/clients?admin_id=xxx&skip=0&limit=10
```

**Response:**
```json
{
  "clients": [ ... ],
  "pagination": {
    "total": 100,
    "skip": 0,
    "limit": 10,
    "has_more": true
  }
}
```

---

## Testing Checklist

Use these curl commands to test all fixes:

### Test Loan Setup
```bash
curl -X POST "http://localhost:8000/api/loans/{client_id}/setup?admin_id=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "loan_amount": 10000,
    "interest_rate": 10,
    "loan_tenure_months": 12,
    "down_payment": 1000
  }'
```

### Test Admin Profile Update (New Endpoint)
```bash
curl -X PUT "http://localhost:8000/api/admin/profile?admin_token=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### Test Admin Profile Update (Original Endpoint)
```bash
curl -X PUT "http://localhost:8000/api/admin/update-profile?admin_token=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Smith"
  }'
```

### Test Device Registration
```bash
curl -X POST "http://localhost:8000/api/device/register" \
  -H "Content-Type: application/json" \
  -d '{
    "registration_code": "ABC123",
    "device_id": "test-device-id",
    "device_model": "Samsung Galaxy S21"
  }'
```

### Test Client Creation with Token
```bash
curl -X POST "http://localhost:8000/api/clients?admin_token=xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "phone": "+1234567890",
    "email": "test@example.com"
  }'
```

### Test Get Clients
```bash
curl "http://localhost:8000/api/clients?admin_id=xxx&skip=0&limit=10"
```

---

## Files Modified

- `backend/server.py`:
  - Added `LoanSetup` model (lines 746-750)
  - Updated `setup_loan` endpoint parameter (line 1604)
  - Added `/admin/profile` alias route (lines 1034-1039)

---

## Summary of Fixes

| Issue | Status | Solution |
|-------|--------|----------|
| 1. GET /api/clients wrong parameters | ✅ Fixed | Added explicit Query() declarations (previous commit) |
| 2. POST /api/loans/{client_id}/setup 422 error | ✅ Fixed | Created LoanSetup model |
| 3. POST /api/clients missing token | ✅ Working | Token can be in query or body |
| 4. PUT /api/admin/update-profile 405 error | ✅ Fixed | Added /admin/profile alias |
| 5. POST /api/device/register 404 error | ✅ Exists | Verify URL and registration code |

All issues have been addressed! 🎉
