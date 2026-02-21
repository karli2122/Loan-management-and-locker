# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with admin dashboard and client-facing mobile app. Device management features lock down client phones as loan collateral. Two-state device protection: PROTECTED (prevents uninstall) and LOCKED (inescapable lock screen).

## Tech Stack
- **Frontend**: React Native (Expo 54), TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Native Android**: Custom Expo module (emi-device-admin)
- **AI**: OpenAI GPT-4.1 via Emergent LLM Key (bank statement analysis)

## Key Files
- `app/client/home.tsx` — Client UI with lock screen + permission grid
- `app/client/register.tsx` — Client registration flow
- `app/admin/add-client.tsx` — Admin form for creating clients
- `app/admin/client-details.tsx` — Client detail page
- `app/admin/loan-plans.tsx` — Loan plan management
- `app/admin/bank-analyzer.tsx` — Bank statement analyzer UI with credit recommendation
- `app/admin/login.tsx` — Admin login with auth persistence
- `app/admin/reports.tsx` — Financial reports with monthly interest
- `backend/routes/clients.py` — Client CRUD
- `backend/routes/loans.py` — Loan operations
- `backend/routes/reports.py` — Reports + monthly interest earned
- `backend/routes/contracts.py` — PDF contract generation
- `backend/routes/bank_statements.py` — .asice/.pdf parsing + AI analysis with credit recommendation
- `backend/routes/device.py` — Device registration and status
- `modules/emi-device-admin/.../EMIAccessibilityService.kt` — Background polling

## Key API Endpoints
- `POST /api/clients` — Create client
- `POST /api/device/register` — Register device with code
- `GET /api/device/status/{id}` — Device status with loan amount (includes interest)
- `POST /api/loans/{id}/setup` — Setup loan with EMI calculation
- `POST /api/loans/{id}/payments` — Record payment
- `POST /api/bank-statements/analyze` — Upload and analyze bank statement (returns credit_recommendation)
- `GET /api/bank-statements/history` — Past analyses
- `GET /api/contracts/{id}/preview` — PDF contract preview
- `GET /api/reports/financial` — Financial reports

## Completed (Feb 20, 2026)

### Bank Statement Analyzer Enhancement
- Added `credit_recommendation` field to AI analysis prompt
- Fields: monthly_credit_amount, yearly_credit_amount, debt_to_income_ratio, disposable_income, risk_level, reasoning
- Frontend UI displays credit recommendation with monthly/yearly amounts, risk level badge, and reasoning
- Calculates safe credit based on 30-40% of disposable income

### Client App Fixes:
- Registration crash fix (v3): Removed ALL native module calls from register.tsx
- Loading stuck fix: setLoading(false) fires immediately after fetchStatus
- Contract date: Uses loan_start_date

### Admin App Fixes:
- Add Client form, Client Details, Client List, Dashboard, Login persistence
- Reports: Monthly interest earned
- Interest rate label: "Interest (Monthly)" in loan history

### Backend Fixes:
- ClientCreate schema, loan calculations, reports, bank statements, contracts
- All 35 API endpoint tests passing (100%)

### Native Android Fixes:
- AccessibilityService: Reads uninstall_allowed from server
- New openAccessibilitySettingsDirect method for Android 13+

### Build & Deployment:
- Fixed yarn.lock / package-lock.json conflict for EAS builds
- Submitted client-preview and admin-preview builds

## Completed (Feb 21, 2026)

### Client App Stability & Permissions
- Disabled automatic permission prompts on startup (location/notification now only request on user action)
- Overlay permission card now refreshes status after returning from settings
- Updated Samsung Android 13+/One UI restricted settings guidance for Accessibility with Loan Client name and required sequence
- Registration now proceeds directly to Home after successful registration
- Added data-testid coverage for permission cards

### Admin App Updates
- Contract actions: removed Preview (contract review) button
- Contract share now uses native share sheet with attached PDF and prefilled subject/body
- Client details: address field added to contact info and edit modal
- Send warning button now only shows when admin mode is active
- Loans tab filter reset when query clears; payment filter buttons enlarged; filter no longer stuck on All
- Device Setup button removed from Features tab
- Superadmin-only Diagnostic Report export (PDF) in Settings with device info, permission status, logs, and API errors
- Contract PDF download/email now uses amount given + explicit interest formula in 2.2

### Backend Updates
- Financial report interest/profit recalculated from payment allocations (using loan tenure when total due missing)
- Dashboard/paid-loans interest summaries now derived from payment allocations (not outstanding balances)
- Added totals for principal_disbursed, principal_collected, processing_fees, late_fees
- Contract PDF paragraphs 1.1/2.2 updated to “amount given” and “amount due (amount given + interest)” wording
- OCR fallback for SEB PDFs (Tesseract) + AI retry with OCR text for encoded statements
- Added backend keepalive job (configurable via KEEPALIVE_URL + KEEPALIVE_INTERVAL_SECONDS)

## Pending User Verification
- P0: Client app crash after registration (~5s after home load) — verify on device; needs logcat if it persists
- P0: Accessibility restricted settings on Samsung Android 16 — verify updated Loan Client sequence
- P1: Profit calculations in Reports/Analytics/Dashboard — validate with real data
- P1: Contract PDF text (1.1/2.2) validated via API; native Share still needs device verification
- P1: Address field save/display + send warning visibility (admin mode only) — verify
- P1: Diagnostic Report export button visible on web; verify PDF share on device
- P1: SEB PDF statement OCR + AI retry — backend API validated; verify in admin app UI
- P1: Loans tab filters (Dashboard > Loans > change filters) — verify not stuck on All
- P1: Client auth token persistence on restart — still needs investigation if issue persists
- P2: Loans filter button sizing + filter reset — verify UI

## Backlog
- P1: Refactor home.tsx into smaller components
- P2: Payment Reminders, Bulk Import, Credit Score PDF, P/L Dashboard
- P3: AMAPI, FCM Push Notifications
