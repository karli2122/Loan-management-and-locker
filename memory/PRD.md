# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management ecosystem with device lockscreen enforcement for loan recovery. Includes FastAPI backend, React Native Admin/Client apps, and Vanilla JS web portal.

## Core Requirements
1. **Data Consistency**: All financial metrics use `loans` collection as single source of truth
2. **Device Management**: Android lockscreen that cannot be bypassed when device is locked
3. **Loan Management**: CRUD operations, contracts, month-based interest calculation
4. **Multi-platform**: Admin app, Client app, Web portal — feature parity

## What's Been Implemented

### Backend (Deployed to VPS: api.paylock.pro)
- Unified financial calculations via `_calc_interest_data` utility
- Loan CRUD: create, edit, delete, contract PDF generation
- Heartbeat thresholds: online < 12h, warning 12-24h, critical > 24h
- Payment reminders include late fees in outstanding amounts (when overdue)
- eBay.de price scraping fallback (Swappa returns 403)
- Stripe Connect, role elevation on plan upgrade
- Welcome email conditional logic
- Contact form rate limiting
- Bulk import (CSV/PDF) writes to `loans` collection

### Web Portal (Deployed)
- Client details: Total Due and Outstanding include late fees when overdue
- Active loans table shows late fees row when client is overdue
- Device management heartbeat: online < 12h, 12-24h warning, >24h critical
- Delete Loan / Share Contract buttons
- Month-based interest calculation in Add Loan form
- Loan history pagination (5 per page)

### Client App (v1.5.2 - Build submitted)
- **Full-screen native overlay lockscreen** (renders lock UI natively in Kotlin)
- Both EMIOverlayService and EMIForegroundMonitorService run as FOREGROUND services
- Cross-monitoring: overlay restarts monitor if dead, and vice versa
- Wake locks to prevent CPU sleep
- Auto-restart via EMIRestartReceiver on service kill
- Version check uses Modal (not Alert.alert) to escape overlay blocker
- Background heartbeat service with correct AsyncStorage key
- Samsung battery optimization fallback instructions
- Emergency call support (112)

### Admin App
- Dashboard with unified financial data
- User management with pagination
- Client details with loan history pagination
- Month-based interest calculation

## Architecture
- Backend: FastAPI + MongoDB Atlas
- Frontend: React Native (Expo SDK 54) + Vanilla JS portal
- Native Modules: Kotlin Android services for device lockscreen
- Deployment: VPS (37.148.202.159) + EAS Build for APKs

## Key DB Collections
- `loans`: Single source of truth for financial data
- `paid_loans`: Completed loan records
- `clients`: Client profiles, device status, lock state
- `admins`: Admin accounts with roles and plans

## Pending / Backlog
- P2: Subscription auto-renewal logic investigation
- P3: Superadmin UI for Stripe Connect platform fee configuration
