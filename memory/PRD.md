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

## Completed (Feb 22, 2026)

### Interest Calculation Fix (P0)
- Fixed `calculate_interest_total()` — removed incorrect `* tenure` from fallback formula
- Interest now correctly uses `loan_amount * rate / 100` when `total_amount_due == loan_amount`
- Interest earned in reports now shows €141.31 instead of €0

### Reports API Structure Fix (P0)
- `GET /api/reports/collection` now returns nested `{overview, financial, this_month}` + flat fields
- `GET /api/reports/clients` now returns `{summary: {...}, details: {on_time, at_risk, defaulted, completed}}`
- Both endpoints now match the frontend's expected structure exactly

### SEB Bank Statement OCR Fix (P0)
- Installed `tesseract-ocr`, `tesseract-ocr-est` at OS level
- Added auto-install logic in `server.py` startup event if tesseract not found
- SEB statements are now auto-detected via OCR (`detect_seb_via_ocr`) when text is garbled
- Bank name shows `SEB`, period, account holder, and correct financial summary

### Loan Contract Share Fix
- `handleShareContract()` in `client-details.tsx` simplified to use `expo-sharing` directly
- Removed unreliable `Share.share` fallback (doesn't support file URLs on Android)

### Lock State Persistence Fix (client app)
- Moved lock screen check BEFORE loading spinner in `home.tsx`
- Lock screen now shows immediately when `checkCachedLockStateOnStartup()` sets `is_locked: true`
- Previously, loading spinner was blocking the lock screen from showing on restart

### Auth Token Persistence Fix (Feb 22, 2026)
- **Admin app** (`login.tsx`): Token was cleared on ANY network error during startup verification. Fixed to only clear on explicit 401/403 (invalid token). Network errors now redirect to tabs (offline-friendly).
- **Client app** (`register.tsx`): If `client_id` exists but server is unreachable (network error), now redirects to home instead of staying on register screen. Only clears `client_id` on explicit 404 (device deleted from server).


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
- Accessibility service lock check + keepalive now runs every 10s and relaunches lock screen if app is swiped away; lock screen hides system bars

### Admin App Updates
- Contract actions: removed Preview (contract review) button
- Contract share now uses native share sheet with attached PDF and prefilled subject/body
- Client details: address field added to contact info and edit modal
- Send warning button now only shows when admin mode is active
- Loans tab filter reset when query clears; payment filter buttons enlarged; filter no longer stuck on All
- Device Setup button removed from Features tab
- Superadmin-only Diagnostic Report export (PDF) in Settings with device info, permission status, logs, and API errors
- Contract PDF download/email now uses amount given + explicit interest formula in 2.2
- Dashboard month stats now populated from analytics (interest + revenue for current month)

### Backend Updates
- Financial report interest/profit recalculated from payment allocations (using paid-loans fallback when loan totals missing)
- Dashboard/paid-loans interest summaries now derived from payment allocations with paid-loans client mapping
- Added totals for principal_disbursed, principal_collected, processing_fees, late_fees
- Contract PDF paragraphs 1.1/2.2 updated to “amount given” and “amount due (amount given + interest)” wording
- OCR fallback for SEB PDFs (Tesseract) + AI retry with OCR text for encoded statements
- SEB statements decoded using Windows-1252/ISO-8859-1 normalization before analysis
- SEB analyzer shows “Processing SEB OCR…” + ETA (~30s) only for SEB PDFs (auto-detected)
- Added backend keepalive job (configurable via KEEPALIVE_URL + KEEPALIVE_INTERVAL_SECONDS)

## Completed (Feb 23, 2026)

### Client App Bug Fixes from Code Audit (P0)
- **Bug 1**: Fixed `handleUninstallSignal` looping alert — Added `uninstallHandledRef` guard to prevent repeated uninstall alerts during 10s polling loop
- **Bug 2**: Fixed `hasInitialized.current` not reset on unmount — Added reset in cleanup function so component re-initializes correctly on remount
- **Bug 3**: Fixed blank screen on fresh registration — Added `fetchStatus(id)` call in the fresh registration path so user data is populated immediately
- **Bug 4**: Fixed error fallback creating blank status object — Error path now preserves `null` status instead of overwriting with empty `{id:'', name:''}` 
- **Bug 5**: Connected `checkAndSetupDeviceProtection` to lifecycle — Function was defined but never called; now invoked in `initializeProtection` effect for proper device admin setup
- All 5 fixes verified via testing agent (12/12 tests passed)

### OS-Level Screen Lock via DevicePolicyManager.lockNow()
- Integrated `devicePolicy.lockDevice()` (calls native `DevicePolicyManager.lockNow()`) at 4 security-critical points:
  1. **Lock state transition**: When admin locks device, OS screen locks immediately (PIN/pattern required)
  2. **Boot with cached lock**: If device was locked when rebooted, locks OS screen on app startup
  3. **Tamper detection**: When Device Admin is forcefully disabled, locks device immediately
  4. **App resume while locked**: Re-locks OS screen every time app returns to foreground
- This is a hard OS-level lock — even if user bypasses the app's lock screen, the device itself requires PIN/pattern
- Verified via testing agent (all integration points confirmed)

### Status Bar & Navigation Bar Hide Workaround (3-Layer Defense)
- **Layer 1 — Enhanced Overlay Service**: Expanded blocker overlays by 20px beyond actual bar heights to catch edge swipe gestures. Added `FLAG_WATCH_OUTSIDE_TOUCH` to intercept touches outside the overlay. Service now sends `REAPPLY_IMMERSIVE` broadcast every 1s to the module.
- **Layer 2 — Broadcast Receiver Guard**: Native module registers a `BroadcastReceiver` that re-applies immersive mode on the activity every time the overlay service pings (every ~1s). This catches cases where focus changes, dialogs, or system events restore bars.
- **Layer 3 — Instant Visibility Listener**: `OnSystemUiVisibilityChangeListener` (pre-API 30) instantly re-hides bars the moment Android shows them. For API 30+, `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` auto-hides bars after swipe.
- Guards are installed when `enableImmersiveMode()` is called and cleaned up when `disableImmersiveMode()` is called.
- Verified via testing agent (8/8 features confirmed)

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
