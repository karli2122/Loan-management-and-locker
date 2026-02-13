import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { LanguageProvider } from '../src/context/LanguageContext';

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
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
          <Slot />
        </View>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
