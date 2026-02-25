# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with client-facing Android app (kiosk/lock mode) and admin-facing app for management. Requires multi-language support (16 languages), currency selection (8 currencies), device locking, and comprehensive loan management.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React Native (Expo) on port 3000
- **Database**: MongoDB (DB: test_database)
- **Build System**: EAS Build for Android APKs
- **Native Module**: emi-device-admin (Kotlin) for Device Admin kiosk mode

## What's Been Implemented

### Core Features
- Full loan management system (CRUD clients, loans, payments)
- Admin app with dashboard, client details, reports, calculator
- Client app with registration, home screen, kiosk lock mode
- Device Admin native module (Kotlin) for Android lock screen
- Credit score display, Used phone price scraper (Swappa)
- Maximum security features: Foreground Monitor, Notification Blocker, Auto-Restart, Camera/Bluetooth disable

### Session 20 (Feb 24-25, 2026)
- **i18n Complete**: 16 languages via LanguagePicker dropdowns (replaced all ET/EN toggles)
- **Currency System**: 8 currencies (EUR, NOK, SEK, DKK, PLN, CHF, GBP, USD) with CurrencyPicker dropdown and formatAmount() conversion
- **Translation Migration**: 822 inline patterns → t() calls across 40 files, 489 new keys, 1080 total t() calls
- **Guided Permission Setup**: Usage Stats + Notification Listener permission cards with device-specific instructions
- **Auto-Fetch Fix**: Removed freshRegistration guard, 5s polling interval
- **Backend**: Admin seeding, client reassignment, KEEPALIVE_URL fix
- **Zero hardcoded €** in codebase

## Current Environment
- Backend URL: https://localization-hub-10.preview.emergentagent.com
- Admin login: username=admin, password=admin123
- DB_NAME: test_database

## Prioritized Backlog

### P0
- Add full translations for 14 non-English/Estonian languages (currently falls back to English)
- Verify permissions and auto-fetch on device

### P1
- Custom Launcher (Default Home App) for client app
- Add "address" field to client information form
- Offline mode data accuracy fix

### P2
- Diagnostic Report PDF export for superadmins
- Allow Uninstall for Deleted Client
- Credit Score PDF Report

### P3
- iOS client app (soft lock)
- Automated Payment Reminders (SMS/Email)
- Bulk Payment Import (CSV)
- AMAPI integration, FCM Push Notifications
