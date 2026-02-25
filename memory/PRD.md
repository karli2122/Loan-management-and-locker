# PayLock Pro - Loan Management App

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React Native (Expo) - Admin + Client apps
- **Email**: Resend (noreply@paylockpro.com)
- **WhatsApp**: Deep link (wa.me) + Cloud API ready
- **Payments**: Stripe

## Subscription Plans
| Feature | Starter €29 | Business €79 | Enterprise €199 | Custom |
|---|---|---|---|---|
| Max Clients | 20 | 200 | 1000 | Unlimited |
| Lock/Unlock | No | Yes | Yes | Yes |
| Reminders | No | Yes | Yes | Yes |
| Reports | No | Yes | Yes | Yes |
| Business Mgmt | No | Yes | Yes | Yes |
| Device Owner | No | No | Yes | Yes |

## Implemented Features
- Device Owner Mode (8/9-digit codes, custom launcher, kiosk)
- Business Management (separate page, plan-restricted)
- Plan Enforcement (backend /api/plans/limits)
- Email Reminders (Resend, verified domain)
- WhatsApp Reminders (deep link + Cloud API ready)
- Bank Statement Analyzer (PDF, CSV, XML, ASICE)
- Google Drive Backup (CRUD)
- QR/NFC Provisioning
- Stripe Subscriptions
- 16 Languages, 8 Currencies
- Business Website (paylockpro.com ready)

## Credentials
- Admin: admin / admin123
- Contact: paylockpro@gmail.com

## Latest APK Builds (Feb 25, 2026)
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/00714247-3d78-4f64-bb14-ef1a6d3db872
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/0d887c37-e695-4f09-902b-525e760c526f

## Environment Variables
- RESEND_API_KEY (configured)
- SENDER_EMAIL=noreply@paylockpro.com
- WHATSAPP_TOKEN (optional, for Cloud API)
- WHATSAPP_PHONE_ID (optional, for Cloud API)

## Upcoming
- Verify paylockpro.com domain in Resend for email delivery
- Upload website ZIP to GoDaddy
- Test APKs on real devices
- Add address field to client info
- Reports calculation audit
