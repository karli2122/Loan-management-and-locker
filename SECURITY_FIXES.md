# Security & Correctness Fixes

This document records the changes applied in this pass and the **manual steps
you still need to do yourself** (things code can't do for you).

## ⚠️ Manual steps you MUST do now

1. **Revoke the leaked Firebase service-account key.** A real private key for
   the `comm-route` project was committed at
   `frontend/comm-route-firebase-adminsdk.json`. The file has been removed from
   the working tree, but anyone who ever cloned/forked the repo still has it.
   - In Google Cloud Console → IAM & Admin → Service Accounts → Keys, **delete
     that key** and generate a new one.
   - Store the new key outside the repo (it's now covered by `.gitignore`).
2. **Purge the key from git history.** Deleting the file in a new commit does
   NOT remove it from history. Use `git filter-repo` (recommended) or BFG:
   ```bash
   git filter-repo --path frontend/comm-route-firebase-adminsdk.json --invert-paths
   # then force-push and have all collaborators re-clone
   ```
3. **Rotate any other secrets** that may have been exposed (Stripe keys, Resend
   key) if they were ever committed or shared.
4. **Set the new environment variables** (see `backend/.env.example`):
   `ALLOWED_ORIGINS`, `STRIPE_WEBHOOK_SECRET`.
5. **Install new dependencies**:
   ```bash
   cd backend && pip install -r requirements.txt      # adds slowapi
   cd ../frontend && yarn install                     # adds expo-secure-store
   ```

## Fixes applied in code

### Critical
- **Removed committed Firebase private key** and added `*firebase-adminsdk*.json`
  / `*service-account*.json` patterns to `.gitignore`.
- **Device endpoints now authenticate.** `/device/location`,
  `/device/push-token`, `/device/update-info`, `/device/clear-warning`,
  `/device/report-admin-status` now require the per-device `device_token` issued
  at registration (verified with a constant-time comparison).
  `/device/location-history` now requires an authenticated admin scoped to the
  client. The client app was updated to send `device_token` on all these calls.

### High
- **CORS hardened.** No more `allow_origins=["*"]` together with
  `allow_credentials=True`. Origins come from `ALLOWED_ORIGINS`; credentials are
  only enabled when explicit origins are configured.
- **Rate limiting added** (slowapi) on `/admin/login` and `/client/login`
  (10/min/IP) to blunt brute-force against passwords and registration codes.
- **Stripe webhook signature verification.** `/api/webhook/stripe` now verifies
  the `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` before processing, and
  refuses to run if the secret is unset.
- **Token transport.** Added `Authorization: Bearer` support server-side
  (`utils/dependencies.py`, `extract_token`) and an `authHeader()` helper plus
  secure token storage on the client. Query-param tokens still work for backward
  compatibility but should be phased out.
- **Secrets in keystore.** Admin token/id moved from plain `AsyncStorage` to
  `expo-secure-store` via `src/utils/secureStorage.ts`, with transparent
  migration of any existing values. 34 screens/services were updated.

### Correctness
- **Atomic payments.** `record_payment` now uses `find_one_and_update` with
  `$inc` instead of read-modify-write, eliminating a race where concurrent
  payments could lose money. Outstanding balance is floored at 0.
- **Payment amount validation.** `PaymentCreate.amount` now requires `> 0`
  (and a sane upper bound), preventing negative "payments" that would inflate
  balances.
- **Money rounding helper** (`utils/calculations.money`) for consistent 2-dp
  rounding at write boundaries. NOTE: balances are still stored as floats; a
  stricter ledger should migrate to integer cents / Decimal (see below).

### Hygiene
- Removed generated artifacts from the repo (`test_reports/`,
  `translations_output.json`, `translation_log.txt`, `model.patch`,
  `missing_lt.json`) and added them to `.gitignore`.
- Added `backend/.env.example`.

## Recommended follow-ups (not done here — larger/riskier)
- **Money as float → integer minor units or `Decimal`** across schemas,
  calculations, routes, and the frontend. This is a data-model migration that
  needs a running system + migration script + tests; doing it blind risks
  corrupting balances.
- **Finish the bearer-token migration**: switch all admin `fetch` calls from
  `?admin_token=` query params to the `Authorization` header using
  `authHeader()`, then drop the query fallback in `extract_token`.
- **Move shared business logic** (credit score, archiving) into a `services/`
  layer instead of cross-importing between route modules inside functions.
- **Force-rehash legacy SHA-256 passwords** on next login, then remove the
  legacy path in `verify_password`.

---

# Lock Mechanism Hardening (second pass)

## Critical — unlock path authenticated & tamper-evident
- `GET /device/status/{client_id}` now requires the per-device `device_token`.
  Previously unauthenticated, it drives the lock/unlock decision, so anyone who
  knew a client_id (or could MITM the poll) could force `is_locked: false`.
- The server now signs the lock decision: HMAC-SHA256 over
  `client_id|is_locked|issued_at`, keyed by the device token
  (`utils/auth.sign_lock_state`). The response carries `lock_signature` +
  `lock_issued_at`.
- The client (`OfflineSyncManager.verifyLockSignature`, `utils/hmac.ts`) verifies
  the signature and rejects stale payloads (>10 min). `home.tsx` only honors an
  UNLOCK when the signature verifies; an unverified/forged unlock keeps the
  device locked. Python signer and JS verifier produce identical signatures
  (cross-checked against Node's native HMAC).

## Battery / reliability
- Native monitor poll 200ms -> 1s; overlay watchdog 200ms -> 500ms.
- Replaced continuous 24h PARTIAL_WAKE_LOCK in both services with short
  renewable wake-locks (5 min monitor / 30 min overlay) that are released when
  the device is unlocked, so the CPU can sleep. The old behavior drained the
  battery and tripped OEM battery managers (which then killed the services).

## Emergency-call bypass closed
- Dialer detection changed from broad substring matches (`contains("phone")`,
  etc.) to an explicit allowlist of known dialer packages.
- Added a 10-minute cap on the emergency-call window
  (`emergency_call_started_at`), so a left-open flag can't keep the device
  unlocked indefinitely.

## New dependencies (install before running)
- backend: `slowapi` (already added)
- frontend: `expo-secure-store`, `expo-crypto`, `expo-linear-gradient`
  (`yarn install`)

## Recommended follow-ups for the lock (design trade-offs — not auto-applied)
- Prefer true Device Owner `startLockTask` where provisioned; treat the overlay
  as fallback. Overlay/accessibility locking is defeatable in safe mode/ADB and
  is sensitive under Google Play policy (may require sideloading).
- Drive foreground detection from `EMIAccessibilityService` events instead of
  polling `UsageStatsManager` (1–2s lag lets a user reach Force-Stop/Uninstall).
- Add TLS certificate pinning to the status/sync calls.

---

# Design System — "Midnight" (premium dark / glass / neon)

Foundation added (not yet rolled across all screens — reference-first):
- `src/theme/tokens.ts` — palette, spacing, radius, type scale (tabular money),
  shadows, gradients.
- `src/theme/components.tsx` — `Screen`, `GlassCard` (signature glassy card with
  neon top-edge), `NeonButton`, `Pill`, `Money`, `Eyebrow`.
- Reference screens: `app/client/dashboard-redesign.tsx`,
  `app/client/lock-redesign.tsx`, `app/admin/dashboard-redesign.tsx`.

To adopt: review the three reference screens, tune accent intensity / blur /
money treatment in tokens.ts, then migrate screens to the primitives.
