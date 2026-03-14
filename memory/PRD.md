# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/app/paylockpro-website/` (zipped at `/app/paylockpro-website.zip`)

## Subscription Plans & Feature Gating (Complete)

### Plan Hierarchy
- **Starter** (level 0): Basic loan management, payments, client management
- **Business** (level 1): + Analytics, Bulk Import, Restructuring, Document Vault, Device lock & unlock, Reminders, Daily digest
- **Enterprise** (level 2): + RBAC, Session Management, Revenue Forecasting, Audit Logs, Bank Statement Analyze, Portfolio Health, Comparative Analytics, Risk Score Tracking
- **Custom** (level 3): Super admin access - all features

### Backend Gating
- Centralized plan checking in `backend/utils/plan_gating.py`
- `check_plan_access(admin_id, feature)` raises 403 for unauthorized access
- `GET /api/admin/feature-access` endpoint for frontend to query
- Applied to all premium route endpoints

### Frontend Gating
- `useEnterpriseAccess` hook with `canAccess(feature)` function
- `EnterpriseGate` component with `requiredPlan` and `featureKey` props
- Features tab shows plan badges (Business/Enterprise) on premium features

## Bug Fixes (Latest Session)
1. **Contact email**: Changed from `paylockpro@gmail.com` to `support@paylock.pro` in settings
2. **Client details crash**: Added missing `adminToken` state variable
3. **Loan restructuring**: Removed from features tab (only accessible via client details)
4. **Revenue forecasting**: Created dedicated `/admin/revenue-forecast` page (was routing to reports)
5. **Session management**: Created dedicated `/admin/session-management` page with search bar
6. **Payment reminders**: Added search bar to filter by name/phone
7. **Repeat customers metric**: Fixed backend calculation (intersection of active + paid loans)
8. **Monthly interest earned**: Fixed calculation to include interest from active loan payments
9. **Import path errors**: Fixed 3 broken imports in `src/components/admin/` (LoanRestructure/DocumentVault/SessionManagement modals)
10. **Website pricing**: Updated from "Professional" to "Business" tier with correct feature lists

## All Implemented Features

### Core (Starter)
- Client management, Loan management, Payments & EMI tracking
- Messaging (Telegram, WhatsApp), Reports (PDF & CSV), Notifications
- Contract generation, Loan plans, Calculator

### Business Features
- Collection analytics & trends, Bulk CSV import (clients & loans)
- Loan restructuring tools, Client document vault
- Device lock & unlock, Automated payment reminders
- Auto-lock after grace period, Daily digest emails

### Enterprise Features
- RBAC (super_admin, full_admin, collections, viewer)
- Session management (view/revoke), Revenue forecasting
- Full audit log, Bank statement analyzer (AI)
- Portfolio health & NPA tracking, Comparative analytics
- Risk score history tracking

## Builds & Deployments
- **Admin APK**: https://expo.dev/accounts/karli1987/projects/loans/builds/dc6e375c-0e15-4f93-9109-2d540910fdfc
- **Client APK**: https://expo.dev/accounts/karli1987/projects/client/builds/e833da39-eb23-4d78-b342-c2bcee3f3e2c
- **Website ZIP**: `/app/paylockpro-website.zip` + available at `https://api.paylock.pro/api/download/paylockpro-website.zip`
- **Backend**: Deployed to VPS (37.148.202.159), service running

## Test Reports
- `/app/test_reports/iteration_73.json` - Feature gating: 39/39 passed (100%)

## Key Files
- `backend/utils/plan_gating.py` - Feature-to-plan mapping and access checks
- `backend/routes/admin.py` - Feature access endpoint
- `frontend/src/hooks/useEnterpriseAccess.ts` - Frontend plan hook
- `frontend/src/components/EnterpriseGate.tsx` - Plan gate component
- `frontend/app/admin/(tabs)/features.tsx` - Features tab with plan badges
- `frontend/app/admin/session-management.tsx` - Dedicated session management page
- `frontend/app/admin/revenue-forecast.tsx` - Dedicated revenue forecast page

## 3rd Party Integrations
- MongoDB Atlas, Stripe (Live), APScheduler, Resend, Chart.js, Expo/EAS, Firebase/FCM, Emergent LLM Key (AI Vision OCR)
