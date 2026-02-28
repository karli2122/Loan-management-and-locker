# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application called "PayLock Pro" for an Estonian IT company. Includes mobile apps (Admin + Client), web admin portal, and marketing website.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler (port 8001)
- **Frontend (Mobile)**: Expo React Native (admin + client apps via EAS)
- **Web Portal**: Vanilla JS served from backend /api/portal
- **Website**: Static HTML/CSS/JS served from backend /api/website/*
- **URL**: https://paylock-enterprise.preview.emergentagent.com

## Credentials
- Admin: username=admin, password=admin123

## What's Been Implemented (as of Feb 27, 2026)

### Core Features
- Full client & loan CRUD, device lock/unlock with audit trail
- Payment scheduling, automation, background tasks
- Web portal dashboard with 14+ features, Live Payment Feed, Stripe Payment Tracker
- Marketing website: 6 pages + ZIP download
- QR provisioning, CSV import, Multi-language (EN/ET)
- Enterprise Feature Gating (6 screens)

### Stripe Payment Automation
- Real Stripe checkout sessions via emergentintegrations
- Auto-charge creates & emails payment links when due
- Payment tracker dashboard widget with real-time status

### Client App Lock Screen (LATEST)
- **Mute + reject incoming calls** — Ringer muted while locked, AccessibilityService + ForegroundMonitor reject regular calls and kill dialer
- **Emergency Call button (112)** — Only way to make calls when locked. Sets `emergency_call_active` flag in native SharedPreferences
- **Emergency call monitoring** — Native PhoneStateListener auto-clears flag when call ends. JS polls every 2s as backup
- **After emergency call ends** — Flag cleared, dialer killed, lock screen re-engaged
- **Native getNativeLockState()** — Survives Clear Data / reboot via SharedPreferences
- **Transparent overlay blockers** — See-through touch protection
- **Status bar auto-collapse** — 100ms interval
- **API retry hardening** — 3x retry with backoff (2s→4s→8s), dynamic polling (3s offline / 5s online)

### Key Native Functions (EMIDeviceAdminModule.kt)
- `setEmergencyCallActive(bool)` / `isEmergencyCallActive()` — Emergency call flag
- `endCall()` — Reject incoming calls via TelecomManager
- `muteRinger()` / `unmuteRinger()` — Ringer control while locked
- `dialEmergencyNumber(number)` — Initiates emergency call + registers call state listener
- `killDialerApps()` — Force-stops all dialer packages + clears emergency flag
- `getNativeLockState()` / `setNativeLockState(bool)` — Persistent lock state

### Key Files
- `/app/backend/server.py`, `/app/backend/tasks.py`, `/app/backend/routes/client_payments.py`
- `/app/frontend/app/client/home.tsx` — Client app with lock screen, emergency call, retry logic
- `/app/frontend/src/utils/DevicePolicy.ts` — Native module bridge
- `/app/frontend/src/services/OfflineSyncManager.ts` — Retry with backoff
- `/app/frontend/modules/emi-device-admin/android/.../EMIDeviceAdminModule.kt`
- `/app/frontend/modules/emi-device-admin/android/.../EMIAccessibilityService.kt`
- `/app/frontend/modules/emi-device-admin/android/.../EMIForegroundMonitorService.kt`
- `/app/frontend/modules/emi-device-admin/android/.../EMIOverlayService.kt`
- `/app/backend/static/portal/portal-app.js`

## Deployment Fixes (Feb 28, 2026)
- **Fixed .gitignore**: Removed 116 malformed `-e` duplicate lines and stopped blocking `.env` files (required for Emergent deployment)
- **Removed apt-get from startup**: `server.py` no longer runs `apt-get install tesseract-ocr` at startup (blocks/fails in production containers)
- **Fixed KEEPALIVE_URL**: Updated from dead `paylock-enterprise.preview.emergentagent.com` to current preview URL; added `APP_URL` fallback for production
- **Current preview URL**: `https://payment-gateway-406.preview.emergentagent.com`

## Backlog
- **P0**: Production deployment (user to click Deploy in Emergent UI)
- **P1**: Portal JS modularization (portal-app.js → modules)
- **P2**: WhatsApp Business API Integration
- **P3**: Location heatmap visualization
