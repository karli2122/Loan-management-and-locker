import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

interface Schedule {
  id: string;
  client_id: string;
  client_name: string;
  amount: number;
  frequency: string;
  day_of_month: number;
  is_active: boolean;
  next_due_date: string;
  auto_reminder: boolean;
  total_scheduled: number;
  total_paid: number;
}

export default function SchedulesPage() {
  return (
    <EnterpriseGate featureName="Payment Schedules" requiredPlan="business" featureKey="reminders">
      <SchedulesContent />
    </EnterpriseGate>
  );
}

function SchedulesContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedules = async () => {
    try {
      const token = await getSecureItem('admin_token');
      const res = await fetch(`${API_URL}/api/schedules?admin_token=${token}`);
      const data = await res.json();
      if (Array.isArray(data)) setSchedules(data);
      else if (data.schedules) setSchedules(data.schedules);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchedules(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchSchedules(); setRefreshing(false); }, []);

  const toggleSchedule = async (id: string, active: boolean) => {
    const token = await getSecureItem('admin_token');
    await fetch(`${API_URL}/api/schedules/${id}/toggle?admin_token=${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    fetchSchedules();
  };

  const deleteSchedule = async (id: string) => {
    Alert.alert('Delete Schedule', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const token = await getSecureItem('admin_token');
          await fetch(`${API_URL}/api/schedules/${id}?admin_token=${token}`, { method: 'DELETE' });
          fetchSchedules();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="schedules-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="schedules-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Payment Schedules</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          {schedules.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar" size={48} color="#64748B" />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No payment schedules</Text>
              <Text style={[styles.emptySubtext, { color: '#64748B' }]}>Create schedules from client details</Text>
            </View>
          ) : (
            schedules.map(s => (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.card }]} data-testid={`schedule-${s.id}`}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clientName, { color: colors.text }]}>{s.client_name}</Text>
                    <Text style={styles.amount}>${s.amount.toFixed(2)} / {s.frequency}</Text>
                  </View>
                  <Switch
                    value={s.is_active}
                    onValueChange={() => toggleSchedule(s.id, s.is_active)}
                    trackColor={{ false: '#334155', true: '#1D4ED8' }}
                    thumbColor={s.is_active ? '#2563EB' : '#64748B'}
                  />
                </View>
                <View style={styles.cardDetails}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#64748B" />
                    <Text style={styles.detailText}>Day {s.day_of_month}</Text>
                  </View>
                  {s.next_due_date && (
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={14} color="#64748B" />
                      <Text style={styles.detailText}>Next: {new Date(s.next_due_date).toLocaleDateString()}</Text>
                    </View>
                  )}
                  <View style={styles.detailItem}>
                    <Ionicons name={s.auto_reminder ? 'notifications' : 'notifications-off'} size={14} color={s.auto_reminder ? '#10B981' : '#64748B'} />
                    <Text style={styles.detailText}>{s.auto_reminder ? 'Auto remind' : 'Manual'}</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => deleteSchedule(s.id)} data-testid={`delete-schedule-${s.id}`}>
                    <Ionicons name="trash" size={16} color="#EF4444" />
                    <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  title: { fontSize: 18, fontWeight: '700' },
  card: { padding: 14, borderRadius: 12, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  clientName: { fontSize: 15, fontWeight: '600' },
  amount: { fontSize: 13, color: '#2563EB', fontWeight: '600', marginTop: 2 },
  cardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 12, color: '#64748B' },
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '500' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySubtext: { fontSize: 13, marginTop: 4 },
});
