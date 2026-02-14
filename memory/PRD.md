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

### Session 6: Enhancement Features (Feb 14, 2026)
1. **Post-Registration Crash Fix**:
   - Added `fresh_registration` flag to coordinate registration → home transition
   - Extended delay (1500ms) for Device Admin prompt after fresh registration
   - Added mount check before showing admin prompt to prevent crashes

2. **Admin Dashboard Analytics** (`GET /api/analytics/dashboard`):
   - Overview metrics: total clients, registered, locked, active loans, overdue
   - Financial summary: total disbursed, collected, outstanding, collection rate
   - Recent activity: registrations and tamper attempts (last 7 days)
   - Monthly revenue trend (6 months)
   - Activity log (recent device activity)

3. **Notification Center**:
   - `GET /api/notifications` - Get notifications with unread count
   - `POST /api/notifications/mark-all-read` - Mark all as read
   - Frontend: `/app/frontend/app/admin/notifications.tsx`

4. **Client Geolocation Map**:
   - `GET /api/clients/locations` - Get all client locations with lat/lng
   - Frontend: `/app/frontend/app/admin/client-map.tsx`

5. **Bulk Operations** (`POST /api/clients/bulk-operation`):
   - Actions: lock, unlock, warning
   - Returns success/failure counts

6. **Client Export** (`GET /api/clients/export`):
   - Format: JSON or CSV
   - Sanitized client data for export

7. **Support Chat**:
   - `GET /api/support/messages/{client_id}` - Get chat messages
   - `POST /api/support/messages/{client_id}` - Send message
   - Creates notification for admin when client sends message
   - Frontend: `/app/frontend/app/client/support-chat.tsx`

8. **Payment History** (`GET /api/payments/history/{client_id}`):
   - Returns payments timeline, totals, loan info
   - Frontend: `/app/frontend/app/client/payment-history.tsx`

### Session 5: Credit System & Security (Feb 14, 2026)
1. **Credit System Logic Correction**
2. **API Security Audit** - 20+ endpoints secured with JWT

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
    │   │   ├── (tabs)/index.tsx      # Dashboard with analytics
    │   │   ├── notifications.tsx     # Notification center (NEW)
    │   │   ├── client-map.tsx        # Client locations map (NEW)
    │   │   ├── add-client.tsx
    │   │   ├── loan-plans.tsx
    │   │   ├── login.tsx
    │   │   └── settings.tsx
    │   └── client/
    │       ├── home.tsx               # Updated with new navigation
    │       ├── register.tsx           # Fixed crash issue
    │       ├── payment-history.tsx    # Payment timeline (NEW)
    │       └── support-chat.tsx       # Support chat (NEW)
    ├── src/
    │   ├── constants/api.ts
    │   ├── utils/
    │   │   ├── adminAuth.ts
    │   │   ├── DevicePolicy.ts
    │   │   ├── api.ts
    │   │   └── errorHandler.ts
    │   ├── context/LanguageContext.tsx
    │   └── services/OfflineSyncManager.ts
    └── package.json
