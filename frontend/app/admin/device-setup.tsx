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
      const adminId = await AsyncStorage.getItem('admin_token');
      const query = adminId ? `?admin_token=${adminId}` : '';
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
      ? `Loan Client seadistus\n\nKlient: ${selectedClient.name}\nRegistreerimiskood: ${selectedClient.registration_code}\n\nJuhised:\n1. Installige Loan Client rakendus telefonile\n2. Avage rakendus ja sisestage kood: ${selectedClient.registration_code}\n3. Vajutage "Registreeri seade"\n4. Lubage administraatori õigused järgmises dialoogis\n5. Seade on nüüd kaitstud`
      : `Loan Client Setup\n\nClient: ${selectedClient.name}\nRegistration Code: ${selectedClient.registration_code}\n\nInstructions:\n1. Install Loan Client app on the phone\n2. Open the app and enter code: ${selectedClient.registration_code}\n3. Press "Register Device"\n4. Grant admin permissions in the next dialog\n5. Device is now protected`;
    
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
          {language === 'et' ? 'Seadme seadistus' : 'Device Setup'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Instructions */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>
              {language === 'et' ? 'Automaatne seadistus' : 'Automatic Setup'}
            </Text>
            <Text style={styles.infoText}>
              {language === 'et' 
                ? 'Skannige QR-kood uuel või tehaseseadetega telefonil, et seadistada laenu kaitse automaatselt.'
                : 'Scan the QR code on a new or factory-reset phone to automatically set up loan protection.'}
            </Text>
          </View>
        </View>

        {/* Client Selection */}
        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Vali klient' : 'Select Client'}
        </Text>
        
        {clients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={styles.emptyText}>
              {language === 'et' 
                ? 'Kõik kliendid on registreeritud'
                : 'All clients are registered'}
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
              {language === 'et' ? 'QR-koodi tüüp' : 'QR Code Type'}
            </Text>
            <View style={styles.qrTypeContainer}>
              <TouchableOpacity
                style={[styles.qrTypeButton, qrType === 'simple' && styles.qrTypeButtonActive]}
                onPress={() => setQrType('simple')}
              >
                <Ionicons name="qr-code" size={20} color={qrType === 'simple' ? '#fff' : '#94A3B8'} />
                <Text style={[styles.qrTypeText, qrType === 'simple' && styles.qrTypeTextActive]}>
                  {language === 'et' ? 'Lihtne' : 'Simple'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrTypeButton, qrType === 'enterprise' && styles.qrTypeButtonActive]}
                onPress={() => setQrType('enterprise')}
              >
                <Ionicons name="business" size={20} color={qrType === 'enterprise' ? '#fff' : '#94A3B8'} />
                <Text style={[styles.qrTypeText, qrType === 'enterprise' && styles.qrTypeTextActive]}>
                  {language === 'et' ? 'Ettevõte' : 'Enterprise'}
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
                {language === 'et' ? 'Juhised' : 'Instructions'}
              </Text>
              {qrType === 'simple' ? (
                <View style={styles.instructionsList}>
                  <Text style={styles.instructionItem}>1. {language === 'et' ? 'Installige Loan Client rakendus telefonile' : 'Install Loan Client app on the phone'}</Text>
                  <Text style={styles.instructionItem}>2. {language === 'et' ? 'Avage rakendus ja sisestage registreerimiskood' : 'Open the app and enter the registration code'}</Text>
                  <Text style={styles.instructionItem}>3. {language === 'et' ? 'Vajutage "Registreeri seade"' : 'Press "Register Device"'}</Text>
                  <Text style={styles.instructionItem}>4. {language === 'et' ? 'Lubage administraatori õigused järgmises dialoogis' : 'Grant admin permissions in the next dialog'}</Text>
                  <Text style={styles.instructionItem}>5. {language === 'et' ? 'Seade on nüüd kaitstud ja lukustatav' : 'Device is now protected and can be locked'}</Text>
                </View>
              ) : (
                <View style={styles.instructionsList}>
                  <Text style={styles.instructionItem}>1. {language === 'et' ? 'Tehke telefonil tehaseseaded' : 'Factory reset the phone'}</Text>
                  <Text style={styles.instructionItem}>2. {language === 'et' ? 'Tervitusekraanil puudutage 6 korda' : 'On welcome screen, tap 6 times'}</Text>
                  <Text style={styles.instructionItem}>3. {language === 'et' ? 'Skannige see QR-kood' : 'Scan this QR code'}</Text>
                  <Text style={styles.instructionItem}>4. {language === 'et' ? 'Seade seadistatakse automaatselt' : 'Device will set up automatically'}</Text>
                </View>
              )}
            </View>

            {/* Share Button */}
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.shareButtonText}>
                {language === 'et' ? 'Jaga juhiseid' : 'Share Instructions'}
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
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    minWidth: 140,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  clientCardSelected: {
    borderColor: '#4F46E5',
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
    color: '#4F46E5',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  qrTypeButtonActive: {
    backgroundColor: '#4F46E5',
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
    backgroundColor: '#1E293B',
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
    color: '#4F46E5',
    letterSpacing: 4,
  },
  instructionsCard: {
    backgroundColor: '#1E293B',
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
    backgroundColor: '#4F46E5',
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
