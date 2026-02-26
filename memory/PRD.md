# PayLock Pro - Product Requirements Document

## Problem Statement
PayLock Pro is a loan management platform with device-locking capabilities. System: FastAPI backend + Expo React Native mobile apps + Web Admin Portal.

## Core Features
- Client/Loan management, Device Locking, Payment Tracking
- Reminders (Email/Push/WhatsApp), Reports & Analytics
- PDF Contracts (16 languages, Section 6 device security clause)
- QR + NFC Provisioning, Google Drive Backup, SaaS Entitlements
- Web Admin Portal, Bank Statement Analyzer

## Contract Languages (16)
et (Estonian), en (English), no (Norwegian), sv (Swedish), da (Danish), fi (Finnish), lv (Latvian), lt (Lithuanian), de (German), de_at (Austrian), de_ch (Swiss), cs (Czech), pl (Polish), es (Spanish), fr (French), it (Italian)

**Auto-language**: Mobile app passes current language from LanguageContext. Web portal uses language from Settings page (stored in localStorage). No manual language selector on contract generation.

## Architecture
```
backend/routes/contracts.py          - PDF generation
backend/routes/contract_translations.py - 16-language translation dictionary (NEW)
backend/static/portal/index.html     - Web portal with language settings
frontend/app/admin/client-details.tsx - Mobile app auto-passes language
```

## What's Implemented
### Session 3 (Feb 26, 2026)
- [x] Contract Section 6 (device security clauses 6.1-6.7) in all 16 languages
- [x] Auto-language: app passes current language, no manual selector
- [x] Translations in separate file (contract_translations.py)
- [x] Web portal language picker in Settings (persisted in localStorage)
- [x] All previous features: Web portal, NFC provisioning, reminder fixes, etc.

## Credentials
- Admin: username=admin, password=admin123
- Web Portal: /api/portal

## Remaining Backlog
### P0 - Lock screen bypass fix (code ready, needs APK build)
### P1 - Payment scheduling, multi-language templates, client portal
### P2 - Credit scoring, receipts, bulk import, team management, charts, Telegram, document storage, WhatsApp Business API
