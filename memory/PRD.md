# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin) — Device Admin, Kiosk, Accessibility, Overlay

## Device Protection Features (9 Permissions Grid - Latest)

### Native Android Services:
1. **EMIAccessibilityService** — Monitors foreground app, relaunches our app if unauthorized app takes focus. Disabled when uninstall allowed.
2. **EMIOverlayService** — Invisible overlay blocks status bar pulldown (top) and navigation bar (bottom)
3. **EMIDeviceAdminReceiver** — Device Admin receiver for tamper detection
4. **EMIDeviceAdminModule** — All native methods exposed to TypeScript

### 9-Permission Grid (2-column layout, matching reference UI):
| Permission | Check | Action |
|---|---|---|
| Battery Optimization | `isIgnoringBatteryOptimizations()` | `requestBatteryOptimization()` |
| Overlay | `canDrawOverlays()` | `requestOverlayPermission()` |
| Device Admin | `isAdminActive()` | `requestAdmin()` |
| Battery Power Usage | Same as battery opt | `openBatterySettings()` |
| Auto Start | Manual (OEM-specific) | `openAutoStartSettings()` |
| Accessibility | `isAccessibilityServiceEnabled()` | `openAccessibilitySettings()` |
| Location | Expo Location API | Expo Location API |
| Play Protect | Manual | `openPlayProtectSettings()` |
| Notification | Expo Notifications API | `openNotificationSettings()` |

### UI: 2-column grid with large circular icons (green checkmark / red X), tappable cards, X/9 summary counter. Collapsible banner when minimized.

## Key Files
- `modules/emi-device-admin/android/src/main/java/expo/modules/emideviceadmin/` — All Kotlin native code
- `modules/emi-device-admin/src/index.ts` — Module JS exports
- `src/utils/DevicePolicy.ts` — TypeScript wrapper
- `app/client/home.tsx` — Client UI with permission grid
- `plugins/withDeviceAdmin.js` — Expo config plugin

## Bug Fixes Applied
- Registration crash: Simplified init, removed aggressive Alert dialogs
- Allow uninstall race: commit() instead of apply() before removeActiveAdmin
- Returning client "Account Deleted": Reset uninstall_allowed on register/generate-code
- onDisableRequested: No more factory reset, locks screen instead

## Backlog
- P1: Bank Statement Analyzer (.asice parsing)
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard, Payment Receipts
- P3: AMAPI, FCM Push Notifications
