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

### Stripe Subscription Plans - COMPLETED (Feb 25, 2026)
- **Starter**: €29/month, 50 clients, basic features
- **Business**: €79/month, 200 clients, auto-lock, reminders, reports (Most Popular)
- **Enterprise**: €199/month, 1000 clients, all features
- **Custom**: Contact sales, unlimited
- **Add-ons**: €0.50/extra device/month, €0.03/SMS
- Stripe Checkout integration via emergentintegrations
- Payment status polling and webhook handling
- Admin subscription stored in DB
- Endpoints: POST /api/payments/subscribe, GET /api/payments/status/{id}, GET /api/payments/current-plan

### PayLock Pro Branding - COMPLETED
- Logo, colors (Royal blue #2563EB), PDF reports header/footer

### Internationalization - COMPLETED
- 16 languages, 8 currencies, 650+ translation keys

### Soft-Delete Client - COMPLETED
- Soft-delete with uninstall signal for client devices

## Credentials
- Admin: username=admin, password=admin123

## Upcoming Tasks
- Custom Launcher for kiosk mode
- Add "address" field to client info
- Diagnostic Report PDF export

## Future/Backlog
- iOS version, SMS/Email reminders, Bulk Import, Credit Score PDF
