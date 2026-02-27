# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application called "PayLock Pro" for an Estonian IT company. Includes mobile apps (Admin + Client), web admin portal, and marketing website.

## Core Requirements
1. **Client Management**: CRUD operations, KYC document storage, loan tracking
2. **Loan Management**: Plans, schedules, EMI calculations, late fees
3. **Device Management**: Lock/unlock devices, QR provisioning, audit trail
4. **Payment Automation**: Auto-reminders, auto-lock, auto-late-fees, auto-charge via Stripe checkout links (all configurable via settings)
5. **Stripe Payment Processing**: Real Stripe checkout sessions for client payments, auto-payment link generation, webhook handling
6. **Notifications**: Push, email (Resend), Telegram bot
7. **Team Management**: Enterprise plan feature with role-based access
8. **Reporting & Analytics**: Revenue, collections, overdue tracking, live payment feed
9. **Marketing Website**: Dark professional theme, multi-page (Home, Pricing, How It Works, Contact, Privacy, Terms)
10. **Mobile Apps**: Admin (manage everything) + Client (view payments, lock status)
11. **Enterprise Feature Gating**: All advanced admin app features gated behind Enterprise/Custom/Superadmin plans

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend (Mobile)**: Expo React Native (admin + client apps)
- **Web Portal**: Vanilla JS served from backend /api/portal
- **Website**: Static HTML/CSS/JS served from backend /api/website/*

## What's Been Implemented (as of Feb 27, 2026)
- Full client & loan CRUD with search, filter, pagination
- Device lock/unlock with audit trail, temporary locks, reasons
- Payment scheduling and automation (configurable via admin settings)
- **Stripe Payment Automation**: Real checkout sessions, payment links, auto-pay toggle per client, auto-charge setting, background scheduler generates and emails payment links
- Background tasks: payment processing, late fees, auto-lock, report emails, auto-payment links
- Web portal: full admin dashboard with 14+ features + Stripe payment management UI
- **Live Payment Feed**: Real-time dashboard widget with animated entries, method icons, polling every 15s
- Marketing website: 6 pages (Home, Pricing, How It Works, Contact, Privacy, Terms) + ZIP download
- Mobile admin app: 20+ screens including Enterprise features (Documents, Import, Schedules, Telegram, Team, Provisioning)
- Mobile client app: payment view, notifications, background location tracking
- **Enterprise Feature Gating**: All 6 enterprise screens wrapped with EnterpriseGate component
- **Improved Lock Screen**: Bigger icon (200px), larger text (40px title), brighter colors, border accents
- **Removed Lock Screen Refastening**: No more 500ms immersive re-engagement interval or scheduleAutoRestart
- Stripe subscription payments, Resend email, Telegram bot, Google Drive backup
- QR code device provisioning, CSV bulk client import, Multi-language support (EN/ET)

## Key API Endpoints
### Payment Automation (NEW)
- POST /api/clients/{id}/create-payment-link - Creates Stripe checkout session for client payment
- GET /api/clients/{id}/check-payment/{session_id} - Check & update payment status
- POST /api/clients/{id}/toggle-autopay - Enable/disable auto-pay per client
- GET /api/clients/{id}/payment-methods - Get payment info and recent Stripe payments

### Admin
- POST /api/admin/login, GET/PUT /api/admin/settings (now includes payment_auto_charge_enabled)
- GET /api/payments/current-plan, GET /api/admin/credits

### Clients & Loans
- GET/POST /api/clients, GET/PUT/DELETE /api/clients/{id}
- POST /api/clients/{id}/lock, GET /api/clients/{id}/lock-history
- GET/POST /api/schedules, PUT/DELETE /api/schedules/{id}
- POST /api/loans/payment, GET /api/loans/payments/{id}

### Website & Portal
- GET /api/website, /api/website/pricing, etc.
- GET /api/download/website
- GET /api/portal

### Stripe Subscription
- POST /api/payments/subscribe, GET /api/payments/status/{session_id}
- POST /api/webhook/stripe

## Credentials
- Admin: username=admin, password=admin123
- Production URL: https://paylock-enterprise.preview.emergentagent.com

## Integrations
- MongoDB Atlas, Stripe (via emergentintegrations), Resend, Telegram Bot, Google Drive, Chart.js, EAS

## Backlog / Future
- Portal JS modularization (portal-app.js -> domain-specific files)
- WhatsApp Business API Integration
- Location heatmap visualization
