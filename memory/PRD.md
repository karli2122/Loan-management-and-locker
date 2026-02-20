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
- Admin unlocks -> stops kiosk mode, disables immersive mode, stops overlay, clears native lock state

## Device Protection Features (6 Permissions Grid)

### Native Android Services:
1. **EMIAccessibilityService** — Monitors foreground app. After setup_complete: blocks Settings + shows toast warning. When uninstall_allowed=true: no blocking.
2. **EMIOverlayService** — Foreground service with 1-second refresh. Blocks status bar + nav bar.
3. **EMIDeviceAdminReceiver** — Device Admin receiver. On disable attempt when not allowed: locks device + warns.
4. **EMIBootReceiver** — Listens for BOOT_COMPLETED. Relaunches app + overlay if registered or locked.
5. **EMIDeviceAdminModule** — All native methods exposed to TypeScript.

### 6-Permission Grid:
| Permission | Action |
|---|---|
| Battery Optimization | `requestBatteryOptimization()` |
| Overlay | `requestOverlayPermission()` |
| Auto Start | Dialog confirmation + `openAutoStartSettings()` |
| Accessibility | `openAppInfo()` (restricted settings) + `openAccessibilitySettings()` |
| Location | Expo Location API |
| Notification | `openNotificationSettings()` |

### Protection Flow:
1. Register -> show 6-permission grid
2. Enable all 6 -> auto-prompt Device Admin
3. Accept -> activate overlay, kiosk, uninstall prevention, set setup_complete flags
4. AccessibilityService blocks Settings with toast warning
5. Admin can allow uninstall -> clears all protection

## Key Files
- `modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/` — Kotlin native code
- `app/client/home.tsx` — Client UI with lock screen + permission grid (most critical file)
- `app/client/register.tsx` — Client registration flow
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
- eas.json backend URL: loan-admin-lock.preview.emergentagent.com

## Completed (Feb 2026)
- Lock screen system: kiosk + immersive + foreground overlay + boot receiver
- Device Protection V2: 6-permission grid
- Accessibility restricted settings workaround
- AutoStart improved OEM intent resolution
- Warning toast when trying to access Settings while locked
- All backend API tests passing (100%)
- Admin "Add Client" Form fixed with correct loan fields
- Backend loan creation logic fixed (outstanding_balance)
- Lock screen hardening (back button, opaque overlay, immersive)
- "Uninstall Allowed" flow fixed
- Client app notification system
- Samsung AutoStart intent fixed

### Bug Fixes Applied (Feb 20, 2026):
- **Registration crash fix**: Fixed `setClientInfo` in register.tsx to use `API_URL` from constants instead of potentially incorrect `process.env.EXPO_PUBLIC_BACKEND_URL`. Replaced "Continue" navigation button with "Close App" button using `BackHandler.exitApp()` to completely eliminate post-registration navigation crash.
- **UI race condition fix**: Removed premature `setLoading(false)` from `fetchStatus()` and `loadClientData()`. Loading state is now only set to false AFTER all permission checks complete in `initialize()`, preventing UI flicker with incorrect permission states.
- **Refresh loop fix**: `onRefresh` handler already has try/finally block (implemented by previous agent, needs user verification).
- **Battery optimization instructions**: Permission card now shows device-specific instructions modal (implemented by previous agent, needs user verification).
- **Autostart/Accessibility cache**: Permission states are saved to and restored from AsyncStorage on init (implemented by previous agent, needs user verification).

## Backlog
- P1: Bank Statement Analyzer (.asice parsing + LLM summary)
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications

## Refactoring Needed
- `app/client/home.tsx` needs to be broken down into smaller components (usePermissions, useDeviceState, PermissionGrid, LockScreenOverlay)
