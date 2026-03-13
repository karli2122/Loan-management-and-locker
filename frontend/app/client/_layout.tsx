import React from 'react';
import { Stack } from 'expo-router';

// Notification handler moved to app/_layout.tsx for app-wide coverage

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0B1527' },
      }}
    >
      <Stack.Screen name="register" options={{ animation: 'none' }} />
      <Stack.Screen name="home" options={{ animation: 'none' }} />
      <Stack.Screen name="payment-history" />
      <Stack.Screen name="support-chat" />
    </Stack>
  );
}
