# PayLock Pro - Product Requirements Document

## Original Problem Statement
Build a full web portal for loan management with admin capabilities, internationalization, mobile apps, analytics, and team management.

## Core Architecture
- **Backend**: FastAPI (Python) on port 8001
- **Frontend Portal**: Vanilla JS SPA at `/api/portal`
- **Mobile Apps**: React Native/Expo (admin + client) in `/app/frontend/`
- **Database**: MongoDB (local - migration to Atlas pending)
- **Website**: Served at `/api/website`, downloadable at `/api/download/website`

## All Completed Features
- Admin authentication, client CRUD, loan management, device lock/unlock
- Payment recording, bulk CSV import, team management with roles
- Document storage, NFC/QR provisioning (enhanced UI)
- Telegram bot, Google Drive backup, Stripe, Resend email
- Analytics charts (revenue, profit, collection, distribution)
- Full i18n (16 languages), Export PDF/CSV, Scheduled email reports
- Contact form (paylockpro@gmail.com), About Us & Contact Us pages
- Website with features/pricing (3 tiers), Admin Portal link
- Day-count interest calculation, Credit score from 0
- Currency-aware loan contracts, Team pagination (5/page)
- Activity log with stats/icons/export, Background payment scheduler

## Recent Changes (Feb 26, 2026 - Session 2)
1. App icon updated to PayLock logo
2. Bank analyzer text: "Upload bank statement: PDF, CSV, XML or ASICE files"
3. Business management: removed "can/cannot remove" text, added padding
4. Language selector: "English EN" with EU flag
5. Interest: day-count method (principal * rate/100 * days/30)
6. Credit score: starts at 0, new tiers (+5/+10/-5/-7/-10/-15)
7. Currency-aware contracts (NOK, EUR, etc.)
8. Team page: 5 users per page with pagination
9. Website: Admin Portal link fixed, API addresses verified
10. APK builds submitted, website zip updated

## Pending
- **MongoDB Atlas migration** - Need to set up persistent database
- **Lock/unlock improvements** - Suggestions provided (see below)

## Lock/Unlock Improvement Suggestions
1. **Scheduled auto-lock**: Auto-lock devices at X days overdue (configurable per client)
2. **Gradual restriction**: Warning lock (limited apps) before full kiosk lock
3. **Grace period lock**: Lock after grace period with notification countdown
4. **Lock history audit**: Track lock/unlock events with timestamps and reasons
5. **Emergency override**: Master unlock code for field agents when server is unreachable
6. **Geofencing**: Optional location-based lock/unlock rules
7. **Custom lock screen**: Branded lock screen with payment instructions and QR code

## Credentials
- Admin: `admin` / `admin123`
- Expo Token: in frontend/.env