```

## DB Schema
- **admins**: `(id, username, password_hash, first_name, last_name, role, is_super_admin, credits)`
- **admin_tokens**: `(admin_id, token, expires_at)` — upsert on login
- **clients**: `(id, name, phone, email, admin_id, admin_mode_active, registration_code, latitude, longitude, ...)`
- **loan_plans**: `(id, name, interest_rate, min/max_tenure_months, processing_fee_percent, late_fee_percent, description, is_active, admin_id)`
- **notifications**: `(id, admin_id, type, title, message, client_id, client_name, is_read, created_at)` (NEW)
- **support_messages**: `(id, client_id, sender, message, is_read, created_at)` (NEW)
- **payments**: `(id, client_id, amount, payment_date, payment_method, notes, recorded_by)`

## Key API Endpoints
- `POST /api/admin/login` — returns token, id, role, first_name, last_name
- `GET /api/admin/verify/{token}` — verify token validity
- `GET/POST/PUT/DELETE /api/loan-plans` — CRUD with `admin_token` query param
- `POST /api/clients` — create client with `admin_token` query param
- `GET /api/device/status/{client_id}` — device status incl. `uninstall_allowed`
- `POST /api/device/report-admin-status` — report device admin mode status
- **New Enhancement Endpoints**:
  - `GET /api/analytics/dashboard` - Dashboard analytics
  - `GET /api/notifications` - Get notifications
  - `GET /api/clients/locations` - Client map data
  - `GET /api/clients/export` - Export clients
  - `POST /api/clients/bulk-operation` - Bulk lock/unlock/warning
  - `GET/POST /api/support/messages/{client_id}` - Support chat
  - `GET /api/payments/history/{client_id}` - Payment history

## Credentials
- Superadmin: `username=karli1987`, `password=nasvakas123`
- Admin: `username=testadmin`, `password=testpassword`

## Backlog
- P2: Enforce `buildApiUrl()` usage across all API calls for consistency
- P3: Push notifications for payment reminders (requires FCM integration)
- P3: Detailed admin dashboard with charts (Chart library integration)

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

## What's Implemented (Feb 14, 2026 - Session 4: Credit System + Security Audit)
1. **Credit-based device registration** (CORRECTED):
   - Admin model updated with `credits` (default: 5) and `is_super_admin` fields
   - Credits are used when generating registration codes, NOT during client creation
   - `POST /api/clients/{client_id}/generate-code` - generates new code and deducts 1 credit
   - Non-superadmin admins must have credits to generate registration codes
   - Superadmins bypass the credit system (unlimited codes)
2. **Credit management APIs**:
   - `GET /api/admin/credits` - Get current admin's credit balance
   - `POST /api/admin/credits/assign` - Superadmin assigns credits to other admins
   - `GET /api/admin/list-with-credits` - List all admins with credits (superadmin only)
3. **UI credit display**:
   - Dashboard shows credit balance card with superadmin indicator
   - Settings page shows credit balance and credit management section
   - **Client details page** shows "Generate key" button with credit badge
   - Button disabled for non-superadmins with 0 credits
   - Admin list in settings shows credit badges for each admin
4. **Silent client filter (Kadunud)**:
   - Clients that haven't sent heartbeat in 60 minutes are flagged as silent
   - Filter button in client list to show only silent clients
5. **API Security Audit (COMPLETE)**:
   - Added `get_admin_id_from_token()` helper function for secure token validation
   - **Secured endpoints** now require `admin_token` instead of `admin_id`:
     - `GET /api/clients`
     - `GET /api/clients/{client_id}`
     - `PUT /api/clients/{client_id}`
     - `POST /api/clients/{client_id}/lock`
     - `POST /api/clients/{client_id}/unlock`
     - `POST /api/clients/{client_id}/warning`
     - `POST /api/clients/{client_id}/allow-uninstall`
     - `DELETE /api/clients/{client_id}`
   - Frontend updated to use `admin_token` for all secured API calls
   - All 27 security tests passed (100%)
   - Clients list has "Kadunud" (Silent) filter button 
   - Shows clients that haven't communicated in 60 minutes
   - Displays last seen time and tamper attempt count
5. **Backend tests**: 15/15 credit management tests passed

## DB Schema (Updated)
- **admins**: `(id, username, password_hash, first_name, last_name, role, is_super_admin, credits)`
- **admin_tokens**: `(admin_id, token, expires_at)` — upsert on login
- **clients**: `(id, name, phone, email, admin_id, admin_mode_active, registration_code, last_heartbeat, uninstall_allowed, ...)`
- **loan_plans**: `(id, name, interest_rate, min/max_tenure_months, processing_fee_percent, late_fee_percent, description, is_active, admin_id)`

## Key API Endpoints (Updated)
- `POST /api/admin/login` — returns token, id, role, first_name, last_name, **credits**, **is_super_admin**
- `GET /api/admin/credits` — get admin's credit balance
- `POST /api/admin/credits/assign` — superadmin assigns credits (body: {target_admin_id, credits})
- `GET /api/admin/list-with-credits` — list all admins with credits (superadmin only)
- `GET /api/clients/silent` — list clients that haven't checked in recently
- `POST /api/clients/{client_id}/generate-code` — generate new registration code (uses 1 credit for non-superadmins)

## What's Implemented (Feb 14, 2026 - Session 5: Post-Registration Crash Fix)
1. **Fixed client app crash after device registration**:
   - Added `fresh_registration` flag in AsyncStorage to coordinate registration → home transition
   - Extended delay (1500ms) for Device Admin prompt after fresh registration vs 500ms for normal app open
   - Added 100ms delay before navigation from registration success alert to ensure alert dismisses cleanly
   - Added mount check before showing admin prompt to prevent crashes if component unmounts during initialization

## Testing Status (Dec 2025)
### Enhancement Features - COMPLETE
- **Backend**: All 30 tests passed (100%)
- **Verified Endpoints**:
  - `GET /api/notifications?admin_token&limit=100` - PASS
  - `POST /api/notifications/mark-all-read?admin_token` - PASS
  - `GET /api/clients/locations?admin_token` - PASS
  - `GET /api/payments/history/{client_id}` - PASS
  - `GET /api/support/messages/{client_id}` - PASS
  - `POST /api/support/messages/{client_id}?sender=client` - PASS
- **Frontend**: React Native/Expo mobile app - browser testing N/A

## Backlog
- P1: **Refactor `backend/server.py`** - File is 2800+ lines, needs breaking into smaller modules using FastAPI APIRouter
- P2: API URL consolidation (src/constants/api.ts vs src/utils/api.ts) - centralize API URL configuration
- P3: Enforce `buildApiUrl()` usage across all API calls for consistency
