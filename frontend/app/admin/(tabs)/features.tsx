import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';

export default function FeaturesTab() {
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const [username, setUsername] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const storedUsername = await AsyncStorage.getItem('admin_username');
    if (storedUsername) setUsername(storedUsername);
  };

  const handleLogout = async () => {
    Alert.alert(
      language === 'et' ? 'Logi välja' : 'Logout',
      language === 'et' ? 'Kas oled kindel?' : 'Are you sure?',
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        {
          text: language === 'et' ? 'Logi välja' : 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['admin_token', 'admin_id', 'admin_username', 'admin_role', 'is_super_admin']);
            router.replace('/');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Funktsioonid' : 'Features'}
        </Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{username}</Text>
            <View style={styles.languageToggle}>
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
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Analüütika' : 'Analytics'}
        </Text>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/reports')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#06B6D420' }]}>
            <Ionicons name="bar-chart" size={24} color="#06B6D4" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'Aruanded' : 'Reports'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'Finantsanalüütika ja aruanded' : 'Financial analytics & reports'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Laenuhaldus' : 'Loan Management'}
        </Text>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/loan-plans')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#EC489920' }]}>
            <Ionicons name="pricetag" size={24} color="#EC4899" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'Laenuplaanid' : 'Loan Plans'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'Halda laenuplaane' : 'Manage loan plans'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/calculator')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#14B8A620' }]}>
            <Ionicons name="calculator" size={24} color="#14B8A6" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'EMI kalkulaator' : 'EMI Calculator'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'Arvuta laenumaksed' : 'Calculate loan payments'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Seadmehaldus' : 'Device Management'}
        </Text>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/device-management')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="phone-portrait" size={24} color="#F59E0B" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'Seadmehaldus' : 'Device Management'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'Lukusta/vabasta seadmeid' : 'Lock/unlock devices'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/device-setup')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#F59E0B20' }]}>
            <Ionicons name="qr-code" size={24} color="#F59E0B" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'Seadme seadistus' : 'Device Setup'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'QR-kood automaatseks seadistuseks' : 'QR code for automatic setup'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          {language === 'et' ? 'Seaded' : 'Settings'}
        </Text>

        <TouchableOpacity
          style={styles.featureCard}
          onPress={() => router.push('/admin/settings')}
        >
          <View style={[styles.featureIcon, { backgroundColor: '#8B5CF620' }]}>
            <Ionicons name="settings" size={24} color="#8B5CF6" />
          </View>
          <View style={styles.featureInfo}>
            <Text style={styles.featureTitle}>
              {language === 'et' ? 'Seaded' : 'Settings'}
            </Text>
            <Text style={styles.featureDescription}>
              {language === 'et' ? 'Kasutajahaldus ja seaded' : 'User management & settings'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          <Text style={styles.logoutText}>
            {language === 'et' ? 'Logi välja' : 'Logout'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  contentContainer: {
    paddingBottom: 96,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#334155',
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  languageToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#334155',
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 13,
    color: '#64748B',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});
