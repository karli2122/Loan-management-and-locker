import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useLanguage } from '../src/context/LanguageContext';

export default function Index() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  
  // Get app mode from config
  const appMode = Constants.expoConfig?.extra?.appMode;

  useEffect(() => {
    // Auto-redirect based on app mode
    if (appMode === 'admin') {
      router.replace('/admin/login');
    } else if (appMode === 'client') {
      router.replace('/client/register');
    }
  }, [appMode]);

  // If app mode is set, show loading while redirecting
  if (appMode === 'admin' || appMode === 'client') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="shield-checkmark" size={80} color="#4F46E5" />
          <Text style={styles.loadingText}>
            {appMode === 'admin' ? 'EMI Admin' : 'EMI Client'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Default: Show mode selection (for development/combined app)
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Language Switcher */}
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

      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={80} color="#4F46E5" />
        <Text style={styles.title}>{t('appTitle')}</Text>
        <Text style={styles.subtitle}>{t('appSubtitle')}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.selectText}>{t('selectMode')}</Text>
        
        <TouchableOpacity 
          style={[styles.modeCard, styles.adminCard]}
          onPress={() => router.push('/admin/login')}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="shield" size={40} color="#fff" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t('adminPanel')}</Text>
            <Text style={styles.cardDescription}>
              {t('adminDescription')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.modeCard, styles.clientCard]}
          onPress={() => router.push('/client/register')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#059669' }]}>
            <Ionicons name="phone-portrait" size={40} color="#fff" />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t('clientDevice')}</Text>
            <Text style={styles.cardDescription}>
              {t('clientDescription')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('secureSystem')}</Text>
      </View>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
  },
  langSwitcher: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
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
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  selectText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 20,
    textAlign: 'center',
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  adminCard: {
    borderColor: '#4F46E5',
  },
  clientCard: {
    borderColor: '#059669',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#64748B',
  },
});
