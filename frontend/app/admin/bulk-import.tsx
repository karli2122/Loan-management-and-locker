import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

export default function BulkImportPage() {
  return (
    <EnterpriseGate featureName="Bulk Import" requiredPlan="professional" featureKey="bulk_import">
      <BulkImportContent />
    </EnterpriseGate>
  );
}

function BulkImportContent() {
  const router = useRouter();
  const { colors } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pickAndUpload = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (res.canceled) return;

      const file = res.assets[0];
      setUploading(true);
      setResult(null);

      const token = await AsyncStorage.getItem('admin_token');
      const formData = new FormData();
      formData.append('admin_token', token || '');
      formData.append('skip_duplicates', 'true');
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'import.csv',
        type: 'text/csv',
      } as any);

      const resp = await fetch(`${API_URL}/api/import/clients/csv`, {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (resp.ok) {
        setResult(data);
        Alert.alert('Import Complete', `${data.imported || 0} clients imported`);
      } else {
        Alert.alert('Import Failed', data.error || 'Unknown error');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="import-page">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} data-testid="import-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Bulk Import</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Ionicons name="cloud-upload" size={48} color="#2563EB" />
          <Text style={[styles.infoTitle, { color: colors.text }]}>Import Clients from CSV</Text>
          <Text style={styles.infoDesc}>Upload a CSV file with client data. Expected columns: name, phone, email, address, loan_amount, interest_rate, loan_duration_months</Text>
        </View>

        <TouchableOpacity
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={pickAndUpload}
          disabled={uploading}
          data-testid="import-upload-btn"
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="document-attach" size={22} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.uploadBtnText}>Select CSV File</Text>
            </>
          )}
        </TouchableOpacity>

        {result && (
          <View style={[styles.resultCard, { backgroundColor: colors.card }]} data-testid="import-results">
            <Text style={[styles.resultTitle, { color: colors.text }]}>Import Results</Text>
            <View style={styles.resultRow}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={[styles.resultText, { color: colors.text }]}>Imported: {result.imported}</Text>
            </View>
            <View style={styles.resultRow}>
              <Ionicons name="remove-circle" size={18} color="#F59E0B" />
              <Text style={[styles.resultText, { color: colors.text }]}>Skipped: {result.skipped}</Text>
            </View>
            {result.errors?.length > 0 && (
              <View style={styles.errorsSection}>
                <Text style={styles.errorsTitle}>Errors:</Text>
                {result.errors.slice(0, 5).map((err, i) => (
                  <Text key={i} style={styles.errorItem}>{err}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={[styles.templateCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.templateTitle, { color: colors.text }]}>CSV Template</Text>
          <Text style={styles.templateCode}>name,phone,email,address,loan_amount,interest_rate,loan_duration_months{'\n'}John Doe,+372 555 1234,john@email.com,Tallinn,5000,12,12</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  title: { fontSize: 18, fontWeight: '700' },
  infoCard: { alignItems: 'center', padding: 24, borderRadius: 12, marginBottom: 20 },
  infoTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  infoDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  uploadBtn: { backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginBottom: 20 },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { padding: 16, borderRadius: 12, marginBottom: 20 },
  resultTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  resultText: { fontSize: 14 },
  errorsSection: { marginTop: 10 },
  errorsTitle: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginBottom: 4 },
  errorItem: { fontSize: 12, color: '#EF4444', marginBottom: 2 },
  templateCard: { padding: 16, borderRadius: 12 },
  templateTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  templateCode: { fontSize: 12, color: '#64748B', fontFamily: 'monospace', lineHeight: 18 },
});
