# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application called "PayLock Pro" for an Estonian IT company. Includes mobile apps (Admin + Client), web admin portal, and marketing website.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend (Mobile)**: Expo React Native (admin + client apps)
- **Web Portal**: Vanilla JS served from backend /api/portal
- **Website**: Static HTML/CSS/JS served from backend /api/website/*

## What's Been Implemented (as of Feb 27, 2026)
- Full client & loan CRUD with search, filter, pagination
- Device lock/unlock with audit trail, temporary locks, reasons
- Payment scheduling and automation (configurable via admin settings)
- **Stripe Payment Automation**: Real checkout sessions via emergentintegrations, payment links, auto-pay toggle, auto-charge setting, background scheduler generates and emails payment links
- **Stripe Payment Tracker**: Dashboard widget showing real-time status of all Stripe payments (pending/completed/failed) with client names, amounts, refresh buttons, auto-polling every 20s
- Background tasks: payment processing, late fees, auto-lock, report emails, auto-payment links
- Web portal: full admin dashboard with 14+ features + Stripe payment management UI
- Live Payment Feed widget with animated entries, method icons, polling every 15s
- Marketing website: 6 pages + ZIP download
- Mobile admin app: 20+ screens with Enterprise feature gating
- Mobile client app: payment view, notifications, location tracking
- Enterprise Feature Gating: All 6 enterprise screens gated
- Improved Lock Screen: Bigger elements, brighter colors, overlay-only protection (no refastening interval)
- Stripe subscriptions, Resend email, Telegram bot, Google Drive backup, QR provisioning, CSV import, Multi-language (EN/ET)

## Key API Endpoints
### Stripe Payment Tracker (NEW)
- GET /api/stripe/payment-tracker - Real-time payment status with summary stats
- POST /api/stripe/refresh-payment/{id} - Refresh individual payment status from Stripe

### Payment Automation
- POST /api/clients/{id}/create-payment-link - Create Stripe checkout session
- GET /api/clients/{id}/check-payment/{session_id} - Check payment status
- POST /api/clients/{id}/toggle-autopay - Toggle auto-pay per client
- GET /api/clients/{id}/payment-methods - Payment info and recent Stripe payments

### Admin & Settings
- POST /api/admin/login, GET/PUT /api/admin/settings (includes payment_auto_charge_enabled)
- GET /api/payments/current-plan, GET /api/admin/credits

### Website & Portal
- GET /api/website/*, GET /api/download/website, GET /api/portal

## Credentials
- Admin: username=admin, password=admin123
- URL: https://paylock-enterprise.preview.emergentagent.com

## Integrations
- MongoDB Atlas, Stripe (via emergentintegrations), Resend, Telegram Bot, Google Drive, Chart.js, EAS

## Backlog / Future
- P1: Portal JS modularization (portal-app.js -> domain-specific files)
- P2: WhatsApp Business API Integration
- P3: Location heatmap visualization
