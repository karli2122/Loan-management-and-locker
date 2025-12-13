import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LanguageProvider } from '../src/context/LanguageContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StatusBar style="light" />
        <Slot />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
