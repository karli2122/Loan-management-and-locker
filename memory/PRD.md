# PayLock Pro - Product Requirements Document

## Original Problem Statement
Build a full web portal for loan management with admin capabilities, internationalization, mobile apps, analytics, and team management.

## Core Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend Portal**: Vanilla JS SPA at `/api/portal` (served as static from `backend/static/portal/`)
- **Mobile Apps**: React Native/Expo (admin + client apps) in `/app/frontend/`
- **Database**: MongoDB
- **Website**: Static site at `/app/website/`

## Completed Features
- Admin authentication (login/logout)
- Client management (CRUD, search, filtering)
- Loan management (create, update, payments)
- Device management (lock/unlock, heartbeat monitoring)
- Payment recording and tracking
- Bulk CSV import for clients
- Admin team management with roles/permissions
- Document storage with file uploads
- Payment scheduling (frontend UI)
- Telegram bot notifications
- Google Drive backup integration
- Stripe payment integration
- Resend email integration
- Analytics charts (revenue, profit, collection rates, loan distribution)
- Advanced public-facing website redesign
- NFC/QR provisioning

## Recently Completed (Feb 26, 2026)
1. **i18n Complete Portal Translation** - All 16 languages, all pages fully translated
2. **Export Reports to PDF/CSV** - Backend endpoints + frontend dropdown menus on Reports page
3. **Enhanced NFC Provisioning UI** - 3-column layout with server URL field, QR download button
4. **Enhanced Activity Log** - Summary stats cards, action type icons, CSV export, translated filters
5. **Translated Chart Labels** - All chart dataset labels use translation keys

## Pending / Backlog
### P0 (Blocked)
- **APK Build Fix** - `yarn.lock` mismatch causing EAS build failures (recurring issue)

### P1
- **Mobile App API URL Update** - Verify/update hardcoded API URLs in mobile app source

### P2
- **Payment Scheduling Backend** - Implement actual recurring payment logic with scheduler
- **WhatsApp Business API Integration** - Deferred by user

### Refactoring
- Break monolithic `index.html` (1500+ lines) into modules

## Credentials
- Admin: `admin` / `admin123`
- Telegram Bot Token: in `backend/.env`

## Key Files
- `backend/static/portal/index.html` - Main portal SPA
- `backend/static/portal/translations.js` - i18n dictionaries (16 languages)
- `backend/routes/exports.py` - PDF/CSV export endpoints
- `backend/server.py` - FastAPI app with all route registrations
- `backend/routes/reports.py` - Financial/client/collection report APIs
