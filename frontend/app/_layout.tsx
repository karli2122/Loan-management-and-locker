import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, LogBox } from 'react-native';
import { LanguageProvider } from '../src/context/LanguageContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { initializeDiagnostics } from '../src/utils/diagnostics';

// Suppress non-critical warnings that can cause crashes in production
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
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <ThemedLayout />
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
