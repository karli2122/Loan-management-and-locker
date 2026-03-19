import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0B1527' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-client" />
      <Stack.Screen name="add-loan" />
      <Stack.Screen name="client-details" />
      <Stack.Screen name="device-setup" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="loan-management" />
      <Stack.Screen name="loan-plans" />
      <Stack.Screen name="calculator" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="client-management" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="bulk-import" />
      <Stack.Screen name="schedules" />
      <Stack.Screen name="telegram" />
      <Stack.Screen name="team" />
      <Stack.Screen name="provisioning" />
      <Stack.Screen name="upgrade-plan" />
    </Stack>
  );
}
