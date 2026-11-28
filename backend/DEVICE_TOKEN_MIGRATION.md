# Device token migration (client 1.5.6+) — backend notes

Status: documentation only. Nothing in this file is deployed. The live API
(api.paylock.pro, Kimi-era) keeps working with client 1.5.6 as is.

## Problem

Devices registered against the old API never received a `device_token`.
The newer backend (`utils/auth.py::verify_device` + the header→query middleware in
`server.py`) answers **401** for every device endpoint when the token is missing.
If that backend is deployed as is, every already-registered phone loses lock/unlock
sync until it is re-registered (which needs a fresh code and physical access).

## What the client (1.5.6) already does

* Sends `X-Device-Token` when it has a token, nothing otherwise.
* 401/403 on `/api/device/status/{id}` no longer wipes the registration: the app keeps
  its `client_id`, shows a "device link needs attention" banner and keeps the last
  known lock state (offline cache / native prefs).
* 404 is only treated as "deleted on the server" after 3 consecutive answers; then the
  local registration is cleared and the register screen is shown.
* If any device response carries a response header **`X-Device-Token-Issued: <token>`**
  and the device has no token yet, the client stores it (SecureStore with AsyncStorage
  fallback + native prefs used by the background lock sync) and sends it from then on.
* SecureStore read/write failures fall back to AsyncStorage instead of throwing.

## What the backend needs before enforcing tokens (additive)

1. **Legacy grace in `verify_device`**: if the client row has *no stored token hash*
   (registered before tokens existed), accept the request without a token instead of
   401, generate a token, store its hash and return it once in the
   `X-Device-Token-Issued` response header (also expose it via CORS
   `expose_headers`).
2. Keep returning 401 only when a token **is** stored and the presented one is wrong
   or missing.
3. Optional: an explicit claim endpoint, e.g. `POST /api/device/claim-token/{client_id}`
   that does the same as (1) for clients without a stored token, rate limited.
4. Do not treat `report-tamper` as a lock trigger server side unless desired: the
   client now applies its own local tamper lock and only *reports*
   (`tamper_type=permission_revoked:<list>`).
5. Tamper lock release: the client releases its local tamper lock when the server
   status goes locked → unlocked (lender presses Lock then Unlock), when
   `uninstall_allowed` / deleted is set, or when the borrower restores the permissions.

## Registration codes

Client accepts 8 (Device Admin), 9 (Device Owner) and legacy 16/17 character codes
(uppercased, separators stripped). A Device Owner code on a phone that is not
provisioned as Device Owner offers registration as Device Admin
(`lock_mode=device_admin`).
