# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with React Native Admin/Client apps and a FastAPI backend + MongoDB. The platform enables loan tracking, device management, payment processing, and client communication.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas
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
- Destination charges model with 0.75% platform fee (configurable by superadmin)
- Onboarding UI in Admin App Settings (enterprise/custom plans only)
- "Send Payment Link" in MultiLoanOverview
- Superadmin dashboard for platform fees
- GET/PUT `/api/connect/platform-fee` endpoints for fee configuration

### Admin App UI/UX (Completed 2026-03-18)
- Plan Badge removed from dashboard
- "Device Management" renamed to "Client Management" (file, routes, UI text)
- "Silent" filter added to Clients list (registered device, heartbeat > 12h)
- Dashboard Heartbeat widget navigates to loans with "silent" filter
- Client card: Due Amount shows green "0" when paid, "Unlocked" badge hidden if no device
- Contract Share uses `expo-sharing` for native share dialog
- Messaging button gated to enterprise/custom plans (both admin + client apps)

### Subscription Management (Completed 2026-03-18)
- Auto-renewal check background task (runs every 6 hours)
- Handles expired subscriptions with 7-day grace period
- Auto-downgrades to demo after grace period
- Sends renewal reminder notifications

### Client App
- Background heartbeat service (expo-background-fetch)
- Chat FAB gated to enterprise/custom admin plans
- Admin plan info returned via `/api/device/status/{client_id}`

### Credit Scoring
- Initialized at client creation, updated on payments and loan completions

### Other
- Bulk import (CSV/PDF) populates `loans` collection
- Role elevation on plan upgrade (user -> admin for enterprise/custom)
- Stripe live integration for subscriptions

## Key DB Schema
- **clients**: `{ id, name, phone, email, admin_id, device_id, is_registered, last_heartbeat, ... }`
- **loans**: `{ id, client_id, loan_amount, interest_rate, tenure_months, due_date, total_due, given_date }` (single source of truth)
- **admins**: `{ id, email, role, plan, stripe_connect_id, is_super_admin, ... }`
- **platform_config**: `{ key: "platform_fee", value: 0.75 }` (superadmin-configurable)

## 3rd Party Integrations
- MongoDB Atlas, Stripe (Live + Connect), APScheduler, Resend
- Chart.js/react-native-chart-kit, EAS, FCM, Emergent LLM Key (AI Vision OCR)
- fpdf2, nginx, expo-task-manager, expo-battery, expo-file-system, expo-sharing, expo-background-fetch

## Credentials
- **VPS**: karliv @ 37.148.202.159 / Nasvakas123!
- **Super Admin**: karli1987 / nasvakas123

## Backlog
- P1: Verify background heartbeat on real device after new build
- P1: Subscription auto-renewal testing with real expired accounts
- P2: Make additional admin features plan-gated where needed
