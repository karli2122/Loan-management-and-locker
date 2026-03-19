# PayLock Pro - Product Requirements Document

## Original Problem Statement
A full-stack loan management application with FastAPI backend, React Native Admin/Client apps, and a vanilla JS web portal. The system manages client loans, tracks payments, generates contracts, monitors device heartbeats, and provides analytics dashboards.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas, VPS (37.148.202.159, service: paylock)
- **Admin App**: React Native (Expo SDK 54), EAS builds
- **Client App**: React Native (Expo SDK 54), EAS builds
- **Web Portal**: Vanilla JS served via FastAPI static files
- **Database**: MongoDB Atlas (loans collection = single source of truth)

## Key Data Model
- `loans` collection: Single source of truth for all loan data
- `clients` collection: Client profile info, aggregated loan stats calculated dynamically
- `paid_loans` collection: Archived fully-paid loan records with interest data
- `payments` collection: Individual payment records
- `document_vault` collection: Client documents

## Due Today Calculation Formula (v1.4.8)
For loans with `given_date`:
- **Overdue (past due date)**: `due_today = principal + interest + (daily_interest × days_overdue) - paid`
- **Due in ≤2 days**: `due_today = principal + interest - paid` (full amount)
- **Due in 3+ days**: `due_today = principal + interest - (days_until_2_before_due × daily_interest) - paid`
Where: `daily_interest = principal × (rate/100) / 30`

## Credentials
- **VPS**: karliv @ 37.148.202.159 / Nasvakas123!
- **Super Admin**: karli1987 / nasvakas123

## What's Implemented (as of March 19, 2026)

### Core Features
- [x] Unified loan data source (loans collection)
- [x] Month-based interest calculation
- [x] Due today formula with late fees (3-tier: overdue/near-due/future)
- [x] Delete Loan functionality (backend + web portal)
- [x] Share Contract functionality (backend PDF gen + frontend share dialog)
- [x] Bulk import writes to loans collection
- [x] Role assignment logic (user default, admin on enterprise/custom plan)
- [x] Background heartbeat service (client app)
- [x] Push notifications for silent devices

### Dashboard & Analytics (Fixed v1.4.8)
- [x] Interest Earned: now includes archived loans from both paid_loans AND loans collection
- [x] Loans Archived: counts from both paid_loans AND archived loans in loans collection
- [x] Monthly Interest Income: correctly calculated from archived loan interest
- [x] Profit This Month: uses actual interest from archived/active loans
- [x] Active Loans: counts from loans collection (not stale clients data)
- [x] Overdue Loans: dynamically calculated from loan due dates
- [x] Outstanding Balance: calculated with late fee formula
- [x] paid_loans records now auto-created when loan fully paid

### Admin App (v1.4.8)
- [x] Month-based interest forms
- [x] Demo mode restrictions (disabled Add Loan, Upgrade button → loan-plans)
- [x] Color-coded due amount on client/loan cards (green=paid, red=overdue, yellow=due)
- [x] 100% Paid indicator on cards when outstanding ≤ 0
- [x] Registered device badge on cards (lock-open/lock-closed/phone icon)
- [x] Late fee row in loan card (shows daily rate × days)
- [x] Add Loan calculator shows Due Amount (removed Monthly EMI)
- [x] Platform fee configuration UI for superadmins (in Stripe Connect settings)
- [x] Share Contract uses legacy expo-file-system API (fixes deprecation error)
- [x] Client list refreshes on focus (useFocusEffect)

### Web Portal
- [x] Delete/Share Contract buttons
- [x] Document search fix
- [x] Email button UI
- [x] Plan-gated code generation
- [x] Correct remaining amount in loan selector
- [x] Stripe Connect setup in settings

## Pending / Known Issues
- [ ] Share Contract native share dialog needs real-device verification after build
- [ ] Background heartbeat needs real-device verification
- [ ] Subscription auto-renewal needs testing with expired accounts

## Changelog
- **v1.4.9 (Build #50, March 19 2026)**: Fixed JSX syntax error in loans.tsx (unclosed fragment/ternary), validated calculator fix, badge logic, and 100% Paid UI. Submitted new EAS builds.
- **v1.4.9-hotfix (March 19 2026)**: Complete backend data consistency audit & fix:
  - Clients endpoint: Resets financial fields to 0 for clients with no active loans (was showing stale data)
  - Clients endpoint: Fixed total_amount_due calculation (was using tenure_avg=1 for all clients, now sums per-loan)
  - Dashboard: Added outstanding_balance to loans projection (was undercounting for loans without given_date)
  - Reports/Collection: Now includes archived data from paid_loans for disbursed/collected totals (was active-only)
  - Reports/Financial: Fixed paid_loans query to use admin_id scoping (was missing deleted clients' data)
  - Portfolio-Health: Refactored to use loans collection instead of stale clients collection
  - Payment handler: Now updates client document's core financial fields (outstanding_balance, loan_amount, total_paid) on every payment
- **v1.4.9-audit (March 19 2026)**: Full audit of all three apps:
  - **Backend API**: All 25+ endpoints tested, all returning 200. Data consistent across all 6 financial endpoints.
  - **Web Portal**: Dashboard, client list, client details, reports all verified via screenshots. Data matches backend.
  - **Admin App**: Code reviewed - loans tab (JSX fixed), dashboard (correct data flow), transactions, client details, MultiLoanOverview (delete/share/edit buttons present).
  - **Client App**: Code reviewed - heartbeat service, registration, permissions, background tasks all correctly implemented.
  - **Production VPS**: Deployed and verified - all endpoints consistent (Outstanding=2028.72, Disbursed=6991.22, Collected=5416.31).
  - **Fixed**: `logger` undefined in loans_multi.py (would cause crash on loan archival).

## EAS Builds Submitted (v1.4.9, Build #50)
- Admin: b5e89a98-3294-4f87-a72b-f7f68fd033a1
- Client: 6b1c5398-de7d-4f1d-8183-39aeb59c9676
