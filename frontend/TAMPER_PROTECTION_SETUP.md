# Android Tamper Protection Setup Guide

## What was implemented

### 1. Foreground Service (TamperDetectionService.java)
- Persistent "Device Protected" notification that cannot be swiped away
- Monitors Device Admin status every 10 seconds
- Detects if Device Admin is disabled (tamper attempt) and broadcasts event
- Uses `START_STICKY` — Android auto-restarts the service if killed
- Boot Receiver restarts the service on device boot

### 2. Accessibility Service (EMIAccessibilityService.java)
- Monitors when user opens Settings > Apps or tries to navigate to uninstall
- Detects dangerous screens: App Info, Manage Applications, Installed App Details
- Covers Samsung, MIUI, Oppo, and stock Android settings packages
- On tamper detection: sends BACK action + opens our app (blocks uninstall attempt)
- Stores tamper attempt count and timestamps for reporting

### 3. Permission Race Condition Fix (home.tsx)
- Permissions now request sequentially: Location → (500ms delay) → Notifications → Device Admin → Foreground Service → Accessibility prompt
- No more overlapping permission dialogs
- Accessibility prompt appears with OK/Later buttons; OK opens system Accessibility Settings

### 4. DevicePolicy.ts API additions
```typescript
// Foreground Service
await devicePolicy.startForegroundProtection();  // Start persistent service
await devicePolicy.stopForegroundProtection();   // Stop service

// Accessibility Service
await devicePolicy.isAccessibilityEnabled();     // Check if enabled
await devicePolicy.openAccessibilitySettings();  // Open system settings
```

## Required AndroidManifest.xml additions

Add these to your `AndroidManifest.xml` inside the `<manifest>` tag:

```xml
<!-- Foreground Service Permission -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

Add these inside the `<application>` tag:

```xml
<!-- Foreground Tamper Detection Service -->
<service
    android:name=".TamperDetectionService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="specialUse" />

<!-- Boot Receiver to restart service on device boot -->
<receiver
    android:name=".TamperDetectionService$BootReceiver"
    android:enabled="true"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="com.eamilock.RESTART_SERVICE" />
    </intent-filter>
</receiver>

<!-- Accessibility Service for tamper detection -->
<service
    android:name=".EMIAccessibilityService"
    android:label="EMI Device Protection"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

## Files Created/Modified

### New Files:
- `android/android/app/src/main/java/com/eamilock/EMIAccessibilityService.java`
- `android/android/app/src/main/res/xml/accessibility_service_config.xml`
- `android/android/app/src/main/res/values/strings.xml`

### Modified Files:
- `android/android/app/src/main/java/com/eamilock/TamperDetectionService.java` — Complete rewrite as foreground service
- `android/android/app/src/main/java/com/eamilock/DeviceAdminModule.java` — Added foreground + accessibility methods
- `src/utils/DevicePolicy.ts` — Added foreground + accessibility API wrappers
- `app/client/home.tsx` — Sequential permissions, foreground service start, accessibility prompt

## Initialization Flow (Sequential)
```
App Start
  → Check cached lock state
  → Load client data
  → Request Location permission (await)
  → 500ms delay
  → Request Notification permission (await)
  → Request Device Admin (await)
  → Start Foreground Protection Service
  → 1000ms delay
  → Check Accessibility → Prompt if not enabled → Open Settings on OK
```

## Testing Checklist
- [ ] Build APK with new manifest entries
- [ ] Verify "Device Protected" notification appears and cannot be dismissed
- [ ] Verify notification persists after app is minimized
- [ ] Kill app from recents → verify service restarts
- [ ] Reboot device → verify service starts on boot
- [ ] Try opening Settings > Apps → verify app blocks navigation
- [ ] Verify accessibility prompt appears with OK/Later buttons
- [ ] Press OK → verify accessibility settings opens
- [ ] Verify no permission dialogs overlap during registration
