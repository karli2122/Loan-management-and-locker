import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { LanguageProvider } from '../src/context/LanguageContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

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
