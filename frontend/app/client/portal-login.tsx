import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';
import { useLanguage } from '../../src/context/LanguageContext';
import { LanguagePicker } from '../../src/components/LanguagePicker';

export default function ClientPortalLogin() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [phone, setPhone] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone.trim() || !registrationCode.trim()) {
      Alert.alert(
        t('error'),
        t('pleaseEnterPhoneAndRegistrationCode')
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/client/login?phone=${encodeURIComponent(phone)}&registration_code=${encodeURIComponent(registrationCode.toUpperCase())}`,
        { method: 'POST' }
      );

      const data = await response.json();

      if (!response.ok) {
        Alert.alert(
          t('loginFailed'),
          data.message || (t('invalidPhoneOrRegistrationCode'))
        );
        return;
      }

      // Store client credentials for portal
      await AsyncStorage.setItem('portal_client_id', data.client_id);
      await AsyncStorage.setItem('portal_client_name', data.name);
      await AsyncStorage.setItem('portal_registration_code', registrationCode.toUpperCase());

      // Navigate to portal dashboard
      router.replace('/client/portal-dashboard');
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert(
        t('error'),
        t('networkConnectionError')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Language Switcher */}
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

        <View style={styles.content}>
          {/* Logo / Icon */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="wallet" size={48} color="#4F46E5" />
            </View>
          </View>

          <Text style={styles.title}>
            {t('clientPortal')}
          </Text>
          <Text style={styles.subtitle}>
            {t('viewYourLoanStatus')}
          </Text>

          {/* Phone Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <Ionicons name="call" size={20} color="#64748B" />
            </View>
            <TextInput
              style={styles.input}
              placeholder={t('phoneNumber')}
              placeholderTextColor="#64748B"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCapitalize="none"
              data-testid="portal-phone-input"
            />
          </View>

          {/* Registration Code Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <Ionicons name="key" size={20} color="#64748B" />
            </View>
            <TextInput
              style={styles.input}
              placeholder={t('registrationCode')}
              placeholderTextColor="#64748B"
              value={registrationCode}
              onChangeText={setRegistrationCode}
              autoCapitalize="characters"
              data-testid="portal-code-input"
            />
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            data-testid="portal-login-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.loginButtonText}>
                  {t('login')}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {/* Help Text */}
          <Text style={styles.helpText}>
            {t('useThePhoneNumberAndCode')}
          </Text>

          {/* Back to Home */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={18} color="#94A3B8" />
            <Text style={styles.backButtonText}>
              {t('back')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  keyboardView: {
    flex: 1,
  },
  langSwitcher: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    gap: 8,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  langButtonActive: {
    backgroundColor: '#4F46E5',
  },
  langText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4F46E530',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputIcon: {
    padding: 16,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 16,
    paddingRight: 16,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 8,
  },
  backButtonText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
