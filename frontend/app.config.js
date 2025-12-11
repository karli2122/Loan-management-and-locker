const IS_ADMIN_APP = process.env.APP_MODE === 'admin';

export default {
  expo: {
    name: IS_ADMIN_APP ? "EMI Admin" : "EMI Client",
    slug: IS_ADMIN_APP ? "emi-admin" : "emi-client",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: IS_ADMIN_APP ? "emiadmin" : "emiclient",
    userInterfaceStyle: "dark",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
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
      permissions: IS_ADMIN_APP 
        ? [
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "INTERNET",
            "ACCESS_NETWORK_STATE"
          ]
        : [
            "ACCESS_FINE_LOCATION",
            "ACCESS_COARSE_LOCATION",
            "INTERNET",
            "ACCESS_NETWORK_STATE",
            "BIND_DEVICE_ADMIN",
            "RECEIVE_BOOT_COMPLETED",
            "SYSTEM_ALERT_WINDOW",
            "DISABLE_KEYGUARD",
            "WAKE_LOCK"
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
          image: "./assets/images/splash-icon.png",
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
      appMode: IS_ADMIN_APP ? "admin" : "client"
      // Note: Add your EAS projectId here when ready to use EAS Build cloud services
      // eas: {
      //   projectId: "your-eas-project-id"
      // }
    }
  }
};
