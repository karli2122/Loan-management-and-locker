# Quick Start: Building APKs

This guide helps you quickly build production-ready APKs for the EMI Phone Lock System.

## Prerequisites (First Time Only)

1. **Install EAS CLI**:
   ```bash
   npm install -g eas-cli
   ```

2. **Login to Expo**:
   ```bash
   eas login
   ```
   - Create account at https://expo.dev/signup if needed

3. **Initialize Project** (if not done already):
   ```bash
   cd frontend
   eas init
   ```
   - This creates an Expo project and links it to your account
   - Updates `app.config.js` with your project ID

## Building APKs

### Method 1: Using the Build Script (Recommended)

The easiest way to build APKs:

```bash
# Run the interactive build script
./build.sh

# Or specify directly:
./build.sh preview admin      # Admin preview APK
./build.sh production client  # Client production APK
./build.sh preview all        # Both preview APKs
```

### Method 2: Manual EAS Commands

#### Build Admin App
```bash
cd frontend

# Preview build (for testing)
APP_MODE=admin eas build --profile admin-preview --platform android

# Production build
APP_MODE=admin eas build --profile admin-production --platform android
```

#### Build Client App
```bash
cd frontend

# Preview build (for testing)
APP_MODE=client eas build --profile client-preview --platform android

# Production build
APP_MODE=client eas build --profile client-production --platform android
```

### Method 3: Local Builds (Faster, requires Android SDK)

```bash
# Use the provided local build script
./build-apks.sh
```

**Note**: Local builds require Android SDK setup (~15GB). See `DEPLOYMENT.md` for details.

## Downloading Your APKs

After the build completes:

1. **Via Web**: 
   - Visit: https://expo.dev
   - Go to your project
   - Click "Builds"
   - Download APK

2. **Via CLI**:
   ```bash
   eas build:list
   # Copy the build ID
   eas build:download [BUILD_ID]
   ```

## Testing Your APKs

1. **Transfer to Device**:
   ```bash
   adb install emi-admin-v1.0.0.apk
   # or
   adb install emi-client-v1.0.0.apk
   ```

2. **Test Admin App**:
   - Login with credentials
   - Verify all features work
   - Test location tracking
   - Test lock/unlock commands

3. **Test Client App**:
   - Register device
   - Setup Device Owner mode (see `DEVICE_OWNER_SETUP.md`)
   - Test receiving lock commands
   - Verify uninstall protection

## Common Build Commands

```bash
# Check build status
eas build:list

# View specific build logs
eas build:view [BUILD_ID]

# Cancel a running build
eas build:cancel

# Configure credentials
eas credentials

# Check EAS account
eas whoami
```

## Version Management

Before each new build, update version in `frontend/app.config.js`:

```javascript
export default {
  expo: {
    version: "1.0.1",     // Increment this
    android: {
      versionCode: 2,     // Must increase each release
      // ...
    }
  }
}
```

## Troubleshooting

### "Not logged in" Error
```bash
eas login
```

### "Project ID not found"
```bash
cd frontend
eas init
```

### Build Fails
```bash
# View detailed logs
eas build:view [BUILD_ID]

# Check build configuration
eas build:configure
```

### Credentials Issues
```bash
# Manage credentials
eas credentials

# Reset credentials (careful!)
eas credentials --platform android
```

## Next Steps

- Read `DEPLOYMENT.md` for complete deployment guide
- Check `RELEASE_CHECKLIST.md` before production release
- Review `DEVICE_OWNER_SETUP.md` for Client app setup

## Support

- EAS Build docs: https://docs.expo.dev/build/introduction/
- Expo forums: https://forums.expo.dev/
- Project issues: https://github.com/[your-repo]/issues
