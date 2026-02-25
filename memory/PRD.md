# PayLock Pro - Loan Management App

## Original Problem Statement
Build a loan management application with:
- A client-facing Android app with device-locking (kiosk) mode
- An admin-facing app for managing clients, loans, payments and device controls
- Brand name: **PayLock Pro**

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React Native (Expo) - Admin app + Client app (web + Android)
- **Native Modules**: Kotlin-based device admin for kiosk mode
- **Payments**: Stripe via emergentintegrations library

## What's Been Implemented

### Core Features
- Admin dashboard with client management, loan tracking, payment recording
- Client app with device registration, lock screen, payment status
- Device locking/unlocking, warning messages, location tracking
- Credit score system, payment reminders, auto-lock on overdue

### Device Owner Mode - COMPLETED (Feb 25, 2026)
- **Backend**: Registration code generation supports `lock_mode` param (device_admin=8-digit, device_owner=9-digit)
- **Backend**: Device registration detects code length to set lock_mode
- **Backend**: Device status endpoint returns lock_mode, outstanding_balance, monthly_emi
- **Client App**: Registration accepts up to 9-digit codes, stores lock_mode in AsyncStorage
- **Client App**: Enhanced lock screen shows Device Owner badge, monthly EMI for device_owner mode
- **Admin App**: Generate Key dialog lets admin choose Device Admin or Device Owner mode
- **Admin App**: DeviceInfo section shows current lock_mode indicator

### Business Management UI - COMPLETED (Feb 25, 2026)
- Added collapsible "Business Management" section under Device Management
- Mode comparison cards (Device Admin vs Device Owner)
- Selectable activation methods: ADB, QR Code, NFC
- Detailed ADB activation instructions with copyable commands
- Troubleshooting section for common Android issues ("Restricted settings unavailable", etc.)

### QR Code Provisioning - COMPLETED (Feb 25, 2026)
- Backend endpoint generates Android Device Owner provisioning QR code
- Supports WiFi configuration in the QR payload
- Instructions in English and Estonian
- Frontend "Generate QR Code" button in Business Management section

### Custom Launcher (Kiosk Mode) - COMPLETED (Feb 25, 2026)
- Native Kotlin module: `setAsDefaultLauncher`, `clearDefaultLauncher`, `setLockTaskPackages`
- DevicePolicy.ts utility wrapper methods added
- Client home.tsx activates custom launcher when lock_mode=device_owner
- Automatically sets app as default launcher + lock task packages when locked in Device Owner mode
- Clears custom launcher when device is unlocked

### Google Drive Backup - COMPLETED (Feb 25, 2026)
- Backend: POST /api/backup/create - Creates full backup (clients, loans, payments, loan_history)
- Backend: GET /api/backup/list - Lists all backups for admin
- Backend: GET /api/backup/{id} - Downloads specific backup
- Backend: POST /api/backup/restore/{id} - Restores data from backup
- Backend: DELETE /api/backup/{id} - Deletes backup
- Frontend: Settings page connected to real backup API (previously mocked)

### Bug Fix: Client Details Crash - COMPLETED (Feb 25, 2026)
- Fixed: `LoanHistory.tsx`, `LoanOverview.tsx`, `PaymentHistory.tsx` were using `t()` function without importing `useLanguage` hook
- This caused crashes when using languages other than English/Estonian

### Stripe Subscription Plans - COMPLETED
- Starter: €29/month, Business: €79/month, Enterprise: €199/month, Custom: Contact sales

### PayLock Pro Branding - COMPLETED
- Logo, colors (Royal blue #2563EB), PDF reports header/footer

### Internationalization - COMPLETED
- 16 languages, 8 currencies, 650+ translation keys

### Soft-Delete Client - COMPLETED
- Soft-delete with uninstall signal for client devices

## Credentials
- Admin: username=admin, password=admin123

## APK Builds (Feb 25, 2026)
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/119d55c0-1a89-4357-a806-5f5c784639d1
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/7e0dfec7-b387-4936-a9c1-3982a9adfdd6

## Upcoming Tasks
- Add "address" field to client info
- Diagnostic Report PDF export for superadmins

## Future/Backlog
- iOS version, SMS/Email reminders, Bulk Import, Credit Score PDF
- NFC provisioning for Device Owner mode (currently "coming soon")
- Fix recurring: lock screen status bar accessible, lock state after app kill

## Key DB Schema
- **clients**: `{ ..., "is_deleted": bool, "uninstall_allowed": bool, "lock_mode": str, "total_due": float, "next_due_date": str }`
- **backups**: `{ "backup_id": str, "admin_id": str, "google_email": str, "created_at": datetime, "size_bytes": int, "stats": dict, "data": dict }`
- **subscriptions**: `{ "admin_id": str, "stripe_customer_id": str, "stripe_subscription_id": str, "plan": str, "status": str }`

## Key API Endpoints
- `POST /api/clients/{id}/generate-code?admin_token=...&lock_mode=device_admin|device_owner`
- `POST /api/device/register` (8-digit=admin, 9-digit=owner)
- `GET /api/device/status/{client_id}` (returns lock_mode, outstanding_balance, monthly_emi)
- `POST /api/backup/create?admin_token=...`
- `GET /api/backup/list?admin_token=...`
- `GET /api/backup/{backup_id}?admin_token=...`
- `POST /api/backup/restore/{backup_id}?admin_token=...`
- `DELETE /api/backup/{backup_id}?admin_token=...`
- `GET /api/provisioning/qr-code?admin_token=...&wifi_ssid=...&wifi_password=...`
