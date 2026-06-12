import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';


// Android Enterprise provisioning QR code data
const generateProvisioningData = (clientRegCode: string) => {
  const data = {
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.emi.client/.DeviceAdminReceiver",
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": `${API_URL}/downloads/loan-client.apk`,
    "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": true,
    "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
    "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
      "registration_code": clientRegCode
    }
  };
  return JSON.stringify(data);
};

// Simple setup QR that contains registration code
const generateSetupQR = (clientRegCode: string, clientName: string) => {
  return JSON.stringify({
    type: "LOAN_CLIENT_SETUP",
    code: clientRegCode,
    name: clientName,
    api: API_URL
  });
};

export default function DeviceSetup() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [qrType, setQrType] = useState<'simple' | 'enterprise'>('simple');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const adminId = await getSecureItem('admin_id');
      const query = adminId ? `?admin_id=${adminId}` : '';
      const response = await fetch(`${API_URL}/api/clients${query}`);
      const data = await response.json();
      // Only show unregistered clients
      let clientList: any[] = [];
      if (Array.isArray(data?.clients)) {
        clientList = data.clients;
      } else if (Array.isArray(data)) {
        clientList = data;
      }
      setClients(clientList.filter((c: any) => !c.is_registered));
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const handleShare = async () => {
    if (!selectedClient) return;
    
    const message = language === 'et' 
      ? `PayLock Client seadistus\n\nKlient: ${selectedClient.name}\nRegistreerimiskood: ${selectedClient.registration_code}\n\nJuhised:\n1. Installige PayLock Client rakendus telefonile\n2. Avage rakendus ja sisestage kood: ${selectedClient.registration_code}\n3. Vajutage "Registreeri seade"\n4. Lubage administraatori õigused järgmises dialoogis\n5. Seade on nüüd kaitstud`
      : `PayLock Client Setup\n\nClient: ${selectedClient.name}\nRegistration Code: ${selectedClient.registration_code}\n\nInstructions:\n1. Install PayLock Client app on the phone\n2. Open the app and enter code: ${selectedClient.registration_code}\n3. Press "Register Device"\n4. Grant admin permissions in the next dialog\n5. Device is now protected`;
    
    try {
      await Share.share({ message });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const getQRData = () => {
    if (!selectedClient) return '';
    return qrType === 'enterprise' 
      ? generateProvisioningData(selectedClient.registration_code)
      : generateSetupQR(selectedClient.registration_code, selectedClient.name);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {t('deviceSetup')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Instructions */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              {t('automaticSetup')}
            </Text>
            <Text style={styles.infoText}>
              {t('scanTheQrCodeOnA')}
            </Text>
          </View>
        </View>

        {/* Client Selection */}
        <Text style={styles.sectionTitle}>
          {t('selectClient')}
        </Text>
        
        {clients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={styles.emptyText}>
              {t('allClientsAreRegistered')}
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.clientList}>
            {clients.map((client) => (
              <TouchableOpacity
                key={client.id}
                style={[
                  styles.clientCard,
                  selectedClient?.id === client.id && styles.clientCardSelected
                ]}
                onPress={() => setSelectedClient(client)}
              >
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientCode}>{client.registration_code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* QR Type Selection */}
        {selectedClient && (
          <>
            <Text style={styles.sectionTitle}>
              {t('qrCodeType')}
            </Text>
            <View style={styles.qrTypeContainer}>
              <TouchableOpacity
                style={[styles.qrTypeButton, qrType === 'simple' && styles.qrTypeButtonActive]}
                onPress={() => setQrType('simple')}
              >
                <Ionicons name="qr-code" size={20} color={qrType === 'simple' ? '#fff' : '#94A3B8'} />
                <Text style={[styles.qrTypeText, qrType === 'simple' && styles.qrTypeTextActive]}>
                  {t('simple')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrTypeButton, qrType === 'enterprise' && styles.qrTypeButtonActive]}
                onPress={() => setQrType('enterprise')}
              >
                <Ionicons name="business" size={20} color={qrType === 'enterprise' ? '#fff' : '#94A3B8'} />
                <Text style={[styles.qrTypeText, qrType === 'enterprise' && styles.qrTypeTextActive]}>
                  {t('enterprise')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* QR Code Display */}
            <View style={styles.qrContainer}>
              <View style={styles.qrWrapper}>
                <QRCode
                  value={getQRData()}
                  size={200}
                  backgroundColor="white"
                  color="black"
                />
              </View>
              <Text style={styles.qrLabel}>
                {selectedClient.name}
              </Text>
              <Text style={styles.qrCode}>
                {selectedClient.registration_code}
              </Text>
            </View>

            {/* Instructions based on QR type */}
            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>
                {t('instructions')}
              </Text>
              {qrType === 'simple' ? (
                <View style={styles.instructionsList}>
                  <Text style={styles.instructionItem}>1. {t('installLoanClientAppOnThe')}</Text>
                  <Text style={styles.instructionItem}>2. {t('openTheAppAndEnterThe')}</Text>
                  <Text style={styles.instructionItem}>3. {language === 'et' ? 'Vajutage "Registreeri seade"' : 'Press "Register Device"'}</Text>
                  <Text style={styles.instructionItem}>4. {t('grantAdminPermissionsInTheNext')}</Text>
                  <Text style={styles.instructionItem}>5. {t('deviceIsNowProtectedAndCan')}</Text>
                </View>
              ) : (
                <View style={styles.instructionsList}>
                  <Text style={styles.instructionItem}>1. {t('factoryResetThePhone')}</Text>
                  <Text style={styles.instructionItem}>2. {t('onWelcomeScreenTap6Times')}</Text>
                  <Text style={styles.instructionItem}>3. {t('scanThisQrCode')}</Text>
                  <Text style={styles.instructionItem}>4. {t('deviceWillSetUpAutomatically')}</Text>
                </View>
              )}
            </View>

            {/* Share Button */}
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.shareButtonText}>
                {t('shareInstructions')}
              </Text>
            </TouchableOpacity>
          </>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  clientList: {
    marginBottom: 24,
  },
  clientCard: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 140,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  clientCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  clientCode: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 12,
  },
  qrTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  qrTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  qrTypeButtonActive: {
    backgroundColor: '#2563EB',
  },
  qrTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  qrTypeTextActive: {
    color: '#fff',
  },
  qrContainer: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  qrWrapper: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  qrLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  qrCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
    letterSpacing: 4,
  },
  instructionsCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  instructionsList: {
    gap: 12,
  },
  instructionItem: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 20,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 40,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
