# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/app/paylockpro-website/` (zipped at `/app/paylockpro-website.zip`)

## Subscription Plans & Feature Gating (Implemented)

### Plan Hierarchy
- **Starter** (level 0): Basic loan management, payments, client management
- **Business** (level 1): + Analytics, Bulk Import, Restructuring, Document Vault, Device lock & unlock, Reminders, Daily digest
- **Enterprise** (level 2): + RBAC, Session Management, Revenue Forecasting, Audit Logs, Bank Statement Analyze, Portfolio Health, Comparative Analytics, Risk Score Tracking
- **Custom** (level 3): Super admin access - all features

### Backend Gating
- Centralized plan checking in `backend/utils/plan_gating.py`
- `check_plan_access(admin_id, feature)` raises AuthorizationException with 403 for unauthorized access
- `get_accessible_features(admin_id)` returns full feature map for frontend
- `GET /api/admin/feature-access` endpoint for frontend to query
- Applied to all premium route endpoints (analytics, bulk_import, restructuring, document_vault, sessions, forecasting, audit_logs, bank_statements, team)

### Frontend Gating
- `useEnterpriseAccess` hook updated for 3-tier plan support (returns `plan`, `hasBusiness`, `hasEnterprise`, `canAccess()`)
- `EnterpriseGate` component accepts `requiredPlan` and `featureKey` props
- Features tab shows plan badges (Business/Enterprise) on premium features
- Locked features show lock icon and prompt to upgrade
- All screen-level gates updated with correct `requiredPlan` and `featureKey`

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
2. **Automated Payment Reminders** - Hourly scheduler, configurable schedule
3. **Daily Digest Email** - Overdue, tamper alerts, upcoming due dates via Resend
4. **Screenshot/Screen Recording Block** - `expo-screen-capture` on client app
5. **Revenue Forecasting** - Expected vs likely collections, weekly forecast
6. **Loan Restructuring** - Modify EMI/tenure/rate with full history tracking
7. **Role-Based Permissions** - super_admin, full_admin, collections, viewer
8. **Session Management** - View/revoke active admin sessions
9. **Analytics Suite** - Collection trends, risk score history, portfolio health, comparative analytics
10. **Client Document Vault** - Upload/list/download/delete documents
11. **Bulk Loan Import** - CSV upload with client matching
12. **Permission Enforcement** - Backend middleware on key routes
13. **Risk Score Auto-Tracking** - Logs score changes on payment events
14. **Feature Gating** - Subscription-based access control (starter/business/enterprise)

### Frontend UIs
- **LoanRestructureModal** - Restructure form + history in client-details
- **DocumentVaultModal** - Upload/list/delete documents in client-details
- **SessionManagementModal** - View/revoke sessions in admin settings
- **Dashboard Analytics** - Portfolio health + collection trends charts
- **Features Tab** - Plan badges, locked/unlocked state, upgrade prompts

## Translations
- All new feature strings translated to: en, et, no, sv, da, fi, lv, lt, de, cs, pl, es, fr, it
- Translation keys in `frontend/src/context/LanguageContext.tsx`

## Key Files
- `backend/utils/plan_gating.py` - Feature-to-plan mapping and access checks
- `backend/routes/admin.py` - Feature access endpoint
- `frontend/src/hooks/useEnterpriseAccess.ts` - Frontend plan hook
- `frontend/src/components/EnterpriseGate.tsx` - Plan gate component
- `frontend/app/admin/(tabs)/features.tsx` - Features tab with plan badges
- `frontend/src/context/LanguageContext.tsx` - All translations

## Test Reports
- `/app/test_reports/iteration_73.json` - Feature gating tests: 39/39 passed (100%)

## Upcoming Tasks
- Build new Admin and Client APKs after feature gating is verified on devices
- Deploy backend changes to production VPS
- Additional UI/UX polish for new features

## 3rd Party Integrations
- MongoDB Atlas, Stripe (Live), APScheduler, Resend, Chart.js, Expo/EAS, Firebase/FCM, Emergent LLM Key (AI Vision OCR)
