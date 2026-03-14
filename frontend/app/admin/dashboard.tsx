import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import API_URL from '../../src/constants/api';

const { width: SCREEN_W } = Dimensions.get('window');

interface LoanStats {
  total_clients: number;
  active_loans: number;
  completed_loans: number;
  overdue_clients: number;
  total_disbursed: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate: number;
}

export default function Dashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const { formatAmount } = useCurrency();
  const [loanStats, setLoanStats] = useState<LoanStats>({
    total_clients: 0, active_loans: 0, completed_loans: 0,
    overdue_clients: 0, total_disbursed: 0, total_collected: 0,
    total_outstanding: 0, collection_rate: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioHealth, setPortfolioHealth] = useState<any>(null);
  const [collectionTrends, setCollectionTrends] = useState<any[]>([]);
  const [username, setUsername] = useState('');

  const fetchStats = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      const response = await fetch(`${API_URL}/api/reports/collection?admin_token=${adminToken}`);
      if (!response.ok) return;
      const data = await response.json();
      setLoanStats({
        total_clients: data.total_clients || data.overview?.total_clients || 0,
        active_loans: data.active_loans || data.overview?.active_loans || 0,
        completed_loans: data.completed_loans || data.overview?.completed_loans || 0,
        overdue_clients: data.overdue_loans || data.overview?.overdue_clients || 0,
        total_disbursed: data.total_disbursed || data.financial?.total_disbursed || 0,
        total_collected: data.total_collected || data.financial?.total_collected || 0,
        total_outstanding: data.total_outstanding || data.financial?.total_outstanding || 0,
        collection_rate: data.collection_rate || data.financial?.collection_rate || 0,
      });
    } catch (e) { console.log(e); }
  };

  const fetchAnalytics = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      const [healthResp, trendsResp] = await Promise.all([
        fetch(`${API_URL}/api/analytics/portfolio-health?admin_token=${adminToken}`).catch(() => null),
        fetch(`${API_URL}/api/analytics/collection-trends?admin_token=${adminToken}&period=monthly&months=6`).catch(() => null),
      ]);
      if (healthResp?.ok) setPortfolioHealth(await healthResp.json());
      if (trendsResp?.ok) {
        const data = await trendsResp.json();
        setCollectionTrends(data.data || []);
      }
    } catch (e) { console.log(e); }
  };

  useEffect(() => {
    (async () => {
      const storedUsername = await AsyncStorage.getItem('admin_username');
      const firstName = await AsyncStorage.getItem('admin_first_name');
      if (firstName) setUsername(firstName);
      else if (storedUsername) setUsername(storedUsername);
    })();
    fetchStats();
    fetchAnalytics();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchAnalytics()]);
    setRefreshing(false);
  }, []);

  const statCards = [
    { label: t('activeLoans'), value: loanStats.active_loans, icon: 'trending-up', color: '#3B82F6', bg: '#1E3A5F' },
    { label: t('overdue'), value: loanStats.overdue_clients, icon: 'alert-circle', color: '#EF4444', bg: '#3D1F1F' },
    { label: t('completed'), value: loanStats.completed_loans, icon: 'checkmark-circle', color: '#10B981', bg: '#1F3D2E' },
    { label: t('collected'), value: formatAmount(loanStats.total_collected, 0), icon: 'cash', color: '#F59E0B', bg: '#3D3D1F' },
  ];

  const agingLabels: Record<string, string> = {
    current: t('current') || 'Current',
    '1_30_days': '1-30d',
    '31_60_days': '31-60d',
    '61_90_days': '61-90d',
    '90_plus_days': '90d+',
  };
  const agingColors: Record<string, string> = {
    current: '#10B981', '1_30_days': '#3B82F6', '31_60_days': '#F59E0B',
    '61_90_days': '#F97316', '90_plus_days': '#EF4444',
  };

  const quickActions = [
    { icon: 'people', color: '#2563EB', label: t('viewClients'), route: '/admin/clients' },
    { icon: 'bar-chart', color: '#06B6D4', label: t('reports'), route: '/admin/reports' },
    { icon: 'phone-portrait', color: '#F59E0B', label: t('deviceManagement'), route: '/admin/device-management' },
    { icon: 'notifications', color: '#EF4444', label: t('paymentReminders'), route: '/admin/payment-reminders' },
  ];

  return (
    <SafeAreaView style={s.container} edges={[]}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{t('welcomeBack')}</Text>
          <Text style={s.username}>{username || 'Admin'}</Text>
        </View>
        <TouchableOpacity style={s.settingsBtn} onPress={() => router.push('/admin/settings')} data-testid="dashboard-settings-btn">
          <Ionicons name="settings-outline" size={22} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {/* Stats Grid */}
        <View style={s.statsGrid}>
          {statCards.map((c, i) => (
            <View key={i} style={[s.statCard, { backgroundColor: c.bg }]} data-testid={`stat-card-${i}`}>
              <Ionicons name={c.icon as any} size={24} color={c.color} />
              <Text style={s.statValue}>{c.value}</Text>
              <Text style={s.statLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Financial Strip */}
        <View style={s.finStrip}>
          <View style={s.finItem}>
            <Text style={s.finLabel}>{t('collectionRate')}</Text>
            <Text style={[s.finValue, { color: '#10B981' }]}>{loanStats.collection_rate.toFixed(1)}%</Text>
          </View>
          <View style={s.finDivider} />
          <View style={s.finItem}>
            <Text style={s.finLabel}>{t('totalDisbursed')}</Text>
            <Text style={s.finValue}>{formatAmount(loanStats.total_disbursed)}</Text>
          </View>
          <View style={s.finDivider} />
          <View style={s.finItem}>
            <Text style={s.finLabel}>{t('outstanding')}</Text>
            <Text style={[s.finValue, { color: '#F59E0B' }]}>{formatAmount(loanStats.total_outstanding)}</Text>
          </View>
        </View>

        {/* Portfolio Health */}
        {portfolioHealth && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="pulse" size={18} color="#8B5CF6" />
              <Text style={s.cardTitle}>{t('portfolioHealth') || 'Portfolio Health'}</Text>
            </View>
            <View style={s.healthRow}>
              <View style={s.healthItem}>
                <Text style={[s.healthVal, { color: '#EF4444' }]}>{portfolioHealth.npa_count}</Text>
                <Text style={s.healthLabel}>NPAs</Text>
              </View>
              <View style={s.healthItem}>
                <Text style={[s.healthVal, { color: '#F59E0B' }]}>{portfolioHealth.npa_ratio}%</Text>
                <Text style={s.healthLabel}>NPA Ratio</Text>
              </View>
              <View style={s.healthItem}>
                <Text style={[s.healthVal, { color: '#10B981' }]}>{portfolioHealth.collection_rate}%</Text>
                <Text style={s.healthLabel}>{t('collectionRate')}</Text>
              </View>
            </View>
            {portfolioHealth.aging_analysis && (
              <View style={s.agingSection}>
                <Text style={s.agingTitle}>{t('agingAnalysis') || 'Aging Analysis'}</Text>
                {Object.entries(portfolioHealth.aging_analysis).map(([key, val]: [string, any]) => {
                  const maxAmt = Math.max(...Object.values(portfolioHealth.aging_analysis).map((v: any) => v.amount || 0), 1);
                  const pct = val.amount > 0 ? Math.max((val.amount / maxAmt) * 100, 4) : 0;
                  return (
                    <View key={key} style={s.agingRow}>
                      <Text style={s.agingLabel}>{agingLabels[key] || key}</Text>
                      <View style={s.agingBarBg}>
                        <View style={[s.agingBar, { width: `${pct}%`, backgroundColor: agingColors[key] || '#3B82F6' }]} />
                      </View>
                      <Text style={s.agingCount}>{val.count}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Collection Trends */}
        {collectionTrends.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name="analytics" size={18} color="#3B82F6" />
              <Text style={s.cardTitle}>{t('collectionTrends') || 'Collection Trends'}</Text>
            </View>
            {collectionTrends.slice(-6).map((tr, i) => {
              const maxVal = Math.max(...collectionTrends.slice(-6).map(x => Math.max(x.expected || 0, x.collected || 0)), 1);
              const eff = tr.efficiency || 0;
              const effColor = eff >= 80 ? '#10B981' : eff >= 50 ? '#F59E0B' : '#EF4444';
              return (
                <View key={i} style={s.trendRow}>
                  <View style={s.trendHeader}>
                    <Text style={s.trendMonth}>{tr.month || tr.start || ''}</Text>
                    <View style={[s.effBadge, { backgroundColor: `${effColor}20` }]}>
                      <Text style={[s.effText, { color: effColor }]}>{eff}%</Text>
                    </View>
                  </View>
                  <View style={s.trendBars}>
                    <View style={s.trendBarRow}>
                      <View style={s.trendBarBg}>
                        <View style={[s.trendBar, { width: `${(tr.expected / maxVal) * 100}%`, backgroundColor: '#3B82F640' }]} />
                      </View>
                      <Text style={s.trendBarLabel}>{formatAmount(tr.expected, 0)}</Text>
                    </View>
                    <View style={s.trendBarRow}>
                      <View style={s.trendBarBg}>
                        <View style={[s.trendBar, { width: `${(tr.collected / maxVal) * 100}%`, backgroundColor: '#10B981' }]} />
                      </View>
                      <Text style={[s.trendBarLabel, { color: '#10B981' }]}>{formatAmount(tr.collected, 0)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#3B82F640' }]} /><Text style={s.legendText}>{t('expected') || 'Expected'}</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#10B981' }]} /><Text style={s.legendText}>{t('collected') || 'Collected'}</Text></View>
            </View>
          </View>
        )}

        {/* Empty state for analytics */}
        {!portfolioHealth && collectionTrends.length === 0 && (
          <View style={s.emptyAnalytics}>
            <Ionicons name="analytics-outline" size={40} color="#334155" />
            <Text style={s.emptyTitle}>{t('analyticsComingSoon') || 'Analytics will appear here'}</Text>
            <Text style={s.emptyDesc}>{t('analyticsEmptyDesc') || 'Data will populate as clients make payments'}</Text>
          </View>
        )}

        {/* Quick Actions */}
        <Text style={s.sectionTitle}>{t('quickActions')}</Text>
        <View style={s.quickGrid}>
          {quickActions.map((a, i) => (
            <TouchableOpacity key={i} style={s.quickCard} onPress={() => router.push(a.route as any)} data-testid={`quick-action-${i}`}>
              <View style={[s.quickIcon, { backgroundColor: `${a.color}20` }]}>
                <Ionicons name={a.icon as any} size={22} color={a.color} />
              </View>
              <Text style={s.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  greeting: { fontSize: 13, color: '#64748B' },
  username: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginTop: 2 },
  settingsBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#152035', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1E3050' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#E2E8F0', marginBottom: 12, marginTop: 8 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { width: (SCREEN_W - 42) / 2, borderRadius: 14, padding: 16 },
  statValue: { fontSize: 28, fontWeight: '800', color: '#F8FAFC', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  // Financial strip
  finStrip: { flexDirection: 'row', backgroundColor: '#152035', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1E3050' },
  finItem: { flex: 1, alignItems: 'center' },
  finLabel: { fontSize: 11, color: '#64748B', marginBottom: 4 },
  finValue: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  finDivider: { width: 1, backgroundColor: '#1E3050', marginHorizontal: 8 },

  // Card
  card: { backgroundColor: '#152035', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1E3050' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },

  // Health
  healthRow: { flexDirection: 'row', marginBottom: 16 },
  healthItem: { flex: 1, alignItems: 'center' },
  healthVal: { fontSize: 22, fontWeight: '800' },
  healthLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Aging
  agingSection: { borderTopWidth: 1, borderTopColor: '#1E3050', paddingTop: 12 },
  agingTitle: { fontSize: 12, fontWeight: '600', color: '#94A3B8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  agingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  agingLabel: { color: '#94A3B8', fontSize: 11, width: 55 },
  agingBarBg: { flex: 1, height: 14, backgroundColor: '#0B1527', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  agingBar: { height: 14, borderRadius: 4 },
  agingCount: { color: '#E2E8F0', fontSize: 12, fontWeight: '600', width: 30, textAlign: 'right' },

  // Trends
  trendRow: { marginBottom: 14 },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  trendMonth: { color: '#94A3B8', fontSize: 12, fontWeight: '500' },
  effBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  effText: { fontSize: 11, fontWeight: '700' },
  trendBars: { gap: 4 },
  trendBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trendBarBg: { flex: 1, height: 10, backgroundColor: '#0B1527', borderRadius: 3, overflow: 'hidden' },
  trendBar: { height: 10, borderRadius: 3 },
  trendBarLabel: { color: '#64748B', fontSize: 10, width: 55, textAlign: 'right' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1E3050' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: '#94A3B8', fontSize: 11 },

  // Empty
  emptyAnalytics: { alignItems: 'center', backgroundColor: '#152035', borderRadius: 14, padding: 32, marginBottom: 16, borderWidth: 1, borderColor: '#1E3050' },
  emptyTitle: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },
  emptyDesc: { color: '#475569', fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { width: (SCREEN_W - 42) / 2, backgroundColor: '#152035', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1E3050' },
  quickIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickLabel: { color: '#E2E8F0', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
