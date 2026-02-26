# PayLock Pro - Product Requirements Document

## Original Problem Statement
Build a full web portal for loan management with admin capabilities, internationalization, mobile apps, analytics, and team management.

## Core Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend Portal**: Vanilla JS SPA at `/api/portal`
- **Mobile Apps**: React Native/Expo SDK 54 (admin + client) in `/app/frontend/`
- **Database**: MongoDB (local - migration to Atlas pending)
- **Website**: Served at `/api/website`, downloadable at `/api/download/website`

## All Completed Features
- Admin auth, client CRUD, loan management, device lock/unlock
- Payment recording, bulk CSV import, team management with roles
- Document storage, NFC/QR provisioning, Telegram bot
- Google Drive backup, Stripe, Resend email
- Analytics charts, full i18n (16 languages), Export PDF/CSV
- Scheduled email reports, Contact form, About Us & Contact Us pages
- Day-count interest calculation, Credit score from 0
- Currency-aware loan contracts, Team pagination (5/page)
- Activity log with stats/icons/export, Background payment scheduler
- All SDK 54 packages aligned (expo doctor: 17/17 passed)

## Recent Changes (Feb 26, 2026 - Session 3)
1. Fixed all Expo SDK 54 package version mismatches (33 → 0)
2. Removed stale package resolutions from package.json
3. Added required Expo config plugins
4. Updated app.config.js backend URL
5. Rebuilt both APKs with clean dependencies

## Credentials
- Admin: `admin` / `admin123`
- Expo Token: in frontend/.env
