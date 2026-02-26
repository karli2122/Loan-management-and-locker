# PayLock Pro - Product Requirements Document

## Original Problem Statement
Build a full web portal for loan management with admin capabilities, internationalization, mobile apps, analytics, and team management.

## Core Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend Portal**: Vanilla JS SPA at `/api/portal` (served as static from `backend/static/portal/`)
- **Mobile Apps**: React Native/Expo (admin + client apps) in `/app/frontend/`
- **Database**: MongoDB
- **Website**: Served at `/api/website`, downloadable at `/api/download/website`

## Completed Features
- Admin authentication (login/logout, password change)
- Client management (CRUD, search, filtering)
- Loan management (create, update, payments)
- Device management (lock/unlock, heartbeat monitoring)
- Payment recording and tracking
- Bulk CSV import for clients
- Admin team management with roles/permissions
- Document storage with file uploads
- NFC/QR provisioning (enhanced UI with server URL field, download button)
- Telegram bot notifications
- Google Drive backup integration
- Stripe payment integration
- Resend email integration
- Analytics charts (revenue, profit, collection rates, loan distribution) with translated labels
- Advanced public-facing website with About Us & Contact Us pages
- Full portal internationalization (16 languages)
- Export reports to PDF/CSV with dropdown menus
- Scheduled report emails (daily/weekly/monthly, configurable via Settings)
- Contact form with email delivery to paylockpro@gmail.com
- Payment scheduling backend with auto-processing background task
- Enhanced Activity Log with stats, action icons, CSV export
- Website zip download available at /api/download/website
- Plans & pricing (3 tiers: Starter, Professional, Enterprise)
- Keepalive URL fixed to current domain

## Recent Changes (Feb 26, 2026)
1. **i18n Completion** - Fixed all remaining hardcoded strings across portal
2. **Export Reports PDF/CSV** - New backend endpoints + dropdown UI on Reports page
3. **Enhanced NFC Provisioning UI** - 3-column layout, server URL field, QR download
4. **Enhanced Activity Log** - Summary stat cards, action type icons, CSV export
5. **Payment Scheduling Backend** - Auto-processing background task for due payments
6. **Scheduled Report Emails** - Full CRUD API + UI in Settings page with Send Now
7. **Contact Form** - POST /api/contact sends to paylockpro@gmail.com via Resend
8. **Website Redesign** - Home page (features + pricing), About Us, Contact Us
9. **Mobile App API URLs** - Updated FALLBACK_BACKEND and eas.json to current domain
10. **Business Management Cards** - Removed "user can/cannot remove" text
11. **Bank Analyzer** - Added "Supported formats: PDF, ASICE" text
12. **Dashboard** - Removed credit counter and sidebar avatar icon
13. **Website ZIP** - Generated at /api/download/website

## Pending / Blocked
### P0 (Blocked)
- **APK Build** - Requires EXPO_TOKEN for EAS authentication. User needs to provide Expo login credentials or token.

### P2
- **WhatsApp Business API Integration** - Deferred by user

### Refactoring
- Break monolithic `index.html` (1500+ lines) into modules

## Key API Endpoints
- `/api/portal` - Admin portal SPA
- `/api/website` - Public website
- `/api/download/website` - Website ZIP download
- `/api/reports/export/csv` & `/api/reports/export/pdf` - Report exports
- `/api/report-schedules` - Schedule CRUD
- `/api/report-schedules/send-now` - Immediate report email
- `/api/contact` - Contact form submission
- `/api/schedules` - Payment schedules

## Credentials
- Admin: `admin` / `admin123`
- Telegram Bot Token: in `backend/.env`
- Resend API Key: in `backend/.env`
