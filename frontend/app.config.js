const IS_ADMIN_APP = process.env.APP_MODE === 'admin';

export default {
  expo: {
    name: IS_ADMIN_APP ? "PayLock Admin" : "PayLock Client",
    slug: IS_ADMIN_APP ? "loans" : "client",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: IS_ADMIN_APP ? "paylockadmin" : "paylockclient",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-image.png",
      resizeMode: "contain",
      backgroundColor: "#0B1527"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_ADMIN_APP ? "com.paylock.admin" : "com.paylock.client"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#0B1527"
      },
      package: IS_ADMIN_APP ? "com.paylock.admin" : "com.paylock.client",
      versionCode: 1,
      navigationBarColor: "#152035",
      navigationBarStyle: "dark",
      // Permissions: Admin app needs basic location/network, 
      // Client app needs elevated permissions for Device Admin protection
      permissions: IS_ADMIN_APP 
        ? [
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "INTERNET",
            "ACCESS_NETWORK_STATE"
          ]
        : [
            // Basic permissions
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "ACCESS_BACKGROUND_LOCATION",  // Background location tracking (Always On)
            "FOREGROUND_SERVICE",           // Required for background location
            "FOREGROUND_SERVICE_LOCATION",  // Android 14+ foreground service type
            "INTERNET",
            "ACCESS_NETWORK_STATE",
            // Device Admin and security permissions (required for EMI protection)
            "BIND_DEVICE_ADMIN",          // Device Admin management
            "RECEIVE_BOOT_COMPLETED",     // Auto-start on device boot
            "SYSTEM_ALERT_WINDOW",        // Lock screen overlay
            "WAKE_LOCK",                  // Prevent device sleep during lock
            // Call management and DND
            "CALL_PHONE",                 // Emergency calls from lock screen
            "READ_PHONE_STATE",           // Detect call state changes
            "ANSWER_PHONE_CALLS",         // End/reject incoming calls
            "ACCESS_NOTIFICATION_POLICY",  // DND mode control
            "MODIFY_AUDIO_SETTINGS"        // Mute ringer
          ]
    },
    web: {
      bundler: "metro",
      output: "single",
      favicon: "./assets/images/favicon.png",
      // Avoid caching 404s via service workers
      registerServiceWorker: false
    },
    plugins: [
      "expo-router",
      "@react-native-community/datetimepicker",
      "expo-font",
      "expo-web-browser",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "PayLock needs your location to verify device compliance.",
          locationAlwaysPermission: "PayLock needs background location access for device tracking.",
          locationWhenInUsePermission: "PayLock needs your location to verify device compliance.",
          isAndroidBackgroundLocationEnabled: !IS_ADMIN_APP,
          isAndroidForegroundServiceEnabled: !IS_ADMIN_APP,
        }
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-image.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0B1527"
        }
      ],
      // emi-device-admin auto-links via expo-module.config.json (no plugin entry needed)
    ],
    experiments: {
      typedRoutes: true
    },
    updates: {
      url: `https://u.expo.dev/${IS_ADMIN_APP ? "7be3aec1-6fef-4200-9987-5868c4320a07" : "0cb46d92-e754-4a76-a24b-c69c70ccd850"}`,
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    extra: {
      appMode: IS_ADMIN_APP ? "admin" : "client",
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || "",
      eas: {
        projectId: IS_ADMIN_APP
          ? "7be3aec1-6fef-4200-9987-5868c4320a07"
          : "0cb46d92-e754-4a76-a24b-c69c70ccd850",
        cli: {
          appVersionSource: "remote"
        }
      }
    }
  }
};
