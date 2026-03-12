# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo (EAS builds)
- **Client App**: React Native / Expo with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## Completed Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL
- URL consolidation across all apps/portal/website

### Web Portal
- Modularized JS architecture (portal-core, portal-risk, portal-messaging, portal-reports)
- Dashboard with live stats and charts
- Client management with full CRUD
- Device registration key generator (8-digit admin / 9-digit owner)
- Add Loan modal with EMI calculation
- Send Warning (in-app message + push notification to client)
- Loan schedule viewer
- Loan plans CRUD with edit/create/delete modals
- Payment schedules CRUD with edit modal
- Bank statement analyzer with AI vision OCR (Force OCR checkbox for scanned PDFs)
- AI client risk scoring with Chart.js
- Bulk messaging via Telegram
- Report exports (PDF/Excel)
- Document management with searchable client dropdown
- CSV import
- Stripe payment links
- Activity log

### Admin App
- Full offline mode with auto-sync
- Dashboard charts (overdue aging, collection trends)
- Expo push notifications for due payments
- Multi-session JWT auth with sliding expiration

### Client App
- In-app messaging with admin
- Multi-language lock screen messages
- Emergency call button fix (kiosk mode exit)
- Status bar bypass hardening

### Auth & Security
- Plan-based portal access gating (enterprise/custom only)
- Removed default/test admin users
- Superadmin = custom plan features

## Backlog

### P1
- Sync latest code changes to VPS (all iteration 71 features)

### P2
- WhatsApp Business API Integration

### P3
- Location heatmap visualization

## Key Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `Nasvakas123!`
- Backend: api.paylock.pro
