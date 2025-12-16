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
import API_URL, { buildApiUrl } from '../../src/constants/api';

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
          router.replace('/admin/(tabs)');
          return;
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
    };

    setLoading(true);
    try {
      const primaryUrl = buildApiUrl('admin/login');
      const fallbackUrl = `${API_URL}/admin/login`;

      const consumeResponse = async (resp: Response) => {
        const text = await resp.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          // Non-JSON response (e.g., HTML error page)
        }
        return { resp, text, data };
      };

      let response = await attemptLogin(primaryUrl);
      let parsed = await consumeResponse(response);

      if (
        !response.ok &&
        (response.status === 404 || response.status === 401 || response.status === 403)
      ) {
        response = await attemptLogin(fallbackUrl);
        parsed = await consumeResponse(response);
      }

      if (!response.ok) {
        const message =
          parsed.data?.detail ||
          parsed.text ||
          `${t('auth_failed') || 'Authentication failed'} (status ${response.status})`;
        throw new Error(message);
      }

      if (!parsed.data || !parsed.data.token) {
        const msg =
          parsed.data?.detail ||
          parsed.text ||
          `${t('auth_failed') || 'Authentication failed'} (status ${response.status})`;
        throw new Error(msg);
      }

      await AsyncStorage.setItem('admin_token', parsed.data.token);
      await AsyncStorage.setItem('admin_id', parsed.data.id);
      await AsyncStorage.setItem('admin_username', parsed.data.username);
      await AsyncStorage.setItem('admin_role', parsed.data.role || 'user');
      await AsyncStorage.setItem('is_super_admin', parsed.data.is_super_admin ? 'true' : 'false');
      await AsyncStorage.setItem('admin_stay_signed_in', staySignedIn ? 'true' : 'false');
      if (parsed.data.first_name) {
        await AsyncStorage.setItem('admin_first_name', parsed.data.first_name);
        setFirstName(parsed.data.first_name);
      }
      if (parsed.data.last_name) {
        await AsyncStorage.setItem('admin_last_name', parsed.data.last_name);
        setLastName(parsed.data.last_name);
      }

      router.replace('/admin/(tabs)');
    } catch (error: any) {
      Alert.alert(t('error'), error.message || 'Something went wrong');
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
              <Text style={styles.rememberText}>{t('staySignedIn') ?? 'Stay signed in'}</Text>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('signIn')}</Text>
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
