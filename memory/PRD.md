# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application "PayLock Pro" with tiered subscription model (Starter, Professional, Enterprise), React Native mobile apps (Admin + Client), FastAPI backend, static website, and web portal.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend**: React Native (Expo) with dual apps (Admin + Client)
- **Web Portal**: Server-rendered HTML/JS at `/api/portal`
- **Website**: Static HTML at `/opt/paylock/paylockpro-website/`
- **Build System**: EAS with auto-versioning (version.json)
- **Integrations**: Stripe (Live), Resend, Firebase/FCM, Emergent LLM Key (AI OCR), fpdf2

## What's Been Implemented

### Core Features (Complete)
- Three-tier subscription: Starter ($29), Professional ($79), Enterprise ($199)
- Full RBAC: Super Admin, Admin, Collections, Viewer roles
- Client management, loan creation, payment tracking
- Device lock/unlock (Standard + Device Owner modes)
- Push notifications (FCM), Payment reminders
- Document vault, Reports & analytics (PDF/CSV export)
- GPS tracking, In-app messaging (Telegram/WhatsApp)
- Stripe payments, Bank statement OCR, Credit scoring
- Revenue forecasting, Loan restructuring, Bulk import

### Security (Complete)
- 8-permission tamper detection: Alert + push notification on first detection
- Data wipe on confirmed tampering (wipeData native method added)
- Admin mode protection with same alert + wipe flow
- Screenshot blocking, reboot detection, offline enforcement

### User Management Scoping (v1.2.4)
- Admins see/manage ONLY users they created (`created_by` filter)
- Super admins see/manage all enterprise users
- Role definitions handle both naming conventions (admin/full_admin, superadmin/super_admin)
- Delete/update enforce created_by ownership

### Dashboard Data Scoping Fix (v1.2.4)
- Dashboard now shows ONLY the logged-in admin's own client data by default
- Super admins can pass `filter_admin_id=all` to see enterprise-wide data
- Fixed `reports.py` both client query and paid_loans query scoping

### PDF Manuals with Screenshots (v1.2.4)
- Admin App Manual: 30 pages, 19 real user-provided screenshots
- Client App Manual: 13 pages, detailed text instructions only
- Web Portal Manual: 12 pages, 9 real portal screenshots
- Download: `/api/download/manual/{admin|client|portal}`

## Current Version
- v1.2.4, Build #25
- Client APK: `21e386f1-f167-4333-affe-909c8484d36f`
- Admin APK: `7d8ec299-e7ad-496e-9e64-f5f55abf1177`

## Key Files Modified This Session
- `backend/routes/team.py` - User management scoping + role definitions
- `backend/routes/reports.py` - Dashboard data scoping fix
- `backend/scripts/generate_manuals.py` - Manual generation with real screenshots
- `backend/server.py` - FileResponse for manual downloads
- `frontend/modules/emi-device-admin/.../EMIDeviceAdminModule.kt` - wipeData native function
- `frontend/src/utils/DevicePolicy.ts` - wipeData TypeScript wrapper
- `frontend/app/client/home.tsx` - Tamper detection triggers wipeData

## Prioritized Backlog
- P0: Monitor and deliver APK builds, deploy backend to VPS
- P1: User verification on device (tamper detection + wipe)
- P2: Stabilization - no new features planned
