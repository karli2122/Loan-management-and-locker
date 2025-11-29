import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Linking,
  AppState,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../context/LanguageContext';
import { devicePolicy } from '../utils/DevicePolicy';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClientStatus {
  id: string;
  name: string;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  emi_amount: number;
  emi_due_date: string | null;
}

export default function ClientHome() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isDeviceOwner, setIsDeviceOwner] = useState(false);
  const [kioskActive, setKioskActive] = useState(false);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLocked = useRef(false);

  // Check Device Owner status
  const checkDeviceOwner = async () => {
    if (Platform.OS === 'android') {
      const owner = await devicePolicy.isDeviceOwner();
      setIsDeviceOwner(owner);
      if (owner) {
        // Block uninstall if device owner
        await devicePolicy.disableUninstall(true);
      }
    }
  };

  // Enable/Disable Kiosk mode based on lock status
  const updateKioskMode = async (locked: boolean) => {
    if (Platform.OS === 'android' && isDeviceOwner) {
      try {
        if (locked && !kioskActive) {
          await devicePolicy.setKioskMode(true);
          await devicePolicy.setLockState(true);
          setKioskActive(true);
          wasLocked.current = true;
        } else if (!locked && kioskActive) {
          await devicePolicy.setKioskMode(false);
          await devicePolicy.setLockState(false);
          setKioskActive(false);
          wasLocked.current = false;
        }
      } catch (error) {
        console.error('Kiosk mode error:', error);
      }
    }
  };

  const fetchStatus = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/device/status/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          await AsyncStorage.removeItem('client_id');
          router.replace('/client/register');
          return;
        }
        throw new Error('Failed to fetch status');
      }
      const data = await response.json();
      setStatus(data);
      
      // Update kiosk mode based on lock status
      if (data.is_locked !== wasLocked.current) {
        updateKioskMode(data.is_locked);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLocation = async (id: string) => {
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await fetch(`${API_URL}/api/device/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: id,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const loadClientData = async () => {
    const id = await AsyncStorage.getItem('client_id');
    if (!id) {
      router.replace('/client/register');
      return;
    }
    setClientId(id);
    await fetchStatus(id);
    await updateLocation(id);
  };

  useEffect(() => {
    loadClientData();

    intervalRef.current = setInterval(() => {
      if (clientId) {
        fetchStatus(clientId);
      }
    }, 5000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (clientId) {
          fetchStatus(clientId);
          updateLocation(clientId);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription.remove();
    };
  }, [clientId]);

  const onRefresh = useCallback(async () => {
    if (!clientId) return;
    setRefreshing(true);
    await fetchStatus(clientId);
    await updateLocation(clientId);
    setRefreshing(false);
  }, [clientId]);

  const handleClearWarning = async () => {
    if (!clientId) return;
    try {
      await fetch(`${API_URL}/api/device/clear-warning/${clientId}`, {
        method: 'POST',
      });
      await fetchStatus(clientId);
    } catch (error) {
      console.error('Error clearing warning:', error);
    }
  };

  const handleUnregister = () => {
    Alert.alert(
      t('unregisterDevice'),
      t('unregisterConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unregister'),
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('client_id');
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleContactSupport = () => {
    Alert.alert(t('contactSupport'), t('howToContact'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('call'), onPress: () => Linking.openURL('tel:+1234567890') },
      { text: t('email'), onPress: () => Linking.openURL('mailto:support@emilock.com') },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('loadingAccount')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Lock Screen Overlay
  if (status?.is_locked) {
    return (
      <SafeAreaView style={styles.lockContainer}>
        <View style={styles.lockContent}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="lock-closed" size={80} color="#EF4444" />
          </View>
          <Text style={styles.lockTitle}>{t('deviceLocked')}</Text>
          <Text style={styles.lockMessage}>{status.lock_message}</Text>

          <View style={styles.lockEmiInfo}>
            <View style={styles.lockEmiItem}>
              <Text style={styles.lockEmiLabel}>{t('pendingAmount')}</Text>
              <Text style={styles.lockEmiValue}>€{status.emi_amount.toLocaleString()}</Text>
            </View>
            {status.emi_due_date && (
              <View style={styles.lockEmiItem}>
                <Text style={styles.lockEmiLabel}>{t('dueDate')}</Text>
                <Text style={styles.lockEmiValue}>{status.emi_due_date}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.contactButton} onPress={handleContactSupport}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>{t('contactSupport')}</Text>
          </TouchableOpacity>

          <Text style={styles.lockFooter}>
            {t('clearEmiToUnlock')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('welcome')}</Text>
          <Text style={styles.name}>{status?.name || 'User'}</Text>
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
          <TouchableOpacity style={styles.settingsButton} onPress={handleUnregister}>
            <Ionicons name="settings-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Warning Banner */}
        {status?.warning_message && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={24} color="#F59E0B" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>{t('warning')}</Text>
              <Text style={styles.warningText}>{status.warning_message}</Text>
            </View>
            <TouchableOpacity onPress={handleClearWarning}>
              <Ionicons name="close-circle" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Ionicons name="shield-checkmark" size={32} color="#10B981" />
            <Text style={styles.statusTitle}>{t('deviceStatus')}</Text>
          </View>
          <View style={styles.statusBadgeContainer}>
            <View style={[styles.statusBadge, styles.unlockedBadge]}>
              <Ionicons name="lock-open" size={16} color="#10B981" />
              <Text style={[styles.statusText, styles.unlockedText]}>{t('unlocked')}</Text>
            </View>
          </View>
          <Text style={styles.statusInfo}>{t('deviceActiveNormal')}</Text>
        </View>

        {/* EMI Card */}
        <View style={styles.emiCard}>
          <Text style={styles.emiCardTitle}>{t('emiDetails')}</Text>
          <View style={styles.emiDetails}>
            <View style={styles.emiDetailItem}>
              <Text style={styles.emiDetailLabel}>{t('monthlyEmi')}</Text>
              <Text style={styles.emiDetailValue}>€{status?.emi_amount.toLocaleString() || '0'}</Text>
            </View>
            <View style={styles.emiDetailDivider} />
            <View style={styles.emiDetailItem}>
              <Text style={styles.emiDetailLabel}>{t('dueDate')}</Text>
              <Text style={styles.emiDetailValue}>{status?.emi_due_date || t('notSet')}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
          <TouchableOpacity style={styles.actionCard} onPress={handleContactSupport}>
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="headset" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>{t('contactSupport')}</Text>
              <Text style={styles.actionDescription}>{t('getHelp')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={onRefresh}>
            <View style={[styles.actionIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="refresh" size={24} color="#fff" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>{t('refreshStatus')}</Text>
              <Text style={styles.actionDescription}>{t('checkForUpdates')}</Text>
            </View>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 12,
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
    backgroundColor: '#10B981',
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
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingsButton: {
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#FCD34D',
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadgeContainer: {
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  unlockedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  unlockedText: {
    color: '#10B981',
  },
  statusInfo: {
    fontSize: 14,
    color: '#94A3B8',
  },
  emiCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  emiCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  emiDetails: {
    flexDirection: 'row',
  },
  emiDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  emiDetailLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  emiDetailValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  emiDetailDivider: {
    width: 1,
    backgroundColor: '#334155',
  },
  actionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
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
  },
  actionDescription: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  // Lock Screen Styles
  lockContainer: {
    flex: 1,
    backgroundColor: '#7F1D1D',
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  lockIconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  lockTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  lockMessage: {
    fontSize: 16,
    color: '#FCA5A5',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  lockEmiInfo: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    width: '100%',
  },
  lockEmiItem: {
    flex: 1,
    alignItems: 'center',
  },
  lockEmiLabel: {
    fontSize: 13,
    color: '#FCA5A5',
    marginBottom: 4,
  },
  lockEmiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
    marginBottom: 24,
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  lockFooter: {
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
  },
});
