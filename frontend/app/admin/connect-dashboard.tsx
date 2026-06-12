import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

export default function ConnectDashboard() {
  const { colors } = useTheme();
  const { formatAmount } = useCurrency();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const token = await getSecureItem('admin_token');
      if (!token) return;
      const resp = await fetch(`${API_URL}/api/connect/dashboard?admin_token=${token}`);
      if (resp.ok) setData(await resp.json());
    } catch (e) {
      console.error('Dashboard error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchDashboard(); }, [fetchDashboard]));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboard(); }} />}
        contentContainerStyle={{ padding: 16 }}
      >
        <Text style={[styles.title, { color: colors.text }]}>Platform Fees Dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Stripe Connect Overview ({data?.platform_fee_percent || 0.75}% per transaction)
        </Text>

        {/* Summary Cards */}
        <View style={styles.cardRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Ionicons name="cash" size={24} color="#10B981" />
            <Text style={[styles.statValue, { color: '#10B981' }]}>{formatAmount(data?.total_fees_earned || 0)}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Fees Earned</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Ionicons name="trending-up" size={24} color="#3B82F6" />
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>{formatAmount(data?.total_volume || 0)}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Volume</Text>
          </View>
        </View>

        <View style={styles.cardRow}>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Ionicons name="receipt" size={24} color="#F59E0B" />
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{data?.total_transactions || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Transactions</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card }]}>
            <Ionicons name="people" size={24} color="#6366F1" />
            <Text style={[styles.statValue, { color: '#6366F1' }]}>{data?.connected_accounts || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Connected Accounts</Text>
          </View>
        </View>

        {data?.pending_accounts > 0 && (
          <View style={[styles.alert, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
            <Ionicons name="warning" size={16} color="#F59E0B" />
            <Text style={{ color: '#F59E0B', fontSize: 13, marginLeft: 8 }}>
              {data.pending_accounts} account{data.pending_accounts > 1 ? 's' : ''} pending onboarding
            </Text>
          </View>
        )}

        {/* Monthly Breakdown */}
        {data?.monthly_breakdown?.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Monthly Breakdown</Text>
            {data.monthly_breakdown.map((m: any, i: number) => (
              <View key={m.month} style={[styles.monthRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={[styles.monthLabel, { color: colors.text }]}>{m.month}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#10B981', fontWeight: '600', fontSize: 14 }}>{formatAmount(m.fees)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{m.count} txns | Vol: {formatAmount(m.volume)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent Transactions */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
          {data?.recent_transactions?.length > 0 ? (
            data.recent_transactions.map((tx: any) => (
              <View key={tx.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{tx.client_name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>by {tx.admin_name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{formatAmount(tx.amount)}</Text>
                  <Text style={{ color: '#10B981', fontSize: 11 }}>Fee: {formatAmount(tx.platform_fee)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="receipt-outline" size={40} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>No transactions yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 20 },
  cardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  statValue: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  alert: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 16 },
  section: { borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  monthLabel: { fontSize: 14, fontWeight: '500' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
});
