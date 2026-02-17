# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Core Users
- **Superadmin** (karli1987): Full access to all features
- **Admin** (testadmin): Standard loan management
- **Client**: Self-service loan portal on locked device

## Tech Stack
- **Frontend**: React Native (Expo), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) with Device Admin, Kiosk, Accessibility, Overlay

## Implemented Features

### Core App
- Loan management, client portal, device lock/unlock, dashboard analytics
- Auto-archiving, loan renewal, bank statement analyzer (AI-powered)
- 30-day JWT token expiry, registration code client auth

### Device Protection (Latest - Feb 17, 2026)
1. **Device Admin** — Prevents unauthorized changes, blocks uninstall
2. **Accessibility Service** (`EMIAccessibilityService.kt`) — Monitors foreground app, relaunches our app if another app takes focus. Disabled when uninstall is allowed.
3. **Display Over Other Apps** (`EMIOverlayService.kt`) — Invisible overlay blocks status bar pulldown and navigation bar access
4. **Screen Pinning** (Kiosk Mode) — `startLockTask()`/`stopLockTask()` pins app to screen. Seamless if device owner, confirmation dialog otherwise.
5. **Protection Setup Wizard** — 4-step checklist in client home screen showing status of each protection with Enable/Open/Pin buttons

### Bug Fixes (Feb 17, 2026)
- Fixed `allowUninstall` race condition (commit() instead of apply())
- Fixed `onDisableRequested` — no more factory reset, just locks screen
- Fixed registration crash — simplified init, removed aggressive Alert dialogs
- Fixed returning client "Account Deleted" bug — reset uninstall_allowed on register/generate-code

## Key Files
- `frontend/modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/`
  - `EMIDeviceAdminModule.kt` — All native methods
  - `EMIDeviceAdminReceiver.kt` — Tamper detection
  - `EMIAccessibilityService.kt` — Foreground monitoring
  - `EMIOverlayService.kt` — Status/nav bar blocker
- `frontend/src/utils/DevicePolicy.ts` — TypeScript wrapper
- `frontend/app/client/home.tsx` — Client UI with protection setup
- `backend/routes/device.py` — Device registration/status APIs

## Backlog
- P1: Complete Bank Statement Analyzer (.asice parsing)
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard, Payment Receipts
- P3: AMAPI Integration, FCM Push Notifications
