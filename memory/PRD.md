# EMI Device Admin - Product Requirements Document

## Original Problem Statement
EMI/Loan management mobile application with admin and client apps. Admin app manages clients, loan plans, device locking. Client app enforces device admin policies, prevents uninstall, and reports status.

## Architecture
- **Backend**: FastAPI + MongoDB (port 8001 internally)
- **Frontend**: React Native / Expo (mobile app)
- **Native Module**: `emi-device-admin` Expo module (Kotlin) for Android Device Admin API
- **Auth**: Token-based (24h expiry), stored in AsyncStorage
- **API URL**: `EXPO_PUBLIC_BACKEND_URL` env var

## What's Implemented

### Core Features
1. Admin Dashboard with analytics, heartbeat monitoring, revenue charts
2. Client CRUD with device management, geolocation, bulk operations
3. Loan Plans CRUD, Loan Setup with date pickers, EMI calculator
4. Payment recording with automatic credit score adjustments
5. Dark/Light theme toggle with persistence
6. Audit Log system (superadmin only)
7. Credit Score tracking (0-1000 range)
8. Client Self-Service Portal (phone + registration code login)
9. Multi-Admin Dashboard Analytics (superadmin filter)
10. Late Fee Auto-Calculation & Auto-Lock system
11. Contract PDF generation & email sending
12. Payment Reminders system
13. Notification Center
14. Support Chat

### Session 25: Loan Archiving & Auto-Archive (Feb 16, 2026)
**COMPLETED - All features implemented and tested (100% pass rate)**

1. **Auto-Archive on Full Payment** - IMPLEMENTED
   - When a payment clears outstanding balance to 0, loan is automatically archived
   - `perform_archive()` shared function in `paid_loans.py`
   - Called from `record_payment()` in `loans.py` when `new_outstanding <= 0`
   - Response includes `auto_archived` field with archive details
   - Creates notification for admin
   - Clears loan fields on client record

2. **Removed "Tasutud" (Settled) Tab** - IMPLEMENTED
   - Loans page now has only 2 tabs: "Antud" (Given) and "Arhiveeritud" (Archived)
   - Removed manual archive button (no longer needed)
   - Updated empty state text for archived tab
   - Cleaned up unused styles and state variables

3. **Client Loan History** - VERIFIED
   - Backend: `GET /api/clients/{client_id}/loan-history` returns archived loans
   - Frontend: Collapsible "Laenu ajalugu" section on client details page
   - Shows loan amount, interest rate, total paid, interest earned, payment count

4. **Registration Code Bug Fix** - FIXED
   - Changed `registration_code` default from `""` to `Optional[str] = None`
   - Exclude `registration_code` field from MongoDB insert when None
   - Sparse unique index now properly allows multiple clients without codes

**Testing Results:** 100% pass rate (11/11 backend tests, frontend verified)
- Test report: `/app/test_reports/iteration_31.json`

## Key Files
```
/app
├── backend/
│   ├── server.py                    # App initialization, routers
│   ├── config.py                    # Configuration
│   ├── database.py                  # MongoDB connection
│   ├── models/schemas.py            # Pydantic models
│   ├── utils/                       # Auth, calculations, audit
│   └── routes/
│       ├── admin.py                 # Admin auth, profile, credits, settings
│       ├── clients.py               # Client CRUD, bulk operations
│       ├── device.py                # Device registration, status
│       ├── loans.py                 # Loan plans, payments (auto-archive)
│       ├── paid_loans.py            # Archive system, loan history
│       ├── reports.py               # Analytics, heartbeat
│       ├── notifications.py         # Notification management
│       ├── support.py               # Support chat
│       ├── reminders.py             # Payment reminders
│       ├── contracts.py             # PDF contracts, email
│       ├── audit_logs.py            # Audit log system
│       ├── credit_score.py          # Credit score tracking
│       └── client_auth.py           # Client self-service portal
└── frontend/
    ├── app/
    │   ├── admin/
    │   │   ├── (tabs)/index.tsx     # Dashboard with analytics
    │   │   ├── (tabs)/loans.tsx     # Loans: Given + Archived tabs
    │   │   ├── (tabs)/transactions.tsx
    │   │   ├── client-details.tsx   # Client details + Loan History
    │   │   ├── settings.tsx         # Theme toggle, admin settings
    │   │   └── ...
    │   └── client/
    │       └── ...
    └── src/
        └── context/
            └── ThemeContext.tsx      # Dark/Light theme
```

## Credentials
- Superadmin: `username=karli1987`, `password=nasvakas123`
- Admin: `username=testadmin`, `password=testpassword`

## Current Backlog
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
- P3: Search functionality in Loan History section
