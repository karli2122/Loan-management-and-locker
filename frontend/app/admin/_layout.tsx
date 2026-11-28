import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { onSessionExpired } from '../../src/utils/adminAuth';
import { installAdminLogRedaction, scrubStoredDiagnostics } from '../../src/utils/adminDiagnostics';

installAdminLogRedaction();

export default function AdminLayout() {
  const router = useRouter();

  // Central "session expired" flow: any admin request that gets a 401 lands here.
  useEffect(() => {
    scrubStoredDiagnostics();
    return onSessionExpired(() => {
      router.replace('/admin/session-expired');
    });
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0B1527' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="session-expired" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add-client" />
      <Stack.Screen name="add-loan" />
      <Stack.Screen name="client-details" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="loan-plans" />
      <Stack.Screen name="calculator" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="client-management" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="bulk-import" />
      <Stack.Screen name="team" />
      <Stack.Screen name="overdue-queue" />
      <Stack.Screen name="notifications" />
    </Stack>
  );
}
