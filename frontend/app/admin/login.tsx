import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL, { API_BASE_URL, buildApiUrl } from '../../src/constants/api';

export default function AdminLogin() {
  const router = useRouter();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    const hydrateSession = async () => {
      const stay = await AsyncStorage.getItem('admin_stay_signed_in');
      if (stay === 'true') {
        const token = await AsyncStorage.getItem('admin_token');
        if (token) {
          try {
            const res = await fetch(`${API_URL}/api/admin/verify/${token}`);
            if (res.ok) {
              router.replace('/admin/(tabs)');
              return;
            }
          } catch (_) {}
          // Token invalid or expired — clear stored auth
          await AsyncStorage.multiRemove(['admin_token', 'admin_stay_signed_in']);
        }
      }
    };
    hydrateSession();
  }, []);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    const creds = { username: username.trim(), password: password.trim() };

      const attemptLogin = async (url: string) => {
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(creds),
        });
      };

    setLoading(true);
    try {
      const baseUrl = API_URL || API_BASE_URL;
      const primaryUrl = buildApiUrl('admin/login');
      const fallbackUrl = `${baseUrl}/api/admin/login`;
      const REDIRECT_FIELDS = ['redirect_to', 'redirectTo'];
      
      console.log('[AdminLogin] Attempting login with URLs:', { baseUrl, primaryUrl, fallbackUrl });

      const extractValue = (data: any, keys: string[]): string | null => {
        if (!data) return null;
        for (const key of keys) {
          if (data[key]) return data[key];
        }
        if (data.data) return extractValue(data.data, keys);
        return null;
      };

      const formatMessage = (
        status?: number,
        detail?: string | null,
        text?: string | null,
        url?: string,
        redirectTo?: string | null,
      ) => {
        const parts: string[] = [];
        if (detail) parts.push(detail);
        if (!detail && text) parts.push(text);
        if (redirectTo) parts.push(`Suggested endpoint: ${redirectTo}`);
        if (status) parts.push(`(status ${status})`);
        if (url) parts.push(`at ${url}`);
        return (
          parts.join(' ') ||
          `${t('auth_failed') || 'Authentication failed'}${status ? ` (status ${status})` : ''}`
        );
      };

      const consumeResponse = async (resp: Response, url: string) => {
        const text = await resp.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          // Non-JSON response (e.g., HTML error page)
        }
        return { resp, text, data, url };
      };

      const networkError = (err: unknown) => {
        const defaultMsg = 'Request failed.';
        const networkMsg =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : defaultMsg;
        const prefix = `${defaultMsg} If you are offline, please check your connection.`;
        if (networkMsg === defaultMsg) {
          return new Error(prefix);
        }
        return new Error(`${prefix} Details: ${networkMsg}`);
      };

      const getRedirect = (data: any) => {
        if (!data) return null;
        // Body fields we expect from the API (not HTTP headers).
        for (const key of REDIRECT_FIELDS) {
          if (data[key] && typeof data[key] === 'string') return data[key];
        }
        return null;
      };

      let response: Response | null = null;
      let parsed: Awaited<ReturnType<typeof consumeResponse>> | null = null;
      let triedFallback = false;

      try {
        console.log('[AdminLogin] Trying primary URL:', primaryUrl);
        response = await attemptLogin(primaryUrl);
      } catch (err: unknown) {
        console.error('[AdminLogin] Primary URL failed:', err);
        throw networkError(err);
      }
      parsed = await consumeResponse(response, primaryUrl);
      console.log('[AdminLogin] Primary response:', { status: response.status, hasData: !!parsed.data, textPreview: parsed.text?.substring(0, 100) });

      if (
        !response.ok &&
        (response.status === 404 || response.status === 401 || response.status === 403)
      ) {
        try {
          console.log('[AdminLogin] Trying fallback URL:', fallbackUrl);
          response = await attemptLogin(fallbackUrl);
          parsed = await consumeResponse(response, fallbackUrl);
          triedFallback = true;
          console.log('[AdminLogin] Fallback response:', { status: response.status, hasData: !!parsed.data });
        } catch (err: unknown) {
          console.error('[AdminLogin] Fallback URL failed:', err);
          throw networkError(err);
        }
      }

      if (!response.ok) {
        throw new Error(
          formatMessage(
            response.status,
            parsed.data?.detail,
            parsed.text,
            parsed.url,
            getRedirect(parsed.data)
          )
        );
      }

      if (response.ok && !parsed.data) {
        // Check if we received HTML (likely a proxy/server error page)
        const isHtmlResponse = parsed.text?.toLowerCase()?.includes('<!doctype') || 
                               parsed.text?.toLowerCase()?.includes('<html');
        const truncatedText = parsed.text?.substring(0, 100) || '(empty response)';
        throw new Error(
          `${isHtmlResponse ? 'Received HTML instead of JSON' : 'Non-JSON response'}. ` +
          `Check that backend URL (${baseUrl}) points to the API server. ` +
          `Tried: ${parsed.url}. Status: ${response.status}. ` +
          `Response preview: ${truncatedText}${parsed.text?.length > 100 ? '...' : ''}`
        );
      }

      if ((!parsed.data || !parsed.data.token) && !triedFallback) {
        try {
          response = await attemptLogin(fallbackUrl);
          parsed = await consumeResponse(response, fallbackUrl);
          triedFallback = true;
        } catch (err: unknown) {
          throw networkError(err);
        }
      }

      const token =
        extractValue(parsed.data, ['token', 'access_token']) ||
        extractValue(parsed.data?.data, ['token', 'access_token']);

      if (!token) {
        throw new Error(
          formatMessage(
            response.status,
            parsed.data?.detail,
            parsed.text,
            parsed.url,
            getRedirect(parsed.data)
          )
        );
      }

      await AsyncStorage.setItem('admin_token', token);
      
      // Safely extract admin data with fallbacks
      const adminData = parsed.data || {};
      
      // Log for debugging
      console.log('[AdminLogin] Admin data extracted:', {
        hasId: !!adminData.id,
        hasUsername: !!adminData.username,
        hasRole: !!adminData.role,
        role: adminData.role
      });
      
      // Validate required fields
      if (!adminData.id || !adminData.username) {
        throw new Error(
          'Login succeeded but response missing required fields (id or username). ' +
          `Response: ${JSON.stringify(adminData).substring(0, 200)}`
        );
      }
      
      await AsyncStorage.setItem('admin_id', adminData.id);
      await AsyncStorage.setItem('admin_username', adminData.username);
      await AsyncStorage.setItem('admin_role', adminData.role || 'user');
      await AsyncStorage.setItem('is_super_admin', adminData.is_super_admin ? 'true' : 'false');
      await AsyncStorage.setItem('admin_stay_signed_in', staySignedIn ? 'true' : 'false');
      if (adminData.first_name) {
        await AsyncStorage.setItem('admin_first_name', adminData.first_name);
        setFirstName(adminData.first_name);
      }
      if (adminData.last_name) {
        await AsyncStorage.setItem('admin_last_name', adminData.last_name);
        setLastName(adminData.last_name);
      }

      router.replace('/admin/(tabs)');
    } catch (error: any) {
      const fallbackMessage =
        (error?.message && error.message.toString()) ||
        `${t('auth_failed') || 'Authentication failed'} (unexpected error)`;
      Alert.alert(t('error'), fallbackMessage);
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="shield" size={50} color="#fff" />
            </View>
            <Text style={styles.title}>{t('adminLogin')}</Text>
            <Text style={styles.subtitle}>
              {t('signInToManage')}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('username')}
                placeholderTextColor="#64748B"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('password')}
                placeholderTextColor="#64748B"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.rememberRow}>
              <Switch
                value={staySignedIn}
                onValueChange={setStaySignedIn}
                trackColor={{ false: '#334155', true: '#4F46E5' }}
                thumbColor="#fff"
              />
              <Text style={styles.rememberText}>{t('staySignedIn')}</Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('login')}</Text>
              )}
            </TouchableOpacity>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
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
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  button: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  rememberText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
});
