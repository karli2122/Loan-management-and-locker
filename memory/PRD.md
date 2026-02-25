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

## Color Scheme
- Primary: `#2563EB` (Royal Blue)
- Primary Light: `#3B82F6`
- Background (Dark): `#0B1527`
- Surface (Dark): `#152035`
- Surface Alt: `#1E3050`
- Text Muted: `#7A9CC6`
- Accent: `#06B6D4` (Cyan - used for Most Popular badge)

## What's Been Implemented

### Core Features
- Admin dashboard with client management, loan tracking, payment recording
- Client app with device registration, lock screen, payment status
- Device locking/unlocking, warning messages, location tracking
- Credit score system, payment reminders, auto-lock on overdue
- Device price lookup (Swappa integration)
- Bank statement OCR analysis
- Audit logging, notifications system

### PayLock Pro Branding - COMPLETED (Feb 25, 2026)
- Logo integrated across admin login, app icon, and PDF reports
- App names: PayLock Admin, PayLock Client
- Color scheme: Royal blue (#2563EB) with navy dark theme (#0B1527)
- PDF contracts: PayLock Pro header with logo + branded footer

### Plans & Pricing - COMPLETED (Feb 25, 2026)
- **Starter**: €29/month, 50 clients, basic features
- **Business**: €79/month, 200 clients, auto-lock, reminders, reports (Most Popular)
- **Enterprise**: €199/month, 1000 clients, all features
- **Custom**: Contact sales, unlimited clients
- **Add-ons**: €0.50/extra device/month, €0.03/SMS
- All plans fully translated in 16 languages
- Interactive plan selection with visual highlighting
- Located in Settings > Plans & Pricing

### Internationalization (i18n) & Localization (l10n) - COMPLETED
- **16 languages**: en, et, no, sv, da, fi, lv, lt, de_at, cs, pl, de_ch, es, de, fr, it
- **8 currencies**: EUR, NOK, SEK, DKK, CZK, PLN, CHF, GBP
- **650+ translation keys** fully translated

### Soft-Delete Client with Uninstall Signal - COMPLETED (Feb 25, 2026)
- DELETE /api/clients/{id} soft-deletes (is_deleted=True, uninstall_allowed=True)
- Device status endpoint returns data for soft-deleted clients
- DELETE /api/clients/{id}/purge for permanent deletion

## Credentials
- Admin: username=admin, password=admin123

## P0 Issues (Critical)
- [ ] Client app lock state not enforced after kill (needs device testing)
- [ ] Status bar accessible on lock screen (needs device testing)

## P1 Issues
- [ ] Client app status auto-refresh consistency
- [ ] "Restricted settings unavailable" on modern Android
- [ ] Client app offline mode incorrect data
- [ ] Client app crashes post-registration

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
- Stripe integration for actual plan purchases
