# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo (EAS builds)
- **Client App**: React Native / Expo with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## Completed Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL
- URL consolidation across all apps/portal/website

### Web Portal
- Modularized JS architecture (portal-core, portal-risk, portal-messaging, portal-reports)
- Dashboard with live stats and charts
- Client management with full CRUD
- Device registration key generator
- Add Loan modal with EMI calculation
- Send Warning (in-app message + push notification to client)
- Loan plans CRUD with edit/create/delete modals
- Payment schedules CRUD with edit modal
- Bank statement analyzer with AI vision OCR
- AI client risk scoring with Chart.js
- Bulk messaging via Telegram
- Report exports (PDF/Excel)
- App Version Management (Settings page, superadmin only)

### Mobile Apps
- App Version Check: Both apps check for updates on startup using semantic version comparison
- Admin: Full offline mode with auto-sync, dashboard charts, Expo push notifications
- Client: In-app messaging, multi-language lock screen, emergency call fix

### Auth & Security
- Plan-based portal access gating (enterprise/custom only, superadmin always allowed)
- Removed default/test admin users
- Superadmin = custom plan features

## Recent Bug Fixes (2026-03-13)

### Analytics Profit Data (P0) - FIXED
- Fixed `/api/analytics/dashboard` to include archived loan data in revenue/interest calculations
- Fixed `/api/paid-loans/summary` to calculate interest directly from paid_loans records
- Root cause: after loan archival, client fields cleared to 0, breaking interest derivation

### Version Check Update Detection (P1) - FIXED
- Fixed `/api/app-version/check` to compare semantic version strings (e.g., 1.0.0 < 1.0.1)
- Previously only compared integer version codes, missing updates where only version string changed

### Push Notifications (5-Bug Fix) - IMPLEMENTED, NEEDS NEW BUILD
1. **Bug #1 CRITICAL**: Added `expo-notifications` plugin to `app.config.js` — FCM service was never registered
2. **Bug #2 CRITICAL**: Moved `initializeNotifications()` to root `_layout.tsx` — background handler was never available when OS waked JS runtime
3. **Bug #3 MEDIUM**: Moved `setNotificationHandler` from `client/_layout.tsx` to `app/_layout.tsx` — app-wide foreground display
4. **Bug #4 MEDIUM**: Added `priority: "high"` and `channelId` to push payloads in `reminders.py`
5. **Bug #5 LOW**: Removed cached push token skip in `client/home.tsx` — always re-registers token

## Pending (User Verification Needed)
- Push notifications (all 5 fixes applied — needs **new native build**, not just OTA)
- Device overview count (fix deployed, needs new build)
- Client app chat keyboard overlay (fix deployed, needs new build)
- Bank statement analyzer (backend fix deployed, needs user testing)

## Backlog
- (P1) WhatsApp Business API Integration
- (P1) Submit new Admin and Client app EAS builds with all recent fixes
- (P2) Location heatmap visualization

## Key Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
