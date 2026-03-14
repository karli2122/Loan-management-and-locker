import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';
import { useLanguage } from '../../src/context/LanguageContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';

export default function SessionManagementScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSessions = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) return;
      const resp = await fetch(`${API_URL}/api/sessions?admin_token=${token}`);
      if (resp.ok) {
        const data = await resp.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const revokeSession = (sessionId: string) => {
    Alert.alert(t('revokeSession') || 'Revoke Session', t('revokeSessionConfirm') || 'This will log out that session. Continue?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('revoke') || 'Revoke', style: 'destructive', onPress: async () => {
          setRevoking(sessionId);
          try {
            const token = await AsyncStorage.getItem('admin_token');
            await fetch(`${API_URL}/api/sessions/${sessionId}?admin_token=${token}`, { method: 'DELETE' });
            fetchSessions();
          } catch (e) { console.log(e); }
          setRevoking(null);
        }
      },
    ]);
  };

  const revokeAll = () => {
    Alert.alert(t('revokeAllSessions') || 'Revoke All', t('revokeAllConfirm') || 'This will log out all sessions. Continue?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('revokeAll') || 'Revoke All', style: 'destructive', onPress: async () => {
          setLoading(true);
          try {
            const token = await AsyncStorage.getItem('admin_token');
            await fetch(`${API_URL}/api/sessions?admin_token=${token}`, { method: 'DELETE' });
            fetchSessions();
          } catch (e) { console.log(e); }
        }
      },
    ]);
  };

  const getDeviceIcon = (ua: string) => {
    if (!ua) return 'phone-portrait';
    const lower = ua.toLowerCase();
    if (lower.includes('android') || lower.includes('mobile') || lower.includes('ios') || lower.includes('iphone')) return 'phone-portrait';
    return 'desktop';
  };

  const timeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const filtered = sessions.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s.ip_address || '').toLowerCase().includes(q) ||
      (s.user_agent || '').toLowerCase().includes(q) ||
      (s.device_info || '').toLowerCase().includes(q);
  });

  return (
    <EnterpriseGate featureName={t('sessionManagement')} requiredPlan="enterprise" featureKey="session_management">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} data-testid="session-back-btn">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('sessionManagement')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('searchSessions') || 'Search by IP or device...'}
            placeholderTextColor="#64748B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            data-testid="session-search-input"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>

        {sessions.length > 1 && (
          <TouchableOpacity onPress={revokeAll} style={styles.revokeAllBtn} data-testid="revoke-all-sessions-btn">
            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
            <Text style={styles.revokeAllText}>{t('revokeAllSessions') || 'Revoke All Sessions'}</Text>
          </TouchableOpacity>
        )}

        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSessions(); }} tintColor="#2563EB" />}
        >
          {loading ? (
            <ActivityIndicator color="#2563EB" style={{ marginTop: 40 }} size="large" />
          ) : filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="key-outline" size={48} color="#334155" />
              <Text style={styles.emptyText}>{searchQuery ? 'No sessions match your search' : 'No active sessions'}</Text>
            </View>
          ) : (
            filtered.map((s, i) => (
              <View key={s.id || i} style={styles.sessionCard} data-testid={`session-card-${i}`}>
                <View style={styles.sessionIcon}>
                  <Ionicons name={getDeviceIcon(s.user_agent) as any} size={22} color="#3B82F6" />
                </View>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionIp}>{s.ip_address || 'Unknown IP'}</Text>
                  <Text style={styles.sessionDevice} numberOfLines={1}>{s.device_info || s.user_agent || 'Unknown device'}</Text>
                  <Text style={styles.sessionTime}>Last active: {timeAgo(s.last_activity)}</Text>
                </View>
                <TouchableOpacity onPress={() => revokeSession(s.id)} disabled={revoking === s.id} style={styles.revokeBtn} data-testid={`revoke-session-${i}`}>
                  {revoking === s.id ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </EnterpriseGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152035', borderRadius: 10, margin: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#1E3050' },
  searchInput: { flex: 1, color: '#F8FAFC', fontSize: 14, marginLeft: 8, padding: 0 },
  revokeAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#EF444415', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#EF444430' },
  revokeAllText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },
  list: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#64748B', fontSize: 14, marginTop: 12 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#152035', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1E3050' },
  sessionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center' },
  sessionInfo: { flex: 1, marginLeft: 12 },
  sessionIp: { color: '#F8FAFC', fontSize: 14, fontWeight: '600' },
  sessionDevice: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  sessionTime: { color: '#64748B', fontSize: 11, marginTop: 2 },
  revokeBtn: { padding: 10 },
});
