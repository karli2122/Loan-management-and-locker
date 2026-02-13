# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Mobile application (React Native/Expo) + FastAPI backend for managing EMI (Equated Monthly Installment) device loans. Admins manage clients, loans, devices, and view financial reports.

## Core Requirements
1. Admin authentication with token-based security
2. Client management (CRUD) with device registration
3. Loan management with EMI calculations
4. Device lock/unlock functionality via native Android module
5. Financial reports and analytics
6. Multi-admin support with data segregation

## Architecture
- **Frontend**: React Native (Expo) - builds as Android APK
- **Backend**: FastAPI (Python) on port 8001
- **Database**: MongoDB
- **Native Module**: emi-device-admin (Kotlin) for Android device admin features

## What's Been Implemented

### Session 1-3 (Previous Agents)
- Expo build system stabilized
- Stale URL eradication (multiple rounds)
- Authentication flow hardened (token validation, 401 handling)
- Native Kotlin module rewritten (admin mode crash fix)
- All 13 API endpoints verified operational

### Session 4 (Current - Feb 13, 2026)
- **Data Segregation (P0)**: Made `/api/stats`, `/api/reports/collection`, `/api/reports/clients` require `admin_id` parameter. Admins now only see their own data.
- **Stale URL Cleanup (P0)**: Removed dead fallback URLs from `src/constants/api.ts`, `src/utils/api.ts`, `app/admin/(tabs)/index.tsx`
- **Device Management Fix (P0)**: `device-management.tsx` now passes `admin_id` to `/api/stats`
- **Profit Report Enhancement (P0)**: `/api/reports/financial` now returns admin `first_name`, `last_name`, `username`, `role` in response. PDF export uses this data.
- **Add Client**: Verified working - POST `/api/clients?admin_token={token}` creates clients correctly

### Testing
- Backend API: 13/13 tests passed (100%)
- Test file: `/app/backend/tests/test_emi_admin_api.py`

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (Important)
- API Security Audit: Verify all endpoints have proper auth middleware
- User needs to rebuild APK with `--clear-cache` to get latest fixes

### P2 (Nice to have)
- Frontend URL consolidation into single source of truth
- Code refactoring for production readiness

## Key API Endpoints
- `POST /api/admin/login` - Admin authentication
- `GET /api/stats?admin_id={id}` - Device statistics (admin_id REQUIRED)
- `GET /api/reports/collection?admin_id={id}` - Collection report (admin_id REQUIRED)
- `GET /api/reports/clients?admin_id={id}` - Client report (admin_id REQUIRED)
- `GET /api/reports/financial?admin_id={id}` - Financial report (admin_id optional but recommended)
- `POST /api/clients?admin_token={token}` - Create client
- `GET /api/clients?admin_id={id}` - List clients

## Credentials
- Admin: `karli1987` / `nasvakas123`
- Admin ID: `a8c52e87-f8c8-44b3-9371-57393881db18`
