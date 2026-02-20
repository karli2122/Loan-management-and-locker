# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral.

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin)

## Key Files
- `app/client/home.tsx` — Client UI with lock screen + permission grid
- `app/client/register.tsx` — Client registration flow
- `app/admin/add-client.tsx` — Admin form for creating clients
- `app/admin/client-details.tsx` — Client detail page
- `app/admin/loan-plans.tsx` — Loan plan management
- `app/admin/login.tsx` — Admin login with auth persistence
- `app/admin/(tabs)/index.tsx` — Dashboard (action buttons removed)
- `app/admin/reports.tsx` — Financial reports with monthly interest
- `backend/routes/clients.py` — Client CRUD
- `backend/routes/loans.py` — Loan operations (interest rate fix: monthly*12=annual)
- `backend/routes/reports.py` — Reports + monthly interest earned
- `backend/routes/contracts.py` — PDF contract generation with loan_start_date
- `backend/routes/bank_statements.py` — .asice parsing (PDF+XML+CSV support)
- `modules/emi-device-admin/.../EMIAccessibilityService.kt` — Background polling + uninstall_allowed

## Key API Endpoints
- `POST /api/clients` — Create client (sets loan_start_date, outstanding_balance, next_payment_due)
- `GET /api/reports/financial` — Returns monthly_trend, monthly_interest, totals
- `PUT /api/loan-plans/{id}` — Update plan (now supports is_active toggle)
- `GET /api/contracts/{id}/preview` — PDF with loan_start_date

## Completed (Feb 20, 2026)

### Client App Fixes:
- **Registration crash fix (v3)**: Removed ALL native module calls from register.tsx. Native setup (backupClientData, setRegistered, setClientInfo) deferred to home.tsx fresh registration path as fire-and-forget.
- **Loading stuck fix**: `setLoading(false)` now fires immediately after `fetchStatus` in `loadClientData()`. Location + push token are fire-and-forget (don't block loading).
- **Contract date**: Uses `loan_start_date` instead of today's date.

### Admin App Fixes:
- Add Client form: Loan Amount moved under Loan Details, Loan Tenure removed, sends loan_amount + loan_start_date + emi_due_date properly
- Client Details: Pull-to-refresh, removed EMI Details section, Lock/Uninstall buttons gated on admin_mode_active
- Client List: Shows outstanding balance + last heartbeat
- Dashboard: Action buttons removed (available in Features tab)
- Login: Auth persistence with loading screen before checking session
- Reports: Monthly interest earned for past 6 months
- Device Management: Removed "Device Setup" button and info dialog
- Info dialog "A unique registration code..." removed from add-client
- Interest rate label: "Interest (Monthly)" in loan history

### Backend Fixes:
- ClientCreate schema: Added loan_start_date, removed loan_tenure_months
- create_client: Sets loan_start_date, outstanding_balance, next_payment_due, loan_due_date
- LoanPlanCreate: Added is_active field for toggle support
- Loan calculations: Fixed interest rate handling (monthly * 12 = annual for EMI calc)
- Reports: monthly_trend array + monthly_interest array + totals object
- Bank statements: .asice parsing handles XML, CSV (not just PDF)
- Contracts: Uses loan_start_date for contract date

### Native Android Fixes:
- AccessibilityService: Now reads and stores `uninstall_allowed` from server during periodic polling
- Uninstall allowed state persists even when app is closed from recents

## Backlog
- P1: Refactor home.tsx into smaller components
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications
