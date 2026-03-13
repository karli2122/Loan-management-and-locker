# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## Completed Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL

### Web Portal
- Dashboard with live stats and charts
- Client management, Device registration key generator, Add Loan, Send Warning
- Loan plans/payment schedules CRUD
- Bank statement analyzer with AI vision OCR
- AI client risk scoring, Bulk messaging, Report exports
- App Version Management (superadmin)

### Mobile Apps
- App Version Check with semantic version comparison
- Admin: Offline mode, dashboard charts, push notifications
- Client: In-app messaging, multi-language lock screen, device lock

### Auth & Security
- Plan-based portal access gating, superadmin bypass

## Recent Changes (2026-03-13)

### Device Count Fix (P0) - FIXED & DEPLOYED
- `/api/stats` endpoint now supports `admin_token` for enterprise-scoped queries
- Frontend device-management.tsx shows `total_clients` as "Total Devices" instead of `registered_devices`
- Verified: returns correct count of 4

### Tamper Detection Fix (P0) - FIXED, BUILD SUBMITTED
- Root cause: `accessibility || accessibilityCached` in AppState handler prevented tamper detection (once cached true, always true)
- Fix: Uses real permission values for tamper comparison, saves both true/false to cache
- Two-step flow: 1) Warn first (React Native Alert + Android notification), 2) If user ignores and permission still off on next app focus → report tamper + force lock
- Conditional on `uninstall_allowed` setting: `true` = no warnings, `false` = full tamper flow

### Chat Date Grouping (P1) - IMPLEMENTED, BUILD SUBMITTED
- Both admin and client chat windows group messages by date with visual separators

### Warning Auto-Dismiss (P2) - IMPLEMENTED, BUILD SUBMITTED
- Client in-app warning messages auto-dismiss after 10 seconds

### Admin Chat UI Tweaks (P2) - IMPLEMENTED, BUILD SUBMITTED
- Chat FAB moved up ~1cm (bottom: 60 instead of 24)
- Chat window has padding (contentContainerStyle padding: 10)

### Previous Session Fixes (Verified Working)
- Push notifications with FCM - WORKING
- App versioning (semantic version check) - WORKING
- Profit analytics (includes archived loans) - DEPLOYED

## Current Builds
- Admin v6: https://expo.dev/accounts/karli1987/projects/loans/builds/3174f95b-4a78-455d-ab20-6ac17ae82509
- Client v8: https://expo.dev/accounts/karli1987/projects/client/builds/c4352851-2e6c-4e9b-b8e7-2989504f2076

## Pending User Verification
- Tamper detection two-step flow (Client v8)
- Device count showing 4 (Admin v6)
- Chat date grouping (both apps)
- Warning auto-dismiss (Client v8)

## Future/Backlog Tasks
- (P1) WhatsApp Business API Integration

## Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro

## Key Files
- `backend/routes/reports.py` - Stats endpoint with enterprise scoping
- `frontend/app/client/home.tsx` - Tamper detection, permission checks, warning auto-dismiss
- `frontend/app/admin/client-details.tsx` - Chat UI with date grouping
- `frontend/app/admin/device-management.tsx` - Device count display
- `frontend/src/context/LanguageContext.tsx` - Translation strings
