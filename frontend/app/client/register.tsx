import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { buildApiUrl } from '../../src/constants/api';
import { devicePolicy } from '../../src/utils/DevicePolicy';

export default function ClientRegister() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [registrationCode, setRegistrationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);

  useEffect(() => {
    checkExistingRegistration();
  }, []);

  const checkExistingRegistration = async () => {
    try {
      const clientId = await AsyncStorage.getItem('client_id');
      if (clientId) {
        const response = await fetch(buildApiUrl(`device/status/${clientId}`));
        if (response.ok) {
          router.replace('/client/home');
          return;
        } else {
          await AsyncStorage.removeItem('client_id');
        }
      }
    } catch (error) {
      console.error('Error checking registration:', error);
    } finally {
      setCheckingRegistration(false);
    }
  };

  const verifyDeviceOwner = async () => {
    let attempts = 0;

    const attempt = async () => {
      attempts += 1;
      const cancelButton = { text: t('cancel'), style: 'cancel' as const };
      const retryButtons =
        attempts < 3
          ? [{ text: t('retry'), onPress: attempt }, cancelButton]
          : [cancelButton];

      try {
        const isOwner = await devicePolicy.isDeviceOwner();
        if (isOwner) {
          try {
            await devicePolicy.disableUninstall(true);
          } catch (err) {
            console.error(
              'Unable to enforce uninstall protection for Device Owner:',
              (err as any)?.message || err
            );
          }
          Alert.alert(t('success'), t('deviceRegisteredSuccess'), [
            { text: t('ok'), onPress: () => router.replace('/client/home') },
          ]);
        } else {
          Alert.alert(t('error'), t('deviceOwnerSetupRequired'), retryButtons);
        }
      } catch (err) {
        console.error('Device Owner verification failed:', (err as any)?.message || err);
        Alert.alert(t('error'), t('deviceOwnerVerificationFailed'), retryButtons);
      }
    };

    await attempt();
  };

  const handleRegister = async () => {
    if (!registrationCode.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      const deviceId = Device.osBuildId || Device.osInternalBuildId || 'unknown';
      const deviceModel = `${Device.brand || ''} ${Device.modelName || 'Unknown Device'}`.trim();

      // Try primary /api path, then fallback to base without /api to avoid 404s from double/missing prefix
      const attemptRegister = async (url: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registration_code: registrationCode.toUpperCase(),
            device_id: deviceId,
            device_model: deviceModel,
          }),
        });

      let response = await attemptRegister(buildApiUrl('device/register'));
      if (response.status === 404) {
        response = await attemptRegister(`${API_URL}/device/register`);
      }
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_code: registrationCode.toUpperCase(),
          device_id: deviceId,
          device_model: deviceModel,
        }),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // non-JSON response
      }

      if (!response.ok) {
        const message = data?.detail || text || 'Registration failed';
        throw new Error(message);
      }

      const clientId = data?.client_id;
      if (clientId) {
        await AsyncStorage.setItem('client_id', clientId);
      }
      
      // Store client data including lock_mode
      const clientData = data?.client;
      if (clientData) {
        await AsyncStorage.setItem('client_data', JSON.stringify(clientData));
      }
      
      // Handle Device Admin mode setup automatically
      if (clientData?.lock_mode === 'device_admin') {
        // Dynamic import to avoid crashes on non-Android
        try {
          const DeviceAdmin = (await import('../../src/components/DeviceAdmin')).default;
          const isActive = await DeviceAdmin.isDeviceAdminActive();
          
          if (!isActive) {
            // Request Device Admin permissions
            await DeviceAdmin.requestDeviceAdmin();
            // Show message that permissions are needed
            Alert.alert(
              t('success'), 
              t('deviceAdminPermissionPrompt'),
              [{ text: t('ok'), onPress: () => router.replace('/client/home') }]
            );
          } else {
            Alert.alert(t('success'), t('deviceRegisteredSuccess'), [
              { text: t('ok'), onPress: () => router.replace('/client/home') },
            ]);
          }
        } catch (err) {
          console.log('Device Admin not available:', err);
          Alert.alert(t('success'), t('deviceRegisteredSuccess'), [
            { text: t('ok'), onPress: () => router.replace('/client/home') },
          ]);
        }
      } else if (clientData?.lock_mode === 'device_owner') {
        // Device Owner mode - verify owner status and enable protections
        await verifyDeviceOwner();
      } else {
        Alert.alert(t('success'), t('deviceRegisteredSuccess'), [
          { text: t('ok'), onPress: () => router.replace('/client/home') },
        ]);
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingRegistration) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('checkingRegistration')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.topBar}>
            <View style={styles.langSwitcher}>
              <TouchableOpacity
                style={[styles.langButton, language === 'et' && styles.langButtonActive]}
                onPress={() => setLanguage('et')}
              >
                <Text style={[styles.langText, language === 'et' && styles.langTextActive]}>EST</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langButton, language === 'en' && styles.langButtonActive]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>ENG</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="phone-portrait" size={50} color="#fff" />
            </View>
            <Text style={styles.title}>{t('registerDevice')}</Text>
            <Text style={styles.subtitle}>
              {t('enterRegistrationCode')}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                placeholder={t('enterCode')}
                placeholderTextColor="#64748B"
                value={registrationCode}
                onChangeText={(text) => setRegistrationCode(text.toUpperCase())}
                autoCapitalize="characters"
                maxLength={8}
              />
            </View>

            <View style={styles.deviceInfo}>
              <Ionicons name="information-circle" size={20} color="#3B82F6" />
              <View style={styles.deviceInfoContent}>
                <Text style={styles.deviceInfoTitle}>{t('deviceInformation')}</Text>
                <Text style={styles.deviceInfoText}>
                  {Device.brand} {Device.modelName}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.buttonText}>{t('registerDevice')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.helpBox}>
              <Ionicons name="help-circle" size={20} color="#94A3B8" />
              <Text style={styles.helpText}>
                {t('noCodeHelp')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 8,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  langButtonActive: {
    backgroundColor: '#059669',
  },
  langText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#fff',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 25,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  form: {
    flex: 1,
  },
  codeInputContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#059669',
    padding: 8,
    marginBottom: 20,
  },
  codeInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    padding: 16,
    letterSpacing: 8,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  deviceInfoContent: {
    flex: 1,
  },
  deviceInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 4,
  },
  deviceInfoText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 12,
    height: 56,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 12,
  },
  helpText: {
    flex: 1,
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
});
