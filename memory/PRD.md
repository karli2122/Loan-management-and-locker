# PayLock Pro - Product Requirements Document

## Original Problem Statement
Web portal for loan management with features: device lock/unlock, payment tracking, client management, multi-language contracts, kiosk mode, and comprehensive admin tools.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Frontend Mobile**: React Native (Expo) - Admin & Client apps
- **Frontend Web**: Vanilla JS SPA at `/api/portal`
- **Website**: Static HTML at `/paylockpro-website/`
- **Database**: MongoDB with GridFS for document storage

## Completed Features
### Core (Pre-existing)
- Client CRUD, loan management, payment tracking
- Device lock/unlock, auto-lock on overdue
- Multi-language support (16 languages), multi-currency
- Email reminders (Resend), WhatsApp deep-links
- Stripe payments, Google Drive backup
- Credit score system, bank statement analyzer
- QR/NFC provisioning, Device Owner kiosk mode
- Multi-language PDF contract generator

### Session - Feb 26, 2026 (New Features)
1. **Team Management (Enterprise)** - Super admin creates sub-users with roles (Manager, Collection Agent, Accountant, Viewer). Enterprise data sharing: superuser sees all clients/revenue, team members see only their own data. Enterprise plan required.
2. **Bulk CSV Import** - Upload CSV to create multiple clients at once. Template download, duplicate skip option, error reporting.
3. **Document Storage** - GridFS-based file upload/download/delete for contracts, ID scans, proof of income. Stats dashboard.
4. **Telegram Bot** - One-way notification bot (@Paylockpro_bot). Link clients to chat IDs, send bulk or individual payment reminders.
5. **Payment Scheduling** - Recurring payment schedules with APScheduler.
6. **Analytics/Reports** - Enterprise-scoped dashboards. Superuser sees all enterprise data, team members see own.
7. **Updated Plans** - Starter/Business/Enterprise/Custom with new features named (Team Management, Document Storage, Bulk Import, Telegram, Payment Scheduling, Analytics Charts).
8. **Updated Website** - New feature cards for Team Management, Bulk Import & Documents, Telegram Notifications, Payment Scheduling.

## Plan Tiers
| Feature | Starter | Business | Enterprise | Custom |
|---------|---------|----------|------------|--------|
| Max Clients | 20 | 200 | 1000 | Unlimited |
| Team Management | No | No | Yes | Yes |
| Document Storage | No | Yes | Yes | Yes |
| Bulk CSV Import | No | Yes | Yes | Yes |
| Telegram Bot | No | Yes | Yes | Yes |
| Payment Scheduling | No | Yes | Yes | Yes |
| Analytics Charts | No | Yes | Yes | Yes |
| Device Owner Mode | No | No | Yes | Yes |

## Key API Endpoints (New)
- `GET/POST/PUT/DELETE /api/team/members` - Team CRUD
- `GET /api/team/enterprise-check` - Enterprise plan check
- `GET /api/team/roles` - Available roles
- `POST /api/import/clients/csv` - CSV bulk import
- `GET /api/import/template` - CSV template
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/client/{id}` - Client documents
- `GET /api/documents/stats` - Storage stats
- `GET /api/telegram/bot-info` - Bot status
- `POST /api/telegram/send-bulk` - Bulk reminders
- `POST /api/telegram/send/{client_id}` - Individual reminder
- `GET /api/plans/features` - All plan features
- `GET /api/plans/limits` - Current plan limits

## Upcoming Tasks (Backlog)
- P1: WhatsApp Business API (user asked to skip for now)
- P1: NFC Provisioning UI (backend ready)
- P2: Analytics charts visualization (Chart.js integration in portal)
- P2: Payment scheduling frontend UI improvements

## Credentials
- Admin: username=admin, password=admin123
- Telegram Bot Token: in backend/.env
