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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';
import API_URL from '../../../src/constants/api';
import { LineChart } from 'react-native-chart-kit';


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

interface MonthStats {
  revenue: number;
  profit: number;
  dueOutstanding: number;
}

interface AdminUser {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
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
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [userCredits, setUserCredits] = useState<number>(5);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [monthStats, setMonthStats] = useState<MonthStats>({
    revenue: 0,
    profit: 0,
    dueOutstanding: 0,
  });
  const [heartbeat, setHeartbeat] = useState({
    total_registered: 0,
    online_count: 0,
    warning_count: 0,
    critical_count: 0,
  });
  const [revenueChart, setRevenueChart] = useState<{ labels: string[]; data: number[] }>({
    labels: [],
    data: [],
  });
  
  // Admin filter state
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [showAdminFilter, setShowAdminFilter] = useState(false);

  const fetchAdminList = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      
      const response = await fetch(`${API_URL}/api/admin/list-with-credits?admin_token=${adminToken}`);
      if (response.ok) {
        const data = await response.json();
        setAdminList(data);
      }
    } catch (error) {
      console.error('Failed to fetch admin list:', error);
    }
  };

  const fetchStats = async (filterAdminId?: string | null) => {
    const baseUrl = API_URL;
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        console.error('Admin token not found');
        return;
      }
      
      let url = `${baseUrl}/api/reports/collection?admin_token=${adminToken}`;
      if (filterAdminId) {
        url += `&filter_admin_id=${filterAdminId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error('API error:', response.status);
        return;
      }
      const data = await response.json();
      
      // API returns flat structure
      setLoanStats({
        total_clients: data.total_clients ?? 0,
        active_loans: data.active_loans ?? 0,
        completed_loans: data.completed_loans ?? 0,
        overdue_clients: data.overdue_loans ?? 0,
        total_disbursed: data.total_disbursed ?? 0,
        total_collected: data.total_collected ?? 0,
        total_outstanding: data.total_outstanding ?? 0,
        collection_rate: data.collection_rate ?? 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchHeartbeat = async (filterAdminId?: string | null) => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      
      let url = `${API_URL}/api/heartbeat/summary?admin_token=${adminToken}`;
      if (filterAdminId) {
        url += `&filter_admin_id=${filterAdminId}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHeartbeat({
          total_registered: data.total_registered,
          online_count: data.online_count,
          warning_count: data.warning_count,
          critical_count: data.critical_count,
        });
      }
    } catch (error) {
      console.error('Failed to fetch heartbeat:', error);
    }
  };

  const fetchRevenueChart = async (filterAdminId?: string | null) => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      
      let url = `${API_URL}/api/analytics/dashboard?admin_token=${adminToken}`;
      if (filterAdminId) {
        url += `&filter_admin_id=${filterAdminId}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const revenue = data.monthly_revenue || {};
        
        // Generate last 6 months labels
        const months: string[] = [];
        const values: number[] = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const monthNames = language === 'et' 
            ? ['Jaan','Veebr','Märts','Apr','Mai','Juuni','Juuli','Aug','Sept','Okt','Nov','Dets']
            : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          months.push(monthNames[d.getMonth()]);
          values.push(revenue[key] || 0);
        }
        setRevenueChart({ labels: months, data: values });
      }
    } catch (error) {
      console.error('Failed to fetch revenue chart:', error);
    }
  };

  const loadUserData = async () => {
    const storedUsername = await AsyncStorage.getItem('admin_username');
    const role = await AsyncStorage.getItem('admin_role');
    const storedFirst = await AsyncStorage.getItem('admin_first_name');
    const token = await AsyncStorage.getItem('admin_token');
    if (storedUsername) setUsername(storedUsername);
    if (storedFirst) setFirstName(storedFirst);
    if (role) setUserRole(role);
    
    // Fetch credits
    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
        if (response.ok) {
          const data = await response.json();
          setUserCredits(data.credits);
          setIsSuperAdmin(data.is_super_admin);
        }
      } catch (error) {
        console.error('Error fetching credits:', error);
      }
    }
  };

  useEffect(() => {
    loadUserData();
    fetchStats();
    fetchHeartbeat();
    fetchRevenueChart();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), loadUserData(), fetchHeartbeat(), fetchRevenueChart()]);
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <View style={{flex: 1}}>
          <Text style={styles.greeting}>{t('welcomeBack')}</Text>
          <Text style={styles.username}>
            {firstName || username || 'Admin'}
          </Text>
        </View>
        <View style={styles.langSwitcher}>
          <TouchableOpacity
            style={[styles.langButton, language === 'et' && styles.langButtonActive]}
            onPress={() => setLanguage('et')}
          >
            <Text style={[styles.langText, language === 'et' && styles.langTextActive]}>ET</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langButton, language === 'en' && styles.langButtonActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {/* Credit Balance Card */}
        <View style={styles.creditBalanceCard} data-testid="dashboard-credit-card">
          <View style={styles.creditBalanceIcon}>
            <Ionicons name="ticket" size={24} color="#F59E0B" />
          </View>
          <View style={styles.creditBalanceInfo}>
            <Text style={styles.creditBalanceLabel}>
              {language === 'et' ? 'Krediidi saldo' : 'Credit Balance'}
            </Text>
            <Text style={styles.creditBalanceValue}>
              {isSuperAdmin ? '∞' : userCredits}
            </Text>
          </View>
          {isSuperAdmin && (
            <View style={styles.superAdminIndicator}>
              <Ionicons name="shield-checkmark" size={16} color="#10B981" />
              <Text style={styles.superAdminIndicatorText}>
                {language === 'et' ? 'Peaadmin' : 'Superadmin'}
              </Text>
            </View>
          )}
          {!isSuperAdmin && userCredits <= 2 && (
            <View style={styles.lowCreditIndicator}>
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <Text style={styles.lowCreditIndicatorText}>
                {language === 'et' ? 'Madal' : 'Low'}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>{language === 'et' ? 'Laenude ülevaade' : 'Loan Overview'}</Text>

        <View style={styles.statsGrid}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#1E3A5F' }]}
            onPress={() => router.push('/admin/(tabs)/loans')}
            activeOpacity={0.8}
          >
            <View style={styles.statIcon}>
              <Ionicons name="trending-up" size={20} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{loanStats.active_loans}</Text>
            <Text style={styles.statLabel}>{language === 'et' ? 'Aktiivsed laenud' : 'Active Loans'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#3D1F1F' }]}
            onPress={() => router.push('/admin/(tabs)/loans?filter=overdue')}
            activeOpacity={0.8}
          >
            <View style={styles.statIcon}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{loanStats.overdue_clients}</Text>
            <Text style={styles.statLabel}>{language === 'et' ? 'Võlglased' : 'Overdue'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: '#1F3D2E' }]}
            onPress={() => router.push('/admin/(tabs)/loans?filter=paid')}
            activeOpacity={0.8}
          >
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{loanStats.completed_loans}</Text>
            <Text style={styles.statLabel}>{language === 'et' ? 'Lõpetatud' : 'Completed'}</Text>
          </TouchableOpacity>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="cash" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>€{loanStats.total_collected.toFixed(0)}</Text>
            <Text style={styles.statLabel}>{language === 'et' ? 'Kogutud' : 'Collected'}</Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={styles.financialSummary}>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Laekumismäär' : 'Collection Rate'}</Text>
            <Text style={[styles.financialValue, { color: '#10B981' }]}>{loanStats.collection_rate.toFixed(1)}%</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Laenatud kokku' : 'Total Disbursed'}</Text>
            <Text style={styles.financialValue}>€{loanStats.total_disbursed.toFixed(2)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Võlgnevused' : 'Outstanding'}</Text>
            <Text style={[styles.financialValue, { color: '#F59E0B' }]}>€{loanStats.total_outstanding.toFixed(2)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Käesoleva kuu tulu' : 'Revenue (This Month)'}</Text>
            <Text style={[styles.financialValue, { color: '#10B981' }]}>€{monthStats.revenue.toFixed(2)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Käesoleva kuu kasum' : 'Profit (This Month)'}</Text>
            <Text style={[styles.financialValue, { color: '#4F46E5' }]}>€{monthStats.profit.toFixed(2)}</Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{language === 'et' ? 'Selle kuu maksed tasuda' : 'Due This Month'}</Text>
            <Text style={[styles.financialValue, { color: '#F59E0B' }]}>€{monthStats.dueOutstanding.toFixed(2)}</Text>
          </View>
        </View>

        {/* Heartbeat Monitoring Card */}
        <TouchableOpacity
          style={styles.heartbeatCard}
          onPress={() => router.push('/admin/device-management')}
          activeOpacity={0.8}
          data-testid="heartbeat-card"
        >
          <View style={styles.heartbeatHeader}>
            <View style={styles.heartbeatTitleRow}>
              <Ionicons name="pulse" size={20} color="#10B981" />
              <Text style={styles.heartbeatTitle}>
                {language === 'et' ? 'Seadmete olek' : 'Device Heartbeat'}
              </Text>
            </View>
            <Text style={styles.heartbeatSubtitle}>
              {heartbeat.total_registered} {language === 'et' ? 'registreeritud' : 'registered'}
            </Text>
          </View>
          <View style={styles.heartbeatGrid}>
            <View style={styles.heartbeatItem}>
              <View style={[styles.heartbeatDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.heartbeatCount}>{heartbeat.online_count}</Text>
              <Text style={styles.heartbeatLabel}>{language === 'et' ? 'Aktiivne' : 'Online'}</Text>
            </View>
            <View style={styles.heartbeatItem}>
              <View style={[styles.heartbeatDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.heartbeatCount}>{heartbeat.warning_count}</Text>
              <Text style={styles.heartbeatLabel}>{language === 'et' ? 'Hoiatus' : 'Warning'}</Text>
            </View>
            <View style={styles.heartbeatItem}>
              <View style={[styles.heartbeatDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.heartbeatCount}>{heartbeat.critical_count}</Text>
              <Text style={styles.heartbeatLabel}>{language === 'et' ? 'Kriitiline' : 'Critical'}</Text>
            </View>
          </View>
          {heartbeat.critical_count > 0 && (
            <View style={styles.heartbeatAlert}>
              <Ionicons name="warning" size={14} color="#EF4444" />
              <Text style={styles.heartbeatAlertText}>
                {heartbeat.critical_count} {language === 'et' ? 'seadet pole vastanud >2h' : 'device(s) unresponsive >2h'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Monthly Revenue Trend Chart */}
        {revenueChart.labels.length > 0 && (
          <View style={styles.chartContainer} data-testid="revenue-chart">
            <Text style={styles.sectionTitle}>
              {language === 'et' ? 'Igakuine tulu' : 'Monthly Revenue'}
            </Text>
            <LineChart
              data={{
                labels: revenueChart.labels,
                datasets: [{ data: revenueChart.data.some(v => v > 0) ? revenueChart.data : [0, 0, 0, 0, 0, 0] }],
              }}
              width={Dimensions.get('window').width - 56}
              height={200}
              yAxisLabel="€"
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: '#1E293B',
                backgroundGradientFrom: '#1E293B',
                backgroundGradientTo: '#1E293B',
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                style: { borderRadius: 12 },
                propsForDots: {
                  r: '5',
                  strokeWidth: '2',
                  stroke: '#4F46E5',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: '#334155',
                  strokeWidth: 0.5,
                },
              }}
              bezier
              style={{ borderRadius: 12, marginTop: 8 }}
            />
          </View>
        )}

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/clients')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#4F46E5' }]}>
              <Ionicons name="people" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('viewClients')}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Vaata ja halda kliente' : 'View and manage clients'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/device-management')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="phone-portrait" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Seadmehaldus' : 'Device Management'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Lukusta/vabasta seadmeid' : 'Lock/unlock devices'}</Text>
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
            <Text style={styles.actionTitle}>{language === 'et' ? 'Aruanded' : 'Reports'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Finantsanalüütika ja aruanded' : 'Financial analytics & reports'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/loan-plans')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EC4899' }]}>
              <Ionicons name="pricetag" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Laenuplaanid' : 'Loan Plans'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Halda laenuplaane' : 'Manage loan plans'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/calculator')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#14B8A6' }]}>
              <Ionicons name="calculator" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Laenukalkulaator' : 'Loan Calculator'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Arvuta laenumaksed' : 'Calculate loan payments'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/notifications')}
            data-testid="notifications-btn"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="notifications" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Teavitused' : 'Notifications'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Turvateavitused ja hoiatused' : 'Security alerts & warnings'}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/client-map')}
            data-testid="client-map-btn"
          >
            <View style={[styles.actionIcon, { backgroundColor: '#06B6D4' }]}>
              <Ionicons name="map" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Klientide kaart' : 'Client Map'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Seadmete asukohad' : 'Device locations'}</Text>
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
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  langButtonActive: {
    backgroundColor: '#4F46E5',
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
  content: {
    flex: 1,
    padding: 20,
  },
  contentContainer: {
    paddingBottom: 140,
  },
  // Credit Balance Card styles
  creditBalanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  creditBalanceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBalanceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creditBalanceLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 2,
  },
  creditBalanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F59E0B',
  },
  superAdminIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#10B98120',
  },
  superAdminIndicatorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  lowCreditIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F59E0B20',
  },
  lowCreditIndicatorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
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
    borderRadius: 11,
    padding: 11,
    marginBottom: 8,
  },
  statIcon: {
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 3,
  },
  actionsContainer: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
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
  // Heartbeat card styles
  heartbeatCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  heartbeatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heartbeatTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heartbeatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  heartbeatSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  heartbeatGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  heartbeatItem: {
    alignItems: 'center',
    gap: 4,
  },
  heartbeatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  heartbeatCount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  heartbeatLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  heartbeatAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  heartbeatAlertText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  // Chart styles
  chartContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
});
