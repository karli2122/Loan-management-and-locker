# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with React Native Admin/Client apps and a FastAPI backend + MongoDB.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, VPS (37.148.202.159, service: paylock)
- **Admin App**: React Native (Expo)
- **Client App**: React Native (Expo)
- **Web Portal**: Vanilla JS at /api/portal

## Latest Changes (2026-03-19)

### Bug Fixes
- **Contract sharing**: Fixed Android compatibility using `getContentUriAsync()` for content:// URI
- **Active Loans count**: Now queries `loans` collection by client_ids (was incorrectly counting by admin_id)
- **Demo mode upgrade button**: Fixed unmatched route `/admin/subscription` → `/admin/loan-plans`
- **Demo mode add loan**: Button hidden for demo plan users
- **Settings User Management**: Fixed layout overlay — changed adminInfo to column layout with flexShrink on actions
- **Payment reminders**: Removed monthly EMI row from reminder cards

### UI Enhancements
- **Due amount color-coding** (clients.tsx + loans.tsx):
  - Green (#10B981): paid (0)
  - Yellow (#F59E0B): outstanding but not overdue
  - Red (#EF4444): overdue with days count
- **Multi-loan overview**: Due Today shows overdue days indicator with color coding
- **Loans endpoint**: Now returns `days_overdue` per loan
- **Client management**: "Registered" card → "Loans Active" with actual count
- **Dashboard heartbeat**: Click navigates to `/admin/clients?filter=silent`
- **Clients page**: Reads `filter` URL param for pre-selected silent filter

### Translations Added
- clientManagement, clientOverview, loansActive, filterSilent (16 languages)

## Current Versions
- Admin: v1.4.3 (code 44)
- Client: v1.4.4 (code 45)

## Credentials
- **VPS**: karliv @ 37.148.202.159 / Nasvakas123!
- **Super Admin**: karli1987 / nasvakas123

## Backlog
- P1: Verify background heartbeat on real device
- P2: Test subscription auto-renewal with expired accounts
