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

### Previous Sessions
- Expo build system stabilized
- Stale URL eradication (multiple rounds)
- Authentication flow hardened (token validation, 401 handling)
- Native Kotlin module rewritten (admin mode crash fix)
- All 13 API endpoints verified operational

### Current Session (Feb 13, 2026)
- **Data Segregation (P0)**: Made `/api/stats`, `/api/reports/collection`, `/api/reports/clients` require `admin_id` parameter
- **Stale URL Cleanup (P0)**: Removed dead fallback URLs from 5 files: `app.config.js`, `src/constants/api.ts`, `src/utils/api.ts`, `src/src/constants/api.ts`, `app/admin/(tabs)/index.tsx`
- **Device Management Fix (P0)**: `device-management.tsx` now passes `admin_id` to `/api/stats`
- **Profit Report Enhancement (P0)**: `/api/reports/financial` now returns admin `first_name`, `last_name`, `username`, `role`
- **Login API Enhanced (P0)**: `AdminResponse` model now includes `first_name`/`last_name`. Login endpoint returns these from DB
- **Dashboard Welcome Screen (P0)**: Removed hardcoded `karli1987='Admin'` check. Now shows user's first name
- **Settings Role Label (P0)**: Shows actual role (Admin/User) instead of hardcoded "Administrator"
- **Admin Mode Fix (P0)**: AndroidManifest.xml now uses fully qualified receiver class name `expo.modules.emideviceadmin.EMIDeviceAdminReceiver`

### Testing
- Backend API: 14/14 tests passed (100%) - iteration_2
- Test files: `/app/backend/tests/test_emi_admin_api.py`

## Prioritized Backlog

### P1 (Important)
- API Security Audit: Verify all endpoints have proper auth middleware
- User needs to rebuild BOTH admin and client APKs with `--clear-cache`

### P2 (Nice to have)
- Code refactoring for production readiness

## Key API Endpoints
- `POST /api/admin/login` - Returns id, username, role, is_super_admin, token, first_name, last_name
- `GET /api/stats?admin_id={id}` - Device statistics (admin_id REQUIRED)
- `GET /api/reports/collection?admin_id={id}` - Collection report (admin_id REQUIRED)
- `GET /api/reports/clients?admin_id={id}` - Client report (admin_id REQUIRED)
- `GET /api/reports/financial?admin_id={id}` - Financial report with admin info
- `POST /api/clients?admin_token={token}` - Create client

## Credentials
- Admin: `karli1987` / `nasvakas123`
- Admin ID: `a8c52e87-f8c8-44b3-9371-57393881db18`
