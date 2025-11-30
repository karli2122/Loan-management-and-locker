import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0F172A' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="clients" />
      <Stack.Screen name="add-client" />
      <Stack.Screen name="client-details" />
      <Stack.Screen name="device-setup" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="loan-management" />
      <Stack.Screen name="loan-plans" />
      <Stack.Screen name="calculator" />
      <Stack.Screen name="reports" />
    </Stack>
  );
}
