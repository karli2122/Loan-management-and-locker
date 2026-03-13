import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, LogBox } from 'react-native';
import * as Notifications from 'expo-notifications';
import { LanguageProvider } from '../src/context/LanguageContext';
import { CurrencyProvider } from '../src/context/CurrencyContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { initializeDiagnostics } from '../src/utils/diagnostics';
import { initializeNotifications } from '../src/services/BackgroundNotificationService';

// Set foreground notification handler at module level (runs before any component mounts)
// This ensures notifications display correctly app-wide (admin + client sections)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Setting a timer for a long period',
  'Possible Unhandled Promise Rejection',
]);

function ThemedLayout() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Slot />
      </View>
    </>
  );
}

export default function RootLayout() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    initializeDiagnostics();
    // Register background notification task at app root so it's available
    // even when the OS wakes the JS runtime for a background push
    initializeNotifications().catch(e =>
      console.log('[RootLayout] Notification init:', e)
    );
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <CurrencyProvider>
          <ThemeProvider>
            <ThemedLayout />
          </ThemeProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
