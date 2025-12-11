# APK Deployment Guide

This guide covers the complete process for building, signing, and deploying production-ready APKs for the EMI Phone Lock System.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [EAS Project Setup](#eas-project-setup)
3. [Building APKs](#building-apks)
4. [App Signing](#app-signing)
5. [Local vs Cloud Builds](#local-vs-cloud-builds)
6. [Production Checklist](#production-checklist)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

1. **Node.js** (v18 or later)
   ```bash
   node --version
   ```

2. **EAS CLI** (Expo Application Services)
   ```bash
   npm install -g eas-cli
   eas --version
   ```

3. **Expo Account**
   - Create account at: https://expo.dev/signup
   - Login via CLI:
   ```bash
   eas login
   ```

4. **For Local Builds** (optional):
   - Android SDK and tools
   - Java Development Kit (JDK 17+)
   - See `build-apks.sh` for environment setup

---

## EAS Project Setup

### 1. Initialize EAS Project (First Time Only)

```bash
cd frontend
eas init
```

This will:
- Create an Expo project ID
- Update your `app.config.js` with the project ID
- Link your local project to EAS

### 2. Configure Build Profiles

The project includes pre-configured build profiles in `eas.json`:

- **Admin App Profiles**:
  - `admin-development`: Development build with debug features
  - `admin-preview`: Internal testing build (APK)
  - `admin-production`: Production release build (APK)

- **Client App Profiles**:
  - `client-development`: Development build with debug features
  - `client-preview`: Internal testing build (APK)
  - `client-production`: Production release build (APK)

---

## Building APKs

### Cloud Builds (Recommended for Production)

#### Build Admin APK
```bash
cd frontend

# Preview build (for testing)
APP_MODE=admin eas build --profile admin-preview --platform android

# Production build
APP_MODE=admin eas build --profile admin-production --platform android
```

#### Build Client APK
```bash
cd frontend

# Preview build (for testing)
APP_MODE=client eas build --profile client-preview --platform android

# Production build
APP_MODE=client eas build --profile client-production --platform android
```

**Note**: Cloud builds are queued on Expo's servers. Build time: 15-30 minutes.

### Local Builds (Faster, but requires Android SDK)

Use the provided script for local builds:

```bash
# From project root
./build-apks.sh
```

Or manually:

```bash
cd frontend

# Admin APK
APP_MODE=admin eas build --profile admin-preview --platform android --local

# Client APK
APP_MODE=client eas build --profile client-preview --platform android --local
```

---

## App Signing

### Development/Internal Testing

For development and internal testing, EAS automatically generates and manages signing credentials.

### Production Release

For production releases, you have two options:

#### Option 1: EAS Managed Credentials (Recommended)

EAS will automatically create and securely store your app signing keys.

```bash
# First production build will prompt for credential setup
APP_MODE=admin eas build --profile admin-production --platform android
```

#### Option 2: Provide Your Own Keystore

1. **Generate a keystore**:
   ```bash
   keytool -genkeypair -v -keystore my-release-key.keystore \
     -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```

2. **Configure in `eas.json`**:
   ```json
   {
     "build": {
       "admin-production": {
         "android": {
           "buildType": "apk",
           "credentialsSource": "local"
         }
       }
     }
   }
   ```

3. **Create `credentials.json`** (add to `.gitignore`):
   ```json
   {
     "android": {
       "keystore": {
         "keystorePath": "path/to/my-release-key.keystore",
         "keystorePassword": "YOUR_KEYSTORE_PASSWORD",
         "keyAlias": "my-key-alias",
         "keyPassword": "YOUR_KEY_PASSWORD"
       }
     }
   }
   ```

**IMPORTANT**: Never commit keystores or credentials to version control!

---

## Local vs Cloud Builds

### Cloud Builds
**Pros**:
- No local Android SDK setup required
- Consistent build environment
- Managed credentials
- Build logs stored online

**Cons**:
- Requires internet connection
- Build queue wait time
- May require paid Expo subscription for faster builds

### Local Builds
**Pros**:
- Faster build times (no queue)
- Works offline
- Full control over build environment

**Cons**:
- Requires Android SDK setup (~15GB)
- Requires Java JDK
- Manual credential management
- Platform-specific setup (see `build-apks.sh`)

---

## Production Checklist

Before building production APKs:

### 1. Configuration Review

- [ ] Update version in `app.config.js` (both version string and versionCode)
- [ ] Verify package names: `com.emi.admin` and `com.emi.client`
- [ ] Set correct backend API URL in environment
- [ ] Review all permissions in `app.config.js`
- [ ] Test both Admin and Client apps thoroughly

### 2. Backend Configuration

- [ ] Ensure backend is deployed and accessible
- [ ] Update `EXPO_PUBLIC_BACKEND_URL` if needed
- [ ] Test API connectivity from both apps

### 3. Assets Verification

- [ ] App icons are correct (512x512 PNG)
- [ ] Splash screen configured
- [ ] Adaptive icons for Android (foreground + background)

### 4. Build & Test

- [ ] Build preview APKs
- [ ] Install on real devices (not emulator)
- [ ] Test all critical features
- [ ] Test Device Owner setup for Client app (see DEVICE_OWNER_SETUP.md)
- [ ] Verify location tracking works
- [ ] Test lock/unlock functionality

### 5. Production Build

- [ ] Build production APKs with production profile
- [ ] Sign APKs with proper credentials
- [ ] Test signed APKs on multiple devices
- [ ] Document version number and release notes

### 6. Distribution

- [ ] Upload APKs to secure distribution location
- [ ] Update deployment documentation
- [ ] Notify stakeholders
- [ ] Prepare Device Owner setup guide for field technicians

---

## Troubleshooting

### "projectId not found" Error

If you haven't initialized EAS yet:
```bash
cd frontend
eas init
```

### Build Fails with "credentials not configured"

For first production build:
```bash
eas credentials
```
Follow prompts to generate or upload credentials.

### Local Build Fails

Ensure Android SDK is properly configured:
```bash
echo $ANDROID_HOME
# Should output: /path/to/android-sdk

# Verify SDK tools
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --list
```

### APK Install Fails on Device

- Check that USB debugging is enabled
- Verify package name doesn't conflict with existing apps
- For Client app, ensure Device Owner setup is correct (see DEVICE_OWNER_SETUP.md)

### Build Takes Too Long

- Use local builds instead of cloud builds
- Or upgrade to Expo Priority plan for faster cloud builds

---

## Version Management

### Incrementing Versions

Before each release, update both version fields in `app.config.js`:

```javascript
export default {
  expo: {
    version: "1.0.1",  // User-visible version (semantic versioning)
    android: {
      versionCode: 2,  // Increment for each release (must increase)
      // ... other config
    }
  }
}
```

**Rules**:
- `version`: Semantic versioning (1.0.0, 1.0.1, 1.1.0, 2.0.0)
- `versionCode`: Integer that MUST increase with each release
- Both apps (Admin & Client) should maintain their own version numbers

---

## Security Notes

1. **Never commit sensitive files**:
   - `*.keystore`, `*.jks`
   - `credentials.json`
   - `.env` files with production secrets

2. **Keystore backup**:
   - Keep secure backups of production keystores
   - Losing the keystore means you cannot update the app

3. **Device Owner security**:
   - Client app has elevated permissions
   - Ensure proper security review before deployment

---

## Additional Resources

- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Android App Signing](https://developer.android.com/studio/publish/app-signing)
- Device Owner Setup: See `DEVICE_OWNER_SETUP.md`
- Build Instructions: See `BUILD_INSTRUCTIONS.md`

---

## Support

For build issues or deployment questions, refer to:
- Expo forums: https://forums.expo.dev/
- EAS Build documentation
- Project README.md
