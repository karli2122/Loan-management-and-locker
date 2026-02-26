# PayLock Pro - Product Requirements Document

## Original Problem Statement
A full-stack loan management application called "PayLock Pro" with a web portal, mobile client and admin apps, analytics, background services, and EMI device protection features.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas (persistent)
- **Frontend/Portal**: Vanilla JS web portal (modular: HTML shell + CSS + JS)
- **Mobile Apps**: React Native / Expo (Client + Admin)
- **Background Tasks**: APScheduler + expo-task-manager

## What's Been Implemented

### All Sessions Combined
- Full CRUD for clients, loans, payments
- Device registration, lock/unlock (enhanced with granular reasons, temporary locks, audit trail), warnings
- PDF contract generation (currency-aware)
- Analytics dashboard with Chart.js
- Stripe, Google Drive, Resend, Telegram integrations
- QR/NFC provisioning
- Multi-language support (ET, EN, RU)
- Database on MongoDB Atlas (persistent)
- Day-count interest calculation
- Credit score system (0-based with payment timeliness rules)
- Currency-aware forms and contracts
- User Management pagination (5/page)
- Language selector: EN with EU flag
- Public website with About/Contact pages
- Background location tracking (expo-task-manager, 5-min intervals)
- Background notification service (expo-notifications with Android channels)
- Secure status bar on lock screen (immersive mode + DPM)
- Full payment scheduling logic (auto-lock, late fees, overdue tracking, temporary lock auto-unlock)
- Portal refactored into modular CSS/JS files
- API URL audit and cleanup across all files
- Expo dependency warnings resolved (17/17 checks pass)

### Latest Session (Feb 26, 2026)
- Built and delivered both APKs via EAS
- End-to-end API address verification completed
- Fixed 6 stale URLs in eas.json and app.config.js

## Deliverables
- **Client APK**: https://expo.dev/artifacts/eas/4vwYhjpXPjijpForAChRCB.apk
- **Admin APK**: https://expo.dev/artifacts/eas/eupVWuUJXC3pt7rQ8qZRqK.apk
- **Website ZIP**: https://client-app-staging-1.preview.emergentagent.com/api/download/website
- **Admin Portal**: https://client-app-staging-1.preview.emergentagent.com/api/portal

## Key API Endpoints
- `POST /api/clients/{id}/lock` - Lock with reason, message, temporary options
- `POST /api/clients/{id}/unlock` - Unlock with audit trail
- `GET /api/clients/{id}/lock-history` - Lock/unlock audit trail
- `POST /api/device/location` - Location update with source field
- `GET /api/device/location-history/{id}` - Location history
- `GET /api/portal` - Admin portal (modular)
- `GET /api/download/website` - Website zip download

## Prioritized Backlog

### P1
- WhatsApp Business API Integration

### P2
- Full payment processing automation (actual money movement)
- Further portal JS modularization (split into domain-specific files)
- Location heatmap visualization in admin portal
