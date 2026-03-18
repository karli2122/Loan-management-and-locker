# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application "PayLock Pro" with tiered subscription model (Starter, Professional, Enterprise, Demo), React Native mobile apps (Admin + Client), FastAPI backend, static website, and web portal.

## Latest Update: v1.5.0 - 2026-03-18

### Stripe Connect Full Integration

**1. Stripe Connect Onboarding UI (Settings Page)**
- Added `StripeConnectSection` component gated to Enterprise/Custom plans
- Shows connection status, platform fee info, and onboarding button
- Locked state with "Upgrade to Enterprise" prompt for lower plans
- Superadmins bypass plan gate

**2. Send Payment Link (MultiLoanOverview)**
- "Pay Link" button on each active loan (purple, Enterprise/Custom only)
- Creates Stripe destination charge with 0.75% platform fee
- Sends in-app message to client with payment URL
- Sends push notification to client's device via Expo Push
- Amount prefilled with `due_today_amount`

**3. Connect Dashboard (Superadmin)**
- New screen at `/admin/connect-dashboard`
- Shows: Total fees earned, Total volume, Transaction count, Connected accounts
- Monthly breakdown table
- Recent transactions with admin/client names
- Accessible from Settings for superadmins only

**4. Backend Endpoints Added**
- `POST /api/connect/onboard` - Create Express Connect account
- `GET /api/connect/onboard/complete` - Handle onboarding callback
- `GET /api/connect/onboard/refresh` - Refresh expired onboarding link
- `GET /api/connect/status` - Get connection status
- `POST /api/connect/payment-link` - Create payment link with destination charge
- `POST /api/connect/send-payment-link` - Create + send via messaging + push
- `GET /api/connect/dashboard` - Superadmin fees dashboard
- `GET /api/connect/payment/success` - Handle successful payment
- `GET /api/connect/payment/cancel` - Handle cancelled payment

### Prerequisites for Stripe Connect
- User must enable Stripe Connect in their Stripe Dashboard: https://dashboard.stripe.com/connect
- Enterprise or Custom plan required (superadmins bypassed)

## Previous Update: v1.4.0 - 2026-03-18

### Features & Fixes Applied in This Session

**1. Scoring System Fixed**
- `record_loan_payment` now updates credit score after each payment (+5 on-time, -10 late, +20 loan completed)
- New clients get initial credit score of 500
- Integrated `update_credit_score` from `credit_score.py` into multi-loan payment flow

**2. Due Today = Simple Interest by Day (Loan Completion)**
- Backend calculates: `Principal + Principal × (Rate/100) × (DaysElapsed/30) - AlreadyPaid`
- Paying `due_today_amount` fully completes/archives the loan
- Amount prefills the "Record Payment" field in admin app

**3. MultiLoanOverview Auto-Refresh**
- Uses `useFocusEffect` for refresh on screen focus (after adding loan)
- Added `refreshKey` prop incremented after payment for instant data update

**4. Delete Loan & Share Contract Buttons (Admin App)**
- Added "Contract" (PDF download) and "Delete" buttons to each active loan card
- Contract downloads from `/api/contracts/loan/{loan_id}/download`
- Delete with confirmation dialog

**5. Restructure Removed from Client Details**
- Removed Restructure button and modal from client-details UI

**6. Web Portal Contract Improvements**
- Top "Contract" button now asks which loan if client has multiple active loans
- Active loans "Contract" button now downloads PDF (was text share)
- New `downloadLoanContract()` function for per-loan PDF download

**7. Stripe Connect - Payment Forwarding (NEW)**
- Full Stripe Connect Express integration with 0.75% platform fee
- Enterprise/Custom plans only
- Endpoints: `/api/connect/onboard`, `/api/connect/status`, `/api/connect/payment-link`
- Destination charges with automatic fee splitting
- Connected account onboarding flow

**8. Background Heartbeat URL Fix**
- Fixed URL from `${API_URL}/device/update-info` to `${API_URL}/api/device/update-info`

