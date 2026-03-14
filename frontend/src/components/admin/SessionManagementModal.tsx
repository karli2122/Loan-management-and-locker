import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import API_URL from '../../constants/api';

interface Props {
  adminToken: string;
  colors: any;
  visible: boolean;
  onClose: () => void;
}

export default function SessionManagementModal({ adminToken, colors, visible, onClose }: Props) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (visible) fetchSessions();
  }, [visible]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/sessions?admin_token=${adminToken}`);
      if (resp.ok) {
        const data = await resp.json();
        setSessions(data.sessions || []);
      }
    } catch (e) { console.log(e); }
    setLoading(false);
  };

  const revokeSession = (sessionId: string) => {
    Alert.alert('Revoke Session', 'This will log out that session. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive', onPress: async () => {
          setRevoking(sessionId);
          try {
            await fetch(`${API_URL}/api/sessions/${sessionId}?admin_token=${adminToken}`, { method: 'DELETE' });
            fetchSessions();
          } catch (e) { console.log(e); }
          setRevoking(null);
        }
      },
    ]);
  };

  const revokeAll = () => {
    Alert.alert('Revoke All Sessions', 'This will log out all sessions. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke All', style: 'destructive', onPress: async () => {
          setLoading(true);
          try {
            await fetch(`${API_URL}/api/sessions?admin_token=${adminToken}`, { method: 'DELETE' });
            fetchSessions();
          } catch (e) { console.log(e); }
          setLoading(false);
        }
      },
    ]);
  };

  const getDeviceIcon = (ua: string) => {
    if (!ua) return 'phone-portrait';
    const lower = ua.toLowerCase();
    if (lower.includes('android') || lower.includes('mobile')) return 'phone-portrait';
    if (lower.includes('ios') || lower.includes('iphone')) return 'phone-portrait';
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%', padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Active Sessions</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
          </View>

          {sessions.length > 1 && (
            <TouchableOpacity onPress={revokeAll} style={{ backgroundColor: '#EF444420', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 13 }}>Revoke All Sessions</Text>
            </TouchableOpacity>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 20 }} /> : sessions.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 30 }}>No active sessions</Text>
            ) : (
              sessions.map((s, i) => (
                <View key={s.id || i} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={getDeviceIcon(s.user_agent) as any} size={20} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{s.ip_address || 'Unknown IP'}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{s.device_info || s.user_agent || 'Unknown device'}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>Last active: {timeAgo(s.last_activity)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => revokeSession(s.id)} disabled={revoking === s.id} style={{ padding: 8 }}>
                    {revoking === s.id ? <ActivityIndicator size="small" color="#EF4444" /> : <Ionicons name="log-out-outline" size={18} color="#EF4444" />}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
