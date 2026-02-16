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

### Phase 3 - Charts, Tabs & Client App (Feb 16, 2026)
- Monthly Interest Trend Chart on admin dashboard (6-month LineChart)
- Client Details Tab System: "Active Loan" and "Payment History" tabs
- Client App "All Paid" state (Kõik makstud) when no active loan
- Removed quick actions (payment history, support chat, refresh) from client app
- Removed Payment History from client portal dashboard

### Phase 4 - Loan Renewal (Feb 16, 2026)
- **Backend**: `GET /api/paid-loans/{client_id}/latest` — fetches most recent archived loan
- **Client Details**: "Renew Loan" button (green) for clients with no active loan but with loan history
- **Add Loan Page**: Renewal mode with pre-filled form (amount, interest rate, tenure/due date) from last archived loan
- **Renewal Banner**: Visual indicator on add-loan page when in renewal mode

## Key API Endpoints
- `GET /api/paid-loans/summary` - Total + monthly interest, 6-month trend
- `GET /api/paid-loans/{client_id}/latest` - Latest archived loan for renewal pre-fill
- `GET /api/loans/{client_id}/payments` - Payment history for a client
- `POST /api/loans/{client_id}/payments` - Record payment (auto-archives on final)
- `POST /api/admin/login` - Admin authentication

## Backlog
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
