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

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const [userRole, setUserRole] = useState('user');

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/reports/collection`);
      const data = await response.json();
      
      setLoanStats({
        total_clients: data.overview.total_clients,
        active_loans: data.overview.active_loans,
        completed_loans: data.overview.completed_loans,
        overdue_clients: data.overview.overdue_clients,
        total_disbursed: data.financial.total_disbursed,
        total_collected: data.financial.total_collected,
        total_outstanding: data.financial.total_outstanding,
        collection_rate: data.financial.collection_rate,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
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
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStats();
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
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        <Text style={styles.sectionTitle}>{t('dashboardOverview')}</Text>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1E3A5F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="people" size={28} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{stats.total_clients}</Text>
            <Text style={styles.statLabel}>{t('totalClients')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D1F1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-closed" size={28} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{stats.locked_devices}</Text>
            <Text style={styles.statLabel}>{t('lockedDevices')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#1F3D2E' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={28} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>{t('registered')}</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-open" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{stats.unlocked_devices}</Text>
            <Text style={styles.statLabel}>{t('unlocked')}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('quickActions')}</Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/clients')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#4F46E5' }]}>
              <Ionicons name="list" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('viewClients')}</Text>
            <Text style={styles.actionDescription}>{t('manageClients')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/add-client')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{t('addNewClient')}</Text>
            <Text style={styles.actionDescription}>{t('registerNewClient')}</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/device-setup')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="qr-code" size={24} color="#fff" />
            </View>
            <Text style={styles.actionTitle}>{language === 'et' ? 'Seadme seadistus' : 'Device Setup'}</Text>
            <Text style={styles.actionDescription}>{language === 'et' ? 'QR-kood automaatseks seadistuseks' : 'QR code for automatic setup'}</Text>
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
            <Text style={styles.actionTitle}>{language === 'et' ? 'EMI kalkulaator' : 'EMI Calculator'}</Text>
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
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
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
});
