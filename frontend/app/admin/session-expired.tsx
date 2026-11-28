import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';
import { ta } from '../../src/utils/adminI18n';
import { expireSession } from '../../src/utils/adminAuth';

/** Shown whenever the server rejects the stored admin token (expired or revoked). */
export default function SessionExpired() {
  const router = useRouter();
  const { language } = useLanguage();

  useEffect(() => {
    // make sure no stale credentials are left behind
    expireSession();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="time" size={44} color="#F59E0B" />
        </View>
        <Text style={styles.title}>{ta(language, 'sessionExpiredTitle')}</Text>
        <Text style={styles.body}>{ta(language, 'sessionExpiredBody')}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/admin/login')} data-testid="relogin-btn">
          <Ionicons name="log-in" size={20} color="#fff" />
          <Text style={styles.buttonText}>{ta(language, 'logInAgain')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#152035', borderRadius: 20, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#1E3050' },
  iconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(245,158,11,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  body: { color: '#94A3B8', fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  button: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
