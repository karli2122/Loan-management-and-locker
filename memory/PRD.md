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

### Push Notifications (5-Bug Fix) - FIXED, NEEDS NEW BUILD
1. Added `expo-notifications` plugin to `app.config.js`
2. Moved `initializeNotifications()` to root `_layout.tsx`
3. Moved `setNotificationHandler` to `app/_layout.tsx`
4. Added `priority: "high"` and `channelId` to push payloads
5. Removed cached push token skip

### Contract Download & Share Buttons - FIXED, NEEDS NEW BUILD
1. Fixed `Linking` import: replaced dynamic `import('react-native')` with static import (breaks in production EAS builds)
2. Fixed `expo-file-system` import: changed to `expo-file-system/legacy` (Expo SDK 54 breaking change — default export no longer has `downloadAsync`)
3. Also fixed same import in `bank-analyzer.tsx`

## Pending (User Verification Needed)
- Contract download/share (needs new build)
- Push notifications (needs new native build)
- Device overview count (needs new build)
- Client app chat keyboard overlay (needs new build)
- Bank statement analyzer (needs user testing)

## Backlog
- (P1) WhatsApp Business API Integration
- (P1) Submit new Admin and Client app EAS builds
- (P2) Location heatmap visualization

## Key Credentials
- VPS: 37.148.202.159, user `karliv`, password `Nasvakas123!`
- Portal login: `karli1987` / `nasvakas123`
- Backend: api.paylock.pro
