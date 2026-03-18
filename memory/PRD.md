# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with React Native Admin/Client apps and a FastAPI backend + MongoDB.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, VPS (37.148.202.159, service: paylock)
- **Admin App**: React Native (Expo)
- **Client App**: React Native (Expo)
- **Web Portal**: Vanilla JS at /api/portal

## What's Been Implemented

### Loan Management
- Month-based interest, CRUD, PDF contracts, auto-archival on full payment
- Data centralized in `loans` collection

### Stripe Connect
- Destination charges, configurable platform fee (0.75% default)
- Onboarding in admin app settings AND web portal settings
- Superadmin fee dashboard

### Admin App UI/UX (Latest: 2026-03-18)
- "Device Management" → "Client Management" (files, routes, translations, icons)
- "Client Overview" section title, "Registered" card → "Loans Active" showing actual active loan count
- Dashboard Active Loans widget now queries `loans` collection (not clients)
- Dashboard heartbeat click → `/admin/clients?filter=silent`
- Clients page reads `filter` URL param, auto-selects silent filter
- Silent filter, green "0" due amount, hidden unlocked badge for unregistered devices
- Last Heartbeat indicator (color-coded) on client card + DeviceInfo
- Contract Share uses `expo-sharing` with `getContentUriAsync()` for Android
- Chat FAB gated to enterprise/custom plans
- Plan Badge removed from dashboard
- Translation keys: clientManagement, clientOverview, loansActive, filterSilent

### Web Portal (Latest: 2026-03-18)
- Document search by client fixed (queries both `documents` + `document_vault`)
- Email button → "Send" with envelope icon
- Generate code buttons plan-gated (enterprise/custom: Admin + Owner codes)
- Loan payment selector shows remaining balance (total_due - total_paid)
- Stripe Connect setup in Settings

### Background Tasks
- Silent device push notifications (hourly, rate-limited per admin)
- Subscription auto-renewal check (every 6h, 7-day grace, auto-downgrade)

### Version Management
- Auto-increment via `bump-version.js` (local only, not on EAS server)
- Current: Admin v1.4.1 (42), Client v1.4.2 (43)

## Credentials
- **VPS**: karliv @ 37.148.202.159 / Nasvakas123!
- **Super Admin**: karli1987 / nasvakas123

## Backlog
- P1: Verify background heartbeat on real device
- P2: Test subscription auto-renewal with expired accounts
