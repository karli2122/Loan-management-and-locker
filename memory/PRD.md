# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application "PayLock Pro" with tiered subscription model (Starter, Professional, Enterprise, Demo), React Native mobile apps (Admin + Client), FastAPI backend, static website, and web portal.

## Latest Update: v1.2.10 - 2026-03-16

### User Registration & Demo Mode Feature (NEW)
- **Registration Flow**: New users can self-register via `/api/auth/register`
- **Email Verification**: 6-digit verification code sent via Resend (fallback: debug_code returned when email fails)
- **Demo Plan**: New users start in "demo" plan with severely restricted features
- **Demo Allowed Features**: calculator, profile_edit, change_password, plans_pricing
- **Demo Restricted Features**: loans, clients, payments, notifications, reminders, device_lock, etc.
- **Frontend Changes**:
  - Login screen now has "Register" link
  - New `register.tsx` screen with form and verification code input
  - Dashboard shows "Demo Mode" banner for demo users with upgrade prompt
  - Plan badge updated to support demo plan (flask icon)

### Registration API Endpoints
- `POST /api/auth/register` - Create pending registration, sends verification email
- `POST /api/auth/verify-email` - Verify code and create admin account with demo plan
- `POST /api/auth/resend-verification` - Resend verification code

### Plan Gating Enhancements
- Added "demo" tier to `PLAN_HIERARCHY` with level -1 (below starter)
- `DEMO_ALLOWED_FEATURES` set defines minimal features for demo users
- `get_accessible_features()` returns true for demo-allowed features
- `check_plan_access()` returns appropriate error messages for demo users

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
- **Client APK (v1.2.5):** https://expo.dev/artifacts/eas/pScbcfSnxanYiC4vUMuXbM.apk
- **Admin APK (v1.2.5):** https://expo.dev/artifacts/eas/tkmNR32y24H38GYwQvzeBC.apk
- **VPS IP:** 37.148.202.159

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
- `hhhhhh` / `testpass123` - Professional plan user
- `starter_test` / `password123` - Starter plan user for testing feature restrictions

## Test Report
- `/app/test_reports/iteration_78.json` - 100% pass rate, all feature gating verified

## Prioritized Backlog
- P0: Test all fixes on real devices with v1.2.5 APKs
- P1: User verification of feature gating with starter/professional users
- P2: Stabilization - no new features planned

## Bug Fixes This Session (v1.2.6 - 2026-03-16)
1. **Analytics new_loans metric**: Fixed - Added `new_loans` count to `this_month` object in `/api/reports/collection` endpoint
2. **Bank Statement Analyzer plan gating**: Refactored - Professional users can access analyzer WITHOUT OCR, Enterprise users get full OCR capability
3. **Audit logs hierarchical scoping**: Implemented - Superadmins see logs for themselves + users they created (via `created_by` field)
4. **Collection overview metrics**: Verified - `overdue_clients` and `completed_loans` returning correct values

## New Feature: Bank Statement Reconciliation (v1.2.7)
**Endpoint**: `POST /api/import/bank-statement/reconcile`

**Supported File Types**: CSV, PDF, ASICE

**Business Logic**:
- Matches transaction names to existing clients (70%+ name match score)
- **Negative amounts (-)**: 
  - If client exists: Creates/adds loan
  - If client NOT found: Creates NEW client with `import_needs_review=True` flag
- **Positive amounts (+)**: Records payment for matched client
  - If payment > outstanding: marks difference as `extra_interest`
  - Sets `loan_fully_paid=True` and auto-archives to Loan History when fully paid
- Ignores: bank fees (teenustasu, service fee), card payments (kaardimakse, pos, visa, mastercard)

**New Client Creation**:
- New clients created from unmatched negative transactions appear in **Loans → Imported** tab
- Marked with "IMPORTED" badge - user can edit to add: birth number, address, phone, email, interest rate, due date

**Loan Overview Updates**:
- Shows "Remaining" amount with interest for partial payments
- Shows "Loan Fully Paid" state with checkmark when outstanding_balance = 0
- Fully paid loans automatically move to Loan History

**Plan Requirements**:
- CSV files: Professional+ plan
- PDF files: Enterprise+ plan (requires AI extraction)

### Previous Session (v1.2.5)
1. **Starter plan 403 on loan creation**: Fixed - Added "admin" and "superadmin" role aliases to ROLE_PERMISSIONS mapping in permissions.py
2. **Settings access for starter users**: Fixed - Basic settings (theme, language, currency) available to all; Late Fee/Auto-Lock shows locked state with upgrade prompt for starter users

## Test Reports
- `/app/test_reports/iteration_79.json` - Analytics & Bank Statement Analyzer plan gating (16/16 tests)
- `/app/test_reports/iteration_80.json` - Bank Statement Reconciliation (18/18 tests)
- `/app/test_reports/iteration_81.json` - New Client Creation & Auto-Archive (9/9 tests)
- `/app/test_reports/iteration_82.json` - Registration Flow with Demo Plan (12/12 tests)

## Test Users
- `karli1987` / `nasvakas123` - Super Admin (custom/enterprise access)
- `hhhhhh` / `testpass123` - Professional plan user
- `starter_test` / `password123` - Starter plan user for testing
- `testuser123` / `testpass123` - Demo plan user (created via registration)

## API Endpoints Reference
- `/api/auth/register` - User registration (POST)
- `/api/auth/verify-email` - Email verification (POST)
- `/api/auth/resend-verification` - Resend verification code (POST)
- `/api/admin/feature-access?admin_token=X` - Returns plan and accessible features
- `/api/heartbeat/summary?admin_token=X` - Professional+ feature
- `/api/analytics/dashboard?admin_token=X` - Professional+ feature
- `/api/paid-loans/summary?admin_token=X` - Interest summary

## Prioritized Backlog
- P0: Deploy registration changes to production VPS
- P0: Build new Admin APK v1.2.10 with registration flow
- P1: Authorize paylock.app domain in Resend for email sending
- P2: Subscription renewal check and expiry logic testing
