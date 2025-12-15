const IS_ADMIN_APP = process.env.APP_MODE === 'admin';

export default {
  expo: {
    name: IS_ADMIN_APP ? "EMI Admin" : "EMI Client",
    slug: "loans",  // Fixed slug for EAS project consistency
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: IS_ADMIN_APP ? "emiadmin" : "emiclient",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-image.png",
      resizeMode: "contain",
      backgroundColor: "#0F172A"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_ADMIN_APP ? "com.emi.admin" : "com.emi.client"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#0F172A"
      },
      package: IS_ADMIN_APP ? "com.emi.admin" : "com.emi.client",
      versionCode: 1,
      // Permissions: Admin app needs basic location/network, 
      // Client app needs elevated permissions for Device Owner protection
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
            "INTERNET",
            "ACCESS_NETWORK_STATE",
            // Device Owner and security permissions (required for EMI protection)
            "BIND_DEVICE_ADMIN",          // Device Owner management
            "RECEIVE_BOOT_COMPLETED",     // Auto-start on device boot
            "SYSTEM_ALERT_WINDOW",        // Lock screen overlay
            "DISABLE_KEYGUARD",           // Control lock screen
            "WAKE_LOCK"                   // Prevent device sleep during lock
          ]
    },
    web: {
      bundler: "metro",
      output: "server",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-image.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0F172A"
        }
      ],
      // Device Owner and Device Admin plugins for Client app only
      ...(IS_ADMIN_APP ? [] : ["./plugins/withDeviceOwner", "./plugins/withDeviceAdmin"])
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      appMode: IS_ADMIN_APP ? "admin" : "client",
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || "https://deviceloan-1.preview.emergentagent.com/api",
      eas: {
        projectId:"7be3aec1-6fef-4200-9987-5868c4320a07",
        cli: {
          appVersionSource: "remote"
        }
      }
    }
  }
};
