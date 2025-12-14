import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper function to build API endpoint URL
const getApiUrl = (endpoint: string) => {
  if (!API_URL) return '';
  // Remove trailing slash from API_URL
  const baseUrl = API_URL.replace(/\/$/, '');
  // Remove leading slash from endpoint
  const cleanEndpoint = endpoint.replace(/^\//, '');
  // Return combined URL
  return `${baseUrl}/${cleanEndpoint}`;
};

export default function AdminLogin() {
  const router = useRouter();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setLoading(true);
    try {
      console.log('API_URL:', API_URL);
      console.log('Login URL:', `${API_URL}/api/admin/login`);
      
      if (!API_URL) {
        throw new Error('API URL is not configured. Please check .env file.');
      }

      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      console.log('Response status:', response.status);
      console.log('Response content-type:', response.headers.get('content-type'));

      // Read response as text first to handle both JSON and non-JSON
      const responseText = await response.text();
      console.log('Response preview:', responseText.substring(0, 100));

      // Check if response is JSON by content-type
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Non-JSON response received');
        throw new Error('Server returned invalid response. Please try again.');
      }

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error('JSON parse error:', parseError.message);
        console.error('Response text:', responseText.substring(0, 200));
        throw new Error('Failed to parse server response. Please try again.');
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      await AsyncStorage.setItem('admin_token', data.token);
      await AsyncStorage.setItem('admin_id', data.id);
      await AsyncStorage.setItem('admin_username', data.username);
      await AsyncStorage.setItem('admin_role', data.role || 'user');
      await AsyncStorage.setItem('is_super_admin', data.is_super_admin ? 'true' : 'false');

      router.replace('/admin/(tabs)');
    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = error.message || 'Something went wrong';
      
      // Check for network errors
      if (error.message && error.message.includes('Network request failed')) {
        errorMessage = 'Network connection error. Please check your internet connection and try again.';
      } else if (error.message && error.message.includes('Failed to fetch')) {
        errorMessage = 'Unable to connect to server. Please check your connection.';
      } else if (!API_URL) {
        errorMessage = 'API configuration error. Please restart the app.';
      }
      
      Alert.alert(t('error'), errorMessage);
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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
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
});
