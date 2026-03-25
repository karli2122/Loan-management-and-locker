# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (Admin + Client), and vanilla JS web portal.

## Architecture
- **Backend**: FastAPI on port 8001 (VPS: 37.148.202.159, service: paylock.service, path: /opt/paylock/backend/)
- **Frontend**: React Native (Expo) admin + client apps
- **Web Portal**: Vanilla JS at /backend/static/portal/
- **Database**: MongoDB Atlas

## Credentials
- Super Admin: karli1987 / nasvakas123
- VPS: karliv @ 37.148.202.159 / Nasvakas123!

## What's Been Implemented
- [2026-03-25] Lockscreen home button bypass fix: immediate re-engagement of kiosk mode, overlay blocker, foreground monitor, immersive mode when app returns from background while locked
- [2026-03-25] ForegroundMonitorService check interval reduced 500ms -> 200ms for faster detection
- [2026-03-25] Emergency call fix: now stops overlay blocker + foreground monitor before dialing, uses Linking.openURL('tel:112') as fallback, re-engages all protections after call ends
- [2026-03-25] Welcome email: portal link only for enterprise/custom plans
- [2026-03-25] Samsung battery/autostart: Linking.openSettings() fallback + "Already Done" button
- [2026-03-25] Client app active loan: status endpoint checks loans collection, returns 0 when no active loan
- [2026-03-25] User Management pagination: 10 users per page
- [2026-03-25] Contact form rate limiting: max 3 per IP/email per 5 minutes
- [2026-03-20] Unified financial endpoints (_calc_interest_data shared function)
- [2026-03-20] Fixed completed_loans count, plan change, Stripe Connect error messaging

## Pending Issues
- P1: Admin app missing Delete Loan / Share Contract UI buttons
- P1: UI refresh after partial payment (web portal + admin app)

## Future Tasks
- Subscription auto-renewal logic
- Superadmin UI for Stripe Connect platform fee configuration
