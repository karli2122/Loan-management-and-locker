import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/context/ThemeContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

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
  const { t } = useLanguage();
  const { formatAmount } = useCurrency();
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [activeTab, setActiveTab] = useState('reconcile');

  const pickAndUploadCSV = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
      if (res.canceled) return;

      const file = res.assets[0];
      setUploading(true);
      setImportResult(null);

      const token = await getSecureItem('admin_token');
      const formData = new FormData();
      formData.append('admin_token', token || '');
      formData.append('skip_duplicates', 'true');
      
      const fileData = {
        uri: file.uri,
        name: file.name || 'import.csv',
        type: 'text/csv',
      };
      formData.append('file', fileData);

      const resp = await fetch(`${API_URL}/api/import/clients/csv`, {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (resp.ok) {
        setImportResult(data);
        Alert.alert(t('importComplete') || 'Import Complete', `${data.total_imported || data.imported || 0} clients imported`);
      } else {
        Alert.alert(t('importFailed') || 'Import Failed', data.error || data.detail || 'Unknown error');
      }
    } catch (e) {
      Alert.alert(t('error') || 'Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const pickAndReconcileStatement = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ 
        type: ['text/csv', 'application/pdf', 'application/octet-stream'],
      });
      if (res.canceled) return;

      const file = res.assets[0];
      const fileName = file.name?.toLowerCase() || '';
      
      // Validate file type
      const validExtensions = ['.csv', '.pdf', '.asice'];
      const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));
      if (!hasValidExt) {
        Alert.alert(
          t('invalidFileType') || 'Invalid File Type',
          'Please upload a CSV, PDF, or ASICE file'
        );
        return;
      }

      setUploading(true);
      setReconcileResult(null);

      const token = await getSecureItem('admin_token');
      const formData = new FormData();
      formData.append('admin_token', token || '');
      
      // Determine mime type
      let mimeType = 'text/csv';
      if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (fileName.endsWith('.asice')) mimeType = 'application/octet-stream';
      
      const fileData = {
        uri: file.uri,
        name: file.name || 'statement.csv',
        type: mimeType,
      };
      formData.append('file', fileData);

      const resp = await fetch(`${API_URL}/api/import/bank-statement/reconcile`, {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      
      if (resp.ok) {
        setReconcileResult(data);
        setShowResultsModal(true);
      } else {
        Alert.alert(
          t('reconcileFailed') || 'Reconciliation Failed', 
          data.detail || data.error || 'Unknown error'
        );
      }
    } catch (e) {
      Alert.alert(t('error') || 'Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} data-testid="import-page">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} data-testid="import-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Bulk Import</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'reconcile' && styles.tabActive,
            { backgroundColor: activeTab === 'reconcile' ? '#2563EB' : colors.card }
          ]}
          onPress={() => setActiveTab('reconcile')}
          data-testid="tab-reconcile"
        >
          <Ionicons 
            name="swap-horizontal" 
            size={18} 
            color={activeTab === 'reconcile' ? '#fff' : colors.textMuted} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'reconcile' ? '#fff' : colors.textMuted }
          ]}>
            Bank Statement
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'import' && styles.tabActive,
            { backgroundColor: activeTab === 'import' ? '#2563EB' : colors.card }
          ]}
          onPress={() => setActiveTab('import')}
          data-testid="tab-import"
        >
          <Ionicons 
            name="people" 
            size={18} 
            color={activeTab === 'import' ? '#fff' : colors.textMuted} 
          />
          <Text style={[
            styles.tabText,
            { color: activeTab === 'import' ? '#fff' : colors.textMuted }
          ]}>
            Import Clients
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {activeTab === 'reconcile' ? (
          <>
            {/* Bank Statement Reconciliation */}
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <Ionicons name="document-text" size={48} color="#2563EB" />
              <Text style={[styles.infoTitle, { color: colors.text }]}>Bank Statement Reconciliation</Text>
              <Text style={[styles.infoDesc, { color: colors.textMuted }]}>
                Upload a bank statement to automatically match transactions with your clients.
                {'\n\n'}
                <Text style={{ fontWeight: '600' }}>Supported formats:</Text> CSV, PDF, ASICE
                {'\n\n'}
                <Text style={{ fontWeight: '600' }}>How it works:</Text>
                {'\n'}• Outgoing transfers (-) → Creates loans
                {'\n'}• Incoming transfers (+) → Records payments
                {'\n'}• Bank fees & card payments are ignored
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
              onPress={pickAndReconcileStatement}
              disabled={uploading}
              data-testid="reconcile-upload-btn"
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={22} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.uploadBtnText}>Select Bank Statement</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Tips Card */}
            <View style={[styles.tipsCard, { backgroundColor: colors.card, borderColor: '#F59E0B' }]}>
              <Ionicons name="bulb" size={20} color="#F59E0B" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.tipsTitle, { color: colors.text }]}>Tips for best results</Text>
                <Text style={[styles.tipsText, { color: colors.textMuted }]}>
                  • Client names in bank statement should match your client list
                  {'\n'}• PDF files require Enterprise plan for AI extraction
                  {'\n'}• CSV files work with any Professional+ plan
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Client Import */}
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <Ionicons name="cloud-upload" size={48} color="#2563EB" />
              <Text style={[styles.infoTitle, { color: colors.text }]}>Import Clients from CSV</Text>
              <Text style={[styles.infoDesc, { color: colors.textMuted }]}>
                Upload a CSV file with client data.
                {'\n\n'}
                <Text style={{ fontWeight: '600' }}>Expected columns:</Text>
                {'\n'}name, phone, email, address, loan_amount, interest_rate
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
              onPress={pickAndUploadCSV}
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

            {importResult && (
              <View style={[styles.resultCard, { backgroundColor: colors.card }]} data-testid="import-results">
                <Text style={[styles.resultTitle, { color: colors.text }]}>Import Results</Text>
                <View style={styles.resultRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={[styles.resultText, { color: colors.text }]}>
                    Imported: {importResult.total_imported || importResult.imported || 0}
                  </Text>
                </View>
                {importResult.skipped !== undefined && importResult.skipped > 0 && (
                  <View style={styles.resultRow}>
                    <Ionicons name="remove-circle" size={18} color="#F59E0B" />
                    <Text style={[styles.resultText, { color: colors.text }]}>Skipped: {importResult.skipped}</Text>
                  </View>
                )}
                {importResult.errors && importResult.errors.length > 0 && (
                  <View style={styles.errorsSection}>
                    <Text style={styles.errorsTitle}>Errors:</Text>
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <Text key={i} style={styles.errorItem}>Row {err.row}: {err.error}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={[styles.templateCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.templateTitle, { color: colors.text }]}>CSV Template</Text>
              <Text style={[styles.templateCode, { color: colors.textMuted }]}>
                name,phone,email,address,loan_amount,interest_rate{'\n'}
                John Doe,+372 555 1234,john@email.com,Tallinn,5000,12
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Results Modal for Bank Statement Reconciliation */}
      <Modal visible={showResultsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Reconciliation Results</Text>
              <TouchableOpacity onPress={() => setShowResultsModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {reconcileResult && (
              <ScrollView style={styles.modalScroll}>
                {/* Summary */}
                <View style={styles.summaryGrid}>
                  <View style={[styles.summaryItem, { backgroundColor: '#8B5CF620' }]}>
                    <Text style={styles.summaryValue}>{reconcileResult.summary.new_clients_created || 0}</Text>
                    <Text style={styles.summaryLabel}>New Clients</Text>
                  </View>
                  <View style={[styles.summaryItem, { backgroundColor: '#10B98120' }]}>
                    <Text style={styles.summaryValue}>{reconcileResult.summary.loans_created}</Text>
                    <Text style={styles.summaryLabel}>Loans Created</Text>
                  </View>
                  <View style={[styles.summaryItem, { backgroundColor: '#2563EB20' }]}>
                    <Text style={styles.summaryValue}>{reconcileResult.summary.payments_recorded}</Text>
                    <Text style={styles.summaryLabel}>Payments</Text>
                  </View>
                  <View style={[styles.summaryItem, { backgroundColor: '#64748B20' }]}>
                    <Text style={styles.summaryValue}>{reconcileResult.summary.ignored}</Text>
                    <Text style={styles.summaryLabel}>Ignored</Text>
                  </View>
                </View>

                {/* New Clients Created */}
                {reconcileResult.details.new_clients_created && reconcileResult.details.new_clients_created.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailTitle, { color: colors.text }]}>
                      <Ionicons name="person-add" size={16} color="#8B5CF6" /> New Clients Created
                    </Text>
                    <View style={[styles.infoBox, { backgroundColor: '#8B5CF610', borderColor: '#8B5CF6' }]}>
                      <Ionicons name="information-circle" size={16} color="#8B5CF6" />
                      <Text style={[styles.infoBoxText, { color: colors.textMuted }]}>
                        These clients need review. Go to Loans → Imported tab to complete their info.
                      </Text>
                    </View>
                    {reconcileResult.details.new_clients_created.map((client, i) => (
                      <View key={i} style={[styles.detailItem, { backgroundColor: colors.background }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.detailName, { color: colors.text }]}>{client.client_name}</Text>
                          <View style={styles.importedBadge}>
                            <Text style={styles.importedBadgeText}>NEEDS REVIEW</Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.detailAmount, { color: '#8B5CF6' }]}>
                            {formatAmount(client.loan_amount)}
                          </Text>
                          <Text style={[styles.detailDate, { color: colors.textMuted }]}>{client.date}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Loans Created */}
                {reconcileResult.details.loans_created.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailTitle, { color: colors.text }]}>
                      <Ionicons name="arrow-down-circle" size={16} color="#10B981" /> Loans Created
                    </Text>
                    {reconcileResult.details.loans_created.map((loan, i) => (
                      <View key={i} style={[styles.detailItem, { backgroundColor: colors.background }]}>
                        <Text style={[styles.detailName, { color: colors.text }]}>{loan.client_name}</Text>
                        <Text style={[styles.detailAmount, { color: '#10B981' }]}>
                          {formatAmount(loan.loan_amount)}
                        </Text>
                        <Text style={[styles.detailDate, { color: colors.textMuted }]}>{loan.date}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Payments Recorded */}
                {reconcileResult.details.payments_recorded.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailTitle, { color: colors.text }]}>
                      <Ionicons name="arrow-up-circle" size={16} color="#2563EB" /> Payments Recorded
                    </Text>
                    {reconcileResult.details.payments_recorded.map((payment, i) => (
                      <View key={i} style={[styles.detailItem, { backgroundColor: colors.background }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.detailName, { color: colors.text }]}>{payment.client_name}</Text>
                          {payment.loan_fully_paid && (
                            <View style={styles.paidBadge}>
                              <Text style={styles.paidBadgeText}>FULLY PAID</Text>
                            </View>
                          )}
                          {payment.extra_interest > 0 && (
                            <Text style={[styles.extraInterest, { color: '#F59E0B' }]}>
                              +{formatAmount(payment.extra_interest)} extra interest
                            </Text>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.detailAmount, { color: '#2563EB' }]}>
                            {formatAmount(payment.payment_amount)}
                          </Text>
                          <Text style={[styles.detailDate, { color: colors.textMuted }]}>{payment.date}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Unmatched Transactions */}
                {reconcileResult.details.unmatched_transactions.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailTitle, { color: colors.text }]}>
                      <Ionicons name="help-circle" size={16} color="#F59E0B" /> Unmatched (No Client Found)
                    </Text>
                    {reconcileResult.details.unmatched_transactions.slice(0, 10).map((txn, i) => (
                      <View key={i} style={[styles.detailItem, { backgroundColor: colors.background }]}>
                        <Text style={[styles.detailName, { color: colors.text }]}>{txn.name}</Text>
                        <Text style={[styles.detailAmount, { color: colors.textMuted }]}>
                          {formatAmount(txn.amount)}
                        </Text>
                      </View>
                    ))}
                    {reconcileResult.details.unmatched_transactions.length > 10 && (
                      <Text style={[styles.moreText, { color: colors.textMuted }]}>
                        +{reconcileResult.details.unmatched_transactions.length - 10} more...
                      </Text>
                    )}
                  </View>
                )}

                {/* Errors */}
                {reconcileResult.details.errors.length > 0 && (
                  <View style={styles.detailSection}>
                    <Text style={[styles.detailTitle, { color: '#EF4444' }]}>
                      <Ionicons name="warning" size={16} color="#EF4444" /> Errors
                    </Text>
                    {reconcileResult.details.errors.slice(0, 5).map((err, i) => (
                      <View key={i} style={[styles.detailItem, { backgroundColor: '#EF444410' }]}>
                        <Text style={[styles.detailName, { color: colors.text }]}>{err.name}</Text>
                        <Text style={[styles.errorText, { color: '#EF4444' }]}>{err.error}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowResultsModal(false)}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 16, 
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  tabContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: { 
    alignItems: 'center', 
    padding: 24, 
    borderRadius: 12, 
    marginBottom: 20 
  },
  infoTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  infoDesc: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  uploadBtn: { 
    backgroundColor: '#2563EB', 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 16, 
    borderRadius: 12, 
    marginBottom: 20 
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tipsCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  tipsTitle: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  tipsText: { fontSize: 12, lineHeight: 18 },
  resultCard: { padding: 16, borderRadius: 12, marginBottom: 20 },
  resultTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  resultText: { fontSize: 14 },
  errorsSection: { marginTop: 10 },
  errorsTitle: { fontSize: 13, color: '#EF4444', fontWeight: '600', marginBottom: 4 },
  errorItem: { fontSize: 12, color: '#EF4444', marginBottom: 2 },
  templateCard: { padding: 16, borderRadius: 12 },
  templateTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  templateCode: { fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalScroll: { maxHeight: '80%' },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryValue: { fontSize: 24, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  detailSection: { marginBottom: 20 },
  detailTitle: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  detailName: { fontSize: 14, fontWeight: '500', flex: 1 },
  detailAmount: { fontSize: 14, fontWeight: '600' },
  detailDate: { fontSize: 11, marginTop: 2 },
  paidBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  paidBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  importedBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  importedBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  infoBoxText: { flex: 1, fontSize: 12, lineHeight: 16 },
  extraInterest: { fontSize: 11, marginTop: 2 },
  errorText: { fontSize: 12 },
  moreText: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  closeBtn: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
