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

type ActivationMethod = 'adb' | 'qr' | 'nfc';

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
  const [activationMethod, setActivationMethod] = useState<ActivationMethod>('adb');
  const [showBusinessMgmt, setShowBusinessMgmt] = useState(false);

  const fetchStats = async () => {
    try {
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
            <Text style={styles.statValue}>{stats.total_clients}</Text>
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

        {/* Business Management Section */}
        <TouchableOpacity
          style={styles.businessMgmtHeader}
          onPress={() => setShowBusinessMgmt(!showBusinessMgmt)}
          data-testid="business-management-toggle"
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
          <Ionicons name={showBusinessMgmt ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
        </TouchableOpacity>

        {showBusinessMgmt && (
          <View style={styles.businessMgmtContent} data-testid="business-management-content">
            {/* Mode Comparison */}
            <View style={styles.modeCompareContainer}>
              <View style={styles.modeCard}>
                <View style={[styles.modeBadge, { backgroundColor: '#2563EB20' }]}>
                  <Ionicons name="shield-half" size={20} color="#2563EB" />
                </View>
                <Text style={styles.modeTitle}>Device Admin</Text>
                <Text style={styles.modeDesc}>
                  {language === 'et' ? '8-kohaline kood\nStandardne lukustus\nKasutaja saab keelata' : '8-digit code\nStandard lock\nUser can disable'}
                </Text>
              </View>
              <View style={styles.modeCard}>
                <View style={[styles.modeBadge, { backgroundColor: '#F9731620' }]}>
                  <Ionicons name="shield-checkmark" size={20} color="#F97316" />
                </View>
                <Text style={[styles.modeTitle, { color: '#F97316' }]}>Device Owner</Text>
                <Text style={styles.modeDesc}>
                  {language === 'et' ? '9-kohaline kood\nTäielik kiosk-režiim\nEi saa keelata' : '9-digit code\nFull kiosk mode\nCannot be disabled'}
                </Text>
              </View>
            </View>

            {/* Activation Method Selector */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
              {language === 'et' ? 'Aktiveerimismeetod' : 'Activation Method'}
            </Text>
            <View style={styles.methodSelector}>
              {(['adb', 'qr', 'nfc'] as ActivationMethod[]).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.methodButton,
                    activationMethod === method && styles.methodButtonActive,
                  ]}
                  onPress={() => setActivationMethod(method)}
                  data-testid={`method-${method}`}
                >
                  <Ionicons
                    name={method === 'adb' ? 'terminal' : method === 'qr' ? 'qr-code' : 'bluetooth'}
                    size={18}
                    color={activationMethod === method ? '#fff' : '#94A3B8'}
                  />
                  <Text style={[
                    styles.methodButtonText,
                    activationMethod === method && styles.methodButtonTextActive,
                  ]}>
                    {method === 'adb' ? 'ADB' : method === 'qr' ? 'QR Code' : 'NFC'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Instructions based on selected method */}
            {activationMethod === 'adb' && (
              <View style={styles.instructionBox}>
                <View style={styles.instructionHeader}>
                  <Ionicons name="terminal" size={20} color="#F97316" />
                  <Text style={styles.instructionTitle}>
                    {language === 'et' ? 'ADB kaudu aktiveerimine' : 'ADB Activation'}
                  </Text>
                </View>
                <Text style={styles.instructionSubtitle}>
                  {language === 'et' ? 'Eeltingimused:' : 'Prerequisites:'}
                </Text>
                <Text style={styles.instructionStep}>
                  {language === 'et'
                    ? '1. Installige ADB (Android Debug Bridge) arvutisse\n2. Lubage seadmes USB silumine (Seaded > Arendaja valikud)\n3. Ühendage seade USB kaabli abil arvutiga'
                    : '1. Install ADB (Android Debug Bridge) on your computer\n2. Enable USB Debugging on the device (Settings > Developer Options)\n3. Connect the device to your computer via USB cable'}
                </Text>
                <Text style={[styles.instructionSubtitle, { marginTop: 12 }]}>
                  {language === 'et' ? 'Sammud:' : 'Steps:'}
                </Text>
                <Text style={styles.instructionStep}>
                  {language === 'et'
                    ? '1. Tehaseseadistage seade (Seaded > Üldine haldus > Lähtesta)\n2. Seadistuse ajal ärge lisage Google kontot\n3. Lubage uuesti USB silumine\n4. Käivitage terminal ja sisestage:'
                    : '1. Factory reset the device (Settings > General Management > Reset)\n2. During setup, do NOT add a Google account\n3. Enable USB Debugging again\n4. Open terminal and run:'}
                </Text>

                <View style={styles.codeBlock}>
                  <Text style={styles.codeText} selectable>
                    adb shell dpm set-device-owner{'\n'}com.paylock.client/.DeviceAdminReceiver
                  </Text>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => {
                      try {
                        Clipboard.setString('adb shell dpm set-device-owner com.paylock.client/.DeviceAdminReceiver');
                      } catch (e) {}
                    }}
                    data-testid="copy-adb-command"
                  >
                    <Ionicons name="copy" size={16} color="#2563EB" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.instructionStep}>
                  {language === 'et'
                    ? '5. Kui näete "Success", on Device Owner režiim aktiveeritud\n6. Installige PayLock Client rakendus ja registreerige 9-kohalise koodiga'
                    : '5. If you see "Success", Device Owner mode is activated\n6. Install the PayLock Client app and register with a 9-digit code'}
                </Text>

                <View style={styles.warningBox}>
                  <Ionicons name="warning" size={18} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    {language === 'et'
                      ? 'NB! Seadmel ei tohi olla teisi kontosid (Google, Samsung jne). Kõik kontod tuleb enne eemaldada.'
                      : 'Important: The device must not have any accounts (Google, Samsung, etc). Remove all accounts first.'}
                  </Text>
                </View>
              </View>
            )}

            {activationMethod === 'qr' && (
              <View style={styles.instructionBox}>
                <View style={styles.instructionHeader}>
                  <Ionicons name="qr-code" size={20} color="#F97316" />
                  <Text style={styles.instructionTitle}>
                    {language === 'et' ? 'QR-koodi aktiveerimine' : 'QR Code Activation'}
                  </Text>
                </View>
                <Text style={styles.instructionStep}>
                  {language === 'et'
                    ? '1. Tehaseseadistage seade\n2. Seadistusekraanil puudutage 6 korda kiirelt ükskõik kuhu\n3. Ühenduge WiFi-ga, kui palutakse\n4. Skaneerige PayLock Pro QR-kood seadme kaameraga\n5. Seade seadistab automaatselt Device Owner režiimi'
                    : '1. Factory reset the device\n2. On the setup screen, tap 6 times rapidly anywhere\n3. Connect to WiFi when prompted\n4. Scan the PayLock Pro QR code with the device camera\n5. The device will automatically configure Device Owner mode'}
                </Text>
                <TouchableOpacity
                  style={[styles.methodButton, styles.methodButtonActive, { flex: 0, marginTop: 12, paddingHorizontal: 20 }]}
                  onPress={async () => {
                    try {
                      const token = await AsyncStorage.getItem('admin_token');
                      if (!token) return;
                      const response = await fetch(`${API_URL}/api/provisioning/qr-code?admin_token=${token}`);
                      if (!response.ok) throw new Error('Failed to generate QR code');
                      const data = await response.json();
                      Alert.alert(
                        'QR Code Generated',
                        language === 'et'
                          ? 'QR-kood on genereeritud. Kasutage seda seadme seadistamisel skaneerimiseks.'
                          : 'QR code generated. Use this during device setup to scan and provision.',
                      );
                    } catch (error: any) {
                      Alert.alert('Error', error.message);
                    }
                  }}
                  data-testid="generate-qr-btn"
                >
                  <Ionicons name="qr-code" size={18} color="#fff" />
                  <Text style={styles.methodButtonTextActive}>
                    {language === 'et' ? 'Genereeri QR-kood' : 'Generate QR Code'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {activationMethod === 'nfc' && (
              <View style={styles.instructionBox}>
                <View style={styles.instructionHeader}>
                  <Ionicons name="bluetooth" size={20} color="#F97316" />
                  <Text style={styles.instructionTitle}>
                    {language === 'et' ? 'NFC aktiveerimine' : 'NFC Activation'}
                  </Text>
                </View>
                <Text style={styles.instructionStep}>
                  {language === 'et'
                    ? '1. Vaja on NFC-toega programmeerimisseadet\n2. Tehaseseadistage sihtseade\n3. Seadistusekraanil puudutage NFC-silt seadmele\n4. Seade seadistab automaatselt Device Owner režiimi'
                    : '1. Requires an NFC-capable programming device\n2. Factory reset the target device\n3. On the setup screen, tap the NFC tag to the device\n4. The device will automatically configure Device Owner mode'}
                </Text>
                <View style={styles.comingSoonBadge}>
                  <Ionicons name="time" size={16} color="#94A3B8" />
                  <Text style={styles.comingSoonText}>
                    {language === 'et' ? 'NFC programmeerimise tugi tuleb peagi' : 'NFC programming support coming soon'}
                  </Text>
                </View>
              </View>
            )}

            {/* Troubleshooting */}
            <View style={[styles.instructionBox, { marginTop: 12 }]}>
              <View style={styles.instructionHeader}>
                <Ionicons name="help-circle" size={20} color="#3B82F6" />
                <Text style={styles.instructionTitle}>
                  {language === 'et' ? 'Veaotsing' : 'Troubleshooting'}
                </Text>
              </View>
              <Text style={styles.instructionStep}>
                {language === 'et'
                  ? '• "Restricted settings unavailable" — Android 13+ nõuab, et rakendus oleks süsteemirakendus või installitud enne seadme seadistamist\n\n• "Already several accounts on the device" — Eemaldage kõik kontod seadetest enne käsu käivitamist\n\n• "Not allowed to set the device owner" — Seade peab olema tehaseseadistatud ilma kontodeta'
                  : '• "Restricted settings unavailable" — Android 13+ requires the app to be a system app or installed before device setup\n\n• "Already several accounts on the device" — Remove all accounts from Settings before running the command\n\n• "Not allowed to set the device owner" — Device must be factory reset without any accounts'}
              </Text>
            </View>
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