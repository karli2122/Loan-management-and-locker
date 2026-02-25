# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with client-facing Android app (kiosk/lock mode) and admin-facing app for management. Requires multi-language support, currency selection, device locking, and comprehensive loan management.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React Native (Expo) on port 3000
- **Database**: MongoDB (DB: test_database)
- **Build System**: EAS Build for Android APKs
- **Native Module**: emi-device-admin (Kotlin) for Device Admin kiosk mode

## What's Been Implemented

### Previous Sessions
- Full loan management system (CRUD clients, loans, payments)
- Admin app with dashboard, client details, reports, calculator
- Client app with registration, home screen, kiosk lock mode
- Device Admin native module (Kotlin) for Android lock screen
- Credit score display, Used phone price scraper (Swappa)
- Maximum security features: Foreground Monitor, Notification Blocker, Auto-Restart, Camera/Bluetooth disable
- Multi-language support (16 languages) via LanguageContext

### Session 20 (Feb 24, 2026) - Language & Currency Selectors
- **CurrencyContext**: 8 currencies (EUR, NOK, SEK, DKK, PLN, CHF, GBP, USD) with conversion rates, formatAmount(), AsyncStorage persistence
- **LanguagePicker + CurrencyPicker**: Reusable modal dropdown components with flag emojis
- **All screens updated**: Replaced ET/EN toggles with LanguagePicker dropdowns, all hardcoded € replaced with formatAmount() across 20+ files
- Zero hardcoded € remaining in codebase

### Session 20 (Feb 25, 2026) - Permissions + Auto-Fetch
- **Guided Permission Setup**: Added Usage Stats Access and Notification Listener permission cards with device-specific instructions, Samsung "Restricted settings" handling
- **Auto-Fetch Fix**: Removed freshRegistration polling guard, reduced interval to 5s
- **Backend Fixes**: Admin seeding with is_super_admin, client reassignment, KEEPALIVE_URL fix

## Current Environment
- Backend URL: https://localization-hub-10.preview.emergentagent.com
- Admin login: username=admin, password=admin123
- DB_NAME: test_database

## Prioritized Backlog

### P0
- Verify new permission prompts work on device (Usage Stats, Notification Listener)
- Verify auto-fetch updates lock/warning status without manual refresh

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
