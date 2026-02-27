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
- Test client ID: cd32110f-4b67-4735-b57f-9efda7699e90

## What's Been Implemented (as of Feb 27, 2026)

### Core Features
- Full client & loan CRUD with search, filter, pagination
- Device lock/unlock with audit trail, temporary locks, reasons
- Payment scheduling and automation (all configurable via admin settings)
- Background tasks: payment processing, late fees, auto-lock, report emails, auto-payment links
- Web portal: full admin dashboard with 14+ features
- Marketing website: 6 pages + ZIP download at /api/download/website
- QR code device provisioning, CSV bulk client import
- Multi-language support (EN/ET)

### Stripe Payment Automation (NEW - this session)
- Real Stripe checkout sessions via emergentintegrations library
- `POST /api/clients/{id}/create-payment-link` - Creates Stripe checkout payment link
- `GET /api/clients/{id}/check-payment/{session_id}` - Check payment status
- `POST /api/clients/{id}/toggle-autopay` - Enable/disable auto-pay per client
- `GET /api/clients/{id}/payment-methods` - Get payment info
- Background scheduler creates & emails payment links when auto-charge enabled
- Admin settings: `payment_auto_charge_enabled` toggle

### Stripe Payment Tracker Dashboard Widget (NEW - this session)
- `GET /api/stripe/payment-tracker` - Real-time payment status with summary stats
- `POST /api/stripe/refresh-payment/{id}` - Refresh individual payment status
- Dashboard widget shows pending/completed/failed payments with client names, amounts, status badges
- Auto-polls every 20s, per-payment refresh buttons

### Enterprise Feature Gating (Completed - this session)
- `EnterpriseGate` component wraps 6 enterprise screens
- `useEnterpriseAccess` hook checks plan via `/api/payments/current-plan`
- Screens gated: bank-analyzer, bulk-import, provisioning, schedules, team, telegram
- Allowed plans: Enterprise, Custom, Superadmin

### Client App Lock Screen Improvements (this session)
- **Bigger visibility**: 200px icon container, 100px icon, 40px title, brighter #991B1B bg
- **Transparent overlay blockers**: Changed from Color.BLACK/OPAQUE to Color.TRANSPARENT/TRANSLUCENT in EMIOverlayService.kt
- **Status bar auto-collapse**: 100ms interval calling collapseStatusBar() + StatusBar.setHidden()
- **Removed refastening**: No more 500ms immersive re-engagement or scheduleAutoRestart
- **Native lock state reader**: Added getNativeLockState() to Kotlin module + DevicePolicy.ts
- **Lock screen escape fix**: getCachedLockState() now falls back to native SharedPreferences; register redirect blocked if natively locked; fetchStatus catch creates locked status even when prev is null

### API Retry Hardening (NEW - this session)
- **OfflineSyncManager**: Retry 3x with exponential backoff (2s→4s→8s), timeout 12-27s for cold starts
- **Dynamic polling**: 3s when offline (aggressive reconnect), 5s when online
- **"Reconnecting..." banner**: ActivityIndicator spinner shown when offline
- **Keepalive**: 30s interval (reduced from 120s)

### Mobile Apps
- Admin app: 20+ screens with Enterprise feature gating
- Client app: lock screen, payment view, notifications, location tracking, offline sync
- Both apps use EAS builds

### Integrations
- MongoDB Atlas, Stripe (via emergentintegrations), Resend email, Telegram Bot, Google Drive backup, Chart.js, EAS

## Key Files
- `/app/backend/server.py` - Main backend, serves website + portal
- `/app/backend/tasks.py` - Background scheduler with auto-charge logic
- `/app/backend/routes/client_payments.py` - Stripe payment management + tracker
- `/app/backend/routes/admin.py` - Admin settings (includes payment_auto_charge_enabled)
- `/app/backend/static/portal/portal-app.js` - Portal JS (monolithic, needs refactoring)
- `/app/frontend/app/client/home.tsx` - Client app main screen with lock logic
- `/app/frontend/src/services/OfflineSyncManager.ts` - Retry logic with backoff
- `/app/frontend/src/utils/DevicePolicy.ts` - Native module bridge (getNativeLockState)
- `/app/frontend/src/components/EnterpriseGate.tsx` - Feature gate component
- `/app/frontend/src/hooks/useEnterpriseAccess.ts` - Plan check hook
- `/app/frontend/modules/emi-device-admin/android/.../EMIOverlayService.kt` - Transparent overlay
- `/app/frontend/modules/emi-device-admin/android/.../EMIDeviceAdminModule.kt` - Native lock state
- `/app/frontend/eas.json` - Build profiles for admin + client

## Latest Builds
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/3d9bc9cb-f78e-4eca-afe8-caf8f604a871
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/eece1af4-7c16-4c02-af19-32db97335369

## Test Reports
- `/app/test_reports/iteration_68.json` - Enterprise gate tests (12/12 passed)
- `/app/test_reports/iteration_69.json` - Stripe payment automation tests (14/14 passed)
- `/app/test_reports/iteration_70.json` - Stripe tracker widget tests (11/11 passed)

## Backlog / Future Tasks
- **P1**: Portal JS modularization (split portal-app.js into domain-specific files: auth.js, clients.js, loans.js, etc.)
- **P2**: WhatsApp Business API Integration
- **P3**: Location heatmap visualization

## Known Issues
- API sleep on preview environment (mitigated with 30s keepalive + client retry; recommend external ping service like UptimeRobot for production)
- package-lock.json was removed to fix EAS build lockfile error (now yarn-only)

## Areas Needing Refactoring
- `portal-app.js` is ~1700 lines monolithic - user explicitly requested splitting into modules
