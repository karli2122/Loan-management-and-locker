# EMI Phone Lock System

A comprehensive loan management system with device locking capabilities, designed for EMI (Equated Monthly Installment) providers.

## Overview

This system consists of two mobile applications:

1. **Admin App** (`com.emi.admin`) - For EMI company administrators
2. **Client App** (`com.emi.client`) - For customers with EMI devices

## Key Features

### Admin App
- Client management dashboard
- Device registration and tracking
- Remote lock/unlock controls
- Real-time GPS location monitoring
- Warning message dispatch
- EMI status tracking

### Client App
- Device registration flow
- EMI payment status display
- Lock screen enforcement
- Location sharing
- Warning notifications
- Device Owner protection (uninstall & factory reset protection)
- Boot protection

## Documentation

### Getting Started
- **[Quick Start Guide](QUICK_START.md)** - Start building APKs in minutes
- **[Deployment Guide](DEPLOYMENT.md)** - Complete APK deployment documentation
- **[Release Checklist](RELEASE_CHECKLIST.md)** - Pre-release verification steps

### API Documentation
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API endpoint reference
- **[API Quick Reference](API_QUICK_REFERENCE.md)** - Quick API setup and common endpoints

### Technical Guides
- **[Build Instructions](frontend/BUILD_INSTRUCTIONS.md)** - Detailed build process
- **[Device Owner Setup](frontend/DEVICE_OWNER_SETUP.md)** - Client app protection setup
- **[Changelog](CHANGELOG.md)** - Version history and changes

## Quick Start

### Building APKs

```bash
# Install EAS CLI (first time only)
npm install -g eas-cli

# Login to Expo
eas login

# Build using the provided script
./build.sh

# Or build manually
cd frontend
APP_MODE=admin eas build --profile admin-preview --platform android
APP_MODE=client eas build --profile client-preview --platform android
```

See [QUICK_START.md](QUICK_START.md) for detailed instructions.

## Project Structure

```
.
├── frontend/           # React Native Expo app
│   ├── src/           # Source code
│   ├── android/       # Android native code
│   ├── assets/        # Images and resources
│   ├── plugins/       # Expo config plugins
│   └── app.config.js  # App configuration
├── backend/           # Python backend API
│   └── server.py      # Flask API server
├── build.sh           # APK build script
├── build-apks.sh      # Local build script
└── DEPLOYMENT.md      # Deployment documentation
```

## Technology Stack

- **Frontend**: React Native with Expo
- **Backend**: Python with Flask
- **Build System**: EAS Build (Expo Application Services)
- **Platform**: Android (minimum API 26 / Android 8.0)

## Requirements

- Node.js 18+
- npm or yarn
- EAS CLI
- Android device for testing
- Expo account (free tier works)

## Development

### Frontend Development
```bash
cd frontend
npm install

# Start development server
npm start

# Run on Android
npm run android
```

### Backend Development
```bash
cd backend
pip install -r requirements.txt

# Start server
python server.py
```

## Configuration

### Backend API Setup

The frontend apps communicate with a backend API. Configure the API URL:

1. **Copy environment template:**
   ```bash
   cp frontend/.env.template frontend/.env.local
   ```

2. **Update backend URL in `.env.local`:**
   ```bash
   EXPO_PUBLIC_BACKEND_URL=https://your-backend-url.com/api
   ```

3. **Default URL (if not configured):**
   ```
   https://apkdebug.preview.emergentagent.com
   ```

For production builds, use EAS Secrets:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_BACKEND_URL --value "https://your-api.com/api"
```

### App Configuration

Configure app settings in `frontend/app.config.js`:
- App names and package identifiers
- Permissions
- Icons and splash screens
- EAS project IDs

## Security

- All API communication uses HTTPS
- Admin authentication required
- Device Owner mode for client app protection
- Tamper detection service
- Secure credential management

**Important**: Never commit sensitive files (`.env`, `*.keystore`, `credentials.json`) to version control.

## Support

For issues, questions, or contributions:
- Check existing documentation
- Review [Troubleshooting](DEPLOYMENT.md#troubleshooting)
- Open an issue on GitHub

## License

[Add your license here]

## Authors

[Add author information here]

