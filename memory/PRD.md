# Loan Management & Phone Lock - PRD

## Original Problem Statement
A loan management application with phone locking capabilities. The system consists of:
- **Admin App**: For loan administrators to manage clients, loans, payments, and remotely lock/unlock devices
- **Client App**: Installed on borrower devices, enables Device Admin for payment enforcement (lock on overdue)
- **Backend**: FastAPI + MongoDB API serving both apps

The codebase is sourced from: `https://github.com/karli2122/Loan-management-and-locker.git`

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) on port 8001
- **Frontend**: Expo/React Native (`/app/frontend/`) — builds separate Admin and Client APKs via `APP_MODE` env variable
- **Database**: MongoDB (`emi_lock_db`)
- **Native Module**: `emi-device-admin` (Kotlin Expo module for Android Device Admin)

## Key Features
1. Admin authentication with token-based auth (Argon2id password hashing)
2. Client CRUD with admin scoping (data segregation)
3. Loan management (setup, EMI calculation, payments)
4. Device lock/unlock control
5. Device Admin mode (prevent uninstall, auto-lock on overdue payments)
6. Payment reminders via Expo push notifications
7. Tamper detection and reporting
8. Loan plans management

## What's Been Implemented
- Full backend API with all CRUD endpoints
- Admin/Client app differentiation via `APP_MODE`
- Device Admin native module (`modules/emi-device-admin`)
- Report admin status endpoint (`POST /api/device/report-admin-status`)
- EMI calculator with multiple methods (simple, reducing balance, flat rate)
- Late fee calculation and auto-lock for overdue payments

## Completed Tasks (Feb 13, 2026)
- **Fixed EAS build failure**: Removed invalid `publishing` block from `modules/emi-device-admin/android/build.gradle` (line 15) that required missing `maven-publish` plugin
- **Verified admin mode enabling flow**: Backend endpoint, client-side Device Admin request, and admin panel status display all working correctly
- **Confirmed module auto-links** via `expo-module.config.json` (no plugin entry needed in `app.config.js`)

## Known Issues
- User's installed APK may be stale — must rebuild with `--clear-cache` after code changes
- `plugins/withDeviceAdmin.js` exists but is redundant with the Expo module approach (potential cleanup)
- Duplicate `DevicePolicy.ts` files at `src/utils/` and `src/src/utils/`

## Build Commands
- Admin APK: `APP_MODE=admin eas build --profile admin-production --platform android --clear-cache`
- Client APK: `eas build --profile client-production --platform android --clear-cache`

## Credentials
- Admin: `karli1987` / `nasvakas123`
