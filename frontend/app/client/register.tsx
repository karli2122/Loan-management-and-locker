import React, { useState, useEffect, useRef } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import API_URL, { API_BASE_URL, buildApiUrl } from '../../src/constants/api';
import {
  deviceAuthHeaders,
  getDeviceToken,
  isValidRegistrationCodeLength,
  lockModeFromRegistrationCode,
  MAX_CODE_LENGTH,
  normalizeRegistrationCode,
  setDeviceToken,
} from '../../src/utils/deviceAuth';
import { devicePolicy } from '../../src/utils/DevicePolicy';
import { getRegistrationDeviceInfo } from '../../src/services/DeviceInfoService';
import { clearLocalRegistration } from '../../src/utils/clientSession';

/** Turn a FastAPI error body into a readable string (422 detail is an array). */
function detailToText(data: any): string {
  const d = data?.detail ?? data?.message ?? data?.raw;
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d
      .map((x: any) => (typeof x === 'string' ? x : x?.msg || JSON.stringify(x)))
      .join('\n');
  }
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}

export default function ClientRegister() {
  const router = useRouter();
  const { t } = useLanguage();
  const [registrationCode, setRegistrationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const submittingRef = useRef(false);
  const baseUrl = API_URL || API_BASE_URL;

  useEffect(() => {
    checkExistingRegistration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkExistingRegistration = async () => {
    try {
      const clientId = await AsyncStorage.getItem('client_id');
      if (clientId) {
        try {
          const token = await getDeviceToken();
          const response = await fetch(buildApiUrl(`device/status/${clientId}`), {
            headers: { Accept: 'application/json', ...deviceAuthHeaders(token) },
          });
          if (response.status === 404) {
            // Device was deleted from the server — clear ALL local registration
            // state (JS + native lock sync) so nothing stale leaks into a new one.
            await clearLocalRegistration();
          } else {
            // OK, auth error (e.g. a newer backend and a device registered before
            // device tokens existed), rate limit or server error: never strand the
            // device — keep the registration and let Home handle it.
            router.replace('/client/home');
            return;
          }
        } catch (_) {
          // Network error — keep client_id and go to home (offline mode)
          router.replace('/client/home');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking registration:', error);
    } finally {
      setCheckingRegistration(false);
    }
  };

  const submitRegistration = async (code: string, ownerNotProvisioned: boolean) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    try {
      const deviceInfo = await getRegistrationDeviceInfo();

      const parseJson = async (resp: Response) => {
        const text = await resp.text();
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return { raw: text };
        }
      };

      const attemptRegister = async (url: string) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ registration_code: code, ...deviceInfo }),
        });

      let response: Response;
      try {
        response = await attemptRegister(buildApiUrl('device/register'));
        if (response.status === 404 && baseUrl) {
          // Fallback for a backend mounted without the /api prefix.
          const retry = await attemptRegister(`${baseUrl}/device/register`);
          if (retry.status !== 404) response = retry;
        }
      } catch (netErr) {
        console.log('Registration network error:', netErr);
        Alert.alert(t('error'), t('networkErrorTryAgain'));
        return;
      }

      const data = await parseJson(response);
      const detail = detailToText(data);

      if (!response.ok) {
        let message: string;
        if (response.status === 404) {
          message = t('incorrectCode');
        } else if (response.status === 400 || response.status === 409) {
          message = /already\s+registered/i.test(detail) ? t('codeAlreadyUsed') : t('incorrectCode');
        } else if (response.status === 422) {
          message = `${t('invalidCodeFormat')}${detail ? `\n\n${detail}` : ''}`;
        } else if (response.status === 429) {
          message = t('serverBusyTryAgain');
        } else if (response.status >= 500) {
          message = t('serverErrorTryAgain');
        } else {
          message = detail || t('registrationFailed');
        }
        Alert.alert(t('error'), message);
        return;
      }

      // Backend returns 'id', not 'client_id'
      const clientId = data?.id || data?.client_id;
      if (!clientId) {
        Alert.alert(t('error'), t('registrationFailed'));
        return;
      }

      // The server has now consumed the code. From here on nothing may abort the
      // registration: every write is isolated so a storage error cannot burn the code.
      await clearLocalRegistration().catch(() => {});

      // Token first: setDeviceToken falls back to AsyncStorage if SecureStore fails.
      if (data?.device_token) {
        try {
          await setDeviceToken(data.device_token);
        } catch (tokErr) {
          console.log('Storing device token failed:', tokErr);
        }
      }

      const requested = lockModeFromRegistrationCode(code, data?.lock_mode);
      // A Device Owner code on a phone that is not provisioned as Device Owner runs in
      // Device Admin mode; remember what the lender asked for so it can be shown.
      const effective = requested === 'device_owner' && ownerNotProvisioned ? 'device_admin' : requested;

      const writes: [string, string][] = [
        ['client_id', String(clientId)],
        ['lock_mode', effective],
        ['lock_mode_requested', requested],
        ['fresh_registration', 'true'],
      ];
      for (const [k, v] of writes) {
        try {
          await AsyncStorage.setItem(k, v);
        } catch (wErr) {
          console.log(`Storing ${k} failed:`, wErr);
        }
      }

      router.replace('/client/home');
    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert(t('error'), error?.message || t('registrationFailed'));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const code = normalizeRegistrationCode(registrationCode);
    if (!code) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    if (!isValidRegistrationCodeLength(code)) {
      Alert.alert(t('error'), t('codeLengthInvalid'));
      return;
    }

    // 9 (or legacy 17) characters = Device Owner code. Device Owner can only be set up
    // on a factory-reset phone (QR provisioning or adb dpm set-device-owner) BEFORE
    // registration; check it now instead of silently running in a weaker mode.
    const wantsOwner = lockModeFromRegistrationCode(code) === 'device_owner';
    if (wantsOwner && Platform.OS === 'android') {
      let isOwner = false;
      try {
        isOwner = await devicePolicy.isDeviceOwner();
      } catch {
        isOwner = false;
      }
      if (!isOwner) {
        Alert.alert(
          t('deviceOwnerNotSetUpTitle'),
          t('deviceOwnerNotSetUpBody'),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: t('registerAsDeviceAdmin'), onPress: () => submitRegistration(code, true) },
          ],
        );
        return;
      }
    }

    await submitRegistration(code, false);
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
            <LanguagePicker compact colors={{
              surface: '#152035', text: '#F8FAFC', textMuted: '#94A3B8',
              border: '#1E3050', primary: '#10B981', background: '#0B1527',
            }} />
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
                onChangeText={(text) => setRegistrationCode(normalizeRegistrationCode(text))}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                editable={!loading}
                maxLength={MAX_CODE_LENGTH}
              />
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
    backgroundColor: '#0B1527',
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
    backgroundColor: '#152035',
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
    backgroundColor: '#152035',
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
    backgroundColor: '#152035',
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
