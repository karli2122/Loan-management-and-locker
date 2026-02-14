const IS_ADMIN_APP = process.env.APP_MODE === 'admin';

export default {
  expo: {
    name: IS_ADMIN_APP ? "Loan Admin" : "Loan Client",
    slug: IS_ADMIN_APP ? "loans" : "client",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: IS_ADMIN_APP ? "loanadmin" : "loanclient",
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
            "INTERNET",
            "ACCESS_NETWORK_STATE",
            // Device Admin and security permissions (required for EMI protection)
            "BIND_DEVICE_ADMIN",          // Device Admin management
            "RECEIVE_BOOT_COMPLETED",     // Auto-start on device boot
            "SYSTEM_ALERT_WINDOW",        // Lock screen overlay
            "WAKE_LOCK"                   // Prevent device sleep during lock
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
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-image.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#0F172A"
        }
      ],
      // emi-device-admin auto-links via expo-module.config.json (no plugin entry needed)
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      appMode: IS_ADMIN_APP ? "admin" : "client",
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL || "https://loan-admin-portal-1.preview.emergentagent.com",
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
