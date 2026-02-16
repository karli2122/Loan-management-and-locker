# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Dashboard analytics, client portal, and loan management features for an EMI device administration system. Estonian language support (et) with English fallback.

## Core Users
- **Superadmin** (karli1987): Full access to all features
- **Admin** (testadmin): Standard loan management
- **Client**: Self-service loan portal

## Tech Stack
- **Frontend**: React Native (Expo), react-native-chart-kit, TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic
- **Auth**: Token-based admin auth, registration code client auth

## What's Been Implemented

### Phase 1 - Core (Previous sessions)
- Client management (CRUD)
- Loan setup, payments, EMI calculation
- Device lock/unlock
- Client portal (register, home, portal-dashboard)
- Multi-language (ET/EN), dark/light theme
- Credit scoring, late fee tracking

### Phase 2 - Dashboard & Archiving (Previous session)
- Auto-loan archiving on final payment
- "Settled" tab removal (redundant with auto-archive)
- Loan History search bar on client detail page
- Interest Earned dashboard card (total + current month)

### Phase 3 - Charts, Tabs & Client App (Current session - Feb 16, 2026)
- **Monthly Interest Trend Chart**: LineChart on admin dashboard showing 6-month interest income trend
- **Backend Enhancement**: `/api/paid-loans/summary` now returns `monthly_interest_trend` array
- **Client Details Tab System**: Added "Active Loan" and "Payment History" tabs to admin client details page
- **Payment History Tab**: Fetches and displays payment history from `/api/loans/{client_id}/payments`
- **Client App "All Paid" State**: Shows "Kõik makstud" card when no active loan (home.tsx + portal-dashboard.tsx)
- **Removed from Client App**: Payment history, support chat, refresh status quick actions
- **Removed from Portal Dashboard**: Payment History section

## Key API Endpoints
- `GET /api/paid-loans/summary` - Total + monthly interest, 6-month trend
- `GET /api/loans/{client_id}/payments` - Payment history for a client
- `POST /api/loans/{client_id}/payments` - Record payment (auto-archives on final)
- `POST /api/admin/login` - Admin authentication

## Backlog
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
