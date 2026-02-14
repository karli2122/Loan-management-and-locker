# Backend Architecture Documentation

## Overview
The EMI Device Admin backend is a FastAPI application that manages:
- Admin authentication and authorization
- Client/device management
- Loan management and EMI calculations
- Payment tracking and reminders
- Push notifications via Expo

## Directory Structure

```
/app/backend/
├── server.py           # Main application file (2900+ lines - legacy monolith)
├── models/
│   ├── __init__.py     # Model exports
│   └── schemas.py      # Pydantic models (reusable for new routers)
├── utils/
│   ├── __init__.py     # Utility exports
│   ├── auth.py         # Authentication helpers
│   ├── calculations.py # EMI calculation functions
│   └── exceptions.py   # Custom exception classes
├── routes/             # Future: API route modules
│   └── (empty - for future refactoring)
├── services/           # Future: Business logic services
│   └── (empty - for future refactoring)
└── tests/              # Pytest test files
    ├── test_admin_token_security.py
    ├── test_client_delete_flow.py
    ├── test_credit_generate_code.py
    ├── test_credit_management.py
    ├── test_emi_admin_api.py
    ├── test_enhancement_features.py
    ├── test_heartbeat_silent_clients.py
    └── test_loan_plans_and_auth.py
```

## API Route Groups

The server.py contains these route groups (in order):

1. **Admin Routes** (`/api/admin/*`)
   - `/admin/register` - Create admin account
   - `/admin/login` - Authenticate admin
   - `/admin/verify/{token}` - Verify token validity
   - `/admin/list` - List all admins
   - `/admin/change-password` - Change password
   - `/admin/profile` - Update profile
   - `/admin/{admin_id}` - Delete admin

2. **Credit Management** (`/api/admin/credits/*`)
   - `/admin/credits` - Get credit balance
   - `/admin/credits/assign` - Assign credits (superadmin)
   - `/admin/list-with-credits` - List admins with credits

3. **Client Management** (`/api/clients/*`)
   - CRUD operations for clients
   - `/clients/silent` - Get silent/offline clients
   - `/clients/export` - Export client data
   - `/clients/locations` - Get client locations for map
   - `/clients/bulk-operation` - Bulk lock/unlock/warning

4. **Device Management** (`/api/device/*`)
   - `/device/register` - Register device with code
   - `/device/status/{client_id}` - Get device lock status
   - `/device/location` - Update device location
   - `/device/push-token` - Update push notification token

5. **Loan Plans** (`/api/loan-plans/*`)
   - CRUD for loan plan templates

6. **Loan Management** (`/api/loans/*`)
   - `/loans/{client_id}/setup` - Setup loan for client
   - `/loans/{client_id}/payments` - Record/get payments
   - `/loans/{client_id}/schedule` - Payment schedule
   - `/loans/{client_id}/settings` - Auto-lock settings

7. **Reminders & Late Fees** (`/api/reminders/*`)
   - `/reminders` - Get all reminders
   - `/reminders/pending` - Get pending payment reminders
   - `/reminders/send-push` - Send push notifications
   - `/reminders/send-single/{client_id}` - Send to specific client
   - `/late-fees/calculate-all` - Trigger late fee calculation

8. **Reports & Analytics** (`/api/reports/*`)
   - `/reports/collection` - Collection statistics
   - `/reports/clients` - Client categorization report
   - `/reports/financial` - Financial breakdown
   - `/analytics/dashboard` - Comprehensive dashboard data

9. **Notifications** (`/api/notifications/*`)
   - GET/POST for admin notifications
   - Mark read functionality

10. **Support Chat** (`/api/support/*`)
    - `/support/messages/{client_id}` - Get/send messages

11. **Payment History** (`/api/payments/history/*`)
    - Public endpoint for client payment history

## Future Refactoring Plan

When refactoring, break server.py into these router files:
1. `routes/admin.py` - Admin auth and management
2. `routes/clients.py` - Client CRUD and bulk operations
3. `routes/devices.py` - Device registration and status
4. `routes/loans.py` - Loan plans and management
5. `routes/payments.py` - Payments and reminders
6. `routes/reports.py` - Reports and analytics
7. `routes/notifications.py` - Notifications and support chat

Each router should:
- Use `APIRouter(prefix="/api/...")` 
- Import models from `models/schemas.py`
- Import utils from `utils/`
- Be included in main app with `app.include_router()`

## Key Dependencies
- FastAPI + Starlette
- Motor (async MongoDB driver)
- Pydantic for validation
- Argon2 for password hashing
- httpx for Expo push notifications
- python-dateutil for date calculations

## Environment Variables
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name (default: emi_lock_db)
