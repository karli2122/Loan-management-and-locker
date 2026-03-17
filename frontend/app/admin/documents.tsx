import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, ActivityIndicator, Alert, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';

interface Document {
  id: string;
  client_id: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  doc_type: string;
  description: string;
  created_at: string;
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
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchDocs = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      // Fetch all documents from vault (all clients)
      const res = await fetch(`${API_URL}/api/documents/vault/all?admin_token=${token}`);
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

  const handleDownload = async (doc: Document) => {
    setDownloading(doc.id);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const resp = await fetch(`${API_URL}/api/documents/vault/${doc.client_id}/${doc.id}/download?admin_token=${token}`);
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Download failed');
      }
      
      const data = await resp.json();
      const base64Data = data.document?.data;
      const contentType = data.document?.content_type || 'application/octet-stream';
      const filename = doc.original_filename;
      
      if (!base64Data) {
        throw new Error('No file data received');
      }

      if (Platform.OS === 'web') {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Alert.alert('Success', 'Document downloaded');
      } else {
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: contentType });
        } else {
          Alert.alert('Success', `Document saved to: ${fileUri}`);
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Download failed');
    }
    setDownloading(null);
  };

  const deleteDoc = async (doc: Document) => {
    Alert.alert('Delete Document', `Delete "${doc.original_filename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const token = await AsyncStorage.getItem('admin_token');
          await fetch(`${API_URL}/api/documents/vault/${doc.client_id}/${doc.id}?admin_token=${token}`, { method: 'DELETE' });
          fetchDocs();
        },
      },
    ]);
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const typeIcon = (t: string) => {
    if (!t) return 'document';
    if (t === 'id_photo') return 'card';
    if (t === 'contract') return 'document-text';
    if (t === 'proof_of_income') return 'cash';
    if (t.includes('pdf')) return 'document-text';
    if (t.includes('image')) return 'image';
    return 'attach';
  };

  const typeColor = (t: string) => {
    switch (t) {
      case 'id_photo': return '#3B82F6';
      case 'contract': return '#10B981';
      case 'proof_of_income': return '#F59E0B';
      default: return '#8B5CF6';
    }
  };

  const filtered = docs.filter(d =>
    (d.original_filename || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.doc_type || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="documents-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="documents-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Document Vault</Text>
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
              <Text style={{ color: '#64748B', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                Upload documents from Client Details → Documents
              </Text>
            </View>
          ) : (
            filtered.map(doc => (
              <View key={doc.id} style={[styles.card, { backgroundColor: colors.card }]} data-testid={`doc-${doc.id}`}>
                <View style={styles.cardRow}>
                  <View style={[styles.iconWrapper, { backgroundColor: typeColor(doc.doc_type) + '20' }]}>
                    <Ionicons name={typeIcon(doc.doc_type) as any} size={22} color={typeColor(doc.doc_type)} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.filename, { color: colors.text }]} numberOfLines={1}>{doc.original_filename}</Text>
                    <Text style={styles.meta}>
                      {doc.doc_type?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} · {formatSize(doc.file_size)}
                    </Text>
                    {doc.description ? <Text style={styles.meta}>{doc.description}</Text> : null}
                    <Text style={styles.meta}>{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}</Text>
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleDownload(doc)} 
                    disabled={downloading === doc.id}
                    style={{ padding: 8 }}
                    data-testid={`download-doc-${doc.id}`}
                  >
                    {downloading === doc.id ? (
                      <ActivityIndicator size="small" color="#3B82F6" />
                    ) : (
                      <Ionicons name="download-outline" size={20} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteDoc(doc)} style={{ padding: 8 }} data-testid={`delete-doc-${doc.id}`}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
  iconWrapper: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  filename: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15, marginTop: 12 },
});
