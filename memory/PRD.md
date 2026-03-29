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
- Stripe Connect, role elevation on plan upgrade
- Welcome email conditional logic
- Contact form rate limiting

### Web Portal (Deployed)
- Client details: Total Due and Outstanding include late fees when overdue
- Active loans table shows late fees row when client is overdue
- Device management heartbeat: online < 12h, 12-24h warning, >24h critical
- Heartbeat "last seen" displays with 5-minute accuracy
- Delete Loan / Share Contract buttons
- Month-based interest calculation in Add Loan form

### Client App (v1.5.3 - Build submitted)
- **Single lockscreen**: Native overlay = transparent bar blockers only (status/nav bar), React Native renders the visible lock UI
- Both EMIOverlayService and EMIForegroundMonitorService run as FOREGROUND services
- Notification channels set to IMPORTANCE_NONE (hidden from user)
- Warning notifications show "Warning from {admin_firstname}"
- Emergency call: Sets native `emergency_call_active` flag before stopping services, properly restores lock after call ends
- `stopKioskMode()` called on unlock to unpin app
- Version check Modal (not Alert)
- Background heartbeat with correct AsyncStorage key

### Admin App (v1.5.3 - Build submitted)
- Dashboard heartbeat shows < 12h / 12-24h / > 24h labels
- Clicking heartbeat card navigates to clients list with `filter=silent` (shows critical devices)
- Client details now renders `<LoanHistory>` component with 5-per-page pagination
- "Last seen" displays with 5-minute accuracy throughout the app
- User management with pagination

## Architecture
- Backend: FastAPI + MongoDB Atlas
- Frontend: React Native (Expo SDK 54) + Vanilla JS portal
- Native Modules: Kotlin Android services for device lockscreen
- Deployment: VPS (37.148.202.159) + EAS Build for APKs

## Key DB Collections
- `loans`: Single source of truth for financial data
- `paid_loans`: Completed loan records
- `clients`: Client profiles, device status, lock state
- `admins`: Admin accounts with roles and plans

## Client App Workflow
### Admin Mode (8-char code)
1. Registration → permissions (overlay, accessibility, device admin) → activate device admin
2. Device is FULLY USABLE normally (no pinning, no kiosk)
3. When `is_locked === true` → show lockscreen (RN UI + native bar blockers)

### Device Owner Mode (9-char code)
1. Registration → full kiosk mode (configurable by admin)
2. Device usable within configured constraints
3. When `is_locked === true` → full lockscreen with kiosk lock task

## Pending / Backlog
- P2: Subscription auto-renewal logic investigation
- P3: Superadmin UI for Stripe Connect platform fee configuration
