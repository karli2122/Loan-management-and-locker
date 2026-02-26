import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

interface AnalysisResult {
  id: string;
  filename: string;
  analyzed_at: string;
  analysis: {
    bank_name?: string;
    period?: string;
    currency?: string;
    account_holder?: string;
    summary?: {
      total_income: number;
      total_expenses: number;
      net_balance: number;
      opening_balance?: number;
      closing_balance?: number;
    };
    income_categories?: Array<{ category: string; total: number; count: number }>;
    expense_categories?: Array<{ category: string; total: number; count: number }>;
    risk_indicators?: {
      has_regular_income?: boolean;
      income_stability?: string;
      high_expense_ratio?: boolean;
      gambling_detected?: boolean;
      loan_payments_detected?: boolean;
      notes?: string;
    };
    credit_recommendation?: {
      monthly_credit_amount?: number;
      yearly_credit_amount?: number;
      debt_to_income_ratio?: number;
      disposable_income?: number;
      risk_level?: string;
      reasoning?: string;
    };
    error?: string;
    raw_response?: string;
  };
}

export default function BankAnalyzer() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [sebLikely, setSebLikely] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSebText = (text: string) => text.includes('SEB') || text.includes('SEB Pank');

  const detectSebFromWebFile = async (file: File): Promise<boolean> => {
    try {
      const blob = file.slice(0, 20000);
      const buffer = await blob.arrayBuffer();
      const decoder = new TextDecoder('latin1');
      const text = decoder.decode(buffer);
      return isSebText(text);
    } catch (e) {
      return false;
    }
  };

  const detectSebFromNativeFile = async (uri: string): Promise<boolean> => {
    try {
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      return isSebText(text);
    } catch (e) {
      return false;
    }
  };

  const pickAndUploadFile = async () => {
    try {
      if (Platform.OS === 'web') {
        fileInputRef.current?.click();
        return;
      }
      // Native: use expo-document-picker
      const docResult = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.etsi.asic-e+zip', '*/*'],
        copyToCacheDirectory: true,
      });
      if (docResult.canceled || !docResult.assets?.length) return;
      const asset = docResult.assets[0];
      setSelectedFileName(asset.name || '');
      const ext = (asset.name || '').toLowerCase().split('.').pop();
      if (ext !== 'pdf' && ext !== 'asice') {
        setError(t('onlyPdfAndAsiceFilesSupported'));
        setSebLikely(false);
        return;
      }
      const nameLower = (asset.name || '').toLowerCase();
      const sebDetected = nameLower.includes('seb') || await detectSebFromNativeFile(asset.uri);
      setSebLikely(sebDetected);
      await uploadFile(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
    } catch (err: any) {
      setError(err.message || 'File picker failed');
    }
  };

  const uploadFile = async (uri: string, name: string, mimeType: string) => {
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setError(t('notLoggedIn'));
        return;
      }
      const formData = new FormData();
      if (Platform.OS === 'web') {
        // Web: uri is actually a File object passed from handleWebFile
        // This path is handled separately in handleWebFile
        return;
      } else {
        formData.append('file', { uri, name, type: mimeType } as any);
      }
      const response = await fetch(
        `${API_URL}/api/bank-statements/analyze?admin_token=${adminToken}`,
        { method: 'POST', body: formData }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed (${response.status})`);
      }
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setUploading(false);
    }
  };

  const handleWebFile = async (file: File) => {
    setError('');
    setResult(null);
    setSelectedFileName(file.name || '');
    const nameLower = (file.name || '').toLowerCase();
    const sebDetected = nameLower.includes('seb') || await detectSebFromWebFile(file);
    setSebLikely(sebDetected);
    setUploading(true);
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setError(t('notLoggedIn'));
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${API_URL}/api/bank-statements/analyze?admin_token=${adminToken}`,
        { method: 'POST', body: formData }
      );
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed (${response.status})`);
      }
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setUploading(false);
    }
  };

  const fmt = (n: number | undefined | null) =>
    n != null ? `${n >= 0 ? '' : '-'}${formatAmount(Math.abs(n), 2)}` : '-';

  const isSebPdf = sebLikely && selectedFileName.toLowerCase().endsWith('.pdf');
  const showSebOcrHint = uploading && isSebPdf;

  const a = result?.analysis;
  const s = a?.summary;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {t('bankStatementAnalyzer')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Upload Area */}
        {!result && !uploading && (
          <TouchableOpacity
            style={styles.uploadArea}
            onPress={pickAndUploadFile}
            data-testid="upload-area"
          >
            <Ionicons name="cloud-upload" size={48} color="#2563EB" />
            <Text style={styles.uploadTitle}>
              {t('uploadBankStatement')}
            </Text>
            <Text style={styles.uploadSubtext}>
              {t('pdfOrAsiceFiles')}
            </Text>
            <Text style={styles.uploadSubtext}>
              {language === 'et' ? 'Laadi üles pangaväljavõte: PDF, CSV, XML või ASICE failid' : 'Upload bank statement: PDF, CSV, XML or ASICE files'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Hidden file input (web only) */}
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".pdf,.asice"
            style={{ display: 'none' }}
            onChange={(e: any) => {
              const file = e.target?.files?.[0];
              if (file) {
                setSelectedFileName(file.name || '');
                handleWebFile(file);
              }
            }}
          />
        )}

        {/* Loading */}
        {uploading && (
          <View style={styles.loadingContainer} data-testid="analyzing-indicator">
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingTitle}>
              {t('analyzing')}
            </Text>
            <Text style={styles.loadingSubtext}>
              {t('aiIsAnalyzingYourBankStatement')}
            </Text>
            {showSebOcrHint && (
              <>
                <Text style={styles.sebLoadingText} data-testid="seb-ocr-loading">
                  {t('processingSebOcr')}
                </Text>
                <Text style={styles.sebLoadingEta} data-testid="seb-ocr-eta">
                  {t('ocrMayTakeUpTo30s')}
                </Text>
              </>
            )}
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer} data-testid="error-message">
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={pickAndUploadFile}>
              <Text style={styles.retryText}>
                {t('tryAgain')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {result && a && !a.error && (
          <View data-testid="analysis-results">
            <View style={styles.resultHeader}>
              <View style={styles.resultHeaderLeft}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={styles.resultHeaderTitle}>
                  {t('analysisComplete')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setResult(null);
                  setError('');
                  setSelectedFileName('');
                }}
                data-testid="new-analysis-btn"
              >
                <Ionicons name="add-circle" size={28} color="#2563EB" />
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{t('bank')}</Text>
                <Text style={styles.cardValue}>{a.bank_name || '-'}</Text>
              </View>
              {a.account_holder && (
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{t('holder')}</Text>
                  <Text style={styles.cardValue}>{a.account_holder}</Text>
                </View>
              )}
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{t('period')}</Text>
                <Text style={styles.cardValue}>{a.period || '-'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{t('file')}</Text>
                <Text style={styles.cardValue}>{result.filename}</Text>
              </View>
            </View>

            {s && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.incomeCard]}>
                  <Ionicons name="trending-up" size={20} color="#10B981" />
                  <Text style={styles.summaryLabel}>{t('income')}</Text>
                  <Text style={[styles.summaryAmount, { color: '#10B981' }]}>{fmt(s.total_income)}</Text>
                </View>
                <View style={[styles.summaryCard, styles.expenseCard]}>
                  <Ionicons name="trending-down" size={20} color="#EF4444" />
                  <Text style={styles.summaryLabel}>{t('expenses')}</Text>
                  <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>{fmt(s.total_expenses)}</Text>
                </View>
              </View>
            )}

            {s && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('balance')}</Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{t('netChange')}</Text>
                  <Text style={[styles.cardValue, { color: (s.net_balance ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                    {fmt(s.net_balance)}
                  </Text>
                </View>
                {s.opening_balance != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t('opening')}</Text>
                    <Text style={styles.cardValue}>{fmt(s.opening_balance)}</Text>
                  </View>
                )}
                {s.closing_balance != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{t('closing')}</Text>
                    <Text style={styles.cardValue}>{fmt(s.closing_balance)}</Text>
                  </View>
                )}
              </View>
            )}

            {a.income_categories && a.income_categories.filter(c => c.total > 0).length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('incomeCategories')}</Text>
                {a.income_categories.filter(c => c.total > 0).map((cat, i) => (
                  <View key={i} style={styles.categoryRow}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.categoryDot, { backgroundColor: '#10B981' }]} />
                      <Text style={styles.categoryName}>{cat.category}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text style={[styles.categoryAmount, { color: '#10B981' }]}>{fmt(cat.total)}</Text>
                      <Text style={styles.categoryCount}>{cat.count}x</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {a.expense_categories && a.expense_categories.filter(c => c.total > 0).length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('expenseCategories')}</Text>
                {a.expense_categories.filter(c => c.total > 0).map((cat, i) => (
                  <View key={i} style={styles.categoryRow}>
                    <View style={styles.categoryLeft}>
                      <View style={[styles.categoryDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.categoryName}>{cat.category}</Text>
                    </View>
                    <View style={styles.categoryRight}>
                      <Text style={[styles.categoryAmount, { color: '#EF4444' }]}>{fmt(cat.total)}</Text>
                      <Text style={styles.categoryCount}>{cat.count}x</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {a.risk_indicators && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('riskAnalysis')}</Text>
                <View style={styles.riskRow}>
                  <Ionicons
                    name={a.risk_indicators.has_regular_income ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={a.risk_indicators.has_regular_income ? '#10B981' : '#EF4444'}
                  />
                  <Text style={styles.riskLabel}>
                    {t('regularIncome')}
                  </Text>
                </View>
                <View style={styles.riskRow}>
                  <Ionicons
                    name={a.risk_indicators.income_stability === 'stable' ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={a.risk_indicators.income_stability === 'stable' ? '#10B981' : '#F59E0B'}
                  />
                  <Text style={styles.riskLabel}>
                    {t('incomeStability')}: {a.risk_indicators.income_stability || '-'}
                  </Text>
                </View>
                {a.risk_indicators.gambling_detected && (
                  <View style={styles.riskRow}>
                    <Ionicons name="warning" size={18} color="#EF4444" />
                    <Text style={[styles.riskLabel, { color: '#EF4444' }]}>
                      {t('gamblingTransactionsDetected')}
                    </Text>
                  </View>
                )}
                {a.risk_indicators.loan_payments_detected && (
                  <View style={styles.riskRow}>
                    <Ionicons name="information-circle" size={18} color="#F59E0B" />
                    <Text style={styles.riskLabel}>
                      {t('loanPaymentsDetected')}
                    </Text>
                  </View>
                )}
                {a.risk_indicators.notes && (
                  <Text style={styles.riskNotes}>{a.risk_indicators.notes}</Text>
                )}
              </View>
            )}

            {a.credit_recommendation && (
              <View style={styles.creditCard} data-testid="credit-recommendation">
                <View style={styles.creditHeader}>
                  <Ionicons name="cash" size={22} color="#8B5CF6" />
                  <Text style={styles.creditTitle}>
                    {t('creditRecommendation')}
                  </Text>
                </View>

                <View style={styles.creditAmountRow}>
                  <View style={styles.creditAmountCard}>
                    <Text style={styles.creditAmountLabel}>
                      {t('monthly')}
                    </Text>
                    <Text style={styles.creditAmountValue}>
                      {fmt(a.credit_recommendation.monthly_credit_amount)}
                    </Text>
                  </View>
                  <View style={styles.creditAmountCard}>
                    <Text style={styles.creditAmountLabel}>
                      {t('yearly')}
                    </Text>
                    <Text style={styles.creditAmountValue}>
                      {fmt(a.credit_recommendation.yearly_credit_amount)}
                    </Text>
                  </View>
                </View>

                {a.credit_recommendation.disposable_income != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {t('disposableIncome')}
                    </Text>
                    <Text style={styles.cardValue}>{fmt(a.credit_recommendation.disposable_income)}</Text>
                  </View>
                )}
                {a.credit_recommendation.debt_to_income_ratio != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {t('debttoincomeRatio')}
                    </Text>
                    <Text style={styles.cardValue}>
                      {(a.credit_recommendation.debt_to_income_ratio * 100).toFixed(1)}%
                    </Text>
                  </View>
                )}
                {a.credit_recommendation.risk_level && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {t('riskLevel')}
                    </Text>
                    <View style={[
                      styles.riskBadge,
                      a.credit_recommendation.risk_level === 'low' && styles.riskLow,
                      a.credit_recommendation.risk_level === 'medium' && styles.riskMedium,
                      a.credit_recommendation.risk_level === 'high' && styles.riskHigh,
                    ]}>
                      <Text style={[
                        styles.riskBadgeText,
                        a.credit_recommendation.risk_level === 'low' && { color: '#10B981' },
                        a.credit_recommendation.risk_level === 'medium' && { color: '#F59E0B' },
                        a.credit_recommendation.risk_level === 'high' && { color: '#EF4444' },
                      ]}>
                        {a.credit_recommendation.risk_level === 'low'
                          ? (t('low'))
                          : a.credit_recommendation.risk_level === 'medium'
                          ? (t('medium'))
                          : (t('high'))}
                      </Text>
                    </View>
                  </View>
                )}
                {a.credit_recommendation.reasoning && (
                  <Text style={styles.creditReasoning}>{a.credit_recommendation.reasoning}</Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#152035',
  },
  backButton: { padding: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 16 },
  contentContainer: { paddingBottom: 40 },
  uploadArea: {
    backgroundColor: '#152035', borderRadius: 16, padding: 40,
    alignItems: 'center', borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#2563EB30', gap: 8,
  },
  uploadTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 8 },
  uploadSubtext: { fontSize: 14, color: '#94A3B8' },
  supportedBanks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, justifyContent: 'center' },
  bankBadge: { backgroundColor: '#1E3050', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  bankBadgeText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  loadingContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  loadingSubtext: { fontSize: 14, color: '#94A3B8' },
  sebLoadingText: { fontSize: 13, color: '#38BDF8', fontWeight: '600' },
  sebLoadingEta: { fontSize: 12, color: '#94A3B8' },
  errorContainer: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center' },
  retryButton: { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultHeaderTitle: { fontSize: 16, fontWeight: '600', color: '#10B981' },
  card: {
    backgroundColor: '#152035', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#1E3050',
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  cardLabel: { fontSize: 14, color: '#94A3B8' },
  cardValue: { fontSize: 14, fontWeight: '600', color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  incomeCard: { backgroundColor: '#10B98115', borderWidth: 1, borderColor: '#10B98130' },
  expenseCard: { backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430' },
  summaryLabel: { fontSize: 12, color: '#94A3B8' },
  summaryAmount: { fontSize: 20, fontWeight: 'bold' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E3050' },
  categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { fontSize: 14, color: '#fff' },
  categoryRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryAmount: { fontSize: 14, fontWeight: '600' },
  categoryCount: { fontSize: 11, color: '#64748B', minWidth: 24, textAlign: 'right' },
  riskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  riskLabel: { fontSize: 14, color: '#CBD5E1' },
  riskNotes: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
  creditCard: {
    backgroundColor: '#152035', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#8B5CF630',
  },
  creditHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  creditTitle: { fontSize: 14, fontWeight: '600', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.5 },
  creditAmountRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  creditAmountCard: {
    flex: 1, backgroundColor: '#8B5CF612', borderRadius: 10, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: '#8B5CF625',
  },
  creditAmountLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  creditAmountValue: { fontSize: 22, fontWeight: 'bold', color: '#8B5CF6' },
  creditReasoning: { fontSize: 13, color: '#94A3B8', lineHeight: 18, marginTop: 10, fontStyle: 'italic' },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  riskLow: { backgroundColor: '#10B98120' },
  riskMedium: { backgroundColor: '#F59E0B20' },
  riskHigh: { backgroundColor: '#EF444420' },
  riskBadgeText: { fontSize: 12, fontWeight: '600' },
});
