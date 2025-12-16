# EMI Loan Management System - Source Code

## 📱 Project Overview

A comprehensive loan management system with device locking capabilities for EMI (Equated Monthly Installment) financing.

**Two Separate Apps:**
1. **Admin App** - Web-based loan management dashboard
2. **Client App** - Android app with device locking for borrowers

---

## 🏗️ Architecture

### Tech Stack

**Backend:**
- FastAPI (Python)
- MongoDB
- Port: 8001

**Frontend:**
- Expo (React Native)
- TypeScript
- Expo Router (File-based routing)
- Port: 3000

**Database:**
- MongoDB (Local: mongodb://localhost:27017)
- Production: MongoDB Atlas ready

---

## 📂 Project Structure

```
/app
├── backend/
│   ├── .env                      # Environment variables
│   ├── server.py                 # Main FastAPI application (1600+ lines)
│   └── requirements.txt          # Python dependencies
│
└── frontend/
    ├── .env                      # Expo environment variables
    ├── app.config.js            # App configuration (admin/client mode)
    ├── eas.json                 # Build profiles
    ├── package.json             # Dependencies
    │
    ├── app/
    │   ├── _layout.tsx          # Root layout
    │   ├── index.tsx            # Entry point
    │   │
    │   ├── admin/               # Admin App
    │   │   ├── (tabs)/          # Tab navigation
    │   │   │   ├── _layout.tsx  # Tab bar configuration
    │   │   │   ├── index.tsx    # Dashboard tab
    │   │   │   ├── loans.tsx    # Loans tab
    │   │   │   ├── transactions.tsx  # Transactions tab
    │   │   │   └── features.tsx # Features menu tab
    │   │   │
    │   │   ├── login.tsx
    │   │   ├── clients.tsx
    │   │   ├── client-details.tsx
    │   │   ├── loan-management.tsx
    │   │   ├── loan-plans.tsx
    │   │   ├── calculator.tsx
    │   │   ├── reports.tsx
    │   │   ├── device-management.tsx
    │   │   ├── device-setup.tsx
    │   │   └── settings.tsx
    │   │
    │   └── client/              # Client App
    │       ├── home.tsx
    │       └── register.tsx
    │
    ├── plugins/                 # Expo Config Plugins
    │   ├── withDeviceAdmin.js   # Android Device Admin
    │   └── withDeviceOwner.js   # Android Device Owner
    │
    └── src/
        ├── components/
        │   └── DeviceAdmin.ts
        ├── context/
        │   └── LanguageContext.tsx
        ├── services/
        │   └── OfflineSyncManager.ts
        └── utils/
            └── DevicePolicy.ts
```

---

## 🔑 Key Features

### Admin App
- ✅ Bottom tab navigation (Dashboard, Loans, Transactions, Features)
- ✅ Role-based access control (Admin/User)
- ✅ Client management with search
- ✅ Loan management & EMI tracking
- ✅ Payment recording & history
- ✅ Reports & Analytics dashboard with charts
- ✅ Device locking/unlocking controls
- ✅ Late fee automation
- ✅ Payment reminders
- ✅ Bilingual support (Estonian/English)

### Client App
- ✅ Device registration
- ✅ Device locking enforcement (Kiosk mode)
- ✅ Offline sync capability
- ✅ Anti-tamper protection
- ✅ Uninstall protection
- ✅ Device Owner & Device Admin modes
- ✅ Automatic permission prompts

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.9+
- MongoDB
- Expo CLI

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB connection

# Run server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env with backend URL

# Start Expo
expo start
```

---

## 🏭 Building APKs

### Admin APK
```bash
cd frontend
eas build --profile admin-preview --platform android
```

### Client APK
```bash
cd frontend
eas build --profile client-preview --platform android
```

### Build Profiles Available

**Admin:**
- `admin-development` - Dev build
- `admin-preview` - Internal distribution
- `admin-production` - Production build

**Client:**
- `client-development` - Dev build
- `client-preview` - Internal distribution
- `client-production` - Production build

---

## 📡 API Endpoints (46 Total)

### Authentication (6)
- POST `/api/admin/register` - Create user
- POST `/api/admin/login` - Login
- GET `/api/admin/verify/{token}` - Verify token
- GET `/api/admin/list` - List users
- POST `/api/admin/change-password` - Change password
- DELETE `/api/admin/{admin_id}` - Delete user

### Client Management (8)
- POST `/api/clients` - Create client
- GET `/api/clients` - List clients (paginated)
- GET `/api/clients/{id}` - Get client
- PUT `/api/clients/{id}` - Update client
- DELETE `/api/clients/{id}` - Delete client
- POST `/api/clients/{id}/allow-uninstall` - Allow uninstall
- POST `/api/clients/{id}/fetch-price` - Fetch device price
- GET `/api/stats` - Dashboard stats

### Device Control (10)
- POST `/api/clients/{id}/lock` - Lock device
- POST `/api/clients/{id}/unlock` - Unlock device
- POST `/api/clients/{id}/warning` - Send warning
- POST `/api/device/register` - Register device
- GET `/api/device/status/{id}` - Device status
- POST `/api/device/location` - Update location
- POST `/api/device/clear-warning/{id}` - Clear warning
- POST `/api/clients/{id}/report-tamper` - Report tamper
- POST `/api/clients/{id}/report-reboot` - Report reboot

### Loan Management (11)
- POST `/api/loans/{id}/setup` - Setup loan
- POST `/api/loans/{id}/payments` - Record payment
- GET `/api/loans/{id}/payments` - Payment history
- GET `/api/loans/{id}/schedule` - Payment schedule
- PUT `/api/loans/{id}/settings` - Update settings
- GET `/api/clients/{id}/late-fees` - Late fees
- POST `/api/late-fees/calculate-all` - Calculate fees
- GET `/api/reminders` - All reminders
- GET `/api/clients/{id}/reminders` - Client reminders
- POST `/api/reminders/create-all` - Create reminders
- POST `/api/reminders/{id}/mark-sent` - Mark sent

### Loan Plans & Calculator (6)
- POST `/api/loan-plans` - Create plan
- GET `/api/loan-plans` - List plans
- GET `/api/loan-plans/{id}` - Get plan
- PUT `/api/loan-plans/{id}` - Update plan
- DELETE `/api/loan-plans/{id}` - Delete plan
- GET `/api/calculator/compare` - Compare options
- POST `/api/calculator/amortization` - Calculate

### Reports (3)
- GET `/api/reports/collection` - Collection stats
- GET `/api/reports/clients` - Client categorization
- GET `/api/reports/financial` - Financial breakdown

### System (2)
- GET `/api/` - API info
- GET `/api/health` - Health check

---

## 👤 Default Users

**Admin (Super Admin):**
- Username: `karli1987`
- Password: `nasvakas123`
- Role: admin
- Can create/manage users

**Test User:**
- Username: `test`
- Password: `test123`
- Role: user
- Cannot manage users

---

## 🔒 Security Features

### Device Security
- Device Owner mode (high security)
- Device Admin mode (easier setup)
- Anti-tamper detection (reboot/power-off)
- Uninstall protection
- Kiosk mode enforcement

### Authentication
- Token-based authentication
- Role-based access control
- Password hashing
- Super admin protection

---

## 🌍 Deployment

### Current Setup
- API URL: `https://loantrack-23.preview.emergentagent.com`
- Backend: Port 8001
- Frontend: Port 3000
- MongoDB: Connected

### Production Deployment
1. Update MongoDB connection string
2. Update API URL in `.env`
3. Build production APKs
4. Deploy backend to cloud
5. Configure DNS/SSL

---

## 📊 Database Schema

### Collections
1. **admins** - User accounts
2. **clients** - Borrowers & devices
3. **loan_plans** - Loan templates
4. **admin_tokens** - Auth tokens

### Indexes
- Compound: `(next_payment_due, outstanding_balance)`
- Single: `loan_plan_id`, `is_locked`, `registration_code`

---

## 🧪 Testing

### Backend Tests
```bash
curl https://loantrack-23.preview.emergentagent.com/api/health
```

### Login Test
```bash
curl -X POST https://loantrack-23.preview.emergentagent.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"karli1987","password":"nasvakas123"}'
```

---

## 📦 Dependencies

### Backend (requirements.txt)
- fastapi
- uvicorn
- motor (MongoDB async)
- pydantic
- python-dotenv
- bcrypt
- httpx

### Frontend (package.json)
- expo
- expo-router
- react-native
- @react-native-async-storage/async-storage
- react-native-chart-kit
- @expo/vector-icons
- typescript

---

## 🐛 Known Issues

1. ESLint config updated (removed invalid `defineConfig`)
2. Client model `email` field made optional
3. Calculator endpoint needs loan data to return results

---

## 📝 License

Proprietary - All rights reserved

---

## 👨‍💻 Development

**Last Updated:** December 2, 2024
**Version:** 1.0.0
**Status:** Production Ready

---

## 📞 Support

For issues or questions, refer to the API documentation at:
`https://loantrack-23.preview.emergentagent.com/api/`

---

## 🎯 Next Steps

1. Build APKs using EAS
2. Test on physical Android devices
3. Configure production MongoDB Atlas
4. Deploy backend to cloud service
5. Update DNS and SSL certificates
6. Distribute APKs to users

---

**Built with ❤️ for efficient loan management**
