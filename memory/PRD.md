# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/app/paylockpro-website/` (zipped at `/app/paylockpro-website.zip`)

## Subscription Plans & Feature Gating (Updated 2026-03-14)

### Plan Hierarchy
- **Starter** (level 0): Up to 25 clients, Push notifications, Basic analytics dashboard, Email reminders, Loan calculator
- **Professional** (level 1, replaces "Business"): Up to 200 clients, Everything in Starter + Device lock & unlock, Client messaging, PDF contract generation, Automated payment scheduling, Auto-lock after grace period, Late fee automation, Team management (3 members), GPS location tracking, Advanced reports (PDF & CSV), Loan plans, Collection trends, Loan restructure
- **Enterprise** (level 2): Unlimited clients, Everything in Professional + Unlimited team members, QR provisioning, Device Owner mode, NFC provisioning, Bank statement OCR, Document vault, Stripe payment integration, Scheduled email reports, Portfolio health (NPA), Risk score tracking, Daily digest mail, Session management, Role-based permissions, Credit scoring system, Bulk import/export, Full REST API access, Priority support & SLA
- **Custom** (level 3): Super admin access - all features

### Backend Gating
- Centralized plan checking in `backend/utils/plan_gating.py`
- `check_plan_access(admin_id, feature)` raises 403 for unauthorized access
- `GET /api/admin/feature-access` endpoint for frontend to query
- Applied to all premium route endpoints
- Both "business" and "professional" supported at level 1 for backward compatibility

### Frontend Gating
- `useEnterpriseAccess` hook with `canAccess(feature)` function and `hasProfessional` alias
- `EnterpriseGate` component with `requiredPlan` and `featureKey` props (supports 'professional' | 'business' | 'enterprise')
- Features tab shows plan badges (Professional/Enterprise) on premium features
- Plan indicator displays "Professional" for both "business" and "professional" DB values

## Client App Permission Locking (Updated 2026-03-14)
- When `uninstall_allowed` is false AND a permission is already granted, the permission card is disabled (opacity: 0.5, non-interactive)
- Applied to ALL 8 permissions: battery, overlay, autoStart, accessibility, location, notification, usageStats, notificationListener
- Tamper detection already in place shows data wipe warning if permissions are revoked via system settings

## Website (Updated 2026-03-14)
- **Home (index.html)**: Core features section + Full feature list (18 cards) + Security section + Integrations row + CTA
- **Pricing (pricing.html)**: 3 tiers - Starter ($29/mo), Professional ($79/mo), Enterprise ($199/mo) with detailed feature lists + FAQ
- **How It Works (how-it-works.html)**: 6-step walkthrough + 9 platform capability cards
- **Download**: `https://api.paylock.pro/api/download/website` or preview URL equivalent

## All Implemented Features

### Core (Starter)
- Client management, Loan management, Payments & EMI tracking
- Push notifications, Email reminders, Calculator

### Professional Features
- Device lock & unlock, Client messaging (Telegram, WhatsApp)
- PDF contract generation, Automated payment scheduling
- Auto-lock after grace period, Late fee automation
- Team management (3 members), GPS location tracking
- Advanced reports (PDF & CSV), Loan plans, Collection trends, Loan restructure

### Enterprise Features
- Unlimited team members, QR provisioning, Device Owner mode, NFC provisioning
- Bank statement OCR (AI), Document vault, Stripe payment integration
- Scheduled email reports, Portfolio health (NPA), Risk score tracking
- Daily digest mail, Session management, Role-based permissions
- Credit scoring system, Bulk import/export, REST API access
- Comparative analytics, Audit log, Revenue forecasting, Tamper detection, Screenshot block

## Builds & Deployments
- **Admin APK v1.2.0**: https://expo.dev/artifacts/eas/h8xg5L53LRTMTEpSVDSqve.apk
- **Client APK v1.2.0**: https://expo.dev/artifacts/eas/r96RMTH1gXzRUxZnmdXauj.apk
- **Website ZIP**: `/app/paylockpro-website.zip` + available at download endpoint
- **Backend**: Deployed to VPS (37.148.202.159), service running
- **Website download**: `https://api.paylock.pro/api/download/website`

## Test Reports
- `/app/test_reports/iteration_73.json` - Feature gating: 39/39 passed (100%)
- `/app/test_reports/iteration_74.json` - Plan gating + website update: 13/13 passed (100%)

## Contact Form
- Backend endpoint: `POST /api/contact` sends email to `support@paylock.pro` via Resend
- Frontend form on `contact.html` POSTs to `https://api.paylock.pro/api/contact`

## Key Files
- `backend/utils/plan_gating.py` - Feature-to-plan mapping and access checks
- `backend/routes/admin.py` - Feature access endpoint
- `frontend/src/hooks/useEnterpriseAccess.ts` - Frontend plan hook
- `frontend/src/components/EnterpriseGate.tsx` - Plan gate component
- `frontend/app/admin/(tabs)/features.tsx` - Features tab with plan badges
- `frontend/app/client/home.tsx` - Client app with permission locking
- `paylockpro-website/` - Static website (pricing, home, how-it-works, contact)

## 3rd Party Integrations
- MongoDB Atlas, Stripe (Live), APScheduler, Resend, Chart.js, Expo/EAS, Firebase/FCM, Emergent LLM Key (AI Vision OCR)
