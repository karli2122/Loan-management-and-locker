# PayLock Pro - Loan Management App

## Original Problem Statement
Build a loan management application with:
- A client-facing Android app with device-locking (kiosk) mode
- An admin-facing app for managing clients, loans, payments and device controls
- Brand name: **PayLock Pro**

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React Native (Expo) - Admin app + Client app
- **Native Modules**: Kotlin-based device admin for kiosk mode
- **Payments**: Stripe
- **Email**: Resend (requires RESEND_API_KEY)
- **Messaging**: Telegram Bot API (requires TELEGRAM_TOKEN)

## Subscription Plans
| Feature | Starter (€29) | Business (€79) | Enterprise (€199) | Custom |
|---|---|---|---|---|
| Max Clients | 20 | 200 | 1000 | Unlimited |
| Lock/Unlock | No | Yes | Yes | Yes |
| Auto-lock | No | Yes | Yes | Yes |
| Reminders | No | Yes | Yes | Yes |
| Reports | No | Yes | Yes | Yes |
| Bank Analyzer | No | Yes | Yes | Yes |
| Business Mgmt | No | Yes | Yes | Yes |
| Device Owner | No | No | Yes | Yes |
| Backup | No | Yes | Yes | Yes |

## What's Been Implemented (Current Session - Feb 25, 2026)

### Bank Statement Analyzer - CSV/XML Support
- Extended analyzer to accept .csv and .xml files alongside .pdf and .asice

### Business Management - Separate Page
- Moved from dropdown to dedicated `/admin/business-management` route
- Restricted to Business/Enterprise/Custom plans + superadmin via /api/plans/limits
- ADB, QR Code, and NFC activation methods with instructions

### Plan Enforcement System
- Backend: GET /api/plans/limits - Returns plan, limits, client count, can_add_client
- Backend: GET /api/plans/features - Returns all 4 plans with features
- Starter: 20 clients, basic only
- Business: 200 clients, lock/unlock, reminders, reports, backup
- Enterprise: 1000 clients, all features + Device Owner
- Credit system disabled, replaced with plan-based limits

### Contact Sales Email
- All "Contact Sales" buttons open native email app with paylockpro@gmail.com

### SMS/Email Reminders
- POST /api/reminders/send-email/{client_id} - Email via Resend
- POST /api/reminders/send-telegram/{client_id} - Telegram message
- POST /api/reminders/send-bulk-email - Bulk email to all clients with balance
- POST /api/reminders/send-bulk-telegram - Bulk Telegram to all clients
- GET /api/reminders/config - Check which services are configured

### NFC Provisioning
- Uses same provisioning payload as QR, generates NFC-compatible data
- Frontend button in Business Management page

### QR Code Provisioning
- GET /api/provisioning/qr-code - Generates Android Device Owner QR code
- Supports WiFi configuration in payload

### Business Website (paylockpro.com)
- Static HTML/CSS site at /app/paylockpro-website/
- Sections: Hero, Features, How It Works, Security, Pricing, CTA, Footer
- ZIP file at /app/paylockpro-website.zip ready for GitHub Pages / GoDaddy upload
- All contact links go to paylockpro@gmail.com

### Previous Session Features (Still Active)
- Device Owner Mode (8/9-digit codes, enhanced lock screen)
- Custom Launcher for kiosk mode
- Google Drive Backup (create, list, restore, delete)
- Stripe Subscription Plans
- PayLock Pro Branding
- 16 Languages, 8 Currencies
- Soft-Delete Client
- Bug fix: Client details crash with non-English/Estonian languages

## Credentials
- Admin: username=admin, password=admin123
- Contact email: paylockpro@gmail.com

## APK Builds (Feb 25, 2026 - Latest)
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/c6f39e77-c5a2-4cac-8f4d-cdbbd20f73da
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/d02a91fb-2af1-4060-8c19-0c6d370ffa59

## Environment Variables Needed
- RESEND_API_KEY - For email reminders (Resend)
- SENDER_EMAIL - Sender email (default: paylockpro@gmail.com)
- TELEGRAM_TOKEN - For Telegram bot reminders

## Key API Endpoints
- POST /api/plans/limits?admin_token=...
- GET /api/plans/features
- POST /api/reminders/send-email/{client_id}?admin_token=...
- POST /api/reminders/send-telegram/{client_id}?admin_token=...
- POST /api/reminders/send-bulk-email?admin_token=...
- GET /api/reminders/config?admin_token=...
- POST /api/backup/create?admin_token=...
- GET /api/provisioning/qr-code?admin_token=...

## Upcoming Tasks
- Add Resend API key for email reminders
- Create Telegram bot and add token for Telegram reminders  
- Add "address" field to client info
- Diagnostic Report PDF export for superadmins
- Audit reports calculation accuracy

## Future/Backlog
- iOS version
- Bulk Payment Import from CSV
- Client Credit Score Report PDF
