# PayLock Pro - Product Requirements Document

## Original Problem Statement
A full-stack loan management application called "PayLock Pro" with a web portal, mobile client and admin apps, analytics, background services, and EMI device protection features.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas (persistent)
- **Frontend/Portal**: Vanilla JS web portal (modular: HTML shell + CSS + JS)
- **Mobile Apps**: React Native / Expo (Client + Admin)
- **Background Tasks**: APScheduler + expo-task-manager

## Core Requirements
1. Admin portal for managing clients, loans, payments
2. Client mobile app with device lock/unlock, EMI protection
3. Admin mobile app for on-the-go management
4. Background location tracking (every 5 min)
5. Background push notifications (even when app killed)
6. Secure status bar on lock screen
7. Day-count interest calculation
8. Credit score system (starts at 0)
9. Currency-aware forms and contracts
10. Payment scheduling with auto-lock and late fees

## What's Been Implemented

### Session 1-N (Previous sessions)
- Full CRUD for clients, loans, payments
- Device registration, lock/unlock, warnings
- PDF contract generation
- Analytics dashboard with Chart.js
- Stripe integration
- Google Drive backup
- Resend email integration
- Telegram bot
- QR/NFC provisioning
- Multi-language support (ET, EN, RU)
- Database migration to MongoDB Atlas
- Day-count interest calculation
- Credit score system (0-based)
- Currency-aware forms
- Pagination in User Management
- Language selector update (EN with EU flag)
- Website creation with About/Contact pages
- Mobile app dependency fixes

### Session N+1 (Feb 26, 2026) - Current
- **Background Location Tracking**: expo-task-manager + expo-location service for 5-min background updates
- **Background Notification Service**: expo-notifications with Android channels (warnings, default, payments)
- **Enhanced Lock/Unlock System**:
  - Granular lock reasons (manual, overdue_payment, policy_violation, suspicious_activity, auto_lock)
  - Temporary locks with auto-unlock (1-720 hours)
  - Full audit trail (lock_audit_log collection)
  - Lock history API endpoint
  - Lock History button in portal UI
- **Full Payment Scheduling Logic**:
  - Auto-lock after grace period exceeded
  - Late fee calculation (2% default, weekly cap)
  - Overdue tracking for all clients
  - Temporary lock auto-unlock processing
  - Admin notifications for auto-lock events
- **Portal Refactoring**: Monolithic 1645-line HTML split into:
  - `index.html` (16 lines - shell)
  - `portal.css` (146 lines - styles)
  - `portal-app.js` (~1500 lines - modular JS)
- **API URL Cleanup**: Fixed stale KEEPALIVE_URL and FALLBACK_BACKEND URLs
- **Location History API**: New endpoint with days/limit filtering
- **Website ZIP Regenerated**: Updated download available

## Key API Endpoints
- `POST /api/clients/{id}/lock` - Lock with reason, message, temporary options
- `POST /api/clients/{id}/unlock` - Unlock with audit trail
- `GET /api/clients/{id}/lock-history` - Lock/unlock audit trail
- `POST /api/device/location` - Location update with source field
- `GET /api/device/location-history/{id}` - Location history
- `GET /api/portal` - Admin portal
- `GET /api/download/website` - Website zip download

## Prioritized Backlog

### P0 (Next)
- Build new Admin and Client APKs via EAS
- Final end-to-end verification of all API endpoints

### P1
- Resolve remaining Expo dependency warnings (eslint-config-expo, @types/react)
- WhatsApp Business API Integration

### P2
- Full payment processing automation (actual money movement)
- Further portal JS modularization (split into domain-specific files)
