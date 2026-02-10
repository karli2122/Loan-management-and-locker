# EMI Phone Lock System - API Documentation

## Table of Contents
1. [API Base URL Configuration](#api-base-url-configuration)
2. [Authentication](#authentication)
3. [API Endpoints](#api-endpoints)
   - [Admin Endpoints](#admin-endpoints)
   - [Client Management](#client-management)
   - [Device Endpoints](#device-endpoints)
   - [Loan Plans](#loan-plans)
   - [Loan Management](#loan-management)
   - [Payments](#payments)
   - [Late Fees](#late-fees)
   - [Reminders](#reminders)
   - [Reports](#reports)
   - [Utility](#utility)

---

## API Base URL Configuration

### Development
```
http://localhost:5000/api
```

### Production
The backend API URL is configured in the frontend application:

**Location**: `frontend/.env.local` or `frontend/.env`

```bash
EXPO_PUBLIC_BACKEND_URL=https://your-production-domain.com/api
```

**Default (if not configured)**: 
```
https://loantrack-23.preview.emergentagent.com
```

### Setting Backend URL

#### Option 1: Environment File (Development)
```bash
cd frontend
cp .env.template .env.local
# Edit .env.local and set:
EXPO_PUBLIC_BACKEND_URL=https://your-api-url.com/api
```

#### Option 2: EAS Secrets (Production)
```bash
eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value "https://your-api.com/api"
```

#### Option 3: Build-time Environment Variable
```bash
EXPO_PUBLIC_BACKEND_URL=https://your-api.com/api npm start
```

---

## Authentication

Most admin endpoints require authentication via `admin_token` query parameter.

### Getting an Admin Token
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin_username",
  "password": "admin_password"
}
```

Response:
```json
{
  "token": "abc123...",
  "admin": {
    "id": "uuid",
    "username": "admin_username",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

Use the `token` in subsequent requests:
```http
GET /api/clients?admin_token=abc123...
```

---

## API Endpoints

### Admin Endpoints

#### 1. Register Admin
```http
POST /api/admin/register
Content-Type: application/json

{
  "username": "admin_username",
  "password": "secure_password",
  "email": "admin@example.com",
  "full_name": "Admin Name"
}
```

**Query Parameters:**
- `admin_token` (optional): Required for non-first admin registration

**Response:** `200 OK`
```json
{
  "token": "admin_token_string",
  "admin": {
    "id": "uuid",
    "username": "admin_username",
    "email": "admin@example.com",
    "full_name": "Admin Name",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00"
  }
}
```

---

#### 2. Login Admin
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin_username",
  "password": "password"
}
```

**Response:** `200 OK` (same structure as register)

---

#### 3. Verify Admin Token
```http
GET /api/admin/verify/{token}
```

**Response:** `200 OK`
```json
{
  "valid": true,
  "admin": {
    "id": "uuid",
    "username": "admin_username",
    "role": "admin"
  }
}
```

---

#### 4. List All Admins
```http
GET /api/admin/list?admin_token={token}
```

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "username": "admin1",
    "email": "admin1@example.com",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00"
  }
]
```

---

#### 5. Change Password
```http
POST /api/admin/change-password?admin_token={token}
Content-Type: application/json

{
  "current_password": "old_password",
  "new_password": "new_password"
}
```

---

#### 6. Update Admin Profile
```http
PUT /api/admin/update-profile?admin_token={token}
Content-Type: application/json

{
  "email": "newemail@example.com",
  "full_name": "Updated Name"
}
```

---

#### 7. Delete Admin
```http
DELETE /api/admin/{admin_id}?admin_token={token}
```

---

### Client Management

#### 1. Create Client
```http
POST /api/clients?admin_token={token}
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1234567890",
  "address": "123 Main St",
  "device_model": "Samsung Galaxy S21",
  "device_imei": "123456789012345",
  "loan_amount": 50000,
  "loan_term_months": 12,
  "interest_rate": 10,
  "down_payment": 10000
}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "registration_code": "ABC123",
  "name": "John Doe",
  "phone": "+1234567890",
  "is_locked": false,
  "created_at": "2024-01-01T00:00:00"
}
```

---

#### 2. Get All Clients
```http
GET /api/clients?skip=0&limit=100&admin_id={optional_admin_id}
```

**Query Parameters:**
- `skip` (optional, default: 0): Pagination offset
- `limit` (optional, default: 100): Number of results
- `admin_id` (optional): Filter by admin who created the client

**Response:** `200 OK` - Array of client objects

---

#### 3. Get Single Client
```http
GET /api/clients/{client_id}?admin_id={optional_admin_id}
```

**Response:** `200 OK` - Client object

---

#### 4. Update Client
```http
PUT /api/clients/{client_id}?admin_id={optional_admin_id}
Content-Type: application/json

{
  "name": "Updated Name",
  "phone": "+9876543210",
  "loan_amount": 55000
}
```

---

#### 5. Allow Uninstall
```http
POST /api/clients/{client_id}/allow-uninstall?admin_id={optional_admin_id}
```

**Note:** Must be called before deleting a client to signal the device app

---

#### 6. Delete Client
```http
DELETE /api/clients/{client_id}?admin_id={optional_admin_id}
```

---

#### 7. Lock Client Device
```http
POST /api/clients/{client_id}/lock?admin_id={optional_admin_id}
Content-Type: application/json

{
  "message": "Payment overdue. Please contact support."
}
```

---

#### 8. Unlock Client Device
```http
POST /api/clients/{client_id}/unlock?admin_id={optional_admin_id}
```

---

#### 9. Send Warning Message
```http
POST /api/clients/{client_id}/warning?admin_id={optional_admin_id}
Content-Type: application/json

{
  "message": "Payment reminder: Due in 3 days"
}
```

---

### Device Endpoints

#### 1. Register Device
```http
POST /api/device/register
Content-Type: application/json

{
  "registration_code": "ABC123",
  "device_model": "Samsung Galaxy S21",
  "device_imei": "123456789012345",
  "android_version": "12"
}
```

**Response:** `200 OK`
```json
{
  "client_id": "uuid",
  "message": "Device registered successfully"
}
```

---

#### 2. Get Device Status
```http
GET /api/device/status/{client_id}
```

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "name": "John Doe",
  "is_locked": false,
  "lock_message": "",
  "warning_message": "",
  "uninstall_allowed": false,
  "loan_amount": 50000,
  "loan_due_date": "2024-12-31",
  "offline": false
}
```

---

#### 3. Update Device Location
```http
POST /api/device/location
Content-Type: application/json

{
  "client_id": "uuid",
  "latitude": 40.7128,
  "longitude": -74.0060
}
```

---

#### 4. Update Push Token
```http
POST /api/device/push-token
Content-Type: application/json

{
  "client_id": "uuid",
  "push_token": "ExponentPushToken[...]"
}
```

---

#### 5. Clear Warning
```http
POST /api/device/clear-warning/{client_id}
```

---

#### 6. Report Admin Status
```http
POST /api/device/report-admin-status
Content-Type: application/json

{
  "client_id": "uuid",
  "admin_active": true
}
```

---

#### 7. Report Tamper Attempt
```http
POST /api/clients/{client_id}/report-tamper
Content-Type: application/json

{
  "tamper_type": "uninstall_attempt"
}
```

---

#### 8. Report Device Reboot
```http
POST /api/clients/{client_id}/report-reboot
```

---

### Loan Plans

#### 1. Create Loan Plan
```http
POST /api/loan-plans?admin_token={token}
Content-Type: application/json

{
  "name": "Standard EMI Plan",
  "description": "12-month standard plan",
  "interest_rate": 10,
  "min_term_months": 6,
  "max_term_months": 24,
  "min_amount": 10000,
  "max_amount": 100000,
  "emi_calculation_method": "reducing_balance"
}
```

**EMI Calculation Methods:**
- `simple_interest`
- `reducing_balance` (recommended)
- `flat_rate`

---

#### 2. Get All Loan Plans
```http
GET /api/loan-plans?active_only=false
```

---

#### 3. Get Single Loan Plan
```http
GET /api/loan-plans/{plan_id}
```

---

#### 4. Update Loan Plan
```http
PUT /api/loan-plans/{plan_id}?admin_token={token}
Content-Type: application/json

{
  "name": "Updated Plan",
  "interest_rate": 12
}
```

---

#### 5. Delete Loan Plan
```http
DELETE /api/loan-plans/{plan_id}?admin_token={token}
```

---

### Loan Management

#### 1. Setup Loan
```http
POST /api/loans/{client_id}/setup
Content-Type: application/json

{
  "loan_amount": 50000,
  "loan_term_months": 12,
  "interest_rate": 10,
  "down_payment": 10000,
  "loan_start_date": "2024-01-01",
  "emi_calculation_method": "reducing_balance"
}
```

---

#### 2. Get Payment Schedule
```http
GET /api/loans/{client_id}/schedule
```

**Response:** Array of payment schedule entries

---

#### 3. Update Loan Settings
```http
PUT /api/loans/{client_id}/settings
Content-Type: application/json

{
  "auto_lock_enabled": true,
  "auto_lock_days_overdue": 3,
  "grace_period_days": 2,
  "late_fee_percentage": 2
}
```

---

### Payments

#### 1. Record Payment
```http
POST /api/loans/{client_id}/payments?admin_token={token}
Content-Type: application/json

{
  "amount": 5000,
  "payment_date": "2024-01-15",
  "payment_method": "cash",
  "notes": "January payment"
}
```

---

#### 2. Get Payment History
```http
GET /api/loans/{client_id}/payments
```

---

### Late Fees

#### 1. Calculate All Late Fees
```http
POST /api/late-fees/calculate-all?admin_token={token}
```

---

#### 2. Get Client Late Fees
```http
GET /api/clients/{client_id}/late-fees
```

---

### Reminders

#### 1. Get All Reminders
```http
GET /api/reminders?sent=false&limit=100&admin_id={optional_admin_id}
```

---

#### 2. Get Client Reminders
```http
GET /api/clients/{client_id}/reminders?admin_id={optional_admin_id}
```

---

#### 3. Create All Reminders
```http
POST /api/reminders/create-all?admin_token={token}
```

---

#### 4. Mark Reminder as Sent
```http
POST /api/reminders/{reminder_id}/mark-sent
```

---

### Reports

#### 1. Collection Report
```http
GET /api/reports/collection
```

**Response:**
```json
{
  "total_collected": 500000,
  "total_outstanding": 200000,
  "collection_rate": 71.43,
  "overdue_amount": 50000
}
```

---

#### 2. Client Report
```http
GET /api/reports/clients
```

---

#### 3. Financial Report
```http
GET /api/reports/financial
```

---

### Utility

#### 1. EMI Calculator - Compare Methods
```http
GET /api/calculator/compare?principal=50000&annual_rate=10&months=12
```

---

#### 2. Calculate Amortization Schedule
```http
POST /api/calculator/amortization
Content-Type: application/json

{
  "principal": 50000,
  "annual_rate": 10,
  "months": 12,
  "method": "reducing_balance"
}
```

---

#### 3. Fetch Phone Price
```http
GET /api/clients/{client_id}/fetch-price?admin_id={optional_admin_id}
```

---

#### 4. Get Statistics
```http
GET /api/stats
```

**Response:**
```json
{
  "total_clients": 50,
  "active_loans": 45,
  "locked_devices": 5,
  "total_loan_amount": 2500000
}
```

---

#### 5. Health Check
```http
GET /api/health
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00"
}
```

---

#### 6. Root
```http
GET /api/
```

**Response:** API information and welcome message

---

## Error Responses

All endpoints may return error responses in this format:

```json
{
  "detail": "Error message description"
}
```

Common HTTP Status Codes:
- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid authentication
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## Rate Limiting

Currently no rate limiting is implemented. Consider implementing rate limiting in production environments.

---

## CORS Configuration

The API allows cross-origin requests from all origins (`*`). For production, configure specific allowed origins in the backend.

---

## WebSocket Support

No WebSocket endpoints are currently available. All communication is REST-based HTTP.

---

## Background Jobs

The backend runs several background jobs:
- **Late Fee Calculation**: Runs periodically to apply late fees
- **Auto-Lock**: Automatically locks devices for overdue payments
- **Payment Reminders**: Creates reminders for upcoming payments

---

## Security Considerations

1. **Always use HTTPS** in production
2. **Never expose admin tokens** in client-side code
3. **Rotate admin credentials** regularly
4. **Implement rate limiting** to prevent abuse
5. **Monitor API logs** for suspicious activity
6. **Use strong passwords** for admin accounts
7. **Keep the backend updated** with security patches

---

## Support

For API issues or questions:
- Check this documentation
- Review backend logs
- Open an issue on GitHub
- Contact the development team

---

## Version History

- **v1.0.0** - Initial API release
  - Complete admin management
  - Client and device management
  - Loan and payment tracking
  - Reports and analytics
