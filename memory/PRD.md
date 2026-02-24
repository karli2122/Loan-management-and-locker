# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Loan management application with client-facing Android app (kiosk/lock mode) and admin-facing app for management. Requires multi-language support, currency selection, device locking, and comprehensive loan management.

## Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend**: React Native (Expo) on port 3000
- **Database**: MongoDB
- **Build System**: EAS Build for Android APKs
- **Native Module**: emi-device-admin (Kotlin) for Device Admin kiosk mode

## What's Been Implemented

### Session 1-19 (Previous Sessions)
- Full loan management system (CRUD clients, loans, payments)
- Admin app with dashboard, client details, reports, calculator
- Client app with registration, home screen, kiosk lock mode
- Device Admin native module (Kotlin) for Android lock screen
- Credit score display
- Used phone price scraper (Swappa)
- Maximum security features: Foreground Monitor, Notification Blocker, Auto-Restart, Camera/Bluetooth disable
- Multi-language support (16 languages) via LanguageContext

### Session 20 (Feb 24, 2026) - Language & Currency Selectors
- **CurrencyContext**: Created with 8 currencies (EUR, NOK, SEK, DKK, PLN, CHF, GBP, USD) with conversion rates from EUR, `formatAmount()` function, AsyncStorage persistence
- **LanguagePicker component**: Reusable modal dropdown with flag emojis, 16 languages, compact mode
- **CurrencyPicker component**: Reusable modal dropdown with flags, currency codes, symbols, names
- **Admin Settings**: Replaced ET/EN toggle with LanguagePicker dropdown + added CurrencyPicker dropdown
- **Admin Dashboard (tabs/index)**: Replaced ET/EN toggle with LanguagePicker, all financial values use formatAmount
- **All admin pages updated**: dashboard, reports, client-details, clients, loans, transactions, add-loan, add-client, calculator, bank-analyzer, client-map, payment-reminders, loan-management
- **Client pages updated**: home.tsx, register.tsx, portal-dashboard, payment-history
- **PDF export**: Updated to use currencySymbol variable
- **Zero hardcoded €** symbols remaining in codebase

## Pending Verification
- Client app max security features build (d0be2f0b-f64b-4bcc-ae82-98b17154affa) - User needs to test on device
- Guided permission setup for Usage Stats / Notification Access

## Prioritized Backlog

### P0
- Guided permission setup screen in client app (for Usage Stats, Notification Access)

### P1
- Custom Launcher (Default Home App) for client app
- Add "address" field to client information form
- Offline mode data accuracy fix
- Client app crash post-registration fix

### P2
- Diagnostic Report PDF export for superadmins
- Allow Uninstall for Deleted Client
- Credit Score PDF Report

### P3
- iOS client app (soft lock)
- Automated Payment Reminders (SMS/Email)
- Bulk Payment Import (CSV)
- AMAPI integration
- FCM Push Notifications
