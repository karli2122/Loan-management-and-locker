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

## Architecture
- **Backend**: FastAPI on port 8001 (production VPS: 37.148.202.159, service: paylock.service, path: /opt/paylock/backend/)
- **Frontend**: React Native (Expo) admin + client apps
- **Web Portal**: Vanilla JS served from /backend/static/portal/
- **Database**: MongoDB Atlas

## Key DB Collections
- `loans`: Single source of truth for all active and historical loan data
- `paid_loans`: Archived fully-paid loans
- `clients`: Client profile info (financial fields deprecated in favor of live calc from `loans`)
- `payments`: Payment transaction log

## Key API Endpoints
- `POST /api/admin/login` - Admin authentication
- `GET /api/analytics/dashboard` - Dashboard with interest_summary, monthly_profit, monthly_interest
- `GET /api/paid-loans/summary` - Archived loan summary (uses shared _calc_interest_data)
- `GET /api/reports/financial` - Financial report (uses shared _calc_interest_data)
- `GET /api/reports/collection` - Collection report with completed_loans from paid_loans/archived
- `PUT /api/admin/{admin_id}/plan` - Change user plan (sets subscription_status + renewal_date)
- `DELETE /api/loans/{loan_id}` - Delete a loan
- `GET /api/loans/{loan_id}/contract` - Generate PDF contract

## Credentials
- Super Admin: karli1987 / nasvakas123
- VPS: karliv @ 37.148.202.159 / Nasvakas123!

## What's Been Implemented
- [2026-03-20] Fixed critical SyntaxError in reports.py (broken _get_enterprise_client_query)
- [2026-03-20] Unified all 3 financial endpoints to use shared _calc_interest_data function
- [2026-03-20] Fixed timezone-naive/aware datetime comparison bugs
- [2026-03-20] Fixed completed_loans count to use paid_loans + archived loans instead of stale clients data
- [2026-03-20] Fixed demo->paid plan change: now updates subscription_status, renewal_date, and role
- [2026-03-20] Improved Stripe Connect error messaging for platform config issues
- [2026-03-20] All fixes deployed to production VPS and verified

## Pending Issues
- P0: Build new Admin and Client APKs (EAS builds)
- P1: Admin app missing Delete Loan / Share Contract UI buttons
- P1: UI refresh after partial payment (web portal + admin app)
- P1: Background heartbeat service testing on real device
- P2: Stripe Connect requires platform-profile config in Stripe Dashboard

## Future Tasks
- Subscription auto-renewal logic
- Superadmin UI for Stripe Connect platform fee configuration
