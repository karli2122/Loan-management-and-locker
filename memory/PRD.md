# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) — Device Admin, Kiosk, Accessibility, Overlay, Boot Receiver

## Lock Screen System (When Admin Locks Device)
1. **Kiosk mode** — pins app to screen
2. **Immersive mode** — hides status bar and navigation bar
3. **Overlay foreground service** — blocks touch events, runs as foreground service
4. **Lock state saved to SharedPreferences** — survives app restarts
5. **Boot receiver** — auto-starts app + overlay on reboot
6. **Accessibility service** — blocks app switch while locked

## Device Protection Features (6 Permissions Grid)
| Permission | Action |
|---|---|
| Battery Optimization | `requestBatteryOptimization()` |
| Overlay | `requestOverlayPermission()` |
| Auto Start | Dialog + `openAutoStartSettings()` |
| Accessibility | `openAppInfo()` + `openAccessibilitySettings()` |
| Location | Expo Location API |
| Notification | `openNotificationSettings()` |

## Key Files
- `app/client/home.tsx` — Client UI with lock screen + permission grid
- `app/client/register.tsx` — Client registration flow
- `app/admin/add-client.tsx` — Admin form for creating new clients
- `app/admin/client-details.tsx` — Client detail page (loan, device, actions)
- `backend/routes/clients.py` — Client CRUD, lock/unlock
- `backend/models/schemas.py` — Pydantic schemas

## Key API Endpoints
- `POST /api/clients` — Create client (now sets loan_start_date + outstanding_balance)
- `GET /api/clients/{id}` — Get client details
- `GET /api/device/status/{client_id}` — Device status
- `POST /api/clients/{id}/lock` — Lock device
- `POST /api/clients/{id}/unlock` — Unlock device
- `POST /api/clients/{id}/allow-uninstall` — Allow uninstall

## Build Pipeline
- Node: 20.20.0, Yarn: 1.22.22
- eas.json backend URL: loan-kiosk-app.preview.emergentagent.com

## Completed (Feb 20, 2026)

### Admin App Changes:
- **Add Client form**: Moved "Loan Amount" under "Loan Details" section, removed "Loan Tenure" field
- **Add Client form**: Now sends `loan_amount` and `loan_start_date` to backend
- **Backend**: `ClientCreate` schema updated with `loan_start_date`, backend auto-sets `outstanding_balance` and `loan_start_date` when loan_amount > 0
- **Client Details**: Active loan now shows immediately after adding client (was broken because `loan_start_date` was never set during creation)
- **Client Details**: Added pull-to-refresh (RefreshControl)
- **Client Details**: Removed redundant "EMI Details" section (info already in Active Loan tab)
- **Client Details**: Lock Device & Allow Uninstall buttons now only visible when admin_mode_active is ON
- **API URLs updated**: All EAS build profiles and api.ts fallback now point to current backend (`loan-kiosk-app.preview.emergentagent.com`)

### Client App Changes (from earlier this session):
- Registration crash fix: `setClientInfo` uses `API_URL` from constants, "Continue" replaced with "Close App" button
- UI race condition fix: `setLoading(false)` moved to after all permission checks complete
- Refresh loop, battery optimization instructions, and autostart/accessibility cache fixes verified in code

### Earlier Completed Work:
- Lock screen system: kiosk + immersive + foreground overlay + boot receiver
- Device Protection V2: 6-permission grid
- Accessibility restricted settings workaround
- Samsung AutoStart intent fix
- Client app notification system
- "Uninstall Allowed" flow fix

## Pending Verification (by user via APK testing)
- Client app registration crash fix
- Client app refresh loop fix
- Client app UI race condition fix
- Battery optimization instructions modal
- Autostart/Accessibility cache persistence

## Backlog
- P1: Bank Statement Analyzer (.asice parsing + LLM summary)
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications

## Refactoring Needed
- `app/client/home.tsx` needs breakdown into smaller components (usePermissions, useDeviceState, PermissionGrid, LockScreenOverlay)
