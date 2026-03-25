# PayLock Pro - Product Requirements Document

## Original Problem Statement
Full-stack loan management application with FastAPI backend, React Native mobile apps (Admin + Client), and vanilla JS web portal. Core focus on data consistency, financial accuracy, and unified loan calculations.

## Core Requirements
1. **Data Consistency**: All financial metrics calculated from single source of truth (`loans` collection)
2. **Standardized Loan Calculation**: Month-based interest, not daily
3. **Loan Actions**: Delete, Edit, Share Contract in both admin app and web portal
4. **Contract Generation**: PDF generation with key loan details
5. **Background Heartbeat**: Client app sends device status every 5 minutes
6. **Role Assignment**: Default "user" role, auto-elevate to "admin" on enterprise/custom plan
7. **Contact Form Rate Limiting**: Max 3 submissions per IP/email per 5 minutes
8. **Welcome Email**: Send APK download link after successful registration

## Architecture
- **Backend**: FastAPI on port 8001 (production VPS: 37.148.202.159, service: paylock.service, path: /opt/paylock/backend/)
- **Frontend**: React Native (Expo) admin + client apps
- **Web Portal**: Vanilla JS served from /backend/static/portal/
- **Database**: MongoDB Atlas

## Key DB Collections
- `loans`: Single source of truth for all active and historical loan data
- `paid_loans`: Archived fully-paid loans
- `clients`: Client profile info
- `payments`: Payment transaction log

## Credentials
- Super Admin: karli1987 / nasvakas123
- VPS: karliv @ 37.148.202.159 / Nasvakas123!

## What's Been Implemented
- [2026-03-25] User Management pagination: 10 users per page with prev/next controls
- [2026-03-25] Contact form rate limiting: max 3 per IP/email per 5 minutes (HTTP 429)
- [2026-03-25] Welcome email with admin app download link sent after successful registration
- [2026-03-20] Fixed critical SyntaxError in reports.py
- [2026-03-20] Unified all 3 financial endpoints to use shared _calc_interest_data
- [2026-03-20] Fixed completed_loans count to use paid_loans + archived loans
- [2026-03-20] Fixed demo->paid plan change: subscription_status, renewal_date, role elevation
- [2026-03-20] Improved Stripe Connect error messaging

## Pending Issues
- P0: Build new Admin and Client APKs (EAS builds)
- P1: Admin app missing Delete Loan / Share Contract UI buttons
- P1: UI refresh after partial payment (web portal + admin app)
- P1: Background heartbeat service testing on real device
- P2: Stripe Connect requires platform-profile config in Stripe Dashboard

## Future Tasks
- Subscription auto-renewal logic
- Superadmin UI for Stripe Connect platform fee configuration
