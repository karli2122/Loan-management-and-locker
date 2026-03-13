import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import API_URL from '../../src/constants/api';
import { Dimensions } from 'react-native';


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
  const { language, setLanguage, t } = useLanguage();
  const { formatAmount } = useCurrency();
  const [loanStats, setLoanStats] = useState<LoanStats>({
    total_clients: 0,
    active_loans: 0,
    completed_loans: 0,
    overdue_clients: 0,
    total_disbursed: 0,
    total_collected: 0,
    total_outstanding: 0,
    collection_rate: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioHealth, setPortfolioHealth] = useState<any>(null);
  const [collectionTrends, setCollectionTrends] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('user');

  const fetchStats = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        console.error('Admin token not found');
        return;
      }
      const response = await fetch(`${API_URL}/api/reports/collection?admin_token=${adminToken}`);
      if (!response.ok) {
        console.error('Reports API error:', response.status);
        return;
      }
      const data = await response.json();
      
      setLoanStats({
        total_clients: data.total_clients || 0,
        active_loans: data.active_loans || 0,
        completed_loans: data.completed_loans || 0,
        overdue_clients: data.overdue_loans || 0,
        total_disbursed: data.total_disbursed || 0,
        total_collected: data.total_collected || 0,
        total_outstanding: data.total_outstanding || 0,
        collection_rate: data.collection_rate || 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      
      const [healthResp, trendsResp] = await Promise.all([
        fetch(`${API_URL}/api/analytics/portfolio-health?admin_token=${adminToken}`),
        fetch(`${API_URL}/api/analytics/collection-trends?admin_token=${adminToken}&period=monthly&months=6`),
      ]);
      
      if (healthResp.ok) {
        const data = await healthResp.json();
        setPortfolioHealth(data);
      }
      if (trendsResp.ok) {
        const data = await trendsResp.json();
        setCollectionTrends(data.data || []);
      }
    } catch (e) { console.log('Analytics fetch error:', e); }
  };

  const loadUserData = async () => {
    const storedUsername = await AsyncStorage.getItem('admin_username');
    const role = await AsyncStorage.getItem('admin_role');
    if (storedUsername) setUsername(storedUsername);
    if (role) setUserRole(role);
  };

  useEffect(() => {
    loadUserData();
    fetchStats();
    fetchAnalytics();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchAnalytics()]);
    setRefreshing(false);
  }, []);

  const handleLogout = async () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['admin_token', 'admin_id', 'admin_username']);
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('welcomeBack')}</Text>
          <Text style={styles.username}>{username || 'Admin'}</Text>
        </View>
        <View style={styles.headerRight}>
          <LanguagePicker compact colors={colors} />
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        <Text style={styles.sectionTitle}>{t('loanOverview')}</Text>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1E3A5F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="trending-up" size={28} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{loanStats.active_loans}</Text>
            <Text style={styles.statLabel}>{t('activeLoans')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D1F1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="alert-circle" size={28} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{loanStats.overdue_clients}</Text>
            <Text style={styles.statLabel}>{t('overdue')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#1F3D2E' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={28} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{loanStats.completed_loans}</Text>
            <Text style={styles.statLabel}>{t('completed')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="cash" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{formatAmount(loanStats.total_collected, 0)}</Text>
            <Text style={styles.statLabel}>{t('collected')}</Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={styles.financialSummary}>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t('collectionRate')}</Text>
            <Text style={[styles.financialValue, { color: '#10B981' }]}>{loanStats.collection_rate.toFixed(1)}%</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t('totalDisbursed')}</Text>
            <Text style={styles.financialValue}>{formatAmount(loanStats.total_disbursed)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t('outstanding')}</Text>
            <Text style={[styles.financialValue, { color: '#F59E0B' }]}>{formatAmount(loanStats.total_outstanding)}</Text>
          </View>
        </View>

        {/* Analytics Section */}
        {portfolioHealth && (
          <>
            <Text style={styles.sectionTitle}>Portfolio Health</Text>
            <View style={{ backgroundColor: '#152035', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              {/* NPA & Aging Summary */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: '#EF4444', fontSize: 22, fontWeight: '700' }}>{portfolioHealth.npa_count}</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 11 }}>NPAs (90d+)</Text>
                </View>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: '#F59E0B', fontSize: 22, fontWeight: '700' }}>{portfolioHealth.npa_ratio}%</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 11 }}>NPA Ratio</Text>
                </View>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{ color: '#10B981', fontSize: 22, fontWeight: '700' }}>{portfolioHealth.collection_rate}%</Text>
                  <Text style={{ color: '#94A3B8', fontSize: 11 }}>Collection Rate</Text>
                </View>
              </View>
              
              {/* Aging Bars */}
              <Text style={{ color: '#E2E8F0', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Aging Analysis</Text>
              {portfolioHealth.aging_analysis && Object.entries(portfolioHealth.aging_analysis).map(([key, val]: [string, any]) => {
                const labels: Record<string, string> = { current: 'Current', '1_30_days': '1-30 days', '31_60_days': '31-60 days', '61_90_days': '61-90 days', '90_plus_days': '90+ days' };
                const barColors: Record<string, string> = { current: '#10B981', '1_30_days': '#3B82F6', '31_60_days': '#F59E0B', '61_90_days': '#F97316', '90_plus_days': '#EF4444' };
                const maxAmt = Math.max(...Object.values(portfolioHealth.aging_analysis).map((v: any) => v.amount || 0), 1);
                const barWidth = val.amount > 0 ? Math.max((val.amount / maxAmt) * 100, 5) : 0;
                return (
                  <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 11, width: 70 }}>{labels[key] || key}</Text>
                    <View style={{ flex: 1, height: 16, backgroundColor: '#0B1527', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 }}>
                      <View style={{ height: 16, width: `${barWidth}%`, backgroundColor: barColors[key] || '#3B82F6', borderRadius: 4 }} />
                    </View>
                    <Text style={{ color: '#E2E8F0', fontSize: 11, width: 50, textAlign: 'right' }}>{val.count}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Collection Trends */}
        {collectionTrends.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Collection Trends</Text>
            <View style={{ backgroundColor: '#152035', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              {collectionTrends.slice(-6).map((t, i) => {
                const maxVal = Math.max(...collectionTrends.slice(-6).map(x => Math.max(x.expected || 0, x.collected || 0)), 1);
                return (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <Text style={{ color: '#94A3B8', fontSize: 11, marginBottom: 4 }}>{t.month || t.start || ''}</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ height: 12, backgroundColor: '#0B1527', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ height: 12, width: `${(t.expected / maxVal) * 100}%`, backgroundColor: '#3B82F640', borderRadius: 3 }} />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ height: 12, backgroundColor: '#0B1527', borderRadius: 3, overflow: 'hidden' }}>
                          <View style={{ height: 12, width: `${(t.collected / maxVal) * 100}%`, backgroundColor: '#10B981', borderRadius: 3 }} />
                        </View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ color: '#64748B', fontSize: 10 }}>Expected: {formatAmount(t.expected, 0)}</Text>
                      <Text style={{ color: '#10B981', fontSize: 10 }}>Collected: {formatAmount(t.collected, 0)}</Text>
                      <Text style={{ color: t.efficiency >= 80 ? '#10B981' : t.efficiency >= 50 ? '#F59E0B' : '#EF4444', fontSize: 10, fontWeight: '600' }}>{t.efficiency}%</Text>
                    </View>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#3B82F640', marginRight: 4 }} />
                  <Text style={{ color: '#94A3B8', fontSize: 10 }}>Expected</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#10B981', marginRight: 4 }} />
                  <Text style={{ color: '#94A3B8', fontSize: 10 }}>Collected</Text>
                </View>
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{t('quickActions')}</Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/clients')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#2563EB' }]}>
              <Ionicons name="people" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('viewClients')}</Text>
            <Text style={styles.actionDescription}>{t('viewAndManageClients')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/device-management')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="phone-portrait" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('deviceManagement')}</Text>
            <Text style={styles.actionDescription}>{t('lockunlockDevices')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {userRole === 'admin' && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/admin/settings')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="settings" size={24} color="#fff" />
              </View>
              <Text style={styles.actionTitle}>{t('settings')}</Text>
              <Text style={styles.actionDescription}>{t('adminManagement')}</Text>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/reports')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#06B6D4' }]}>
              <Ionicons name="bar-chart" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('reports')}</Text>
            <Text style={styles.actionDescription}>{t('financialAnalyticsReports')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/loan-plans')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EC4899' }]}>
              <Ionicons name="pricetag" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('loanPlans')}</Text>
            <Text style={styles.actionDescription}>{t('manageLoanPlans')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/calculator')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#14B8A6' }]}>
              <Ionicons name="calculator" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('loanCalculator')}</Text>
            <Text style={styles.actionDescription}>{t('calculateLoanPayments')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/payment-reminders')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="notifications" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('paymentReminders')}</Text>
            <Text style={styles.actionDescription}>{t('sendPaymentReminders')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/notifications')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="mail" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('notifications')}</Text>
            <Text style={styles.actionDescription}>{t('viewNotifications')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/client-map')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#059669' }]}>
              <Ionicons name="map" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('clientMap')}</Text>
            <Text style={styles.actionDescription}>{t('viewClientLocations')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          {/* Enterprise Features */}
          <View style={styles.enterpriseHeader}>
            <Ionicons name="shield-checkmark" size={16} color="#8B5CF6" />
            <Text style={styles.enterpriseTitle}>Enterprise</Text>
          </View>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/schedules')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#7C3AED' }]}>
              <Ionicons name="calendar" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Payment Schedules</Text>
            <Text style={styles.actionDescription}>Manage automated payment schedules</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/documents')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#0891B2' }]}>
              <Ionicons name="folder" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Documents</Text>
            <Text style={styles.actionDescription}>Client document management</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/bulk-import')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#D97706' }]}>
              <Ionicons name="cloud-upload" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Bulk Import</Text>
            <Text style={styles.actionDescription}>Import clients from CSV</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/team')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#4F46E5' }]}>
              <Ionicons name="people-circle" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Team Management</Text>
            <Text style={styles.actionDescription}>Manage team members &amp; roles</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/telegram')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#0088CC' }]}>
              <Ionicons name="paper-plane" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Telegram</Text>
            <Text style={styles.actionDescription}>Bot integration &amp; reminders</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/provisioning')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#DC2626' }]}>
              <Ionicons name="qr-code" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>Device Provisioning</Text>
            <Text style={styles.actionDescription}>QR code for device enrollment</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#152035',
  },
  langButtonActive: {
    backgroundColor: '#2563EB',
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#fff',
  },
  greeting: {
    fontSize: 14,
    color: '#94A3B8',
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  statIcon: {
    marginBottom: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  actionsContainer: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionDescription: {
    position: 'absolute',
    left: 76,
    bottom: 16,
    fontSize: 12,
    color: '#64748B',
  },
  financialSummary: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3050',
  },
  financialLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  financialValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  enterpriseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 4,
  },
  enterpriseTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8B5CF6',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});