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

### Session 26: Search, Interest Card & Auto-Archive (Feb 16, 2026)
**COMPLETED - All features implemented and tested (100% pass rate)**

1. **Loan History Search** - IMPLEMENTED
   - Search bar in collapsible "Laenu ajalugu" section on client detail pages
   - Client-side filtering by loan amount, date, interest rate, total paid
   - Clear button when search has text
   - "No results found" empty state

2. **Interest Earned Dashboard Card** - IMPLEMENTED
   - New card on admin dashboard showing:
     - Total interest earned from all archived loans
     - Current month interest earned
     - Total loans archived count
     - Current month archived count
   - Backend: Enhanced `/api/paid-loans/summary` endpoint with `current_month_interest` and `current_month_loans_archived`
   - Fixed route ordering: summary route placed before `{paid_loan_id}` to avoid 404

3. **Auto-Archive on Full Payment** - IMPLEMENTED (Previous session, carried forward)
   - `perform_archive()` shared function in `paid_loans.py`
   - Called from `record_payment()` when `new_outstanding <= 0`

4. **Removed "Tasutud" (Settled) Tab** - IMPLEMENTED (Previous session)
   - Only "Antud" (Given) and "Arhiveeritud" (Archived) tabs remain

5. **Registration Code Bug Fix** - FIXED
   - `registration_code` default changed from `""` to `Optional[str] = None`
   - Excluded from MongoDB insert when None (sparse unique index compat)

**Testing Results:** 100% pass rate (7/7 backend tests, frontend verified)
- Test report: `/app/test_reports/iteration_32.json`

## Key Files
```
/app
├── backend/
│   ├── server.py
│   ├── database.py
│   ├── models/schemas.py
│   └── routes/
│       ├── paid_loans.py        # Summary endpoint, archive, loan history
│       ├── loans.py             # Auto-archive on payment
│       ├── clients.py           # Registration code fix
│       └── ...
└── frontend/
    ├── app/admin/
    │   ├── (tabs)/index.tsx     # Dashboard + Interest Earned card
    │   ├── (tabs)/loans.tsx     # 2 tabs: Given + Archived
    │   └── client-details.tsx   # Loan History with search
    └── src/context/
        └── ThemeContext.tsx
```

## Credentials
- Superadmin: `username=karli1987`, `password=nasvakas123`
- Admin: `username=testadmin`, `password=testpassword`

## Current Backlog
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