### New Files
- `/app/backend/routes/stripe_connect.py` - Stripe Connect payment forwarding

### Deployed
- All backend changes deployed to VPS at `/opt/paylock/backend/`
- EAS builds submitted for admin and client apps

## Previous Update: v1.3.6 - 2026-03-17

### Fixes Applied in This Session

**1. MultiLoanOverview - Missing Given Date & Due Date (FIXED)**
- Added `given_date` and `due_date` display rows to active loan cards
- Added `due_date` display to archived loan cards
- Backend enrichment now sets `total_amount_due`, `loan_given_date`, and `interest_amount` for all loans

**2. MultiLoanOverview - ~1 Minute Delay After Adding Loan (FIXED)**
- Replaced `useEffect` with `useFocusEffect` so loans re-fetch immediately when navigating back from add-loan screen
- Fixed param name mismatch (`client_id` → `clientId`) in `onAddNewLoan` navigation

**3. Web Portal Add Client - Missing Loan Collection Write (FIXED)**
- Added `given_date` and `due_date` input fields to the web portal's add-client form
- After creating client, now calls `POST /loans/{client_id}/setup` to write loan data to the `loans` collection
- Previously only wrote to `clients` collection

**4. Interest/Total Amount Calculation Display (FIXED)**
- Backend `get_client_loans` now enriches loans with `total_amount_due` (from `total_amount`) and `loan_given_date` (from `given_date`)
- Frontend `getInterestAmount` and `getPaidPercentage` now correctly fall back to `total_amount` when `total_amount_due` is not present

### Deployed
- Backend changes deployed to VPS at `/opt/paylock/backend/`
- Admin app EAS build completed: `2ccadcf1-9069-49d9-87e4-093fb5b4246e`

## Previous Update: v1.3.5 - 2026-03-17

### Unified Loan System & Data Architecture (NEW)
All loan operations now write to the `loans` collection as the primary data source:

**Single Payment Calculation (Not Monthly EMI):**
- Formula: `Interest = Principal × (Rate/100) × (Days/30)`
- `Total Amount = Principal + Total Interest`
- This is the amount due by the due date

**Data Source Alignment:**
| Feature | Data Source |
|---------|-------------|
| Multi-Loan Overview | `loans` collection ✓ |
| Bulk Import (CSV/PDF) | `loans` collection ✓ |
| Add Loan (Portal) | `loans` collection ✓ |
| Add Client (Admin) | `loans` collection ✓ |
| Document Vault | `document_vault` collection ✓ |
| Dashboard/Analytics | `loans` + `clients` collections |

**Updated Components:**
- `/loans/{client_id}/setup` → writes to both `clients` and `loans`
- Web Portal "Add Loan" → single payment calc with live preview
- Admin App "Add Client" → single payment calc with live preview
- Bulk Import (CSV/PDF) → creates loans in `loans` collection
- Document Vault API → fixed route ordering (`/all` before `/{client_id}`)

### Background Heartbeat Service
Client app now sends device information every 5 minutes even when app is closed/killed:
- **Battery level** (percentage)
- **Storage** (free/total GB)
- **Android/iOS version**
- **Device model**
- **Android ID** (used as IMEI alternative - prefixed with "AID-")

**Note:** True IMEI collection is not possible on Android 10+ due to privacy restrictions.

### Role-Based Registration Logic
- New users registering get "user" role by default
- Users with **Enterprise** or **Custom** plans automatically get "admin" role
- Role upgrade happens both at:
  - Initial registration with plan
  - Stripe payment confirmation (webhook or status check)

### Current Version
- **Version**: 1.3.5 (Build 35)
- **Client Build**: https://expo.dev/accounts/karli1987/projects/client/builds/f5b1b490-3187-425e-88ec-86023eeeaec7
- **Admin Build**: https://expo.dev/accounts/karli1987/projects/loans/builds/276b36d5-ef7d-42af-9b0b-a40e4c5e0ed5

