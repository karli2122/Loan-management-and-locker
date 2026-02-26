# PayLock Pro - Product Requirements Document

## Problem Statement
PayLock Pro is a comprehensive loan management platform with device-locking capabilities for loan enforcement. The system consists of:
- **FastAPI Backend** (port 8001) - MongoDB-based REST API
- **Admin Expo App** - Mobile app for loan officers
- **Client Expo App** - Mobile app installed on borrower devices (with kiosk/lock capabilities)
- **Web Admin Portal** - Web-based admin dashboard (served at `/api/portal`)
- **Static Website** - Business marketing website

## Core Features
1. Client Management, Device Locking, Payment Tracking
2. Reminders (Email via Resend, Push, WhatsApp deep links)
3. Reports & Analytics (Collection, Financial, Client)
4. Bank Statement Analyzer (PDF, CSV, XML, ASiC-E)
5. PDF Contracts with multi-language support (Estonian/English) and Section 6 device security clause
6. Provisioning (QR code + NFC tag) for Device Owner setup
7. Google Drive Backup, SaaS Feature Entitlement
8. Web Admin Portal with full feature parity

## Architecture
```
/app/backend/
  server.py, routes/{admin,clients,loans,contracts,reminders,reports,bank_statements,provisioning,backup,plans,support}.py
  static/portal/index.html (Web Admin SPA)
  assets/ (logo, fonts)
/app/frontend/ (Expo React Native)
  app/admin/, app/client/, modules/emi-device-admin/
/app/paylockpro-website/index.html
```

## What's Been Implemented

### Session 3 (Feb 26, 2026)
- [x] Fixed email/push reminder amount bug (outstanding_balance instead of monthly_emi)
- [x] Built web admin portal at /api/portal
- [x] NFC provisioning endpoint
- [x] Feature suggestions endpoint (14 ideas)
- [x] Android lock screen bypass fix (onTaskRemoved, onDestroy restart)
- [x] Website updated with Admin Login link
- [x] **Contract Section 6**: Added device security measures clause (6.1-6.7) about app installation, device locking, permissions
- [x] **Multi-language contracts**: ET (Estonian) and EN (English) with `?language=` param
- [x] Contract sections renumbered: 9 total sections (was 8)
- [x] Web portal: language selector for contract downloads (ET/EN buttons)

### Session 2
- Device Owner Mode, Google Drive Backup, Plan-based entitlements
- Resend email, WhatsApp deep links, Dependency resolution, Website

### Session 1
- Core backend API, Admin/Client apps, Device lock/unlock, PDF contracts
- Bank statement analyzer, Stripe payments

## Credentials
- Admin: username=admin, password=admin123
- Web Portal: /api/portal

## Remaining Backlog
### P0 (Requires APK Build)
- Lock screen bypass fix (code ready, needs build + device test)
- Status bar visibility fix (needs device test)

### P1-P2
- Automated payment scheduling, Multi-language templates
- Client self-service portal, Credit scoring, Payment receipts
- Bulk CSV import, Admin team management, Charts, Telegram bot
- Document storage, WhatsApp Business API
