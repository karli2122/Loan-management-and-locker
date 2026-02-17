# EMI Device Admin - Product Requirements Document

## Original Problem Statement
Dashboard analytics, client portal, and loan management features for an EMI device administration system. Estonian language support (et) with English fallback.

## Core Users
- **Superadmin** (karli1987): Full access to all features
- **Admin** (testadmin): Standard loan management
- **Client**: Self-service loan portal

## Tech Stack
- **Frontend**: React Native (Expo), react-native-chart-kit, expo-document-picker, TypeScript
- **Backend**: FastAPI, MongoDB, Pydantic, PyMuPDF, emergentintegrations (GPT-4.1)
- **Auth**: Token-based admin auth (30-day expiry), registration code client auth

## What's Been Implemented

### Phase 1-4 (Previous sessions)
- Core loan management, client portal, device lock/unlock
- Dashboard analytics, auto-archiving, loan renewal
- Bank statement analyzer (AI-powered)

### Phase 5 - Bug Fixes (Feb 17, 2026)
- **Bank Statement Analyzer file upload**: Fixed for native mobile - now uses `expo-document-picker` instead of web-only `<input type="file">`
- **Dashboard compacted**: Reduced chart heights (200→160), tighter padding/margins on all cards, smaller font sizes
- **Session persistence**: Extended token expiry from 24h to 30 days (720h)
- **Backend URL fixed**: Updated all fallback URLs from old `loan-history-feature` to `loan-trends`
- **EAS build config**: Added `EXPO_PUBLIC_BACKEND_URL` to all 6 build profiles in `eas.json`
- **.gitignore cleanup**: Removed 27 duplicate `*.env` blocks that were blocking deployment
- **yarn.lock**: Regenerated clean lockfile, removed package-lock.json conflicts

## Key API Endpoints
- `POST /api/bank-statements/analyze` - Upload & analyze bank statement
- `GET /api/bank-statements/history` - Past analyses
- `GET /api/paid-loans/summary` - Interest summary + 6-month trend
- `GET /api/paid-loans/{client_id}/latest` - Latest archived loan for renewal
- `POST /api/admin/login` - Admin auth (30-day token)

## Backlog
- P3: Android Management API (AMAPI) Integration
- P3: Push notifications (FCM)
