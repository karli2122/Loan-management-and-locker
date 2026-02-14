# EMI Device Admin - Product Requirements Document

## Original Problem Statement
EMI/Loan management mobile application with admin and client apps. Admin app manages clients, loan plans, device locking. Client app enforces device admin policies, prevents uninstall, and reports status.

## Architecture
- **Backend**: FastAPI + MongoDB (port 8001 internally)
- **Frontend**: React Native / Expo (mobile app)
- **Native Module**: `emi-device-admin` Expo module (Kotlin) for Android Device Admin API
- **Auth**: Token-based (24h expiry), stored in AsyncStorage
- **API URL**: `EXPO_PUBLIC_BACKEND_URL` env var

## Key Files
```
/app
├── backend/
│   └── server.py                    # All API logic
└── frontend/
    ├── modules/emi-device-admin/    # Native Expo module
    │   └── android/src/main/java/expo/modules/emideviceadmin/
    │       ├── EMIDeviceAdminModule.kt
    │       └── EMIDeviceAdminReceiver.kt
    ├── app/
    │   ├── admin/
    │   │   ├── add-client.tsx
    │   │   ├── loan-plans.tsx
    │   │   ├── login.tsx
    │   │   └── settings.tsx
    │   └── client/
    │       ├── home.tsx
    │       └── register.tsx
    ├── src/
    │   ├── constants/api.ts
    │   ├── utils/
    │   │   ├── adminAuth.ts         # Shared admin auth utility (NEW)
    │   │   ├── DevicePolicy.ts
    │   │   ├── api.ts
    │   │   └── errorHandler.ts
    │   ├── context/LanguageContext.tsx
    │   └── services/OfflineSyncManager.ts
    └── package.json
```

## DB Schema
- **admins**: `(id, username, password_hash, first_name, last_name, role, is_super_admin)`
- **admin_tokens**: `(admin_id, token, expires_at)` — upsert on login
- **clients**: `(id, name, phone, email, admin_id, admin_mode_active, registration_code, ...)`
- **loan_plans**: `(id, name, interest_rate, min/max_tenure_months, processing_fee_percent, late_fee_percent, description, is_active, admin_id)`

## Key API Endpoints
- `POST /api/admin/login` — returns token, id, role, first_name, last_name
- `GET /api/admin/verify/{token}` — verify token validity
- `GET/POST/PUT/DELETE /api/loan-plans` — CRUD with `admin_token` query param
- `POST /api/clients` — create client with `admin_token` query param
- `GET /api/device/status/{client_id}` — device status incl. `uninstall_allowed`
- `POST /api/device/report-admin-status` — report device admin mode status

## Credentials
- Admin: `username=karli1987`, `password=nasvakas123`

## What's Implemented (Feb 14, 2026)
1. **Loan Plan CRUD fix**: All operations (create/delete/update/toggle) now use centralized `getAuthInfo()` from `adminAuth.ts` with proper 401 handling + redirect to login
2. **Add Client fix**: Uses `getAuthInfo()` with 401 handling
3. **Settings page fix**: Removed aggressive token verification on page load; only redirects if no token/adminId stored at all
4. **Admin mode protection enhancement**:
   - `EMIDeviceAdminReceiver.kt`: Now locks device screen when user attempts to disable Device Admin (before confirmation)
   - `EMIDeviceAdminReceiver.kt`: **Auto-launches the app** via `getLaunchIntentForPackage()` on both `onDisableRequested` and `onDisabled` — shows non-dismissable re-enable prompt even if app was closed
   - `EMIDeviceAdminModule.kt`: Added `wasAdminDisabled()` and `clearTamperFlags()` methods
   - `DevicePolicy.ts`: Added corresponding JS wrapper methods
   - `client/home.tsx`: Enhanced `checkAndSetupDeviceProtection()` — detects forced deactivation, reports tamper, shows non-dismissable re-enable prompt
5. **Code cleanup**: Removed duplicate `src/src/` directory
6. **New utility**: `src/utils/adminAuth.ts` — centralized auth token handling

## What's Implemented (Feb 14, 2026 - Session 2)
1. **Client details conditional quick actions**: Quick actions section only renders when `client.is_registered === true`
2. **Delete confirmation with auto-uninstall**: Delete button shows "Are you sure?" dialog. On confirmation, automatically calls `/api/clients/{id}/allow-uninstall` first, then `/api/clients/{id}` DELETE
3. **Backend verified**: Full chain (login → create → guard check → allow-uninstall → delete) tested with 7/7 tests passing

## What's Implemented (Feb 14, 2026 - Session 3: Security Hardening)
1. **Factory reset on tamper**: `EMIDeviceAdminReceiver.kt` → `onDisableRequested()` calls `dpm.wipeData(0)` if `uninstall_allowed=false`. Device wiped before admin disable completes.
2. **Heartbeat monitoring**: Backend tracks `last_heartbeat` on every status check. New `GET /api/clients/silent` endpoint. 9/9 tests passed.
3. **Persistent identity backup**: Native `backupClientData/restoreClientData/clearBackupData` methods write to `/sdcard/.emi_backup/`. App restores identity after Clear Data and reports tamper.
4. **Client model update**: Added `last_heartbeat` and `uninstall_allowed` fields.

## Backlog
- P1: API Security Audit — verify all endpoints have auth middleware
- P2: API URL consolidation (src/constants/api.ts vs src/utils/api.ts)
