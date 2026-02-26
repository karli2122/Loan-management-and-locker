# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application called "PayLock Pro" for an Estonian IT company. Includes mobile apps (Admin + Client), web admin portal, and marketing website.

## Core Requirements
1. **Client Management**: CRUD operations, KYC document storage, loan tracking
2. **Loan Management**: Plans, schedules, EMI calculations, late fees
3. **Device Management**: Lock/unlock devices, QR provisioning, audit trail
4. **Payment Automation**: Auto-reminders, auto-lock, auto-late-fees (configurable via settings)
5. **Notifications**: Push, email (Resend), Telegram bot
6. **Team Management**: Enterprise plan feature with role-based access
7. **Reporting & Analytics**: Revenue, collections, overdue tracking
8. **Marketing Website**: Dark professional theme, multi-page (Home, Pricing, How It Works, Contact, Privacy, Terms)
9. **Mobile Apps**: Admin (manage everything) + Client (view payments, lock status)

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend (Mobile)**: Expo React Native (admin + client apps)  
- **Web Portal**: Vanilla JS served from backend /api/portal
- **Website**: Static HTML/CSS/JS served from backend /api/website/*

## What's Been Implemented
- Full client & loan CRUD with search, filter, pagination
- Device lock/unlock with audit trail, temporary locks, reasons
- Payment scheduling and automation (configurable via admin settings)
- Background tasks: payment processing, late fees, auto-lock, report emails
- Web portal: full admin dashboard with 14+ features
- Marketing website: 6 pages (Home, Pricing, How It Works, Contact, Privacy, Terms)
- Mobile admin app: 20+ screens including Enterprise features
- Mobile client app: payment view, notifications, background location tracking
- Stripe payments, Resend email, Telegram bot, Google Drive backup
- QR code device provisioning
- CSV bulk client import
- Multi-language support (EN/ET)

## Admin App Screens (All portal features now available)
- Dashboard, Clients, Add Client, Add Loan, Client Details
- Device Setup, Settings, Loan Management, Loan Plans, Calculator
- Reports, Device Management, Payment Reminders, Notifications
- Bank Analyzer, Business Management, Client Map, Audit Log
- **Enterprise (NEW)**: Documents, Bulk Import, Schedules, Telegram, Team, Provisioning

## Key API Endpoints
- POST /api/admin/login, GET /api/admin/settings, PUT /api/admin/settings
- GET/POST /api/clients, GET/PUT/DELETE /api/clients/{id}
- POST /api/clients/{id}/lock, GET /api/clients/{id}/lock-history
- GET/POST /api/schedules, PUT/DELETE /api/schedules/{id}
- POST /api/documents/upload, GET /api/documents/list
- POST /api/import/clients/csv
- GET/POST /api/team/members
- GET /api/telegram/bot-info, POST /api/telegram/link-client
- GET /api/provisioning/qr-code
- GET /api/website, /api/website/pricing, etc.
- GET /api/portal

## Credentials
- Admin: username=admin, password=admin123
- MongoDB Atlas: configured in backend/.env
- Production URL: https://client-app-staging-1.preview.emergentagent.com

## Integrations
- MongoDB Atlas, Stripe, Resend, Telegram Bot, Google Drive, Chart.js, EAS

## Backlog / Future
- WhatsApp Business API Integration
- Location heatmap visualization
- Portal JS modularization (portal-app.js → domain-specific files)
