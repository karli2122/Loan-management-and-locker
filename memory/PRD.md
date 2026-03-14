# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application "PayLock Pro" with tiered subscription model (Starter, Professional, Enterprise), React Native mobile apps (Admin + Client), FastAPI backend, static website, and web portal.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend**: React Native (Expo) with dual apps (Admin + Client)
- **Web Portal**: Server-rendered HTML/JS at `/api/portal`
- **Website**: Static HTML at `/opt/paylock/paylockpro-website/`
- **Build System**: EAS with auto-versioning (version.json)
- **Integrations**: Stripe (Live), Resend, Firebase/FCM, Emergent LLM Key (AI OCR), fpdf2

## What's Been Implemented

### Core Features (Complete)
- Three-tier subscription: Starter ($29), Professional ($79), Enterprise ($199)
- Full RBAC: Super Admin, Admin, Collections, Viewer roles
- Client management, loan creation, payment tracking
- Device lock/unlock (Standard + Device Owner modes)
- Push notifications (FCM), Payment reminders
- Document vault, Reports & analytics (PDF/CSV export)
- GPS tracking, In-app messaging (Telegram/WhatsApp)
- Stripe payments, Bank statement OCR, Credit scoring
- Revenue forecasting, Loan restructuring, Bulk import

### Security (Complete)
- 8-permission tamper detection: Alert + push notification on first detection
- Data wipe on confirmed tampering (wipeData native method added)
- Admin mode protection with same alert + wipe flow
- Screenshot blocking, reboot detection, offline enforcement
- **Permission Warning System (v1.2.5)**:
  - Device Admin: Shows warning dialog via `onDisableRequested` when user tries to disable admin mode
  - Accessibility Settings: Shows toast warnings when user navigates to accessibility settings
  - Device Admin Settings: Shows toast warnings when user navigates to device admin settings
  - Warning message: "Disabling this permission will erase ALL your data on this device!"

### User Management Scoping (v1.2.4)
- Admins see/manage ONLY users they created (`created_by` filter)
- Super admins see/manage all enterprise users
- Role definitions handle both naming conventions (admin/full_admin, superadmin/super_admin)
- Delete/update enforce created_by ownership

### Dashboard Data Scoping Fix (v1.2.4)
- Dashboard now shows ONLY the logged-in admin's own client data by default
- Super admins can pass `filter_admin_id=all` to see enterprise-wide data
- Fixed `reports.py` both client query and paid_loans query scoping

### PDF Manuals with Screenshots (v1.2.4)
- Admin App Manual: 30 pages, 19 real user-provided screenshots
- Client App Manual: 13 pages, detailed text instructions only
- Web Portal Manual: 12 pages, 9 real portal screenshots
- Download: `/api/download/manual/{admin|client|portal}`

### Feature Gating Implementation (v1.2.5) - COMPLETED 2026-03-14
- **Backend**: `/api/admin/feature-access` endpoint returns plan and accessible features
- **Backend**: `check_plan_access()` middleware enforces plan restrictions on protected routes
- **Backend**: 403 responses for unauthorized feature access with clear error messages
- **Frontend Dashboard**: Plan badge and conditional rendering for Professional+ features
- **Frontend Loans Screen**: Credit scoring badges hidden for non-enterprise users
- **Frontend Client Details**: Restructure (Pro+) and Documents (Ent+) buttons with locked states
- **Frontend Settings**: Team Management section with locked state and upgrade button
- **Client App**: Permission warning dialog when app goes to background

#### Feature Tiers Implemented:
- **Starter**: clients, loans, payments, notifications, calculator, reminders
- **Professional**: device_lock, auto_lock, messaging, contracts, loan_plans, collection_trends, reports, late_fee, loan_restructure, team_management, heartbeat, dashboard_analytics, interest_summary, device_management
- **Enterprise**: device_owner, custom_launcher, credit_scoring, audit_log, revenue_forecast, portfolio_health, risk_score_tracking, comparative_analytics, session_management, role_permissions, screenshot_block, tamper_detection, bank_ocr, document_vault, bulk_import, daily_digest, scheduled_reports, stripe_integration, qr_provisioning, nfc_provisioning, api_access

## Current Version
- v1.2.5, Build #26
- **Client Build (In Progress):** `c14443d6-27c2-4354-970f-a68e8baeec9d`
  - https://expo.dev/accounts/karli1987/projects/client/builds/c14443d6-27c2-4354-970f-a68e8baeec9d
- **Admin Build (In Progress):** `dd5ab2d9-f0e7-4a19-9b9b-8646bdace05e`
  - https://expo.dev/accounts/karli1987/projects/loans/builds/dd5ab2d9-f0e7-4a19-9b9b-8646bdace05e

## Key Files Modified This Session (v1.2.5)
- `frontend/app/admin/(tabs)/loans.tsx` - Credit scoring badge gating
- `frontend/app/admin/client-details.tsx` - Restructure/Documents button gating with locked states
- `frontend/app/admin/settings.tsx` - Team management section gating with locked state + upgrade button
- `frontend/app/client/home.tsx` - Removed background warning dialog (per user request)
- `frontend/android/android/app/src/main/java/com/eamilock/EmiDeviceAdminReceiver.java` - Updated data wipe warning message
- `frontend/android/android/app/src/main/java/com/eamilock/EMIAccessibilityService.java` - Added warnings for Accessibility and Device Admin settings access
- `frontend/version.json` - Bumped to v1.2.5 Build #26

## Test Users
- `karli1987` / `nasvakas123` - Super Admin (custom/enterprise access)
- `starter_test` / `starter123` - Starter plan user for testing feature restrictions

## Test Report
- `/app/test_reports/iteration_78.json` - 100% pass rate, all feature gating verified

## Prioritized Backlog
- P1: Build new APKs (v1.2.5) via EAS (no backend deploy needed - frontend changes only)
- P1: User verification of feature gating on real devices
- P2: Stabilization - no new features planned

## API Endpoints Reference
- `/api/admin/feature-access?admin_token=X` - Returns plan and accessible features
- `/api/heartbeat/summary?admin_token=X` - Professional+ feature
- `/api/analytics/dashboard?admin_token=X` - Professional+ feature
- `/api/paid-loans/summary?admin_token=X` - Interest summary
