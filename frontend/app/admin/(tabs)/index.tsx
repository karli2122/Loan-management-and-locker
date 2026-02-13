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
import { useLanguage } from '../../../src/context/LanguageContext';
import API_URL from '../../../src/constants/api';


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
  const [monthStats, setMonthStats] = useState<MonthStats>({
    revenue: 0,
    profit: 0,
    dueOutstanding: 0,
  });

  const fetchStats = async () => {
    const baseUrl = API_URL || 'https://api-token-migration.preview.emergentagent.com';
    try {
      const adminId = await AsyncStorage.getItem('admin_id');
      if (!adminId) {
        console.error('Admin ID not found');
        return;
      }
      
      const response = await fetch(`${baseUrl}/api/reports/collection?admin_id=${adminId}`);
      if (!response.ok) {
        console.error('API error:', response.status);
        return;
      }
      const data = await response.json();
      
      // Safe access with fallbacks
      setLoanStats({
        total_clients: data?.overview?.total_clients ?? 0,
        active_loans: data?.overview?.active_loans ?? 0,
        completed_loans: data?.overview?.completed_loans ?? 0,
        overdue_clients: data?.overview?.overdue_clients ?? 0,
        total_disbursed: data?.financial?.total_disbursed ?? 0,
        total_collected: data?.financial?.total_collected ?? 0,
        total_outstanding: data?.financial?.total_outstanding ?? 0,
        collection_rate: data?.financial?.collection_rate ?? 0,
      });
      setMonthStats({
        revenue: data?.this_month?.total_collected ?? 0,
        profit: data?.this_month?.profit_collected ?? 0,
        dueOutstanding: data?.this_month?.due_outstanding ?? 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const loadUserData = async () => {
    const storedUsername = await AsyncStorage.getItem('admin_username');
    const role = await AsyncStorage.getItem('admin_role');
    const storedFirst = await AsyncStorage.getItem('admin_first_name');
    if (storedUsername) setUsername(storedUsername);
    if (storedFirst) setFirstName(storedFirst);
    if (role) setUserRole(role);
  };

  useEffect(() => {
    loadUserData();
    fetchStats();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <View style={{flex: 1}}>
          <Text style={styles.greeting}>{t('welcomeBack')}</Text>
          <Text style={styles.username}>
            {username === 'karli1987'
              ? 'Admin'
              : firstName || username || 'Admin'}
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
            onPress={() => router.push('/admin/loan-management')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="wallet" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Laenuhaldus' : 'Loan Management'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'Halda laene ja makseid' : 'Manage loans & payments'}</Text>
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
});
