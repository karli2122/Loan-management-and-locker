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
      package: IS_ADMIN_APP ? "com.emi.admin" : "com.emi.client"
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
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      appMode: IS_ADMIN_APP ? "admin" : "client",
      eas: {
        projectId: "your-project-id"
      }
    }
  }
};
