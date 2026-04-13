# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management ecosystem with device lockscreen enforcement for loan recovery. Includes FastAPI backend, React Native Admin/Client apps, and Vanilla JS web portal.

## Core Requirements
1. **Data Consistency**: All financial metrics use `loans` collection as single source of truth
2. **Device Management**: Android lockscreen that cannot be bypassed when device is locked
3. **Loan Management**: CRUD operations, contracts, month-based interest calculation
4. **Multi-platform**: Admin app, Client app, Web portal — feature parity

## What's Been Implemented

### Backend (Deployed to VPS: api.paylock.pro)
- Unified financial calculations via `_calc_interest_data` utility
- Loan CRUD: create, edit, delete, contract PDF generation
- Heartbeat thresholds: online < 12h (720min), warning 12-24h, critical > 24h (1440min)
- Payment reminders include late fees in outstanding amounts (when overdue)
- eBay.de price scraping fallback (Swappa returns 403)
- Device status returns `admin_firstname` for warning notifications
- Silent clients endpoint: `GET /api/clients/silent?minutes=1440`

### Web Portal (Deployed)
- Client details: Total Due and Outstanding include late fees when overdue
- Active loans table shows late fees row when client is overdue
- Device management heartbeat: online < 12h, 12-24h warning, >24h critical
- Heartbeat "last seen" with 5-minute accuracy
- Delete Loan / Share Contract buttons

### Client App (v1.5.4 - Build submitted)
- **Blue native lockscreen (EMIOverlayService)**: Full-screen opaque Kotlin overlay with lock UI
  - Emergency call 112 button built into the native overlay
  - After emergency call ends, overlay re-applies automatically
  - Watchdog loop every 200ms re-creates overlay if removed
  - Cross-monitors EMIForegroundMonitorService
- **Proper unpin on unlock**: `stopKioskMode()` called FIRST, then clears lock task packages for device owner mode
- Notification channels set to `IMPORTANCE_NONE` (hidden)
- Warning notifications show "Warning from {admin_firstname}"
- `CALL_PHONE` and `READ_PHONE_STATE` permissions in module manifest

### Admin App (v1.5.4 - Build submitted)
- Dashboard heartbeat shows < 12h / 12-24h / > 24h labels
- Clicking heartbeat card -> clients list with `filter=silent` (shows critical >24h devices)
- Silent filter fetches `minutes=1440` (was 60)
- Client details renders `<LoanHistory>` with 5-per-page pagination
- "Last seen" displays with 5-minute accuracy

## Client App Workflow
### Admin Mode (8-char code)
1. Registration -> permissions -> activate device admin
2. Device is FULLY USABLE (no pinning, no kiosk)
3. When `is_locked === true` -> Blue native lockscreen overlay (un-removable)

### Device Owner Mode (9-char code)
1. Registration -> full kiosk mode (configurable by admin)
2. Device usable within configured constraints
3. When `is_locked === true` -> Full lockscreen with kiosk lock task

## Architecture
- Backend: FastAPI + MongoDB Atlas
- Frontend: React Native (Expo SDK 54) + Vanilla JS portal
- Native Modules: Kotlin Android services for device lockscreen
- Deployment: VPS (37.148.202.159) + EAS Build for APKs

## Git Hygiene (Resolved Apr 2026)
- `.gitignore` cleaned (removed 80+ lines of duplicate `-e` artifacts)
- `frontend/.env` and `frontend/credentials/paylock.keystore` untracked from git via `git rm --cached`
- `backend/.env` already untracked; `translations.js` never contained secrets
- User should use **"Save to Github"** button to push (no git remote in container)

## Pending / Backlog
- P1: User verification of Client App v1.5.4 & Admin App builds (physical device testing)
- P2: Subscription auto-renewal logic
- P3: Superadmin UI for Stripe Connect platform fee config
- P3: Refactor `portal-app.js` (3000+ lines)
