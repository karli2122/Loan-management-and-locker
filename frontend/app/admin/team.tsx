import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';
import API_URL from '../../src/constants/api';

interface TeamMember {
  id: string;
  username: string;
  role: string;
  first_name?: string;
  last_name?: string;
  client_count?: number;
  created_at: string;
  is_active?: boolean;
}

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'collection_agent', label: 'Collection Agent' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'viewer', label: 'Viewer' },
];

export default function TeamPage() {
  const router = useRouter();
  const { colors } = useTheme();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '', role: 'collection_agent' });
  const [adding, setAdding] = useState(false);

  const fetchTeam = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/team/members?admin_token=${token}`);
      const data = await res.json();
      if (Array.isArray(data)) setMembers(data);
      else if (data.members) setMembers(data.members);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeam(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchTeam(); setRefreshing(false); }, []);

  const addMember = async () => {
    if (!form.username || !form.password) {
      Alert.alert('Error', 'Username and password required');
      return;
    }
    setAdding(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/team/members?admin_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Team member added');
        setShowAdd(false);
        setForm({ username: '', password: '', first_name: '', last_name: '', role: 'collection_agent' });
        fetchTeam();
      } else {
        Alert.alert('Error', data.error || data.detail || 'Failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (memberId: string) => {
    Alert.alert('Remove Member', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const token = await AsyncStorage.getItem('admin_token');
          await fetch(`${API_URL}/api/team/members/${memberId}?admin_token=${token}`, { method: 'DELETE' });
          fetchTeam();
        },
      },
    ]);
  };

  const roleColor = (role: string) => {
    const map: Record<string, string> = { manager: '#8B5CF6', collection_agent: '#2563EB', accountant: '#10B981', viewer: '#64748B' };
    return map[role] || '#64748B';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="team-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="team-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Team Management</Text>
        <TouchableOpacity onPress={() => setShowAdd(true)} data-testid="team-add-btn">
          <Ionicons name="person-add" size={22} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          <View style={[styles.infoCard, { backgroundColor: '#172554' }]}>
            <Ionicons name="shield-checkmark" size={20} color="#2563EB" />
            <Text style={styles.infoText}>Enterprise Feature - Manage your team members and their roles</Text>
          </View>

          {members.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people" size={48} color="#64748B" />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No team members yet</Text>
            </View>
          ) : (
            members.map(m => (
              <View key={m.id} style={[styles.card, { backgroundColor: colors.card }]} data-testid={`member-${m.id}`}>
                <View style={styles.memberRow}>
                  <View style={[styles.avatar, { backgroundColor: roleColor(m.role) + '33' }]}>
                    <Ionicons name="person" size={20} color={roleColor(m.role)} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {m.first_name || m.last_name ? `${m.first_name || ''} ${m.last_name || ''}`.trim() : m.username}
                    </Text>
                    <Text style={styles.memberUsername}>@{m.username}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: roleColor(m.role) + '33' }]}>
                    <Text style={[styles.roleText, { color: roleColor(m.role) }]}>{m.role.replace('_', ' ')}</Text>
                  </View>
                </View>
                <View style={styles.memberMeta}>
                  {m.client_count !== undefined && (
                    <Text style={styles.metaText}>{m.client_count} clients</Text>
                  )}
                  <Text style={styles.metaText}>Added {new Date(m.created_at).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeMember(m.id)} data-testid={`remove-member-${m.id}`}>
                  <Ionicons name="trash" size={14} color="#EF4444" />
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]} data-testid="add-member-modal">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Team Member</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} data-testid="close-add-modal">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="Username" placeholderTextColor="#64748B" value={form.username} onChangeText={v => setForm({ ...form, username: v })} data-testid="member-username" />
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="Password" placeholderTextColor="#64748B" secureTextEntry value={form.password} onChangeText={v => setForm({ ...form, password: v })} data-testid="member-password" />
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="First Name" placeholderTextColor="#64748B" value={form.first_name} onChangeText={v => setForm({ ...form, first_name: v })} data-testid="member-firstname" />
            <TextInput style={[styles.input, { color: colors.text }]} placeholder="Last Name" placeholderTextColor="#64748B" value={form.last_name} onChangeText={v => setForm({ ...form, last_name: v })} data-testid="member-lastname" />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Role</Text>
            <View style={styles.roleGrid}>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.roleOption, form.role === r.value && styles.roleSelected]}
                  onPress={() => setForm({ ...form, role: r.value })}
                  data-testid={`role-${r.value}`}
                >
                  <Text style={[styles.roleOptionText, form.role === r.value && { color: '#fff' }]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={addMember} disabled={adding} data-testid="submit-member-btn">
              {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Add Member</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  title: { fontSize: 18, fontWeight: '700' },
  infoCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 16, gap: 10 },
  infoText: { fontSize: 13, color: '#93C5FD', flex: 1 },
  card: { padding: 14, borderRadius: 12, marginBottom: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontSize: 15, fontWeight: '600' },
  memberUsername: { fontSize: 12, color: '#64748B', marginTop: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  roleText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  memberMeta: { flexDirection: 'row', gap: 16, marginTop: 8, marginLeft: 52 },
  metaText: { fontSize: 12, color: '#64748B' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 52 },
  removeBtnText: { fontSize: 12, color: '#EF4444' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14 },
  fieldLabel: { fontSize: 13, marginBottom: 8 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  roleOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  roleSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  roleOptionText: { fontSize: 13, color: '#94A3B8' },
  submitBtn: { backgroundColor: '#2563EB', padding: 14, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
