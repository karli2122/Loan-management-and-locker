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
- Bank Statement Analyzer file upload fix for native mobile
- Dashboard compacted layout
- Session persistence (30-day token)
- Backend URL fix, EAS build config, .gitignore cleanup, yarn.lock regen

### Phase 6 - Device Management Bug Fixes (Feb 17, 2026)
- **Kiosk Mode**: Added startKioskMode/stopKioskMode to native module
- **Allow Uninstall Fix**: commit() instead of apply() before removeActiveAdmin
- **Registration Crash Fix**: initComplete ref to prevent race condition
- **Removed Factory Reset**: onDisableRequested no longer calls wipeData(0)
- **uninstall_allowed Reset**: Both generate-code and register now reset to false

### Phase 7 - Initialization Crash Fix (Feb 17, 2026)
- **Root cause**: Aggressive initialization showing multiple Alert dialogs + system permission intents + calling non-existent native methods in rapid succession caused 10s of flickering then crash
- **Fix**: Replaced Alert-based admin prompts during init with silent state check. UI banner handles user-initiated admin activation. Removed startForegroundProtection (no native impl), removed checkAndPromptAccessibility (no native impl), removed checkAndSetupDeviceProtection from AppState resume handler.
- **Before**: init → Alert → system dialog → 20s retry loop → non-existent method → Alert → crash
- **After**: init → silent admin check → done. Banner prompts user when ready.

## Key API Endpoints
- POST /api/device/register — now resets uninstall_allowed, admin_mode_active, tamper_attempts
- POST /api/clients/{id}/generate-code — now resets uninstall_allowed
- GET /api/device/status/{client_id}
- POST /api/clients/{id}/allow-uninstall

## Key Files
- frontend/app/client/home.tsx — Simplified initialization
- frontend/modules/emi-device-admin/.../EMIDeviceAdminModule.kt — Kiosk mode + fixed allowUninstall
- frontend/modules/emi-device-admin/.../EMIDeviceAdminReceiver.kt — No more wipeData
- frontend/src/utils/DevicePolicy.ts — Kiosk mode wrapper
- backend/routes/device.py — Register resets uninstall_allowed
- backend/routes/clients.py — Generate-code resets uninstall_allowed

## Backlog
- P1: Complete Bank Statement Analyzer (.asice parsing)
- P2: Automated Payment Reminders (SMS/Email)
- P2: Bulk Payment Import (CSV)
- P2: Client Credit Score Report (PDF Generation)
- P2: Dashboard Profit/Loss Summary
- P2: Payment Receipt Generation
- P3: AMAPI Integration
- P3: Push notifications (FCM)
