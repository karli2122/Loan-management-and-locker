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
- File download endpoint (`/api/download/{filename}`)

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
- CSV import, Stripe payment links, Activity log
- **App Version Management** (Settings page, superadmin only) — set version, code, download URL, force update
- Superadmin bypasses plan gate for portal access

### Mobile Apps
- **App Version Check**: Both admin and client apps check for updates on startup, show native update prompt with download link
- Admin: Full offline mode with auto-sync, dashboard charts, Expo push notifications, multi-session JWT auth
- Client: In-app messaging, multi-language lock screen, emergency call fix, status bar bypass hardening

### Auth & Security
- Plan-based portal access gating (enterprise/custom only, superadmin always allowed)
- Removed default/test admin users
- Superadmin = custom plan features

## Backlog

### P1
- WhatsApp Business API Integration

### P2
- Location heatmap visualization

## Key Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
