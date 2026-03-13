# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## Implemented Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL
- Firebase Cloud Messaging for push notifications

### Previous Session Fixes (Verified)
- Push notifications + FCM: WORKING
- App versioning (semantic version check): WORKING
- Profit analytics (includes archived loans): DEPLOYED
- Device count: FIXED (enterprise-scoped via admin_token)

### Session 2026-03-13 Features

#### Phase 1: Bug Fixes (DEPLOYED)
- Device count fixed: `/api/stats` enterprise-scoped, shows `total_clients`
- Tamper detection fixed: real permission values for comparison, two-step warning flow
- Chat date grouping in both admin and client apps
- Warning auto-dismiss after 10 seconds
- Admin chat FAB moved up, padding added

#### Phase 2: New Features (DEPLOYED TO VPS + APK BUILDS SUBMITTED)

1. **Audit Log System** (P0)
   - `log_audit()` helper integrated into client CRUD, lock/unlock, warnings, delete
   - API: `GET /api/audit-logs` with filters

2. **Automated Payment Reminders** (P0)
   - Background task runs hourly, sends Expo push notifications
   - Schedule: 1 day before, on due date, 1-3 days after (if unpaid)
   - Configurable in admin settings: `auto_reminders_enabled`, `reminder_schedule`

3. **Daily Digest Email** (P1)
   - Background task, sends via Resend at configured hour (default 8 AM UTC)
   - Content: overdue payments, new registrations, tamper alerts, upcoming due dates
   - Configurable: `daily_digest_enabled`, `daily_digest_hour`

4. **Screenshot/Screen Recording Block** (P1)
   - `expo-screen-capture` installed, `preventScreenCaptureAsync()` called on init
   - Only on client app (not admin)

5. **Revenue Forecasting** (P2)
   - API: `GET /api/forecasting/revenue?admin_token=...&days=90`
   - Weekly forecast with expected vs likely collections
   - Factors in client payment reliability + overdue status

6. **Loan Restructuring/Rescheduling** (P0)
   - API: `POST /api/loans/{client_id}/restructure` - modify EMI, tenure, rate
   - API: `GET /api/loans/{client_id}/restructure-history` - full history
   - Saves original vs new terms, reason, effective date

7. **Role-Based Sub-Admin Permissions** (P0)
   - 4 roles: super_admin, full_admin, collections, viewer
   - `viewer`: read-only (clients_read, reports_read, loans_read)
   - `collections`: clients, loans, payments, reminders, contracts
   - `full_admin`: all operational permissions
   - Team CRUD with role assignment

8. **Session Management** (P1)
   - API: `GET /api/sessions` - list active sessions
   - API: `DELETE /api/sessions/{id}` - revoke specific session
   - API: `DELETE /api/sessions` - revoke all sessions

9. **Analytics Suite** (P1)
   - `GET /api/analytics/collection-trends` - weekly/monthly efficiency
   - `GET /api/analytics/risk-score-history` - per-client score tracking
   - `GET /api/analytics/portfolio-health` - NPAs, aging analysis, collection rate
   - `GET /api/analytics/comparative` - team member performance comparison

10. **Client Document Vault** (P1)
    - Upload files to VPS `/opt/paylock/documents/{client_id}/`
    - API: `POST /api/documents/vault/{client_id}/upload` - upload with doc type
    - API: `GET /api/documents/vault/{client_id}` - list documents
    - API: `GET /api/documents/vault/{client_id}/{doc_id}/download` - download
    - API: `DELETE /api/documents/vault/{client_id}/{doc_id}` - delete
    - Types: id_photo, contract, proof_of_income, other

11. **Bulk Loan Import** (P1)
    - API: `POST /api/import/loans/csv` - import loans from CSV
    - Matches clients by name/phone, sets up loan terms
    - API: `GET /api/import/loans/template` - CSV template

## Current Builds
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/a78a0eb3-84ac-4432-be15-46535455a27c
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/a2976f38-520e-4c31-83c7-8b942e9f8cdc

## Pending User Verification
- Tamper detection two-step flow
- Screenshot blocking on client
- All new features accessible via mobile apps
- Device count showing 4 on admin

## Future/Backlog
- WhatsApp Business API Integration
- Risk score history needs frontend UI in admin app
- Restructuring UI in admin client-details screen
- Document vault UI in admin client-details screen
- Session management UI in admin settings
- Analytics charts in admin dashboard
- Bulk import UI in admin app
- Permission enforcement middleware on all routes
- Risk score auto-tracking on payment events

## Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
