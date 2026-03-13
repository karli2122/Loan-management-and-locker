# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (admin + client), and vanilla JS web portal. Deployed to user's VPS at `api.paylock.pro`.

## Core Architecture
- **Backend**: FastAPI + MongoDB Atlas, deployed on Ubuntu VPS (37.148.202.159)
- **Admin App**: React Native / Expo SDK 54 (EAS builds)
- **Client App**: React Native / Expo SDK 54 with device lock capabilities
- **Web Portal**: Vanilla JS served from `/api/portal` on the backend
- **Website**: Static HTML at `/api/website`

## Completed Features

### Infrastructure
- VPS deployment with Nginx reverse proxy + systemd service
- Custom domain `api.paylock.pro` with Let's Encrypt SSL

### Web Portal
- Dashboard with live stats and charts
- Client management, Device registration key generator, Add Loan, Send Warning
- Loan plans/payment schedules CRUD
- Bank statement analyzer with AI vision OCR
- AI client risk scoring, Bulk messaging, Report exports
- App Version Management (superadmin)

### Mobile Apps
- App Version Check with semantic version comparison
- Admin: Offline mode, dashboard charts, push notifications
- Client: In-app messaging, multi-language lock screen, device lock

### Auth & Security
- Plan-based portal access gating, superadmin bypass

## Recent Bug Fixes (2026-03-13)

### Analytics Profit Data (P0) - FIXED & DEPLOYED
- Fixed to include archived loan data in revenue/interest calculations

### Version Check Update Detection - FIXED & DEPLOYED
- Added semantic version string comparison

### Push Notifications (5-Bug Fix) - FIXED, BUILD SUBMITTED
1. Added `expo-notifications` plugin to `app.config.js`
2. Moved `initializeNotifications()` to root `_layout.tsx`
3. Moved `setNotificationHandler` to `app/_layout.tsx`
4. Added `priority: "high"` and `channelId` to push payloads (deployed to VPS)
5. Removed cached push token skip

### Contract Download & Share - FIXED, BUILD SUBMITTED
- Fixed `Linking` static import (dynamic import breaks in production)
- Fixed `expo-file-system` → `expo-file-system/legacy` (SDK 54 breaking change)

### Admin Mode Premature Reporting - FIXED, BUILD SUBMITTED
- Removed `reportAdminStatus(true)` from `checkAdminStatusWithRetry` retry loop (was firing as soon as native API returned true, even from stale state)
- Removed `reportAdminStatus(true)` from `else` branch of `checkAndSetupDeviceProtection` (was auto-firing on every app open if native module reported admin active)
- Now `reportAdminStatus(true)` only fires from explicit user-initiated flows ("Enable Now" and "Yes, Enable" button handlers)

## Builds In Progress
- Admin APK: https://expo.dev/accounts/karli1987/projects/loans/builds/1a09f1e6-ccc6-4a6d-8fd0-da867af84b40
- Client APK: https://expo.dev/accounts/karli1987/projects/client/builds/492fc517-edc9-465e-8582-df342223a7a5

## Pending (User Verification After Builds)
- Push notifications
- Contract download/share
- Admin mode reporting
- Device overview count
- Client app chat keyboard overlay
- Bank statement analyzer

## Backlog
- (P1) WhatsApp Business API Integration
- (P2) Location heatmap visualization

## Key Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
