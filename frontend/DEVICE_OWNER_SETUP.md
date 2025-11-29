# Device Owner Mode Setup Guide

## Overview

Device Owner mode provides the strongest protection for EMI devices:
- **Uninstall Protection**: App cannot be uninstalled
- **Factory Reset Protection**: App survives factory reset
- **Kiosk Mode**: When locked, device can ONLY show the lock screen
- **Boot Protection**: App starts automatically on device boot

## Important: Setup BEFORE Giving Device to Customer

Device Owner must be set up on a **factory-fresh device** or after a **factory reset**.
This should be done at your shop/office before handing the device to the customer.

---

## Setup Methods

### Method 1: ADB Setup (Recommended)

#### Prerequisites
1. Install ADB on your computer
2. Enable USB Debugging on the Android device
3. Factory reset the device (or use a new device)

#### Steps

1. **Factory Reset the Device**
   - Go to Settings > System > Reset > Factory Reset
   - Complete the reset process

2. **During Initial Setup - SKIP everything**
   - Skip Google account
   - Skip all other setup steps
   - Just tap "Skip" or "Next" until you reach home screen

3. **Enable Developer Options**
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times
   - Go back to Settings > Developer Options
   - Enable "USB Debugging"

4. **Connect to Computer and Run ADB Command**
   ```bash
   # For Client App
   adb shell dpm set-device-owner com.emi.client/.DeviceAdminReceiver
   ```

5. **Verify Device Owner**
   ```bash
   adb shell dumpsys device_policy | grep "Device Owner"
   ```

6. **Install and Open the EMI Client App**
   - The app will detect Device Owner status
   - Uninstall protection is now active

---

### Method 2: QR Code Provisioning

For bulk device setup, you can use QR code provisioning:

1. Factory reset device
2. On welcome screen, tap 6 times on the screen
3. Scan QR code with provisioning data
4. Device will automatically set up with your app as Device Owner

#### QR Code Content (JSON):
```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.emi.client/.DeviceAdminReceiver",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": "https://your-server.com/emi-client.apk",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true
}
```

---

## Features When Device Owner is Active

### 1. Uninstall Protection
The app cannot be uninstalled by the user. Even from Settings > Apps.

### 2. Kiosk Mode (Lock Task Mode)
When the device is locked for EMI:
- User can ONLY see the EMI lock screen
- Home button doesn't work
- Recent apps button doesn't work
- Cannot access settings or other apps
- Cannot turn off the device (optional)

### 3. Boot Protection
When device restarts:
- App automatically starts
- If device was locked, lock screen shows immediately

### 4. Factory Reset Protection
Even after factory reset:
- Device Owner status is preserved
- App remains installed
- Lock status is preserved

---

## Testing Device Owner

In the app, you can check Device Owner status:

```typescript
import { devicePolicy } from './utils/DevicePolicy';

// Check if Device Owner
const isOwner = await devicePolicy.isDeviceOwner();
console.log('Is Device Owner:', isOwner);

// Get full device info
const info = await devicePolicy.getDeviceInfo();
console.log('Device Info:', info);
```

---

## Removing Device Owner (For Testing)

**Warning**: Only do this for testing. In production, Device Owner should remain active.

```bash
adb shell dpm remove-active-admin com.emi.client/.DeviceAdminReceiver
```

---

## Troubleshooting

### "Not allowed to set device owner"
- Device must be factory fresh or just factory reset
- No Google account should be added
- No other Device Admin should be active

### "Device already has owner"
- Another app is Device Owner
- Factory reset required

### ADB not detecting device
- Enable USB Debugging
- Try different USB cable
- Install proper USB drivers

---

## Security Notes

1. **Keep ADB Disabled**: After setup, disable USB Debugging in Developer Options
2. **Hide Developer Options**: Some devices allow hiding Developer Options
3. **Document IMEI**: Record device IMEI before giving to customer
4. **Backup Registration Code**: Keep record of which device has which code
