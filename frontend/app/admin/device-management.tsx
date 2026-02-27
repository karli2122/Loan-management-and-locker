import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  Clipboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';


interface DeviceStats {
  total_clients: number;
  locked_devices: number;
  registered_devices: number;
  unlocked_devices: number;
}

export default function DeviceManagement() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [stats, setStats] = useState<DeviceStats>({
    total_clients: 0,
    locked_devices: 0,
    registered_devices: 0,
    unlocked_devices: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [planAllowsBusinessMgmt, setPlanAllowsBusinessMgmt] = useState(false);

  const fetchStats = async () => {
    try {
      const adminId = await AsyncStorage.getItem('admin_id');
      const url = adminId 
        ? `${API_URL}/api/stats?admin_id=${adminId}` 
        : `${API_URL}/api/stats`;
      const response = await fetch(url);
      const data = await response.json();
      setStats(data);
      
      // Check plan limits for Business Management visibility
      const token = await AsyncStorage.getItem('admin_token');
      if (token) {
        try {
          const planResp = await fetch(`${API_URL}/api/plans/limits?admin_token=${token}`);
          if (planResp.ok) {
            const planData = await planResp.json();
            setPlanAllowsBusinessMgmt(planData.limits?.business_management || planData.is_super_admin || false);
          }
        } catch (e) {}
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('deviceManagement')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        <Text style={styles.sectionTitle}>
          {t('deviceOverview')}
        </Text>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1E3A5F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="phone-portrait" size={28} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>
              {t('totalDevices')}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D1F1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-closed" size={28} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{stats.locked_devices}</Text>
            <Text style={styles.statLabel}>
              {t('locked')}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#1F3D2E' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={28} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>
              {t('registered')}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-open" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{stats.unlocked_devices}</Text>
            <Text style={styles.statLabel}>
              {t('unlocked')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {t('quickActions')}
        </Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/clients')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#2563EB' }]}>
              <Ionicons name="list" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {t('viewDevices')}
              </Text>
              <Text style={styles.actionDescription}>
                {t('manageAllClientsAndDevices')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/add-client')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="person-add" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {t('addNewClient')}
              </Text>
              <Text style={styles.actionDescription}>
                {t('registerANewDevice')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Business Management - only visible to Business/Enterprise/Custom + superadmin */}
        {planAllowsBusinessMgmt && (
        <TouchableOpacity
          style={[styles.businessMgmtHeader, { marginBottom: 40 }]}
          onPress={() => router.push('/admin/business-management')}
          data-testid="business-management-nav"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.actionIcon, { backgroundColor: '#F97316' }]}>
              <Ionicons name="business" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle} data-testid="business-management-title">
                {language === 'et' ? 'Ärihaldus' : 'Business Management'}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B' }}>
                {language === 'et' ? 'Device Owner kiosk-režiimi aktiveerimine' : 'Device Owner kiosk mode activation'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
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
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 12,
    color: '#64748B',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  businessMgmtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  businessMgmtContent: {
    marginBottom: 24,
  },
  modeCompareContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  modeCard: {
    flex: 1,
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  modeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  modeDesc: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#152035',
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  methodButtonActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  methodButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  methodButtonTextActive: {
    color: '#fff',
  },
  instructionBox: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  instructionSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 4,
  },
  instructionStep: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
  },
  codeBlock: {
    backgroundColor: '#0B1527',
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  codeText: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#10B981',
    lineHeight: 18,
  },
  copyButton: {
    padding: 4,
    marginLeft: 8,
  },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F59E0B15',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#FBBF24',
    lineHeight: 18,
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0B1527',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  comingSoonText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});