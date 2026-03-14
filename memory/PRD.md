# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application called "PayLock Pro" with tiered subscription model (Starter, Professional, Enterprise), React Native mobile apps (Admin + Client), FastAPI backend, and static informational website.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + APScheduler
- **Frontend**: React Native (Expo) with dual apps (Admin + Client)
- **Website**: Static HTML/CSS/JS at `/opt/paylock/paylockpro-website/`
- **Build System**: EAS (Expo Application Services) with auto-versioning
- **Integrations**: Stripe (Live), Resend, Firebase/FCM, Emergent LLM Key (OCR)

## What's Been Implemented
### Core Features (Complete)
- Three-tier subscription: Starter ($29), Professional ($79), Enterprise ($199)
- Full RBAC: Super Admin, Admin, Collections, Viewer roles
- Client management, loan creation, payment tracking
- Device lock/unlock (Standard + Device Owner modes)
- Push notifications via FCM
- Document vault with encryption
- Reports & analytics with PDF/CSV export
- GPS location tracking
- In-app messaging (Telegram/WhatsApp integration)
- Stripe payment processing
- Bank statement OCR (AI-powered, Enterprise)
- Credit scoring & risk assessment
- Loan restructuring
- Automated payment reminders & late fees
- Session management with remote revocation
- Audit logging

### Security Features (Complete)
- 8-permission monitoring on client device
- Tamper detection: Full-screen alert + push notification on first detection
- Data wipe on confirmed tampering (permission revocation or admin mode deactivation)
- Screenshot blocking, reboot detection, offline enforcement
- Status bar blocking when locked

### User Management Scoping (v1.2.4 - March 14, 2026)
- Admins can only see/manage users they created (`created_by` field)
- Super admins can see and manage all users in the enterprise
- Role definitions updated to handle both naming conventions (admin/full_admin, superadmin/super_admin)
- Delete/update operations enforce created_by ownership for non-super admins

### Asset Generation (Complete)
- PDF user manuals with AI-generated screenshots:
  - Admin App Manual (20 pages, 4 screenshots)
  - Client App Manual (10 pages, 2 screenshots)
  - Web Portal Manual (11 pages, 2 screenshots)
- Email signature and auto-reply HTML templates
- Download endpoints: `/api/download/manual/{admin|client|portal}`

## Current Version
- v1.2.4, Build #25
- Client APK build: `21e386f1-f167-4333-affe-909c8484d36f`
- Admin APK build: `7d8ec299-e7ad-496e-9e64-f5f55abf1177`

## Key API Endpoints
- `POST /api/admin/login` - Admin authentication
- `POST /api/admin/register` - Register (first user = super admin)
- `POST /api/team/members` - Add team member
- `GET /api/team/members` - List team members (scoped by role)
- `PUT /api/team/members/{id}` - Update member
- `DELETE /api/team/members/{id}` - Remove member
- `GET /api/download/manual/{type}` - Download PDF manuals

## Database
- MongoDB Atlas: `mongodb+srv://...@paylock.fgtu4o7.mongodb.net/`
- DB Name: `paylock`
- Key collections: `admins`, `admin_tokens`, `clients`, `loans`, `payments`

## Deployment
- Production VPS: User's server with SSH access
- Website: `/opt/paylock/paylockpro-website/`
- Backend deployed via supervisor

## Prioritized Backlog
- P0: Monitor and deliver APK builds (client + admin)
- P1: Final user verification on device
- P2: Stabilization phase - no new features planned
