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
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';

interface Document {
  id: string;
  client_id: string;
  filename: string;
  content_type: string;
  size: number;
  doc_type: string;
  description: string;
  uploaded_at: string;
}

export default function DocumentsPage() {
  return (
    <EnterpriseGate featureName="Documents" requiredPlan="business" featureKey="document_vault">
      <DocumentsContent />
    </EnterpriseGate>
  );
}

function DocumentsContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDocs = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const res = await fetch(`${API_URL}/api/documents/list?admin_token=${token}`);
      const data = await res.json();
      if (Array.isArray(data)) setDocs(data);
      else if (data.documents) setDocs(data.documents);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);
  const onRefresh = useCallback(async () => { setRefreshing(true); await fetchDocs(); setRefreshing(false); }, []);

  const deleteDoc = async (docId: string) => {
    Alert.alert('Delete Document', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const token = await AsyncStorage.getItem('admin_token');
          await fetch(`${API_URL}/api/documents/${docId}?admin_token=${token}`, { method: 'DELETE' });
          fetchDocs();
        },
      },
    ]);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const typeIcon = (t: string) => {
    if (t.includes('pdf')) return 'document-text';
    if (t.includes('image')) return 'image';
    return 'document';
  };

  const filtered = docs.filter(d =>
    d.filename.toLowerCase().includes(search.toLowerCase()) ||
    d.doc_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="documents-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="documents-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Documents</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search documents..."
          placeholderTextColor="#64748B"
          value={search}
          onChangeText={setSearch}
          data-testid="documents-search"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open" size={48} color="#64748B" />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No documents found</Text>
            </View>
          ) : (
            filtered.map(doc => (
              <View key={doc.id} style={[styles.card, { backgroundColor: colors.card }]} data-testid={`doc-${doc.id}`}>
                <View style={styles.cardRow}>
                  <Ionicons name={typeIcon(doc.content_type)} size={24} color="#2563EB" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.filename, { color: colors.text }]} numberOfLines={1}>{doc.filename}</Text>
                    <Text style={styles.meta}>{doc.doc_type} - {formatSize(doc.size)}</Text>
                    {doc.description ? <Text style={styles.meta}>{doc.description}</Text> : null}
                    <Text style={styles.meta}>{new Date(doc.uploaded_at).toLocaleDateString()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteDoc(doc.id)} data-testid={`delete-doc-${doc.id}`}>
                    <Ionicons name="trash" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 10, backgroundColor: '#152035', borderRadius: 10 },
  searchInput: { flex: 1, fontSize: 14 },
  card: { padding: 14, borderRadius: 10, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  filename: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15, marginTop: 12 },
});
