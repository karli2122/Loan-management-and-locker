# EMI Device Admin - Loan Management App

## Original Problem Statement
Build a loan management application with:
- A client-facing Android app with device-locking (kiosk) mode
- An admin-facing app for managing clients, loans, payments and device controls

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React Native (Expo) - Admin app + Client app (web + Android)
- **Native Modules**: Kotlin-based device admin for kiosk mode

## What's Been Implemented

### Core Features
- Admin dashboard with client management, loan tracking, payment recording
- Client app with device registration, lock screen, payment status
- Device locking/unlocking, warning messages, location tracking
- Credit score system, payment reminders, auto-lock on overdue
- Device price lookup (Swappa integration)
- Bank statement OCR analysis
- Audit logging, notifications system

### Internationalization (i18n) & Localization (l10n) - COMPLETED
- **16 languages**: en, et, no, sv, da, fi, lv, lt, de_at, cs, pl, de_ch, es, de, fr, it
- **8 currencies**: EUR, NOK, SEK, DKK, CZK, PLN, CHF, GBP
- **622 translation keys** fully translated via LLM (GPT-4o-mini)
- LanguageContext and CurrencyContext for global state management
- LanguagePicker and CurrencyPicker dropdown components
- German variant fallback (de_at, de_ch → de)

### Soft-Delete Client with Uninstall Signal - COMPLETED (Feb 25, 2026)
- DELETE /api/clients/{id} now soft-deletes (is_deleted=True, uninstall_allowed=True)
- Device status endpoint still returns data for soft-deleted clients
- Client app detects is_deleted and triggers uninstall flow
- DELETE /api/clients/{id}/purge for permanent deletion
- All listing/report queries exclude soft-deleted clients

### Kiosk Mode (Device Admin)
- Native Kotlin overlay service for status bar blocking
- Lock state caching to SharedPreferences for background service persistence
- Guided permission prompts for Usage Stats and Notification Listener

## Key API Endpoints
- POST /api/admin/login - Admin authentication
- GET/POST/DELETE /api/clients - Client CRUD
- DELETE /api/clients/{id}/purge - Hard delete
- GET /api/device/status/{client_id} - Device status (supports soft-deleted)
- POST /api/clients/{id}/lock|unlock - Lock/unlock device
- POST /api/clients/{id}/allow-uninstall - Allow uninstall
- POST /api/clients/{id}/send-warning - Send warning

## Credentials
- Admin: username=admin, password=admin123

## P0 Issues (Critical)
- [x] Incomplete translations for 14 languages - FIXED
- [ ] Client app lock state not enforced after kill (needs device testing)
- [ ] Status bar accessible on lock screen (needs device testing)

## P1 Issues
- [ ] Client app status auto-refresh consistency
- [ ] "Restricted settings unavailable" on modern Android
- [ ] Client app offline mode incorrect data
- [ ] Client app crashes post-registration

## P2 Issues
- [x] Allow Uninstall for deleted client - FIXED (soft-delete)

## Upcoming Tasks
- Custom Launcher (Default Home App) for strongest kiosk lock-in
- Add "address" field to client information form
- Diagnostic Report PDF export for superadmins

## Future/Backlog
- iOS version with "soft lock" features
- Automated Payment Reminders via SMS/Email
- Bulk Payment Import from CSV
- Client Credit Score Report (PDF)
- Migrate portal-dashboard.tsx and portal-login.tsx to global LanguageContext
