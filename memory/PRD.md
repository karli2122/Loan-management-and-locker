# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Dashboard analytics, client portal, and loan management features for an EMI device administration system. Estonian language support (et) with English fallback.

## Core Users
- **Superadmin** (karli1987): Full access to all features
- **Admin** (testadmin): Standard loan management
- **Client**: Self-service loan portal

## Tech Stack
- **Frontend**: React Native (Expo), react-native-chart-kit, expo-document-picker, TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic, PyMuPDF, emergentintegrations (GPT-4.1)
- **Auth**: Token-based admin auth (30-day expiry), registration code client auth
- **Native Android**: Custom Expo module (emi-device-admin) with Device Admin API, kiosk mode (Lock Task), tamper detection

## What's Been Implemented

### Phase 1-4 (Previous sessions)
- Core loan management, client portal, device lock/unlock
- Dashboard analytics, auto-archiving, loan renewal
- Bank statement analyzer (AI-powered)

### Phase 5 - Bug Fixes (Feb 17, 2026)
- **Bank Statement Analyzer file upload**: Fixed for native mobile
- **Dashboard compacted**: Reduced chart heights, tighter padding
- **Session persistence**: Extended token expiry to 30 days
- **Backend URL fixed**: Updated all fallback URLs
- **EAS build config**: Added EXPO_PUBLIC_BACKEND_URL to all build profiles
- **.gitignore cleanup**: Removed duplicate env blocks
- **yarn.lock**: Regenerated clean lockfile

### Phase 6 - Device Management Bug Fixes (Feb 17, 2026)
- **Kiosk Mode (Lock Task)**: Added `startKioskMode()`/`stopKioskMode()` to native module. When device is locked, the app pins itself using Android Lock Task API. Device Owner mode gives seamless kiosk (no user confirmation). Device Admin mode shows system pinning dialog.
- **Allow Uninstall Race Condition Fix**: Changed `allowUninstall()` to use `commit()` (synchronous) instead of `apply()` (async) before calling `removeActiveAdmin()`. This ensures `onDisableRequested` in the receiver reads the correct flag and does NOT trigger a factory reset.
- **Registration Crash Fix**: Added `initComplete` ref to prevent the protection useEffect from racing with the main initialization. The protection effect now waits up to 6 seconds for init to complete before proceeding.
- **Removed Factory Reset on Unauthorized Disable**: `onDisableRequested` no longer calls `wipeData(0)`. Instead, it locks the screen and launches the app for a tamper re-enable prompt. This is safer while still deterring tampering.
- **Backend APIs verified**: All 17 device management backend tests passed (100%).

## Key API Endpoints
- `POST /api/bank-statements/analyze` - Upload & analyze bank statement
- `GET /api/bank-statements/history` - Past analyses
- `GET /api/paid-loans/summary` - Interest summary + 6-month trend
- `GET /api/paid-loans/{client_id}/latest` - Latest archived loan for renewal
- `POST /api/admin/login` - Admin auth (30-day token)
- `POST /api/device/register` - Client device registration
- `GET /api/device/status/{client_id}` - Device lock/uninstall status
- `POST /api/clients/{client_id}/allow-uninstall` - Admin allows uninstall

## Key Files for Device Management
- `frontend/modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/EMIDeviceAdminModule.kt` - Native Kotlin module with kiosk, admin, uninstall logic
- `frontend/modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/EMIDeviceAdminReceiver.kt` - Device Admin receiver (tamper detection)
- `frontend/src/utils/DevicePolicy.ts` - TypeScript wrapper for native module
- `frontend/modules/emi-device-admin/src/index.ts` - Module exports
- `frontend/app/client/home.tsx` - Client home with kiosk mode integration

## Backlog
- P1: Complete Bank Statement Analyzer (.asice parsing, enriched LLM analysis)
- P2: Automated Payment Reminders (SMS/Email)
- P2: Bulk Payment Import (CSV)
- P2: Client Credit Score Report (PDF Generation)
- P2: Dashboard Profit/Loss Summary
- P2: Payment Receipt Generation
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
