# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## All Implemented Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL
- Firebase Cloud Messaging for push notifications
- Document vault storage on VPS `/opt/paylock/documents/`

### Bug Fixes (All Deployed)
- Device count: enterprise-scoped `/api/stats`
- Tamper detection: two-step warning + lock flow, real permission values
- Chat date grouping, warning auto-dismiss, admin chat UI tweaks

### Feature Set

1. **Audit Log System** - Log all admin actions, queryable with filters
2. **Automated Payment Reminders** - Hourly scheduler, configurable schedule [-1,0,1,2,3]
3. **Daily Digest Email** - Overdue, tamper alerts, upcoming due dates via Resend
4. **Screenshot/Screen Recording Block** - `expo-screen-capture` on client app
5. **Revenue Forecasting** - Expected vs likely collections, weekly forecast
6. **Loan Restructuring** - Modify EMI/tenure/rate with full history tracking
7. **Role-Based Permissions** - super_admin, full_admin, collections, viewer
8. **Session Management** - View/revoke active admin sessions (UI in settings)
9. **Analytics Suite**:
   - Collection efficiency trends (weekly/monthly) - UI in dashboard
   - Risk score history per client - API ready
   - Portfolio health (NPAs, aging analysis) - UI in dashboard
   - Comparative analytics (team member performance) - API ready
10. **Client Document Vault** - Upload/list/download/delete (UI in client details)
11. **Bulk Loan Import** - CSV upload with client matching
12. **Permission Enforcement** - Backend middleware on key client-modifying routes
13. **Risk Score Auto-Tracking** - Logs score changes on payment events

### Frontend UIs Added
- **LoanRestructureModal** - Restructure form + history in client-details
- **DocumentVaultModal** - Upload/list/delete documents in client-details
- **SessionManagementModal** - View/revoke sessions in admin settings
- **Dashboard Analytics** - Portfolio health + collection trends charts

## Current Builds
- Admin: https://expo.dev/accounts/karli1987/projects/loans/builds/c4e30b1b-a9e3-4659-ad77-2c49d47068df
- Client: https://expo.dev/accounts/karli1987/projects/client/builds/53b35192-536c-4c7e-adae-2a55d7b6630c

## Future/Backlog
- WhatsApp Business API Integration
- Geofencing alerts
- Multi-currency support
- Client self-service portal
- Payment receipt PDF auto-generation
- Loan portfolio export to Excel

## Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
