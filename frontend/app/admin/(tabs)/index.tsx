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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useCurrency } from '../../../src/context/CurrencyContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { LanguagePicker } from '../../../src/components/LanguagePicker';
import { useVersionCheck } from '../../../src/hooks/useVersionCheck';
import API_URL from '../../../src/constants/api';
import { LineChart } from 'react-native-chart-kit';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../../src/utils/secureStorage';


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

interface PlanFeatures {
  plan: string;
  features: { [key: string]: boolean };
}

export default function Dashboard() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const { colors, isDark } = useTheme();
  const { currentVersion } = useVersionCheck('admin');
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
  const [interestSummary, setInterestSummary] = useState({
    total_interest_earned: 0,
    current_month_interest: 0,
    total_loans_archived: 0,
    current_month_loans_archived: 0,
  });
  const [interestTrend, setInterestTrend] = useState<{ labels: string[]; data: number[] }>({
    labels: [],
    data: [],
  });
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Push notifications state
  const [dueTodayCount, setDueTodayCount] = useState(0);
  
  // Offline mode state
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  
  // Admin filter state
  const [adminList, setAdminList] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [showAdminFilter, setShowAdminFilter] = useState(false);
  
  // Plan-based feature gating state
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures>({ plan: 'starter', features: {} });
  
  // Helper function to check feature access
  const hasFeature = (featureName: string): boolean => {
    return planFeatures.features[featureName] === true;
  };

  const fetchAdminList = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;
      
      const response = await fetch(`${API_URL}/api/admin/list?admin_token=${adminToken}`);
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
      const adminToken = await getSecureItem('admin_token');
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
      const adminToken = await getSecureItem('admin_token');
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
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;
      
      let url = `${API_URL}/api/analytics/dashboard?admin_token=${adminToken}`;
      if (filterAdminId) {
        url += `&filter_admin_id=${filterAdminId}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const revenue = data.monthly_revenue || {};
        const interest = data.monthly_interest || {};
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setMonthStats({
          revenue: revenue[currentKey] || 0,
          profit: interest[currentKey] || 0,
          dueOutstanding: data.financial?.total_outstanding || 0,
        });
        
        // Generate last 6 months labels
        const months: string[] = [];
        const values: number[] = [];
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

  const fetchInterestSummary = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;
      const response = await fetch(`${API_URL}/api/paid-loans/summary?admin_token=${adminToken}`);
      if (response.ok) {
        const data = await response.json();
        setInterestSummary({
          total_interest_earned: data.total_interest_earned ?? 0,
          current_month_interest: data.current_month_interest ?? 0,
          total_loans_archived: data.total_loans_archived ?? 0,
          current_month_loans_archived: data.current_month_loans_archived ?? 0,
        });
        // Parse monthly interest trend
        const trend = data.monthly_interest_trend || [];
        if (trend.length > 0) {
          const monthNamesEt = ['Jaan','Veebr','Märts','Apr','Mai','Juuni','Juuli','Aug','Sept','Okt','Nov','Dets'];
          const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const names = language === 'et' ? monthNamesEt : monthNamesEn;
          setInterestTrend({
            labels: trend.map((t: any) => names[t.month - 1]),
            data: trend.map((t: any) => t.interest),
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch interest summary:', error);
    }
  };

  const fetchPlanFeatures = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;
      const response = await fetch(`${API_URL}/api/admin/feature-access?admin_token=${adminToken}`);
      if (response.ok) {
        const data = await response.json();
        setPlanFeatures({
          plan: data.plan || 'starter',
          features: data.features || {},
        });
      }
    } catch (error) {
      console.error('Failed to fetch plan features:', error);
    }
  };

  const loadUserData = async () => {
    const storedUsername = await AsyncStorage.getItem('admin_username');
    const role = await AsyncStorage.getItem('admin_role');
    const storedFirst = await AsyncStorage.getItem('admin_first_name');
    const token = await getSecureItem('admin_token');
    if (storedUsername) setUsername(storedUsername);
    if (storedFirst) setFirstName(storedFirst);
    if (role) setUserRole(role);
    
    // Fetch super admin status
    if (token) {
      try {
        const response = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
        if (response.ok) {
          const data = await response.json();
          setIsSuperAdmin(data.is_super_admin);
        }
      } catch (error) {
        console.error('Error fetching admin status:', error);
      }
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      setInitialLoading(true);
      try {
        await Promise.all([
          loadUserData(),
          fetchStats(selectedAdminId),
          fetchHeartbeat(selectedAdminId),
          fetchRevenueChart(selectedAdminId),
          fetchInterestSummary(),
          fetchPlanFeatures(),
        ]);
      } finally {
        setInitialLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // Fetch admin list for superadmins
  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdminList();
    }
  }, [isSuperAdmin]);

  // Refetch data when admin filter changes
  useEffect(() => {
    if (selectedAdminId !== null || isSuperAdmin) {
      fetchStats(selectedAdminId);
      fetchHeartbeat(selectedAdminId);
      fetchRevenueChart(selectedAdminId);
    }
  }, [selectedAdminId]);

  // Push notifications setup
  useEffect(() => {
    const setupPushNotifications = async () => {
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus === 'granted') {
          const projectId = '7be3aec1-6fef-4200-9987-5868c4320a07';
          const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
          const adminToken = await getSecureItem('admin_token');
          if (adminToken && tokenData?.data) {
            fetch(`${API_URL}/api/push/register-token?token=${encodeURIComponent(tokenData.data)}&admin_token=${adminToken}`, { method: 'POST' }).catch(() => {});
          }
        }
      } catch (e) {
        console.log('Push notification setup skipped:', e);
      }
    };
    setupPushNotifications();

    // Check payments due today
    const checkDueToday = async () => {
      try {
        const adminToken = await getSecureItem('admin_token');
        if (!adminToken) return;
        const resp = await fetch(`${API_URL}/api/push/due-today?admin_token=${adminToken}`);
        if (resp.ok) {
          const data = await resp.json();
          setDueTodayCount(data.count || 0);
          if (data.count > 0) {
            await Notifications.scheduleNotificationAsync({
              content: { title: 'Payments Due Today', body: `${data.count} payment(s) due today`, sound: 'default' },
              trigger: null,
            });
          }
        }
      } catch (e) { console.log('Due today check skipped:', e); }
    };
    checkDueToday();
  }, []);

  // Offline mode: network monitoring + queue sync
  useEffect(() => {
    const loadOfflineQueue = async () => {
      const q = await AsyncStorage.getItem('offline_queue');
      if (q) setOfflineQueue(JSON.parse(q));
    };
    loadOfflineQueue();

    const unsubscribe = NetInfo.addEventListener(state => {
      const wasOffline = isOffline;
      const nowOffline = !state.isConnected;
      setIsOffline(nowOffline);
      if (wasOffline && !nowOffline) {
        syncOfflineQueue();
      }
    });
    return () => unsubscribe();
  }, []);

  const addToOfflineQueue = async (action: any) => {
    const newQueue = [...offlineQueue, { ...action, timestamp: Date.now() }];
    setOfflineQueue(newQueue);
    await AsyncStorage.setItem('offline_queue', JSON.stringify(newQueue));
  };

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    setSyncingOffline(true);
    const adminToken = await getSecureItem('admin_token');
    let remaining: any[] = [];
    for (const action of offlineQueue) {
      try {
        await fetch(`${API_URL}${action.url}${action.url.includes('?') ? '&' : '?'}admin_token=${adminToken}`, {
          method: action.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: action.body ? JSON.stringify(action.body) : undefined,
        });
      } catch {
        remaining.push(action);
      }
    }
    setOfflineQueue(remaining);
    await AsyncStorage.setItem('offline_queue', JSON.stringify(remaining));
    setSyncingOffline(false);
    if (remaining.length === 0) {
      Alert.alert('Sync Complete', 'All offline actions have been synced.');
      onRefresh();
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStats(selectedAdminId),
      loadUserData(),
      fetchHeartbeat(selectedAdminId),
      fetchRevenueChart(selectedAdminId),
      fetchInterestSummary(),
      fetchPlanFeatures(),
    ]);
    setRefreshing(false);
  }, [selectedAdminId]);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh data when screen is focused
      if (!initialLoading) {
        onRefresh();
      }
    }, [selectedAdminId])
  );

  const getSelectedAdminName = () => {
    if (!selectedAdminId) return t('myData');
    if (selectedAdminId === 'all') return t('allAdmins');
    const admin = adminList.find(a => a.id === selectedAdminId);
    return admin ? (admin.first_name || admin.username) : '';
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 14 }}>
            {t('loadingData')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{flex: 1}}>
          <Text style={[styles.greeting, { color: colors.textMuted }]}>{t('welcomeBack')}</Text>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.text }]}>
              {firstName || username || 'Admin'}
            </Text>
          </View>
        </View>
        <View style={styles.langSwitcher}>
          <LanguagePicker compact colors={colors} />
        </View>
      </View>

      <ScrollView
        style={[styles.content, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {/* Offline Mode Banner */}
        {isOffline && (
          <View style={{ backgroundColor: '#f59e0b', padding: 12, borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="cloud-offline" size={20} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600', flex: 1 }}>Offline Mode — Actions will sync when back online</Text>
            {offlineQueue.length > 0 && (
              <View style={{ backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 12 }}>{offlineQueue.length}</Text>
              </View>
            )}
          </View>
        )}

        {/* Syncing Banner */}
        {syncingOffline && (
          <View style={{ backgroundColor: '#2563EB', padding: 12, borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600' }}>Syncing offline actions...</Text>
          </View>
        )}

        {/* Plan Badge removed per user request */}

        {/* Demo Mode Banner */}
        {planFeatures.plan === 'demo' && (
          <View style={{ backgroundColor: '#F59E0B', padding: 14, borderRadius: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }} data-testid="demo-mode-banner">
            <Ionicons name="flask" size={22} color="#fff" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Demo Mode</Text>
              <Text style={{ color: '#fff', fontSize: 12, opacity: 0.9 }}>Limited features. Upgrade to unlock full access.</Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 }}
              onPress={() => router.push('/admin/loan-plans')}
            >
              <Text style={{ color: '#F59E0B', fontWeight: '600', fontSize: 13 }}>Upgrade</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payments Due Today Alert */}
        {dueTodayCount > 0 && (
          <View style={{ backgroundColor: '#ef4444', padding: 12, borderRadius: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }} data-testid="due-today-banner">
            <Ionicons name="alarm" size={20} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '600', flex: 1 }}>{dueTodayCount} payment(s) due today</Text>
          </View>
        )}

        {/* Admin Filter for Superadmins */}
        {isSuperAdmin && (
          <TouchableOpacity
            style={[styles.adminFilterButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowAdminFilter(true)}
            data-testid="admin-filter-btn"
          >
            <View style={styles.adminFilterContent}>
              <Ionicons name="funnel" size={18} color="#2563EB" />
              <Text style={[styles.adminFilterLabel, { color: colors.textMuted }]}>
                {t('filterByAdmin')}
              </Text>
              <Text style={styles.adminFilterValue}>{getSelectedAdminName()}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Admin Filter Modal */}
        <Modal
          visible={showAdminFilter}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAdminFilter(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowAdminFilter(false)}
          >
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {t('selectAdmin')}
              </Text>
              
              <TouchableOpacity
                style={[styles.modalOption, !selectedAdminId && styles.modalOptionActive]}
                onPress={() => {
                  setSelectedAdminId(null);
                  setShowAdminFilter(false);
                }}
              >
                <Ionicons name="person" size={18} color={!selectedAdminId ? '#2563EB' : colors.textMuted} />
                <Text style={[styles.modalOptionText, { color: colors.textMuted }, !selectedAdminId && styles.modalOptionTextActive]}>
                  {t('myData')}
                </Text>
                {!selectedAdminId && <Ionicons name="checkmark" size={18} color="#2563EB" />}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalOption, selectedAdminId === 'all' && styles.modalOptionActive]}
                onPress={() => {
                  setSelectedAdminId('all');
                  setShowAdminFilter(false);
                }}
              >
                <Ionicons name="people" size={18} color={selectedAdminId === 'all' ? '#2563EB' : colors.textMuted} />
                <Text style={[styles.modalOptionText, { color: colors.textMuted }, selectedAdminId === 'all' && styles.modalOptionTextActive]}>
                  {t('allAdmins')}
                </Text>
                {selectedAdminId === 'all' && <Ionicons name="checkmark" size={18} color="#2563EB" />}
              </TouchableOpacity>
              
              <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />
              
              {adminList.map((admin) => (
                <TouchableOpacity
                  key={admin.id}
                  style={[styles.modalOption, selectedAdminId === admin.id && styles.modalOptionActive]}
                  onPress={() => {
                    setSelectedAdminId(admin.id);
                    setShowAdminFilter(false);
                  }}
                >
                  <Ionicons name="person-circle" size={18} color={selectedAdminId === admin.id ? '#2563EB' : colors.textMuted} />
                  <Text style={[styles.modalOptionText, { color: colors.textMuted }, selectedAdminId === admin.id && styles.modalOptionTextActive]}>
                    {admin.first_name || admin.username}
                  </Text>
                  {selectedAdminId === admin.id && <Ionicons name="checkmark" size={18} color="#2563EB" />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('loanOverview')}</Text>

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
            <Text style={styles.statLabel}>{t('activeLoans')}</Text>
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
            <Text style={styles.statLabel}>{t('overdue')}</Text>
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
            <Text style={styles.statLabel}>{t('completed')}</Text>
          </TouchableOpacity>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="cash" size={20} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{formatAmount(loanStats.total_collected, 0)}</Text>
            <Text style={styles.statLabel}>{t('collected')}</Text>
          </View>
        </View>

        {/* Financial Summary */}
        <View style={[styles.financialSummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('collectionRate')}</Text>
            <Text style={[styles.financialValue, { color: '#10B981' }]}>{loanStats.collection_rate.toFixed(1)}%</Text>
          </View>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('totalDisbursed')}</Text>
            <Text style={[styles.financialValue, { color: colors.text }]}>{formatAmount(loanStats.total_disbursed)}</Text>
          </View>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('outstanding')}</Text>
            <Text style={[styles.financialValue, { color: '#F59E0B' }]}>{formatAmount(loanStats.total_outstanding)}</Text>
          </View>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('revenueThisMonth')}</Text>
            <Text style={[styles.financialValue, { color: '#10B981' }]}>{formatAmount(monthStats.revenue)}</Text>
          </View>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('profitThisMonth')}</Text>
            <Text style={[styles.financialValue, { color: '#2563EB' }]}>{formatAmount(monthStats.profit)}</Text>
          </View>
          <View style={[styles.financialRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.financialLabel, { color: colors.textMuted }]}>{t('dueThisMonth')}</Text>
            <Text style={[styles.financialValue, { color: '#F59E0B' }]}>{formatAmount(monthStats.dueOutstanding)}</Text>
          </View>
        </View>

        {/* Interest Earned from Archived Loans - Professional+ */}
        {hasFeature('interest_summary') ? (
          <View style={[styles.interestCard, { backgroundColor: colors.surface, borderColor: colors.border }]} data-testid="interest-earned-card">
            <View style={styles.interestCardHeader}>
              <Ionicons name="trending-up" size={20} color="#10B981" />
              <Text style={[styles.interestCardTitle, { color: colors.text }]}>
                {t('interestEarned')}
              </Text>
            </View>
            <View style={styles.interestCardBody}>
              <View style={styles.interestMainStat}>
                <Text style={[styles.interestMainValue, { color: '#10B981' }]} data-testid="total-interest-value">
                  {formatAmount(interestSummary.total_interest_earned)}
                </Text>
                <Text style={[styles.interestMainLabel, { color: colors.textMuted }]}>
                  {t('totalInterestEarned')}
                </Text>
              </View>
              <View style={[styles.interestDivider, { backgroundColor: colors.border }]} />
              <View style={styles.interestSubStats}>
                <View style={styles.interestSubStat}>
                  <Text style={[styles.interestSubValue, { color: '#2563EB' }]} data-testid="month-interest-value">
                    {formatAmount(interestSummary.current_month_interest)}
                  </Text>
                  <Text style={[styles.interestSubLabel, { color: colors.textMuted }]}>
                    {t('thisMonth2')}
                  </Text>
                </View>
                <View style={styles.interestSubStat}>
                  <Text style={[styles.interestSubValue, { color: colors.text }]} data-testid="total-archived-count">
                    {interestSummary.total_loans_archived}
                  </Text>
                  <Text style={[styles.interestSubLabel, { color: colors.textMuted }]}>
                    {t('loansArchived')}
                  </Text>
                </View>
                <View style={styles.interestSubStat}>
                  <Text style={[styles.interestSubValue, { color: '#F59E0B' }]} data-testid="month-archived-count">
                    {interestSummary.current_month_loans_archived}
                  </Text>
                  <Text style={[styles.interestSubLabel, { color: colors.textMuted }]}>
                    {t('thisMonth2')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.interestCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.6 }]} data-testid="interest-earned-card-locked">
            <View style={styles.featureLockedOverlay}>
              <Ionicons name="lock-closed" size={24} color="#fff" />
              <Text style={styles.featureLockedText}>Professional Plan</Text>
            </View>
            <View style={styles.interestCardHeader}>
              <Ionicons name="trending-up" size={20} color="#10B981" />
              <Text style={[styles.interestCardTitle, { color: colors.text }]}>
                {t('interestEarned')}
              </Text>
            </View>
            <View style={styles.interestCardBody}>
              <View style={styles.interestMainStat}>
                <Text style={[styles.interestMainValue, { color: '#10B981' }]}>---</Text>
                <Text style={[styles.interestMainLabel, { color: colors.textMuted }]}>
                  {t('totalInterestEarned')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Interest Trend Chart - Professional+ */}
        {hasFeature('interest_summary') && interestTrend.labels.length > 0 && (
          <View style={[styles.chartContainer, { backgroundColor: colors.surface, borderColor: colors.border }]} data-testid="interest-trend-chart">
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('monthlyInterestIncome')}
            </Text>
            <LineChart
              data={{
                labels: interestTrend.labels,
                datasets: [{ data: interestTrend.data.some(v => v > 0) ? interestTrend.data : [0, 0, 0, 0, 0, 0] }],
              }}
              width={Dimensions.get('window').width - 56}
              height={160}
              yAxisLabel={currencySymbol}
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                labelColor: (opacity = 1) => isDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(71, 85, 105, ${opacity})`,
                style: { borderRadius: 12 },
                propsForDots: {
                  r: '5',
                  strokeWidth: '2',
                  stroke: '#10B981',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: colors.border,
                  strokeWidth: 0.5,
                },
              }}
              bezier
              style={{ borderRadius: 12, marginTop: 4 }}
            />
          </View>
        )}

        {/* Heartbeat Monitoring Card - Professional+ */}
        {hasFeature('heartbeat') ? (
          <TouchableOpacity
            style={[styles.heartbeatCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push('/admin/clients?filter=silent')}
            activeOpacity={0.8}
            data-testid="heartbeat-card"
          >
            <View style={styles.heartbeatHeader}>
              <View style={styles.heartbeatTitleRow}>
                <Ionicons name="pulse" size={20} color="#10B981" />
                <Text style={[styles.heartbeatTitle, { color: colors.text }]}>
                  {t('deviceHeartbeat')}
                </Text>
              </View>
              <Text style={[styles.heartbeatSubtitle, { color: colors.textMuted }]}>
                {heartbeat.total_registered} {t('registered2')}
              </Text>
            </View>
            <View style={styles.heartbeatGrid}>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#10B981' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>{heartbeat.online_count}</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>&lt; 12h</Text>
              </View>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>{heartbeat.warning_count}</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>12-24h</Text>
              </View>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>{heartbeat.critical_count}</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>&gt; 24h</Text>
              </View>
            </View>
            {heartbeat.critical_count > 0 && (
              <View style={[styles.heartbeatAlert, { borderTopColor: colors.border }]}>
                <Ionicons name="warning" size={14} color="#EF4444" />
                <Text style={styles.heartbeatAlertText}>
                  {heartbeat.critical_count} {t('devicesUnresponsive24h') || 'devices unresponsive > 24h'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.heartbeatCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.6 }]} data-testid="heartbeat-card-locked">
            <View style={styles.featureLockedOverlay}>
              <Ionicons name="lock-closed" size={24} color="#fff" />
              <Text style={styles.featureLockedText}>Professional Plan</Text>
            </View>
            <View style={styles.heartbeatHeader}>
              <View style={styles.heartbeatTitleRow}>
                <Ionicons name="pulse" size={20} color="#10B981" />
                <Text style={[styles.heartbeatTitle, { color: colors.text }]}>
                  {t('deviceHeartbeat')}
                </Text>
              </View>
            </View>
            <View style={styles.heartbeatGrid}>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#10B981' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>--</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>{t('online')}</Text>
              </View>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>--</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>{t('warning')}</Text>
              </View>
              <View style={styles.heartbeatItem}>
                <View style={[styles.heartbeatDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.heartbeatCount, { color: colors.text }]}>--</Text>
                <Text style={[styles.heartbeatLabel, { color: colors.textMuted }]}>{t('critical')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Monthly Revenue Trend Chart - Professional+ */}
        {hasFeature('dashboard_analytics') && revenueChart.labels.length > 0 && (
          <View style={[styles.chartContainer, { backgroundColor: colors.surface, borderColor: colors.border }]} data-testid="revenue-chart">
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('monthlyRevenue')}
            </Text>
            <LineChart
              data={{
                labels: revenueChart.labels,
                datasets: [{ data: revenueChart.data.some(v => v > 0) ? revenueChart.data : [0, 0, 0, 0, 0, 0] }],
              }}
              width={Dimensions.get('window').width - 56}
              height={160}
              yAxisLabel={currencySymbol}
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: colors.surface,
                backgroundGradientFrom: colors.surface,
                backgroundGradientTo: colors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
                labelColor: (opacity = 1) => isDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(71, 85, 105, ${opacity})`,
                style: { borderRadius: 12 },
                propsForDots: {
                  r: '5',
                  strokeWidth: '2',
                  stroke: '#2563EB',
                },
                propsForBackgroundLines: {
                  strokeDasharray: '',
                  stroke: colors.border,
                  strokeWidth: 0.5,
                },
              }}
              bezier
              style={{ borderRadius: 12, marginTop: 8 }}
            />
          </View>
        )}
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerCredits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F59E0B20',
  },
  headerCreditsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
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
    backgroundColor: '#152035',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  // Heartbeat card styles
  heartbeatCard: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  heartbeatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    fontSize: 18,
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
    borderTopColor: '#1E3050',
  },
  heartbeatAlertText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  // Chart styles
  chartContainer: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  // Admin Filter styles
  adminFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2563EB30',
  },
  adminFilterContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  adminFilterLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  adminFilterValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalOptionActive: {
    backgroundColor: '#2563EB20',
  },
  modalOptionText: {
    flex: 1,
    fontSize: 15,
    color: '#94A3B8',
  },
  modalOptionTextActive: {
    color: '#2563EB',
    fontWeight: '500',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#1E3050',
    marginVertical: 8,
  },
  // Interest Earned Card styles
  interestCard: {
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
  },
  interestCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  interestCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  interestCardBody: {
    gap: 10,
  },
  interestMainStat: {
    alignItems: 'center',
    gap: 2,
  },
  interestMainValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  interestMainLabel: {
    fontSize: 13,
  },
  interestDivider: {
    height: 1,
  },
  interestSubStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  interestSubStat: {
    alignItems: 'center',
    gap: 4,
  },
  interestSubValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  interestSubLabel: {
    fontSize: 11,
  },
  // Plan Badge styles
  planBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  planBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  upgradePlanBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  upgradePlanBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Feature locked overlay styles
  featureLockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  featureLockedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
