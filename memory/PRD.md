# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) — Device Admin, Kiosk, Accessibility, Overlay

## Device Protection Features (7 Permissions Grid)

### Native Android Services:
1. **EMIAccessibilityService** — Monitors foreground app, relaunches our app if unauthorized app takes focus. After setup_complete: blocks Settings app. Disabled when uninstall allowed.
2. **EMIOverlayService** — Invisible overlay blocks status bar pulldown (top) and navigation bar (bottom)
3. **EMIDeviceAdminReceiver** — Device Admin receiver for tamper detection. Locks device on unauthorized disable.
4. **EMIDeviceAdminModule** — All native methods exposed to TypeScript

### 7-Permission Grid (2-column layout):
| Permission | Check | Action |
|---|---|---|
| Battery Optimization | `isIgnoringBatteryOptimizations()` | `requestBatteryOptimization()` |
| Overlay | `canDrawOverlays()` | `requestOverlayPermission()` |
| Battery Power Usage | Same as battery opt | `openBatterySettings()` |
| Auto Start | Manual (dialog confirmation) | `openAutoStartSettings()` |
| Accessibility | `isAccessibilityEnabled()` | `openAccessibilitySettings()` + `openAppInfo()` for restricted settings |
| Location | Expo Location API | Expo Location API |
| Notification | Expo Notifications API | `openNotificationSettings()` |

**Removed**: Play Protect (per user request)

### Protection Flow:
1. Device registers via registration code
2. Client app shows 7-permission grid
3. User enables all 7 permissions
4. When all 7 are granted -> auto-prompt for Device Admin
5. User accepts -> Protection services activate (overlay, kiosk, uninstall prevention)
6. `setup_complete` flag set in both AsyncStorage and SharedPreferences
7. AccessibilityService blocks Settings app access after setup complete
8. Admin can allow uninstall -> clears all protection flags and services

### Accessibility Permission - "Restricted Settings" Workaround:
Android 13+ blocks sideloaded apps from enabling Accessibility Service. The app now guides users through:
1. Open App Info (via `openAppInfo()` native method)
2. Tap three-dot menu -> "Allow restricted settings"
3. Then open Accessibility settings (tries "Installed Apps" sub-page first on Samsung)
4. Find "Loan Client" and enable

### Dual State Management:
- **React Native**: `protectionComplete` in AsyncStorage
- **Native Android**: `setup_complete` in SharedPreferences (used by AccessibilityService)

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
- `POST /api/clients/{id}/generate-code` — Generates new code (resets flags)
- `POST /api/clients/{id}/allow-uninstall` — Allows client to uninstall
- `POST /api/clients/{id}/lock` — Lock device
- `POST /api/clients/{id}/unlock` — Unlock device

## Bug Fixes Applied
- Registration crash: Simplified init, removed aggressive Alert dialogs
- Allow uninstall race: commit() instead of apply() before removeActiveAdmin
- Returning client "Account Deleted": Reset uninstall_allowed on register/generate-code
- onDisableRequested: No more factory reset, locks screen instead
- AutoStart permission bug: Added confirmation dialog
- Data field mismatch: Fixed ClientStatusResponse (loan_amount/loan_due_date)
- AutoStart intent: Added more Samsung/OEM intents + battery optimization fallback
- Accessibility: Opens "Installed Apps" sub-page directly on Samsung
- Accessibility restricted: Added "Allow restricted settings" guidance with openAppInfo()
- Play Protect: Removed from permission grid per user request

## Build Pipeline
- Node: 20.20.0 (matches eas.json)
- Yarn: 1.22.22
- `yarn install --frozen-lockfile` passes
- eas.json backend URL: admin-device-lock.preview.emergentagent.com

## Completed (Feb 2026)
- Device Protection V2: 7-permission grid (was 8, Play Protect removed)
- Accessibility restricted settings workaround
- AutoStart improved OEM intent resolution
- Backend field alignment: loan_amount/loan_due_date
- Build stability: yarn.lock in sync
- All backend API tests passing (100%)

## Backlog
- P1: Bank Statement Analyzer (.asice parsing + LLM summary)
- P2: Payment Reminders (SMS/Email), Bulk Import (CSV), Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications
