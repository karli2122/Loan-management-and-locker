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
- QR Code and NFC methods marked as "coming soon"
- Troubleshooting section for common Android issues

### Stripe Subscription Plans - COMPLETED (Feb 25, 2026)
- **Starter**: €29/month, 50 clients, basic features
- **Business**: €79/month, 200 clients, auto-lock, reminders, reports (Most Popular)
- **Enterprise**: €199/month, 1000 clients, all features
- **Custom**: Contact sales, unlimited
- Stripe Checkout integration via emergentintegrations

### PayLock Pro Branding - COMPLETED
- Logo, colors (Royal blue #2563EB), PDF reports header/footer

### Internationalization - COMPLETED
- 16 languages, 8 currencies, 650+ translation keys

### Soft-Delete Client - COMPLETED
- Soft-delete with uninstall signal for client devices

## Credentials
- Admin: username=admin, password=admin123

## Upcoming Tasks
- (P0) Finish Google Drive backup feature using Emergent-managed Google Auth
- Custom Launcher for kiosk mode
- Add "address" field to client info

## Future/Backlog
- iOS version, SMS/Email reminders, Bulk Import, Credit Score PDF
- Diagnostic Report PDF export for superadmins
- QR Code provisioning for Device Owner mode
- NFC provisioning for Device Owner mode

## Key DB Schema
- **clients**: `{ ..., "is_deleted": bool, "uninstall_allowed": bool, "lock_mode": str, "total_due": float, "next_due_date": str }`
- **subscriptions**: `{ "admin_id": str, "stripe_customer_id": str, "stripe_subscription_id": str, "plan": str, "status": str }`

## Key API Endpoints
- `POST /api/clients/{id}/generate-code?admin_token=...&lock_mode=device_admin|device_owner`
- `POST /api/device/register` (8-digit=admin, 9-digit=owner)
- `GET /api/device/status/{client_id}` (returns lock_mode, outstanding_balance, monthly_emi)
