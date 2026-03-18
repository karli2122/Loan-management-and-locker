# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with React Native Admin/Client apps and a FastAPI backend + MongoDB. The platform enables loan tracking, device management, payment processing, and client communication.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on VPS (37.148.202.159)
- **Admin App**: React Native (Expo) - Admin manages clients, loans, devices
- **Client App**: React Native (Expo) - Clients view loan status, communicate
- **Web Portal**: Vanilla JS - Alternative admin interface

## What's Been Implemented

### Loan Management
- Month-based interest calculation (unified across all forms)
- Loan creation, deletion, contract generation (PDF via fpdf2)
- Data centralized in `loans` collection (single source of truth)
- Auto-completion and archival when `due_today_amount` is paid
- Delete/Share Contract buttons on both web portal and admin app

### Stripe Connect (Payment Forwarding)
- Destination charges model with configurable platform fee (default 0.75%)
- GET/PUT `/api/connect/platform-fee` endpoints (superadmin-only, 0-10% range)
- Onboarding UI in Admin App Settings (enterprise/custom plans only)
- "Send Payment Link" in MultiLoanOverview
- Superadmin dashboard for platform fees

### Admin App UI/UX
- Plan Badge removed from dashboard
- "Device Management" renamed to "Client Management" (file, routes, UI text)
- "Silent" filter: clients with registered device but heartbeat > 12h ago
- Dashboard Heartbeat widget navigates to loans with "silent" filter
- Client card: Due Amount shows green "0" when paid, "Unlocked" badge hidden if no device
- **Last Heartbeat indicator** on client card (color-coded: green <5m, yellow <12h, red >12h)
- **Last Heartbeat** displayed in DeviceInfo component in client details
- Contract Share uses `expo-sharing` for native share dialog
- Messaging button gated to enterprise/custom plans (both admin + client apps)

### Silent Device Push Notifications (2026-03-18)
- Background task `check_silent_devices()` runs every hour
- Detects registered devices with last heartbeat >12h ago
- Groups silent devices by admin, sends in-app notification + Expo push notification
- Rate-limited: max 1 notification per admin per 6 hours

### Subscription Management
- Auto-renewal check background task (runs every 6 hours)
- Handles expired subscriptions with 7-day grace period
- Auto-downgrades to demo after grace period
- Sends renewal reminder notifications

### Version Auto-Increment (Fixed 2026-03-18)
- `bump-version.js` now wired into EAS build process
- `eas-build-pre-install` runs bump script on EAS server
- Convenience scripts: `yarn build:admin`, `yarn build:client`
- Version auto-increments on every build submission

### Client App
- Background heartbeat service (expo-background-fetch)
- Chat FAB gated to enterprise/custom admin plans
- Admin plan info returned via `/api/device/status/{client_id}`

### Credit Scoring
- Initialized at client creation, updated on payments and loan completions

## Key DB Schema
- **clients**: `{ id, name, phone, email, admin_id, device_id, is_registered, last_heartbeat, ... }`
- **loans**: `{ id, client_id, loan_amount, interest_rate, tenure_months, due_date, total_due, given_date }`
- **admins**: `{ id, email, role, plan, stripe_connect_id, is_super_admin, ... }`
- **platform_config**: `{ key: "platform_fee", value: 0.75 }`
- **notifications**: `{ id, admin_id, type, title, message, created_at, read }`

## 3rd Party Integrations
MongoDB Atlas, Stripe (Live + Connect), APScheduler, Resend, Chart.js/react-native-chart-kit, EAS, FCM, Emergent LLM Key (AI Vision OCR), fpdf2, nginx, expo-task-manager, expo-battery, expo-file-system, expo-sharing, expo-background-fetch

## Credentials
- **VPS**: karliv @ 37.148.202.159 / Nasvakas123!
- **Super Admin**: karli1987 / nasvakas123

## Backlog
- P1: Verify background heartbeat on real device after new build completes
- P1: Update app_version DB records once builds complete with new APK URLs
- P2: Test subscription auto-renewal with real expired accounts
