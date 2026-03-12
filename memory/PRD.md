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

## VPS Migration (Mar 11, 2026)
- **Migrated API to GoDaddy VPS**: `https://api.paylock.pro`
- Backend deployed at `/opt/paylock/` with systemd service (`paylock.service`)
- Nginx reverse proxy with **SSL via Let's Encrypt** (auto-renewing, expires 2026-06-09)
- Uses MongoDB Atlas (same database, no data migration)
- Updated all URLs across: `eas.json` (6 profiles), `site.js`, `frontend/.env`, `app.config.js`
- All endpoints verified over HTTPS
- **Current API URL**: `https://api.paylock.pro`

## Client App Lock Screen Fixes (Mar 11, 2026)
- **Emergency Call Fix**: Kiosk mode was blocking dialer from opening. Now exits kiosk mode + re-enables status bar before dialing, and re-engages all protections after call ends. Changed from ACTION_CALL (requires permission) to ACTION_DIAL.
- **Status Bar Bypass Fix**: Made accessibility service much more aggressive when SystemUI is detected during lock — rapid-fire GLOBAL_ACTION_BACK (8 staggered delays from 50ms-1000ms), GLOBAL_ACTION_HOME to force-close shade, StatusBarManager.collapsePanels() via reflection, plus forced app relaunch.

## Portal Improvements (Mar 12, 2026)
- **Upload Document**: Replaced raw Client ID text input with searchable client dropdown (fetches clients list, filters by name/phone, shows client details)
- **Bank Statement Analyzer**: Added full new page to the portal with:
  - Searchable client dropdown (optional)
  - File upload for .pdf, .csv, .xml, .asice formats
  - AI-powered analysis with income/expense breakdown
  - Analysis history table with view details modal
  - Connected to existing `/api/bank-statements/analyze` and `/api/bank-statements/history` endpoints

## Auth & Access Control (Mar 12, 2026)
- **Removed test users**: Deleted `testapiadmin` and `admin` from database
- **Superadmin = Custom plan**: Set karli1987 to `plan=custom`, `role=superadmin`
- **Portal plan gating**: Only `enterprise` or `custom` plan users can access the web portal (checked on login + token verify)
- **Multi-session support**: Changed token storage from single-token to multi-token per admin (login from app + portal no longer invalidates each other)
- **Sliding token expiration**: Token expiry refreshes on each verify call (30-day rolling window)
- **Plan field in API responses**: Added `plan` field to login and verify endpoints

## Backlog
- **P0**: Production deployment (user to click Deploy in Emergent UI)
- **P1**: Portal JS modularization (portal-app.js → modules)
- **P2**: WhatsApp Business API Integration
- **P3**: Location heatmap visualization
