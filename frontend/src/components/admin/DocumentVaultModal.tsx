import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import API_URL from '../../src/constants/api';

interface Props {
  clientId: string;
  clientName: string;
  adminToken: string;
  colors: any;
  visible: boolean;
  onClose: () => void;
}

const DOC_TYPES = [
  { key: 'id_photo', label: 'ID Photo', icon: 'card' },
  { key: 'contract', label: 'Contract', icon: 'document-text' },
  { key: 'proof_of_income', label: 'Proof of Income', icon: 'cash' },
  { key: 'other', label: 'Other', icon: 'attach' },
];

export default function DocumentVaultModal({ clientId, clientName, adminToken, colors, visible, onClose }: Props) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState('other');

  useEffect(() => {
    if (visible) fetchDocuments();
  }, [visible]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/documents/vault/${clientId}?admin_token=${adminToken}`);
      if (resp.ok) {
        const data = await resp.json();
        setDocuments(data.documents || []);
      }
    } catch (e) { console.log(e); }
    setLoading(false);
  };

  const handleUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      formData.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);

      const resp = await fetch(
        `${API_URL}/api/documents/vault/${clientId}/upload?admin_token=${adminToken}&doc_type=${selectedType}`,
        { method: 'POST', body: formData, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const data = await resp.json();
      if (resp.ok) {
        Alert.alert('Success', 'Document uploaded');
        fetchDocuments();
      } else {
        Alert.alert('Error', data.detail || 'Upload failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setUploading(false);
  };

  const handleDelete = (docId: string, filename: string) => {
    Alert.alert('Delete Document', `Delete "${filename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            const resp = await fetch(`${API_URL}/api/documents/vault/${clientId}/${docId}?admin_token=${adminToken}`, { method: 'DELETE' });
            if (resp.ok) fetchDocuments();
          } catch (e) { console.log(e); }
        }
      },
    ]);
  };

  const getTypeIcon = (type: string) => DOC_TYPES.find(d => d.key === type)?.icon || 'document';
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'id_photo': return '#3B82F6';
      case 'contract': return '#10B981';
      case 'proof_of_income': return '#F59E0B';
      default: return '#8B5CF6';
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Document Vault</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
          </View>

          {/* Upload Section */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Upload Document</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {DOC_TYPES.map(dt => (
                <TouchableOpacity key={dt.key} onPress={() => setSelectedType(dt.key)}
                  style={{ backgroundColor: selectedType === dt.key ? getTypeColor(dt.key) : colors.background, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={dt.icon as any} size={14} color={selectedType === dt.key ? '#fff' : colors.textMuted} />
                  <Text style={{ color: selectedType === dt.key ? '#fff' : colors.textMuted, fontSize: 12, marginLeft: 4 }}>{dt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={handleUpload} disabled={uploading}
              style={{ backgroundColor: '#10B981', borderRadius: 8, padding: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
              {uploading ? <ActivityIndicator color="#fff" /> : (
                <><Ionicons name="cloud-upload" size={18} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Select & Upload</Text></>
              )}
            </TouchableOpacity>
          </View>

          {/* Document List */}
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>Documents ({documents.length})</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 20 }} /> : documents.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 30 }}>No documents uploaded yet</Text>
            ) : (
              documents.map((doc, i) => (
                <View key={doc.id || i} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: getTypeColor(doc.doc_type) + '20', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={getTypeIcon(doc.doc_type) as any} size={20} color={getTypeColor(doc.doc_type)} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{doc.original_filename}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {DOC_TYPES.find(d => d.key === doc.doc_type)?.label || doc.doc_type} · {formatSize(doc.file_size || 0)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(doc.id, doc.original_filename)} style={{ padding: 8 }}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
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
