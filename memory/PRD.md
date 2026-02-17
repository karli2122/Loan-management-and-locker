# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) — Device Admin, Kiosk, Accessibility, Overlay

## Device Protection Features (8 Permissions Grid)

### Native Android Services:
1. **EMIAccessibilityService** — Monitors foreground app, relaunches our app if unauthorized app takes focus. After setup_complete: blocks Settings app. Disabled when uninstall allowed.
2. **EMIOverlayService** — Invisible overlay blocks status bar pulldown (top) and navigation bar (bottom)
3. **EMIDeviceAdminReceiver** — Device Admin receiver for tamper detection. Locks device on unauthorized disable.
4. **EMIDeviceAdminModule** — All native methods exposed to TypeScript

### 8-Permission Grid (2-column layout):
| Permission | Check | Action |
|---|---|---|
| Battery Optimization | `isIgnoringBatteryOptimizations()` | `requestBatteryOptimization()` |
| Overlay | `canDrawOverlays()` | `requestOverlayPermission()` |
| Battery Power Usage | Same as battery opt | `openBatterySettings()` |
| Auto Start | Manual (dialog confirmation) | `openAutoStartSettings()` |
| Accessibility | `isAccessibilityServiceEnabled()` | `openAccessibilitySettings()` |
| Location | Expo Location API | Expo Location API |
| Play Protect | Manual (dialog confirmation) | `openPlayProtectSettings()` |
| Notification | Expo Notifications API | `openNotificationSettings()` |

### Protection Flow:
1. Device registers via registration code
2. Client app shows 8-permission grid
3. User enables all 8 permissions (some via system settings, some via confirmation dialogs)
4. When all 8 are granted → auto-prompt for Device Admin
5. User accepts → Protection services activate (overlay, kiosk, uninstall prevention)
6. `setup_complete` flag set in both AsyncStorage and SharedPreferences
7. AccessibilityService blocks Settings app access after setup complete
8. Admin can allow uninstall → clears all protection flags and services

### Dual State Management:
- **React Native**: `protectionComplete` in AsyncStorage
- **Native Android**: `setup_complete` in SharedPreferences (used by AccessibilityService even when app is backgrounded)

## Key Files
- `modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/` — All Kotlin native code
- `modules/emi-device-admin/src/index.ts` — Module JS exports
- `src/utils/DevicePolicy.ts` — TypeScript wrapper
- `app/client/home.tsx` — Client UI with permission grid
- `backend/routes/device.py` — Device registration, status, location
- `backend/routes/clients.py` — Client CRUD, lock/unlock, allow-uninstall
- `backend/models/schemas.py` — Pydantic models

## Key API Endpoints
- `POST /api/device/register` — Register device (resets uninstall_allowed)
- `GET /api/device/status/{client_id}` — Returns loan_amount, loan_due_date, uninstall_allowed
- `POST /api/device/report-admin-status` — Reports admin mode active status
- `POST /api/clients/{id}/generate-code` — Generates new code (resets uninstall_allowed, is_registered)
- `POST /api/clients/{id}/allow-uninstall` — Allows client to uninstall
- `POST /api/clients/{id}/lock` — Lock device
- `POST /api/clients/{id}/unlock` — Unlock device

## Bug Fixes Applied
- Registration crash: Simplified init, removed aggressive Alert dialogs
- Allow uninstall race: commit() instead of apply() before removeActiveAdmin
- Returning client "Account Deleted": Reset uninstall_allowed on register/generate-code
- onDisableRequested: No more factory reset, locks screen instead
- **AutoStart permission bug**: Added confirmation dialog so autoStart can be marked as done (was blocking Device Admin auto-trigger)
- **Data field mismatch**: Fixed ClientStatusResponse to return loan_amount/loan_due_date instead of legacy emi_amount/emi_due_date

## Build Pipeline
- Node: 20.20.0 (matches eas.json)
- Yarn: 1.22.22
- `yarn install --frozen-lockfile` passes
- `eas-build-pre-install` script clears caches
- **Note**: eas.json backend URL may need updating per session

## Completed (Feb 2026)
- Device Protection V2: 8-permission grid, Accessibility Service, Overlay Blocker
- Device Protection V1 Fixes: kiosk mode, uninstall bugs, registration crashes
- Backend field alignment: loan_amount/loan_due_date in status response
- Build stability: yarn.lock in sync, lockfile tracked in git
- All 13 backend API tests passing (100%)

## Backlog
- P1: Bank Statement Analyzer (.asice parsing + LLM summary)
- P2: Payment Reminders (SMS/Email), Bulk Import (CSV), Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications
