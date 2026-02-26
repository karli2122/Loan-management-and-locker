# PayLock Pro - Product Requirements Document

## Problem Statement
PayLock Pro is a comprehensive loan management platform with device-locking capabilities for loan enforcement. The system consists of:
- **FastAPI Backend** (port 8001) - MongoDB-based REST API
- **Admin Expo App** - Mobile app for loan officers
- **Client Expo App** - Mobile app installed on borrower devices (with kiosk/lock capabilities)
- **Web Admin Portal** - Web-based admin dashboard (served at `/api/portal`)
- **Static Website** - Business marketing website

## Core Features
1. **Client Management**: Full CRUD for loan clients with personal info, loan details, payment tracking
2. **Device Locking**: Remote device lock/unlock via Android Device Owner mode (kiosk mode)
3. **Payment Tracking**: Record payments, track outstanding balances, late fees
4. **Reminders**: Email (Resend), push notifications, WhatsApp deep links
5. **Reports**: Collection, financial, client analytics
6. **Bank Statement Analyzer**: PDF, CSV, XML, ASiC-E format support
7. **PDF Contracts**: Auto-generated loan contracts with PayLock Pro branding
8. **Provisioning**: QR code and NFC tag provisioning for Device Owner setup
9. **Google Drive Backup**: Automated backup via Emergent Google Auth
10. **SaaS Feature Entitlement**: Plan-based feature access control
11. **Web Admin Portal**: Full-featured admin dashboard for browser-based management

## Architecture
```
/app
├── backend/
│   ├── server.py              # Main FastAPI server
│   ├── routes/
│   │   ├── admin.py           # Admin auth, settings
│   │   ├── clients.py         # Client CRUD
│   │   ├── loans.py           # Loan plans, payments
│   │   ├── contracts.py       # PDF generation
│   │   ├── reminders.py       # Email/push/WhatsApp reminders
│   │   ├── reports.py         # Analytics and reports
│   │   ├── bank_statements.py # Statement analysis
│   │   ├── provisioning.py    # QR + NFC provisioning
│   │   ├── backup.py          # Google Drive backup
│   │   ├── plans.py           # Feature entitlements
│   │   └── support.py         # Support chat + feature suggestions
│   ├── static/portal/         # Web admin portal SPA
│   └── assets/                # Logo, fonts
├── frontend/                  # Expo React Native apps
│   ├── app/admin/             # Admin mobile app
│   ├── app/client/            # Client mobile app (with lock screen)
│   └── modules/emi-device-admin/  # Native Android module (Kotlin)
└── paylockpro-website/        # Static marketing website
```

## Credentials
- **Admin Login**: username=admin, password=admin123
- **Resend API Key**: In backend/.env
- **Web Portal URL**: /api/portal

## What's Been Implemented (as of Feb 26, 2026)

### Session 3 (Current)
- [x] Fixed email/push reminder amount bug (uses outstanding_balance, not monthly_emi)
- [x] Fixed push notification amounts across all endpoints
- [x] Built web admin portal at /api/portal (Dashboard, Clients, Loans, Reminders, Reports, Devices, Provisioning, Settings)
- [x] Added NFC provisioning endpoint (/api/provisioning/nfc-payload)
- [x] Added feature suggestions endpoint (/api/feature-suggestions)
- [x] Added provisioning page (QR + NFC) to web portal
- [x] Updated website with Admin Login link
- [x] Fixed reminders/pending datetime comparison bug
- [x] Prepared Android native code fixes for lock screen bypass (onTaskRemoved, onDestroy restart)
- [x] Prepared fix for fresh registration lock enforcement (starts kiosk + monitor + auto-restart)
- [x] Verified CSV/XML bank statement support (already working)
- [x] Verified report calculations (correct)
- [x] Verified PDF logo integration (already present)

### Session 2
- Device Owner Mode (9-digit codes, QR provisioning, custom launcher)
- Google Drive Backup
- Plan-based feature entitlements
- Resend email integration
- WhatsApp deep-link messaging
- Dependency resolution for Expo
- Static website creation

### Session 1
- Core backend API (clients, loans, payments, reminders)
- Admin and Client mobile apps
- Device lock/unlock functionality
- PDF contract generation
- Bank statement analyzer
- Stripe payment integration

## Remaining Backlog

### P0 (Critical - Requires APK Build + Physical Device)
- Lock screen bypass when app killed from recents (code prepared, needs APK build)
- Status bar visibility on lock screen (code already comprehensive, needs device test)

### P1
- Automated payment scheduling
- Multi-language SMS/email templates
- Client self-service web portal

### P2
- Credit scoring integration
- Payment receipt generation
- Bulk client import (CSV/Excel)
- Admin team management (sub-admin accounts)
- Advanced analytics with charts
- Client photo verification
- Telegram bot for reminders
- Document storage for IDs/contracts
- WhatsApp Business API (beyond deep links)