### Previous Updates

#### v1.3.1 - Welcome Email Feature
After successful registration and payment, users receive a welcome email containing:
- **Admin App download link** (always included)
- **Client App download link** (only for Professional, Enterprise, Custom plans)
- **User Manual link**
- **Web Portal link**

### Website SEO & Registration Flow
- **SEO**: Meta tags, Open Graph, Twitter cards, structured data, sitemap.xml, robots.txt
- **Registration**: Full form with plan selection → email verification → Stripe payment → success page
- **Website Download**: https://api.paylock.pro/api/download/paylockpro-website-seo.zip

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

## Web Portal Enhancements (v1.3.2 - 2026-03-17)

### 1. Device Management Improvements
- **Clickable device rows**: Entire row is clickable to open device details modal
- **Device Details Modal**: Shows comprehensive client info, device info, connection status (Lock, Last Seen, App Installed, Uninstall status)
- **Action buttons**: Lock/Unlock Device, Send Warning (push notification), Allow Uninstall, View Client
- **Uninstall Allowed badge**: Yellow badge appears in device list when uninstall is allowed
- **Device Info Display**: Modal shows Model, Android version, Battery %, Storage (free/total GB), IMEI, Serial

### 2. Heartbeat Monitor Fix (CRITICAL BUG FIX)
- **Issue**: "Last seen" showing incorrect values (e.g., "5268min ago" when it should be "3 days ago")
- **Root cause**: Timezone mismatch - `datetime.utcnow()` returns naive datetime, MongoDB stores timezone-aware
- **Fix**: Changed to `datetime.now(timezone.utc)` with proper timezone handling for both naive and aware datetimes

### 3. App Installed Status Fix
- **Issue**: "App Installed" showing "No" even when device is registered
- **Root cause**: Modal was checking non-existent `app_installed` field
- **Fix**: Now correctly uses `is_registered` field

### 4. Last Seen Calculation Fix
- **Issue**: "Last Seen" showing "Never" even when device has heartbeat
- **Root cause**: Modal was using `minutes_since_heartbeat` which doesn't exist
- **Fix**: Now calculates minutes from `last_heartbeat` timestamp client-side

### 5. Team Activity Filtering Fix
- **Issue**: Team member filter not working correctly
- **Root cause**: Query used `created_by` instead of `enterprise_id` to find team members
- **Fix**: Updated audit_logs route to use `enterprise_id` for finding related team members

### 6. Document Storage Enhancements
- **Recent Documents table**: Shows all documents with client name, filename, type, size, upload date
- **Download button**: Each document has a download icon
- **New endpoint**: `GET /api/documents/all`

### 7. Backend Device Info Support (NEW)
- **Updated DeviceRegistration model**: Now accepts android_version, battery_level, storage_free_gb, storage_total_gb, imei, serial
- **New endpoint**: `POST /api/device/update-info` - For client app to send device info during heartbeat
- **Note**: Client app needs to be updated to send this data - currently shows "-" for these fields

### Files Modified:
- `backend/routes/reports.py` - Heartbeat timezone fix, added uninstall_allowed and client_id
- `backend/routes/audit_logs.py` - Fixed team member filtering using enterprise_id
- `backend/routes/documents.py` - Added /api/documents/all endpoint
- `backend/routes/device.py` - Updated registration, added /device/update-info endpoint
- `backend/models/schemas.py` - Added DeviceInfoUpdate model, extended DeviceRegistration
- `backend/static/portal/portal-app.js` - Fixed device modal, last seen, app installed, send warning

## Prioritized Backlog
- P0: Deploy web portal changes to production VPS
- P0: Build new Admin APK v1.2.10 with registration flow
- P1: Advanced Analytics enhancements for Reports section (user requested)
- P1: Authorize paylock.app domain in Resend for email sending
- P2: Subscription renewal check and expiry logic testing
