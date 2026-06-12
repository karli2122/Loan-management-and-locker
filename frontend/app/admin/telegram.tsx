import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

interface BotInfo {
  configured: boolean;
  bot_name?: string;
  bot_username?: string;
  error?: string;
}

interface LinkedClient {
  id: string;
  name: string;
  telegram_chat_id?: string;
}

export default function TelegramPage() {
  return (
    <EnterpriseGate featureName="Telegram">
      <TelegramContent />
    </EnterpriseGate>
  );
}

function TelegramContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [clients, setClients] = useState<LinkedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [linkClientId, setLinkClientId] = useState('');
  const [linkChatId, setLinkChatId] = useState('');

  const fetchData = async () => {
    try {
      const token = await getSecureItem('admin_token');
      const [botRes, clientsRes] = await Promise.all([
        fetch(`${API_URL}/api/telegram/bot-info?admin_token=${token}`),
        fetch(`${API_URL}/api/clients?admin_token=${token}`),
      ]);
      const bot = await botRes.json();
      const cl = await clientsRes.json();
      setBotInfo(bot);
      const clientList = Array.isArray(cl) ? cl : (cl.clients || []);
      setClients(clientList.filter((c: any) => c.telegram_chat_id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }, []);

  const linkClient = async () => {
    if (!linkClientId || !linkChatId) {
      Alert.alert('Error', 'Client ID and Chat ID required');
      return;
    }
    try {
      const token = await getSecureItem('admin_token');
      const res = await fetch(`${API_URL}/api/telegram/link-client?admin_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: linkClientId, chat_id: linkChatId }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Client linked to Telegram');
        setLinkClientId('');
        setLinkChatId('');
        fetchData();
      } else {
        Alert.alert('Error', data.error || 'Failed to link');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const sendTestMessage = async (chatId: string) => {
    const token = await getSecureItem('admin_token');
    const res = await fetch(`${API_URL}/api/telegram/send-test?admin_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
    });
    const data = await res.json();
    Alert.alert(data.ok ? 'Sent' : 'Failed', data.ok ? 'Test message sent' : (data.error || 'Failed'));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="telegram-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="telegram-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Telegram</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          <View style={[styles.card, { backgroundColor: colors.card }]} data-testid="bot-status-card">
            <View style={styles.statusRow}>
              <Ionicons name="paper-plane" size={24} color={botInfo?.configured ? '#10B981' : '#EF4444'} />
              <View style={{ marginLeft: 12 }}>
                <Text style={[styles.statusTitle, { color: colors.text }]}>
                  {botInfo?.configured ? 'Bot Connected' : 'Bot Not Configured'}
                </Text>
                {botInfo?.bot_username && (
                  <Text style={styles.statusSub}>@{botInfo.bot_username}</Text>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: botInfo?.configured ? '#064E3B' : '#7F1D1D' }]}>
                <Text style={[styles.statusBadgeText, { color: botInfo?.configured ? '#10B981' : '#EF4444' }]}>
                  {botInfo?.configured ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Link Client to Telegram</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: '#334155' }]}
              placeholder="Client ID"
              placeholderTextColor="#64748B"
              value={linkClientId}
              onChangeText={setLinkClientId}
              data-testid="telegram-client-id"
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: '#334155' }]}
              placeholder="Telegram Chat ID"
              placeholderTextColor="#64748B"
              value={linkChatId}
              onChangeText={setLinkChatId}
              data-testid="telegram-chat-id"
            />
            <TouchableOpacity style={styles.linkBtn} onPress={linkClient} data-testid="telegram-link-btn">
              <Ionicons name="link" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.linkBtnText}>Link Client</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16, marginBottom: 10 }]}>
            Linked Clients ({clients.length})
          </Text>
          {clients.length === 0 ? (
            <Text style={{ color: '#64748B', textAlign: 'center' }}>No clients linked yet</Text>
          ) : (
            clients.map(c => (
              <View key={c.id} style={[styles.clientCard, { backgroundColor: colors.card }]} data-testid={`linked-${c.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clientName, { color: colors.text }]}>{c.name}</Text>
                  <Text style={styles.chatId}>Chat: {c.telegram_chat_id}</Text>
                </View>
                <TouchableOpacity onPress={() => sendTestMessage(c.telegram_chat_id!)} data-testid={`test-msg-${c.id}`}>
                  <Ionicons name="send" size={18} color="#2563EB" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  title: { fontSize: 18, fontWeight: '700' },
  card: { padding: 16, borderRadius: 12, marginBottom: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '600' },
  statusSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusBadge: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', padding: 12, borderRadius: 10 },
  linkBtnText: { color: '#fff', fontWeight: '600' },
  clientCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 8 },
  clientName: { fontSize: 14, fontWeight: '600' },
  chatId: { fontSize: 12, color: '#64748B', marginTop: 2 },
});
