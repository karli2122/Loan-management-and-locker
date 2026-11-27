# Backend Architecture (PayLockPro / Kimi)

The backend is a modular FastAPI app (v2.0.0). `server.py` is the application
entry point: middleware, exception handlers, router includes, and startup
tasks. Business logic lives in `routes/`, `utils/`, `models/`, and `tasks.py`.

```
backend/
├── server.py             # FastAPI app, CORS, Bearer token compat middleware
├── config.py             # Env-backed settings (MONGO_URL, TOKEN_EXPIRY_HOURS, …)
├── database.py           # Motor client and indexes
├── tasks.py              # Background loops (overdue, reminders, reports, …)
├── models/
│   └── schemas.py        # Pydantic request/response models
├── routes/               # One module per API area (admin, clients, device,
│                         # loans, reports, support, payments, …)
├── utils/
│   ├── auth.py           # Argon2 passwords, tokens, device_token, lock HMAC
│   ├── dependencies.py   # require_admin / require_permission (Bearer + query)
│   ├── calculations.py   # Canonical interest, EMI, and late-fee helpers
│   ├── ledger.py         # Payment application (clients + loans)
│   ├── overdue.py        # Shared overdue / auto-lock / late-fee pipeline
│   ├── lock_notify.py    # Signed Expo push for lock/unlock
│   ├── timeutils.py      # UTC-aware datetime helpers
│   ├── permissions.py    # Role-based permission map
│   └── …
├── static/portal/        # Lender / client web portal
└── tests are in the repo-root `tests/` directory (pytest)
```

## Auth

- Admin routes accept `Authorization: Bearer <token>` (preferred). Query-string
  `admin_token` is a deprecated fallback for older app builds (`server.py`
  copies the Bearer token into the query so existing handlers keep working).
- Device routes accept `X-Device-Token` (preferred) or `device_token` in the
  query/body. `verify_device` uses a constant-time compare.
- Lock decisions on `/api/device/status` are HMAC-signed with the device token.

## Money math

`utils/calculations.py` is the single source of truth:

- Loan `interest_rate` is a **monthly** percent.
- Principal is `loan_amount - down_payment`.
- Tenure is `max(1, round(days / 30))`.
- Late fees accrue in discrete periods (percent of outstanding after grace).

Payments update both the `clients` document and the active `loans` row. Device
status reads the loan ledger.

## Overdue / auto-lock

`utils/overdue.py::apply_overdue_for_client` is used by the hourly
`process_due_payments` task and by `POST /late-fees/calculate-all`. It covers
one-time loans created by `setup_loan` (which do not have a
`payment_schedules` row). Unpaid schedules do not advance their due date.
