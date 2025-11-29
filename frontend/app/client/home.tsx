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
import { useLanguage } from '../../src/context/LanguageContext';
import { devicePolicy } from '../../src/utils/DevicePolicy';
import OfflineSyncManager from '../../src/services/OfflineSyncManager';

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
  const [isAdminActive, setIsAdminActive] = useState(false);
  const [kioskActive, setKioskActive] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLocked = useRef(false);

  // Check and setup Device Owner/Admin
  const checkAndSetupDeviceProtection = async () => {
    if (Platform.OS !== 'android') return;
    
    try {
      // Check Device Owner status
      const owner = await devicePolicy.isDeviceOwner();
      setIsDeviceOwner(owner);
      
      // Check Admin status
      const admin = await devicePolicy.isAdminActive();
      setIsAdminActive(admin);
      
      if (owner) {
        // If device owner, enable uninstall protection
        await devicePolicy.disableUninstall(true);
        setSetupComplete(true);
        console.log('Device Owner mode active - full protection enabled');
      } else if (!admin) {
        // If not admin, request admin permissions automatically
        console.log('Requesting Device Admin permissions...');
        // Small delay to let UI load first
        setTimeout(async () => {
          try {
            await devicePolicy.requestAdmin();
          } catch (e) {
            console.log('Admin request failed:', e);
          }
        }, 2000);
      } else {
        setSetupComplete(true);
        console.log('Device Admin active - basic protection enabled');
      }
    } catch (error) {
      console.error('Device protection setup error:', error);
    }
  };

  // Enable/Disable Kiosk mode based on lock status
  const updateKioskMode = async (locked: boolean) => {
    if (Platform.OS !== 'android') return;
    
    try {
      // Save lock state for boot receiver
      await devicePolicy.setLockState(locked);
      
      if (isDeviceOwner) {
        if (locked && !kioskActive) {
          await devicePolicy.setKioskMode(true);
          setKioskActive(true);
          console.log('Kiosk mode enabled');
        } else if (!locked && kioskActive) {
          await devicePolicy.setKioskMode(false);
          setKioskActive(false);
          console.log('Kiosk mode disabled');
        }
      }
      
      wasLocked.current = locked;
    } catch (error) {
      console.error('Kiosk mode error:', error);
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
      
      // Check if admin has allowed uninstall
      if (data.uninstall_allowed && Platform.OS === 'android') {
        handleUninstallSignal();
      }
      
      // Update kiosk mode based on lock status change
      if (data.is_locked !== wasLocked.current) {
        updateKioskMode(data.is_locked);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUninstallSignal = async () => {
    try {
      const DeviceAdmin = (await import('../../src/components/DeviceAdmin')).default;
      
      // Allow app to be uninstalled
      await DeviceAdmin.allowUninstall();
      
      console.log('App uninstall protection disabled by admin');
      
      // Show alert to user
      Alert.alert(
        'Account Removed',
        'Your account has been removed by the administrator. You can now uninstall this app.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.log('Error handling uninstall signal:', error);
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
    // Setup device protection first
    checkAndSetupDeviceProtection();
    
    // Then load client data
    loadClientData();

    // Poll status every 5 seconds
    intervalRef.current = setInterval(() => {
      if (clientId) {
        fetchStatus(clientId);
      }
    }, 5000);

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (clientId) {
          fetchStatus(clientId);
          updateLocation(clientId);
        }
        // Re-check protection on app resume
        checkAndSetupDeviceProtection();
      }
      appState.current = nextAppState;
    });

    // Block back button when locked
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status?.is_locked) {
        return true; // Prevent going back when locked
      }
      return false;
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription.remove();
      backHandler.remove();
    };
  }, [clientId, status?.is_locked]);

  // Initialize tamper detection and check for reboot
  useEffect(() => {
    const initializeTamperProtection = async () => {
      if (!clientId || Platform.OS !== 'android') return;

      try {
        // Check if this is a fresh app start (potential reboot)
        const lastAppStart = await AsyncStorage.getItem('last_app_start');
        const now = Date.now();
        
        if (lastAppStart) {
          const timeDiff = now - parseInt(lastAppStart);
          // If more than 1 minute since last start, likely a reboot
          if (timeDiff > 60000) {
            console.log('Potential reboot detected');
            await reportReboot(clientId);
          }
        }
        
        await AsyncStorage.setItem('last_app_start', now.toString());

        // Start tamper detection service
        const DeviceAdmin = (await import('../../src/components/DeviceAdmin')).default;
        const result = await DeviceAdmin.startTamperDetection();
        console.log('Tamper detection:', result);
        
        // Enable uninstall protection
        await DeviceAdmin.preventUninstall(true);
        
      } catch (error) {
        console.log('Tamper protection setup error:', error);
      }
    };

    initializeTamperProtection();
  }, [clientId]);

  const reportReboot = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/report-reboot`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Reboot reported:', data);
        
        // If device should be locked, ensure it's locked
        if (data.should_lock && status) {
          await updateKioskMode(true);
        }
      }
    } catch (error) {
      console.log('Reboot report failed:', error);
    }
  };

  const reportTamperAttempt = async (tamperType: string) => {
    if (!clientId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/clients/${clientId}/report-tamper?tamper_type=${tamperType}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tamper attempt logged:', data);
        
        // Force immediate lock on tamper attempt
        if (status) {
          await updateKioskMode(true);
          Alert.alert(
            'Security Alert',
            'Tampering detected. Device has been locked.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.log('Tamper report failed:', error);
    }
  };

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
    // Don't allow unregister if device is locked
    if (status?.is_locked) {
      Alert.alert(
        language === 'et' ? 'Keelatud' : 'Not Allowed',
        language === 'et' ? 'Seade on lukustatud. Registreerimist ei saa tühistada.' : 'Device is locked. Cannot unregister.'
      );
      return;
    }
    
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

  // Lock Screen Overlay - Full screen, no escape
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
          
          {/* Protection Status */}
          <View style={styles.protectionStatus}>
            <Ionicons 
              name={isDeviceOwner ? "shield-checkmark" : "shield"} 
              size={16} 
              color={isDeviceOwner ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.protectionText}>
              {isDeviceOwner 
                ? (language === 'et' ? 'Täielik kaitse aktiivne' : 'Full protection active')
                : (language === 'et' ? 'Põhikaitse aktiivne' : 'Basic protection active')}
            </Text>
          </View>
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
        {/* Protection Status Banner */}
        <View style={[styles.protectionBanner, isDeviceOwner ? styles.protectionFull : styles.protectionBasic]}>
          <Ionicons 
            name={isDeviceOwner ? "shield-checkmark" : "shield"} 
            size={24} 
            color={isDeviceOwner ? "#10B981" : "#F59E0B"} 
          />
          <View style={styles.protectionBannerContent}>
            <Text style={styles.protectionBannerTitle}>
              {isDeviceOwner 
                ? (language === 'et' ? 'Täielik kaitse' : 'Full Protection')
                : (language === 'et' ? 'Põhikaitse' : 'Basic Protection')}
            </Text>
            <Text style={styles.protectionBannerText}>
              {isDeviceOwner 
                ? (language === 'et' ? 'Seade on täielikult kaitstud' : 'Device is fully protected')
                : (language === 'et' ? 'Administraatori õigused aktiivsed' : 'Admin permissions active')}
            </Text>
          </View>
        </View>

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
  protectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  protectionFull: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  protectionBasic: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  protectionBannerContent: {
    flex: 1,
  },
  protectionBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  protectionBannerText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
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
    marginBottom: 16,
  },
  protectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  protectionText: {
    fontSize: 12,
    color: '#FCA5A5',
  },
});
