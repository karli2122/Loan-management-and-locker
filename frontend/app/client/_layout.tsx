import React from 'react';
import { Stack } from 'expo-router';

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F172A' },
      }}
    >
      <Stack.Screen name="register" options={{ animation: 'none' }} />
      <Stack.Screen name="home" options={{ animation: 'none' }} />
      <Stack.Screen name="payment-history" />
      <Stack.Screen name="support-chat" />
    </Stack>
  );
}
