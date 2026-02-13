import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';


interface DeviceStats {
  total_clients: number;
  locked_devices: number;
  registered_devices: number;
  unlocked_devices: number;
}

export default function DeviceManagement() {
  const router = useRouter();
  const { language } = useLanguage();
  const [stats, setStats] = useState<DeviceStats>({
    total_clients: 0,
    locked_devices: 0,
    registered_devices: 0,
    unlocked_devices: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const adminId = await AsyncStorage.getItem('admin_id');
      const url = adminId 
        ? `${API_URL}/api/stats?admin_id=${adminId}` 
        : `${API_URL}/api/stats`;
      const response = await fetch(url);
      const data = await response.json();
      setStats(data);
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
          {language === 'et' ? 'Seadmehaldus' : 'Device Management'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Seadmete ülevaade' : 'Device Overview'}
        </Text>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#1E3A5F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="phone-portrait" size={28} color="#3B82F6" />
            </View>
            <Text style={styles.statValue}>{stats.total_clients}</Text>
            <Text style={styles.statLabel}>
              {language === 'et' ? 'Seadmeid kokku' : 'Total Devices'}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D1F1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-closed" size={28} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{stats.locked_devices}</Text>
            <Text style={styles.statLabel}>
              {language === 'et' ? 'Lukustatud' : 'Locked'}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#1F3D2E' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="checkmark-circle" size={28} color="#10B981" />
            </View>
            <Text style={styles.statValue}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>
              {language === 'et' ? 'Registreeritud' : 'Registered'}
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#3D3D1F' }]}>
            <View style={styles.statIcon}>
              <Ionicons name="lock-open" size={28} color="#F59E0B" />
            </View>
            <Text style={styles.statValue}>{stats.unlocked_devices}</Text>
            <Text style={styles.statLabel}>
              {language === 'et' ? 'Vabastatud' : 'Unlocked'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Kiired toimingud' : 'Quick Actions'}
        </Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/clients')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#4F46E5' }]}>
              <Ionicons name="list" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {language === 'et' ? 'Vaata seadmeid' : 'View Devices'}
              </Text>
              <Text style={styles.actionDescription}>
                {language === 'et' ? 'Halda kõiki kliente ja seadmeid' : 'Manage all clients and devices'}
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
                {language === 'et' ? 'Lisa uus klient' : 'Add New Client'}
              </Text>
              <Text style={styles.actionDescription}>
                {language === 'et' ? 'Registreeri uus seade' : 'Register a new device'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/admin/device-setup')}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="qr-code" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {language === 'et' ? 'Seadme seadistus' : 'Device Setup'}
              </Text>
              <Text style={styles.actionDescription}>
                {language === 'et' ? 'QR-kood automaatseks seadistuseks' : 'QR code for automatic setup'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#4F46E5" />
          <Text style={styles.infoText}>
            {language === 'et' 
              ? 'Seadmed lukustatakse automaatselt, kui klient ei tee õigeaegselt makseid. Võite seadmeid käsitsi lukustada või vabastada kliendivaates.'
              : 'Devices are automatically locked when clients miss payments. You can manually lock or unlock devices from the client view.'}
          </Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
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
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4F46E5',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
});