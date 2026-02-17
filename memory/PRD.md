# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) — Device Admin, Kiosk, Accessibility, Overlay, Boot Receiver

## Lock Screen System (When Admin Locks Device)

### What happens when admin presses "Lock Device":
1. **Kiosk mode** (`startLockTask`) — pins app to screen, user can't navigate away
2. **Immersive mode** (`enableImmersiveMode`) — hides status bar and navigation bar completely
3. **Overlay foreground service** (`EMIOverlayService`) — invisible overlay blocks status bar/nav bar touch events, refreshes every 1 second, runs as Android foreground service with notification (won't be killed)
4. **Lock state saved to SharedPreferences** (`setNativeLockState`) — survives app restarts
5. **Boot receiver** (`EMIBootReceiver`) — auto-starts app + overlay service on device reboot
6. **Accessibility service** blocks any app switch while locked

### Unlock flow:
- Admin unlocks → stops kiosk mode, disables immersive mode, stops overlay, clears native lock state

## Device Protection Features (7 Permissions Grid)

### Native Android Services:
1. **EMIAccessibilityService** — Monitors foreground app. After setup_complete: blocks Settings + shows toast warning. When uninstall_allowed=true: no blocking.
2. **EMIOverlayService** — Foreground service with 1-second refresh. Blocks status bar + nav bar.
3. **EMIDeviceAdminReceiver** — Device Admin receiver. On disable attempt when not allowed: locks device + warns "device admin will wipe data".
4. **EMIBootReceiver** — NEW. Listens for BOOT_COMPLETED. Relaunches app + overlay if registered or locked.
5. **EMIDeviceAdminModule** — All native methods exposed to TypeScript.

### 7-Permission Grid:
| Permission | Action |
|---|---|
| Battery Optimization | `requestBatteryOptimization()` |
| Overlay | `requestOverlayPermission()` |
| Battery Power Usage | `openBatterySettings()` |
| Auto Start | Dialog confirmation + `openAutoStartSettings()` |
| Accessibility | `openAppInfo()` (restricted settings) + `openAccessibilitySettings()` (installed apps) |
| Location | Expo Location API |
| Notification | `openNotificationSettings()` |

### Protection Flow:
1. Register → show 7-permission grid
2. Enable all 7 → auto-prompt Device Admin
3. Accept → activate overlay, kiosk, uninstall prevention, set setup_complete flags
4. AccessibilityService blocks Settings with toast warning
5. Admin can allow uninstall → clears all protection

## Key Files
- `modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/` — Kotlin native code
  - `EMIDeviceAdminModule.kt` — All native methods
  - `EMIAccessibilityService.kt` — Foreground monitor + toast warnings
  - `EMIOverlayService.kt` — Foreground overlay service with 1s refresh
  - `EMIBootReceiver.kt` — NEW: Boot auto-start
  - `EMIDeviceAdminReceiver.kt` — Device Admin tamper detection
- `modules/emi-device-admin/src/index.ts` — JS bridge exports
- `src/utils/DevicePolicy.ts` — TypeScript wrapper
- `app/client/home.tsx` — Client UI with lock screen + permission grid
- `backend/routes/device.py` — Device registration, status
- `backend/routes/clients.py` — Client CRUD, lock/unlock

## Key API Endpoints
- `POST /api/device/register` — Register device
- `GET /api/device/status/{client_id}` — Returns loan_amount, loan_due_date, uninstall_allowed
- `POST /api/clients/{id}/lock` — Lock device
- `POST /api/clients/{id}/unlock` — Unlock device
- `POST /api/clients/{id}/allow-uninstall` — Allow uninstall

## Build Pipeline
- Node: 20.20.0, Yarn: 1.22.22
- `yarn install --frozen-lockfile` passes
- eas.json backend URL: admin-device-lock.preview.emergentagent.com

## Completed (Feb 2026)
- Lock screen system: kiosk + immersive + foreground overlay + boot receiver
- Device Protection V2: 7-permission grid (Play Protect removed)
- Accessibility restricted settings workaround
- AutoStart improved OEM intent resolution
- Warning toast when trying to access Settings while locked
- All backend API tests passing (100%)

## Backlog
- P1: Bank Statement Analyzer (.asice parsing + LLM summary)
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications
