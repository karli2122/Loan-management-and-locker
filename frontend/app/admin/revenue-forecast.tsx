import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';
import { useLanguage } from '../../src/context/LanguageContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

const screenWidth = Dimensions.get('window').width;

export default function RevenueForecastScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(90);

  const fetchForecast = useCallback(async () => {
    try {
      const token = await getSecureItem('admin_token');
      if (!token) return;
      const resp = await fetch(`${API_URL}/api/forecasting/revenue?admin_token=${token}&days=${days}`);
      if (resp.ok) {
        const data = await resp.json();
        setForecast(data);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { setLoading(true); fetchForecast(); }, [fetchForecast]);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchForecast();
    }, [fetchForecast])
  );

  const formatAmount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  const dayOptions = [30, 60, 90, 180, 365];

  return (
    <EnterpriseGate featureName={t('revenueForecast')} requiredPlan="enterprise" featureKey="revenue_forecast">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} data-testid="forecast-back-btn">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('revenueForecast')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.periodPicker}>
          {dayOptions.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.periodBtn, days === d && styles.periodBtnActive]}
              onPress={() => setDays(d)}
              data-testid={`forecast-period-${d}`}
            >
              <Text style={[styles.periodText, days === d && styles.periodTextActive]}>
                {d}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchForecast(); }} tintColor="#2563EB" />}
        >
          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 60 }} size="large" />
          ) : !forecast ? (
            <View style={styles.emptyState}>
              <Ionicons name="trending-up-outline" size={48} color="#334155" />
              <Text style={styles.emptyText}>{t('noForecastData') || 'No forecast data available'}</Text>
            </View>
          ) : (
            <>
              {/* Summary Cards */}
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { borderLeftColor: '#2563EB' }]}>
                  <Text style={styles.summaryLabel}>{t('expectedCollections') || 'Expected'}</Text>
                  <Text style={[styles.summaryValue, { color: '#2563EB' }]}>
                    {formatAmount(forecast.summary?.total_expected || 0)}
                  </Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#10B981' }]}>
                  <Text style={styles.summaryLabel}>{t('likelyCollections') || 'Likely'}</Text>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                    {formatAmount(forecast.summary?.total_likely || 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { borderLeftColor: '#F59E0B' }]}>
                  <Text style={styles.summaryLabel}>{t('activeClients') || 'Active Clients'}</Text>
                  <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                    {forecast.summary?.active_clients || 0}
                  </Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#8B5CF6' }]}>
                  <Text style={styles.summaryLabel}>{t('reliability') || 'Avg Reliability'}</Text>
                  <Text style={[styles.summaryValue, { color: '#8B5CF6' }]}>
                    {forecast.summary?.avg_reliability || 0}%
                  </Text>
                </View>
              </View>

              {/* Weekly Breakdown */}
              {forecast.weekly_breakdown && forecast.weekly_breakdown.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('weeklyBreakdown') || 'Weekly Breakdown'}</Text>
                  {forecast.weekly_breakdown.map((week: any, i: number) => (
                    <View key={i} style={styles.weekCard}>
                      <View style={styles.weekHeader}>
                        <Text style={styles.weekLabel}>{week.week || `Week ${i + 1}`}</Text>
                        <Text style={styles.weekDue}>{week.due_count || 0} {t('paymentsDue') || 'payments due'}</Text>
                      </View>
                      <View style={styles.weekRow}>
                        <View style={styles.weekItem}>
                          <Text style={styles.weekItemLabel}>{t('expected') || 'Expected'}</Text>
                          <Text style={[styles.weekItemValue, { color: '#2563EB' }]}>{formatAmount(week.expected || 0)}</Text>
                        </View>
                        <View style={styles.weekDivider} />
                        <View style={styles.weekItem}>
                          <Text style={styles.weekItemLabel}>{t('likely') || 'Likely'}</Text>
                          <Text style={[styles.weekItemValue, { color: '#10B981' }]}>{formatAmount(week.likely || 0)}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Client Forecasts */}
              {forecast.client_forecasts && forecast.client_forecasts.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('clientForecasts') || 'Client Forecasts'}</Text>
                  {forecast.client_forecasts.slice(0, 10).map((cf: any, i: number) => (
                    <View key={i} style={styles.clientRow}>
                      <View style={styles.clientInfo}>
                        <Text style={styles.clientName}>{cf.name || 'Unknown'}</Text>
                        <Text style={styles.clientReliability}>
                          {t('reliability') || 'Reliability'}: {(cf.reliability || 0).toFixed(0)}%
                        </Text>
                      </View>
                      <View style={styles.clientAmounts}>
                        <Text style={styles.clientExpected}>{formatAmount(cf.expected || 0)}</Text>
                        <Text style={styles.clientLikely}>{formatAmount(cf.likely || 0)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </EnterpriseGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  periodPicker: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  periodBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#152035', borderWidth: 1, borderColor: '#1E3050' },
  periodBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  periodText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: '#fff' },
  content: { flex: 1, padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#64748B', fontSize: 14, marginTop: 12 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: '#152035', borderRadius: 12, padding: 16, borderLeftWidth: 3, borderWidth: 1, borderColor: '#1E3050' },
  summaryLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  section: { marginTop: 20 },
  sectionTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  weekCard: { backgroundColor: '#152035', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1E3050' },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  weekLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  weekDue: { color: '#64748B', fontSize: 12 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekItem: { flex: 1, alignItems: 'center' },
  weekItemLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 4 },
  weekItemValue: { fontSize: 18, fontWeight: '700' },
  weekDivider: { width: 1, height: 30, backgroundColor: '#1E3050' },
  clientRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152035', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1E3050' },
  clientInfo: { flex: 1 },
  clientName: { color: '#F8FAFC', fontSize: 14, fontWeight: '500' },
  clientReliability: { color: '#64748B', fontSize: 11, marginTop: 2 },
  clientAmounts: { alignItems: 'flex-end' },
  clientExpected: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
  clientLikely: { color: '#10B981', fontSize: 12, marginTop: 2 },
});
