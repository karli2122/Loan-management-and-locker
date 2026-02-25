import React from 'react';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';

// Configure how push notifications are displayed when app is in foreground
// Without this, push notifications from the server are silently swallowed
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
