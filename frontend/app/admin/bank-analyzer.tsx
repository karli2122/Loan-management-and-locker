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
  const { language } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        setError(language === 'et' ? 'Ainult .pdf ja .asice failid' : 'Only .pdf and .asice files supported');
        return;
      }
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
        setError(language === 'et' ? 'Pole sisse logitud' : 'Not logged in');
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
    setUploading(true);
    setError('');
    setResult(null);
    setSelectedFileName(file.name || '');
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setError(language === 'et' ? 'Pole sisse logitud' : 'Not logged in');
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
    n != null ? `${n >= 0 ? '' : '-'}€${Math.abs(n).toFixed(2)}` : '-';

  const isSebFile = selectedFileName.toLowerCase().includes('seb');

  const a = result?.analysis;
  const s = a?.summary;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {language === 'et' ? 'Pangaväljavõtte analüüs' : 'Bank Statement Analyzer'}
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
            <Ionicons name="cloud-upload" size={48} color="#4F46E5" />
            <Text style={styles.uploadTitle}>
              {language === 'et' ? 'Lae üles pangaväljavõte' : 'Upload Bank Statement'}
            </Text>
            <Text style={styles.uploadSubtext}>
              {language === 'et' ? '.pdf või .asice failid' : '.pdf or .asice files'}
            </Text>
            <View style={styles.supportedBanks}>
              {['Swedbank', 'SEB', 'LHV', 'Coop', 'Revolut', 'Wise', 'N26'].map((b) => (
                <View key={b} style={styles.bankBadge}>
                  <Text style={styles.bankBadgeText}>{b}</Text>
                </View>
              ))}
            </View>
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
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingTitle}>
              {language === 'et' ? 'Analüüsin...' : 'Analyzing...'}
            </Text>
            <Text style={styles.loadingSubtext}>
              {language === 'et'
                ? 'AI analüüsib teie pangaväljavõtet'
                : 'AI is analyzing your bank statement'}
            </Text>
            {isSebFile && (
              <Text style={styles.sebLoadingText} data-testid="seb-ocr-loading">
                {language === 'et' ? 'SEB OCR töötleb faili...' : 'Processing SEB OCR...'}
              </Text>
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
                {language === 'et' ? 'Proovi uuesti' : 'Try Again'}
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
                  {language === 'et' ? 'Analüüs valmis' : 'Analysis Complete'}
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
                <Ionicons name="add-circle" size={28} color="#4F46E5" />
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{language === 'et' ? 'Pank' : 'Bank'}</Text>
                <Text style={styles.cardValue}>{a.bank_name || '-'}</Text>
              </View>
              {a.account_holder && (
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{language === 'et' ? 'Omanik' : 'Holder'}</Text>
                  <Text style={styles.cardValue}>{a.account_holder}</Text>
                </View>
              )}
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{language === 'et' ? 'Periood' : 'Period'}</Text>
                <Text style={styles.cardValue}>{a.period || '-'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>{language === 'et' ? 'Fail' : 'File'}</Text>
                <Text style={styles.cardValue}>{result.filename}</Text>
              </View>
            </View>

            {s && (
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, styles.incomeCard]}>
                  <Ionicons name="trending-up" size={20} color="#10B981" />
                  <Text style={styles.summaryLabel}>{language === 'et' ? 'Tulud' : 'Income'}</Text>
                  <Text style={[styles.summaryAmount, { color: '#10B981' }]}>{fmt(s.total_income)}</Text>
                </View>
                <View style={[styles.summaryCard, styles.expenseCard]}>
                  <Ionicons name="trending-down" size={20} color="#EF4444" />
                  <Text style={styles.summaryLabel}>{language === 'et' ? 'Kulud' : 'Expenses'}</Text>
                  <Text style={[styles.summaryAmount, { color: '#EF4444' }]}>{fmt(s.total_expenses)}</Text>
                </View>
              </View>
            )}

            {s && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{language === 'et' ? 'Saldo' : 'Balance'}</Text>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{language === 'et' ? 'Netomuutus' : 'Net Change'}</Text>
                  <Text style={[styles.cardValue, { color: (s.net_balance ?? 0) >= 0 ? '#10B981' : '#EF4444' }]}>
                    {fmt(s.net_balance)}
                  </Text>
                </View>
                {s.opening_balance != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{language === 'et' ? 'Algsaldo' : 'Opening'}</Text>
                    <Text style={styles.cardValue}>{fmt(s.opening_balance)}</Text>
                  </View>
                )}
                {s.closing_balance != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{language === 'et' ? 'Lõppsaldo' : 'Closing'}</Text>
                    <Text style={styles.cardValue}>{fmt(s.closing_balance)}</Text>
                  </View>
                )}
              </View>
            )}

            {a.income_categories && a.income_categories.filter(c => c.total > 0).length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{language === 'et' ? 'Tulu kategooriad' : 'Income Categories'}</Text>
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
                <Text style={styles.cardTitle}>{language === 'et' ? 'Kulu kategooriad' : 'Expense Categories'}</Text>
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
                <Text style={styles.cardTitle}>{language === 'et' ? 'Riskianalüüs' : 'Risk Analysis'}</Text>
                <View style={styles.riskRow}>
                  <Ionicons
                    name={a.risk_indicators.has_regular_income ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={a.risk_indicators.has_regular_income ? '#10B981' : '#EF4444'}
                  />
                  <Text style={styles.riskLabel}>
                    {language === 'et' ? 'Regulaarne sissetulek' : 'Regular income'}
                  </Text>
                </View>
                <View style={styles.riskRow}>
                  <Ionicons
                    name={a.risk_indicators.income_stability === 'stable' ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={a.risk_indicators.income_stability === 'stable' ? '#10B981' : '#F59E0B'}
                  />
                  <Text style={styles.riskLabel}>
                    {language === 'et' ? 'Sissetuleku stabiilsus' : 'Income stability'}: {a.risk_indicators.income_stability || '-'}
                  </Text>
                </View>
                {a.risk_indicators.gambling_detected && (
                  <View style={styles.riskRow}>
                    <Ionicons name="warning" size={18} color="#EF4444" />
                    <Text style={[styles.riskLabel, { color: '#EF4444' }]}>
                      {language === 'et' ? 'Hasartmängu tehingud tuvastatud' : 'Gambling transactions detected'}
                    </Text>
                  </View>
                )}
                {a.risk_indicators.loan_payments_detected && (
                  <View style={styles.riskRow}>
                    <Ionicons name="information-circle" size={18} color="#F59E0B" />
                    <Text style={styles.riskLabel}>
                      {language === 'et' ? 'Laenumaksed tuvastatud' : 'Loan payments detected'}
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
                    {language === 'et' ? 'Krediidisoovitus' : 'Credit Recommendation'}
                  </Text>
                </View>

                <View style={styles.creditAmountRow}>
                  <View style={styles.creditAmountCard}>
                    <Text style={styles.creditAmountLabel}>
                      {language === 'et' ? 'Kuus' : 'Monthly'}
                    </Text>
                    <Text style={styles.creditAmountValue}>
                      {fmt(a.credit_recommendation.monthly_credit_amount)}
                    </Text>
                  </View>
                  <View style={styles.creditAmountCard}>
                    <Text style={styles.creditAmountLabel}>
                      {language === 'et' ? 'Aastas' : 'Yearly'}
                    </Text>
                    <Text style={styles.creditAmountValue}>
                      {fmt(a.credit_recommendation.yearly_credit_amount)}
                    </Text>
                  </View>
                </View>

                {a.credit_recommendation.disposable_income != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {language === 'et' ? 'Vaba sissetulek' : 'Disposable Income'}
                    </Text>
                    <Text style={styles.cardValue}>{fmt(a.credit_recommendation.disposable_income)}</Text>
                  </View>
                )}
                {a.credit_recommendation.debt_to_income_ratio != null && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {language === 'et' ? 'Võla/tulu suhe' : 'Debt-to-Income Ratio'}
                    </Text>
                    <Text style={styles.cardValue}>
                      {(a.credit_recommendation.debt_to_income_ratio * 100).toFixed(1)}%
                    </Text>
                  </View>
                )}
                {a.credit_recommendation.risk_level && (
                  <View style={styles.cardRow}>
                    <Text style={styles.cardLabel}>
                      {language === 'et' ? 'Riskitase' : 'Risk Level'}
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
                          ? (language === 'et' ? 'Madal' : 'Low')
                          : a.credit_recommendation.risk_level === 'medium'
                          ? (language === 'et' ? 'Keskmine' : 'Medium')
                          : (language === 'et' ? 'Kõrge' : 'High')}
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
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E293B',
  },
  backButton: { padding: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 16 },
  contentContainer: { paddingBottom: 40 },
  uploadArea: {
    backgroundColor: '#1E293B', borderRadius: 16, padding: 40,
    alignItems: 'center', borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#4F46E530', gap: 8,
  },
  uploadTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 8 },
  uploadSubtext: { fontSize: 14, color: '#94A3B8' },
  supportedBanks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, justifyContent: 'center' },
  bankBadge: { backgroundColor: '#334155', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  bankBadgeText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  loadingContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
  loadingSubtext: { fontSize: 14, color: '#94A3B8' },
  sebLoadingText: { fontSize: 13, color: '#38BDF8', fontWeight: '600' },
  errorContainer: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center' },
  retryButton: { backgroundColor: '#4F46E5', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  resultHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultHeaderTitle: { fontSize: 16, fontWeight: '600', color: '#10B981' },
  card: {
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#334155',
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
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' },
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
    backgroundColor: '#1E293B', borderRadius: 12, padding: 16,
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
