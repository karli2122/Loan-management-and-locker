import { authedFetch } from '../../src/utils/adminAuth';
import React, { useState, useRef, useEffect } from 'react';
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
import * as FileSystem from 'expo-file-system/legacy';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { useTheme } from '../../src/context/ThemeContext';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';
import { base64ToBytes, statementBytesToText } from '../../src/utils/statementText';
import { extractIdentity } from '../../src/utils/statementIdentity';
import { ta } from '../../src/utils/adminI18n';
import { scoreStatement, Scoring } from '../../src/utils/statementScoring';
import { StatementScoreCards } from '../../src/components/StatementScoreCards';

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
    scoring?: Scoring;
    statement_truncated?: boolean;
    response_cut_off?: boolean;
    error?: string;
    raw_response?: string;
  };
}

export default function BankAnalyzerPage() {
  return (
    <EnterpriseGate featureName="Bank Statement Analyzer" requiredPlan="enterprise" featureKey="bank_ocr">
      <BankAnalyzerContent />
    </EnterpriseGate>
  );
}

function BankAnalyzerContent() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [sebLikely, setSebLikely] = useState(false);
  const [forceOcr, setForceOcr] = useState(false);
  const [pickedFile, setPickedFile] = useState<{ uri?: string; file?: File; name: string } | null>(null);
  const [readingIdentity, setReadingIdentity] = useState(false);
  const [scoring, setScoring] = useState<Scoring | null>(null);
  const [scoringBusy, setScoringBusy] = useState(false);
  const [scanNote, setScanNote] = useState(false);
  const textCache = useRef<{ key: string; text: string } | null>(null);
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
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8, position: 0, length: 20000 });
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
      if (ext !== 'pdf' && ext !== 'asice' && ext !== 'csv' && ext !== 'xml') {
        setError(t('onlyPdfAndAsiceFilesSupported'));
        setSebLikely(false);
        return;
      }
      const nameLower = (asset.name || '').toLowerCase();
      const sebDetected = nameLower.includes('seb') || await detectSebFromNativeFile(asset.uri);
      setSebLikely(sebDetected);
      setPickedFile({ uri: asset.uri, name: asset.name || '' });
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
      const adminToken = await getSecureItem('admin_token');
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
      const response = await authedFetch(
        `${API_URL}/api/bank-statements/analyze?admin_token=${adminToken}${forceOcr ? '&force_ocr=true' : ''}`,
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
    setPickedFile({ file, name: file.name || '' });
    const nameLower = (file.name || '').toLowerCase();
    const sebDetected = nameLower.includes('seb') || await detectSebFromWebFile(file);
    setSebLikely(sebDetected);
    setUploading(true);
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) {
        setError(t('notLoggedIn'));
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      const response = await authedFetch(
        `${API_URL}/api/bank-statements/analyze?admin_token=${adminToken}${forceOcr ? '&force_ocr=true' : ''}`,
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

  // Re-reads the statement file on the phone (same file the analysis was made from). Cached per file.
  const readStatementText = async (): Promise<string> => {
    const key = `${pickedFile?.name || ''}|${result?.id || ''}`;
    if (textCache.current && textCache.current.key === key) return textCache.current.text;
    let text = '';
    try {
      let bytes: Uint8Array | null = null;
      if (pickedFile?.file) bytes = new Uint8Array(await pickedFile.file.arrayBuffer());
      else if (pickedFile?.uri) {
        const info: any = await FileSystem.getInfoAsync(pickedFile.uri);
        if (!info?.size || info.size <= 25 * 1024 * 1024) {
          const b64 = await FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
          bytes = base64ToBytes(b64);
        }
      }
      if (bytes) text = statementBytesToText(bytes, pickedFile?.name || result?.filename || '');
    } catch {
      text = '';
    }
    textCache.current = { key, text };
    return text;
  };

  // Affordability + intent flags. A newer server sends `analysis.scoring`; the old server does not,
  // so the phone computes the same thing from the analysis response plus the re-read statement text.
  useEffect(() => {
    let cancelled = false;
    if (!result || !result.analysis || result.analysis.error) {
      setScoring(null);
      return;
    }
    const serverScoring = result.analysis.scoring;
    if (serverScoring && serverScoring.version === 1 && serverScoring.affordability && Array.isArray(serverScoring.flags)) {
      setScoring({ ...serverScoring, source: 'server' });
      setScanNote(false);
      return;
    }
    setScoringBusy(true);
    (async () => {
      await new Promise((r) => setTimeout(r, 50)); // let the spinner paint before the synchronous parsing
      const text = await readStatementText();
      if (cancelled) return;
      try {
        setScoring(scoreStatement(result.analysis, text));
      } catch {
        setScoring(null);
      }
      setScanNote(text.replace(/\s+/g, '').length < 200);
      setScoringBusy(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // Opens the new-client form with name / address / personal ID from the statement. The analysis
  // response (old backend: only account_holder) fills the gaps. Missing pieces stay empty.
  const startAddClient = async () => {
    if (readingIdentity) return;
    setReadingIdentity(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const text = await readStatementText();
      const id = extractIdentity(text, result?.analysis);
      router.push({
        pathname: '/admin/add-client',
        params: {
          fromStatement: '1',
          firstName: id.firstName,
          lastName: id.lastName,
          address: id.address,
          personalId: id.personalId,
        },
      });
    } finally {
      setReadingIdentity(false);
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
        {/* OCR Toggle */}
        {!result && !uploading && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12, backgroundColor: forceOcr ? '#1E3A5F' : '#1A2332', borderRadius: 10, borderWidth: 1, borderColor: forceOcr ? '#2563EB' : '#2D3748' }}
            onPress={() => setForceOcr(!forceOcr)}
            data-testid="ocr-toggle"
          >
            <Ionicons name={forceOcr ? 'checkbox' : 'square-outline'} size={22} color={forceOcr ? '#2563EB' : '#64748B'} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#F8FAFC', fontSize: 14, fontWeight: '600' }}>AI Vision OCR</Text>
              <Text style={{ color: '#64748B', fontSize: 12 }}>Use AI to read scanned/image-based PDFs</Text>
            </View>
          </TouchableOpacity>
        )}

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
              {language === 'et' ? 'Laadi üles pangaväljavõte: PDF, CSV, XML või ASICE failid' : 'Upload bank statement: PDF, CSV, XML or ASICE files'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Hidden file input (web only) */}
        {Platform.OS === 'web' && (
          <input
            ref={fileInputRef as any}
            type="file"
            accept=".pdf,.asice,.csv,.xml"
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
                  setPickedFile(null);
                  setScoring(null);
                  textCache.current = null;
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

            <TouchableOpacity
              onPress={startAddClient}
              disabled={readingIdentity}
              style={{ backgroundColor: '#2563EB', borderRadius: 14, padding: 14, marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: readingIdentity ? 0.7 : 1 }}
              data-testid="add-client-from-statement"
            >
              {readingIdentity ? <ActivityIndicator color="#fff" /> : <Ionicons name="person-add" size={20} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 8 }}>
                {readingIdentity ? ta(language, 'readingStatement') : ta(language, 'addClientFromStatement')}
              </Text>
            </TouchableOpacity>
            <Text style={{ color: '#94A3B8', fontSize: 12, marginBottom: 14, textAlign: 'center' }}>{ta(language, 'addClientFromStatementHint')}</Text>

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

            {scoringBusy && (
              <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                <ActivityIndicator color="#38BDF8" />
                <Text style={styles.cardLabel}>{ta(language, 'scChecking')}</Text>
              </View>
            )}
            {scoring && (
              <StatementScoreCards
                key={result?.id}
                scoring={scoring}
                language={language}
                fmt={fmt}
                scanNote={scanNote}
                cutOffNote={!!(a?.statement_truncated || a?.response_cut_off)}
              />
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
