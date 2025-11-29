# EMI Phone Lock System - Build Instructions

## Two Separate APKs

This project produces two separate APKs:

### 1. EMI Admin App (`com.emi.admin`)
- For EMI company administrators
- Features: Manage clients, lock/unlock devices, send warnings, track locations
- Login: karli1987 / nasvakas123

### 2. EMI Client App (`com.emi.client`)
- For customers with EMI devices
- Features: Register device, view EMI status, receive lock/warning notifications

---

## Building APKs

### Prerequisites
1. Install EAS CLI: `npm install -g eas-cli`
2. Login to Expo: `eas login`

### Build Admin APK
```bash
cd frontend

# Development build (for testing)
APP_MODE=admin eas build --profile admin-preview --platform android

# Production build
APP_MODE=admin eas build --profile admin-production --platform android
```

### Build Client APK
```bash
cd frontend

# Development build (for testing)
APP_MODE=client eas build --profile client-preview --platform android

# Production build
APP_MODE=client eas build --profile client-production --platform android
```

---

## Local Development

### Run as Combined App (both modes)
```bash
cd frontend
npx expo start
```

### Run as Admin App Only
```bash
cd frontend
APP_MODE=admin npx expo start
```

### Run as Client App Only
```bash
cd frontend
APP_MODE=client npx expo start
```

---

## App Configuration

### Admin App
- Package: `com.emi.admin`
- Name: "EMI Admin"
- Icon: Blue shield

### Client App
- Package: `com.emi.client`
- Name: "EMI Client"
- Icon: Green phone

---

## Languages
- Estonian (default)
- English

Users can switch languages using the EST/ENG buttons in the app.

## Currency
- Euro (€)

---

## Backend API
The backend runs at: `https://emi-phone-lock.preview.emergentagent.com/api/`

Make sure to update `EXPO_PUBLIC_BACKEND_URL` in `.env` for production deployment.
