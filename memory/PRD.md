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

### Session 1 - Feb 26, 2026 (New Features Batch 1)
1. **Team Management (Enterprise)** - Super admin creates sub-users with roles
2. **Bulk CSV Import** - Upload CSV to create multiple clients
3. **Document Storage** - GridFS file upload/download/delete
4. **Telegram Bot** - One-way @Paylockpro_bot notifications
5. **Payment Scheduling Backend** - Recurring payment schedules with APScheduler
6. **Updated Plans** - 4 tiers with new features named
7. **Updated Website** - New feature cards

### Session 2 - Feb 26, 2026 (Features Batch 2)
1. **Analytics Charts (Chart.js)** - 4 charts on dashboard: Revenue Trends (line), Profit Trends (bar+line), Collection Rates (bar+line), Loan Distribution (doughnut)
2. **Payment Scheduling UI** - Full CRUD page: create/view/toggle/delete schedules with "Process Reminders" and "New Schedule" actions
3. **Team Activity Log** - Superuser-only page showing all team member actions with filtering by action type and member
4. **Role-based Sidebar Filtering** - Nav items hidden based on user permissions (super_admin sees all, viewer sees only Clients & Reports)
5. **Enhanced Auth** - Login and verify endpoints return permissions, is_super_admin, full user info

## Roles & Permissions
| Role | Permissions |
|------|------------|
| Super Admin | All (team, activity, everything) |
| Manager | clients, loans, reminders, reports, devices, contracts, schedules, documents, import |
| Collection Agent | clients, loans, reminders, contracts |
| Accountant | reports, loans, clients |
| Viewer | clients, reports |

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

## Key API Endpoints
### Team
- `GET/POST/PUT/DELETE /api/team/members` - Team CRUD
- `GET /api/team/enterprise-check` - Enterprise plan check
- `GET /api/team/roles` - Available roles

### Documents & Import
- `POST /api/documents/upload` - Upload document
- `GET /api/documents/client/{id}` - Client documents
- `GET /api/documents/stats` - Storage stats
- `POST /api/import/clients/csv` - CSV bulk import
- `GET /api/import/template` - CSV template

### Schedules
- `GET/POST /api/schedules` - List/create schedules
- `PUT/DELETE /api/schedules/{id}` - Update/delete schedule
- `GET /api/schedules/due/today` - Due today
- `POST /api/schedules/process-reminders` - Process all due reminders

### Telegram
- `GET /api/telegram/bot-info` - Bot status
- `POST /api/telegram/send-bulk` - Bulk reminders
- `POST /api/telegram/send/{client_id}` - Individual reminder

### Activity & Analytics
- `GET /api/audit-logs` - Activity log with filters
- `GET /api/audit-logs/action-types` - Available action types
- `GET /api/analytics/dashboard` - Dashboard analytics
- `GET /api/reports/financial` - Financial report with monthly trends
- `GET /api/plans/features` - All plan features

## Upcoming Tasks (Backlog)
- P1: WhatsApp Business API (user asked to skip for now)
- P1: NFC Provisioning UI improvements (backend ready)
- P2: Enterprise data isolation testing with real multi-user scenarios
- P2: Revenue/profit charts with date range filtering
- P3: Export reports to PDF/CSV

## Credentials
- Admin: username=admin, password=admin123
- Telegram Bot Token: in backend/.env
