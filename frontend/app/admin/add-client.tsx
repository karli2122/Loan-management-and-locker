import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { authedFetch, getAuthInfo, responseError } from '../../src/utils/adminAuth';
import { parseAmount, round2 } from '../../src/utils/money';
import { useClients, invalidateClients } from '../../src/utils/clientsStore';
import { shareHandover } from '../../src/utils/handover';
import { ta } from '../../src/utils/adminI18n';
import { checkIsikukood } from '../../src/utils/statementIdentity';
import { shareLoanContract } from '../../src/utils/contract';
import { DatePicker } from '../../src/components/DatePicker';


export default function AddClient() {
  const router = useRouter();
  const params = useLocalSearchParams<{ firstName?: string; lastName?: string; address?: string; personalId?: string; fromStatement?: string }>();
  const fromStatement = params.fromStatement === '1';
  const { t, language } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [loading, setLoading] = useState(false);
  const { clients } = useClients();
  const submitting = useRef(false);
  // Remembers a client that was already created, so a retry after a failed loan setup
  // (or a dropped connection) never creates the same client twice.
  const createdRef = useRef<{ id: string; name: string; code?: string } | null>(null);
  const [result, setResult] = useState<null | { id: string; name: string; code?: string; totalDue?: number; hasLoan?: boolean }>(null);
  const [contractBusy, setContractBusy] = useState(false);

  const [form, setForm] = useState({
    first_name: typeof params.firstName === 'string' ? params.firstName : '',
    last_name: typeof params.lastName === 'string' ? params.lastName : '',
    phone: '',
    email: '',
    address: typeof params.address === 'string' ? params.address : '',
    birth_number: typeof params.personalId === 'string' ? params.personalId : '',
    loan_amount: '',
    down_payment: '',
    loan_given_date: new Date().toISOString().split('T')[0],
    emi_due_date: '',
    interest_rate: '',
  });
  const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
  const idCheck = checkIsikukood(form.birth_number);

  // Live preview calculation (simple month-based interest, not day-count)
  const loanPreview = React.useMemo(() => {
    const amount = parseAmount(form.loan_amount);
    const rate = parseAmount(form.interest_rate);
    const down = parseAmount(form.down_payment) || 0;
    if (!form.emi_due_date || !form.loan_given_date || amount === null || amount <= 0 || rate === null || rate < 0) return null;
    const principal = Math.max(0, amount - down);
    if (principal <= 0) return null;

    const start = new Date(form.loan_given_date);
    const due = new Date(form.emi_due_date);
    const diffMs = due.getTime() - start.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const months = Math.max(1, Math.round(days / 30)); // Round to nearest month

    // Simple month-based: Interest = Principal × (Rate/100) × Months (principal = amount − down payment)
    const totalInterest = principal * (rate / 100) * months;
    return {
      principal: round2(principal),
      totalInterest: round2(totalInterest),
      totalAmount: round2(principal + totalInterest),
      months,
      days,
    };
  }, [form.loan_amount, form.interest_rate, form.down_payment, form.loan_given_date, form.emi_due_date]);

  const phoneKey = (p: string) => (p || '').replace(/[^\d]/g, '').replace(/^0+/, '');

  const handleSubmit = async (skipDuplicateCheck = false) => {
    if (submitting.current) return;
    if (!form.first_name.trim() || !form.phone.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }
    const email = form.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert(t('error'), language === 'et' ? 'E-posti aadress ei ole korrektne' : 'Email address is not valid');
      return;
    }

    // Validate loan fields if any loan info is provided
    const hasLoanInfo = !!(form.loan_amount || form.interest_rate || form.emi_due_date);
    const amount = parseAmount(form.loan_amount);
    const rate = parseAmount(form.interest_rate);
    const down = parseAmount(form.down_payment) || 0;
    if (hasLoanInfo) {
      if (!form.loan_amount || !form.interest_rate || !form.emi_due_date) {
        Alert.alert(t('error'), language === 'et' 
          ? 'Kui lisate laenuandmeid, täitke kõik laenuväljad (summa, intress, tähtaeg)'
          : 'If adding loan details, please fill all loan fields (amount, interest, due date)');
        return;
      }
      if (amount === null || amount <= 0 || rate === null || rate < 0) {
        Alert.alert(t('error'), ta(language, 'invalidAmount'));
        return;
      }
      if (down < 0 || down >= amount) {
        Alert.alert(t('error'), language === 'et' ? 'Sissemakse peab olema väiksem kui laenusumma' : 'Down payment must be smaller than the loan amount');
        return;
      }
    }

    if (!createdRef.current && !skipDuplicateCheck && form.birth_number.trim() && !idCheck.valid) {
      Alert.alert(
        ta(language, `idBad_${idCheck.reason === 'empty' ? 'format' : idCheck.reason}`),
        ta(language, 'idSaveAnyway'),
        [
          { text: ta(language, 'fixIt'), style: 'cancel' },
          { text: ta(language, 'saveAnyway'), style: 'destructive', onPress: () => handleSubmit(true) },
        ],
      );
      return;
    }

    if (!createdRef.current && !skipDuplicateCheck) {
      const key = phoneKey(form.phone);
      const dup = key && clients.find((c: any) => phoneKey(c.phone) === key);
      if (dup) {
        Alert.alert(
          ta(language, 'duplicatePhoneTitle'),
          ta(language, 'duplicatePhoneBody', { name: dup.name || dup.phone }),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: ta(language, 'openClient'), onPress: () => router.replace(`/admin/client-details?id=${dup.id}`) },
            { text: ta(language, 'createAnyway'), style: 'destructive', onPress: () => handleSubmit(true) },
          ],
        );
        return;
      }
    }

    submitting.current = true;
    setLoading(true);
    try {
      const auth = await getAuthInfo();
      if (!auth) return; // session-expired flow takes over

      // Step 1: Create client (skipped when a previous attempt already created it)
      if (!createdRef.current) {
        // the deployed server's ClientCreate requires an email field, so send '' when none was given
        const clientData: Record<string, string> = { name: fullName, phone: form.phone.trim(), email };
        if (form.address.trim()) clientData.address = form.address.trim();
        if (form.birth_number.trim()) clientData.birth_number = form.birth_number.trim();

        const clientResponse = await authedFetch(`${API_URL}/api/clients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(clientData),
        });
        if (clientResponse.status === 401) return;
        if (!clientResponse.ok) throw new Error(await responseError(clientResponse, 'Failed to create client'));
        let client: any;
        try {
          client = await clientResponse.json();
        } catch {
          throw new Error('Server error. Please try again.');
        }
        createdRef.current = { id: client.id, name: client.name || fullName, code: client.registration_code || undefined };
        invalidateClients();
      }
      const created = createdRef.current;

      // Step 2: Setup loan if loan data provided
      if (hasLoanInfo && amount !== null && rate !== null) {
        const loanData = {
          loan_amount: amount,
          interest_rate: rate,
          given_date: form.loan_given_date,
          due_date: form.emi_due_date,
          down_payment: down,
        };
        const loanResponse = await authedFetch(`${API_URL}/api/loans/${created.id}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loanData),
        });
        if (!loanResponse.ok) {
          const loanError = await responseError(loanResponse, 'Loan setup failed');
          Alert.alert(
            t('partialSuccess') || 'Partial Success',
            language === 'et'
              ? `Klient on loodud, kuid laenu seadistamine ebaõnnestus: ${loanError}\n\nVajutage "Loo klient" uuesti, et proovida ainult laenu – klienti ei looda teist korda.`
              : `The client was created, but the loan setup failed: ${loanError}\n\nTap "Create client" again to retry just the loan – the client will not be created twice.`,
          );
          return;
        }
        const loanResult = await loanResponse.json().catch(() => ({}));
        const details = loanResult.loan_details || {};
        invalidateClients();
        setResult({ id: created.id, name: created.name, code: created.code, totalDue: details.total_amount, hasLoan: true });
      } else {
        setResult({ id: created.id, name: created.name, code: created.code, hasLoan: false });
      }
      createdRef.current = null;
    } catch (error: any) {
      let errorMessage = 'Something went wrong';
      if (typeof error === 'string') errorMessage = error;
      else if (error instanceof Error) errorMessage = error.message;
      Alert.alert(t('error'), errorMessage);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const runContract = async () => {
    if (!result || contractBusy) return;
    setContractBusy(true);
    const r = await shareLoanContract(result.id, language, ta(language, 'contractPromptTitle'));
    setContractBusy(false);
    if (r.ok) return;
    if (r.needsLoan) { askAddLoan(); return; }
    if (r.error === 'session_expired') return;
    Alert.alert(ta(language, 'contractFailed'), r.error || '');
  };
  const askAddLoan = () => {
    if (!result) return;
    Alert.alert(ta(language, 'contractPromptTitle'), ta(language, 'contractNeedsLoan'), [
      { text: ta(language, 'contractNo'), style: 'cancel' },
      { text: ta(language, 'addLoanNow'), onPress: () => router.replace(`/admin/add-loan?clientId=${result.id}&contract=1`) },
    ]);
  };
  // Right after the client exists, ask about the contract (once).
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!result || asked.current === result.id) return;
    asked.current = result.id;
    const t = setTimeout(() => {
      if (result.hasLoan) {
        Alert.alert(ta(language, 'contractPromptTitle'), ta(language, 'contractPromptBody', { name: result.name }), [
          { text: ta(language, 'contractNo'), style: 'cancel' },
          { text: ta(language, 'contractYes'), onPress: runContract },
        ]);
      } else askAddLoan();
    }, 400);
    return () => clearTimeout(t);
  }, [result]);

  if (result) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 8 }}>{ta(language, 'clientCreated')}</Text>
            <Text style={{ color: '#CBD5E1', fontSize: 16, marginTop: 4 }}>{result.name}</Text>
            {result.totalDue ? (
              <Text style={{ color: '#94A3B8', marginTop: 4 }}>
                {language === 'et' ? 'Kokku tasuda' : 'Total due'}: {formatAmount(result.totalDue)}
              </Text>
            ) : null}
          </View>
          {result.code ? (
            <>
              <View style={{ backgroundColor: '#152035', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: '#94A3B8', fontSize: 12 }}>{ta(language, 'codeReady')}</Text>
                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 3, marginTop: 4 }}>{result.code}</Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, { marginTop: 0 }]}
                onPress={() => shareHandover({ name: result.name, code: result.code!, language })}
              >
                <Ionicons name="share-social" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>{ta(language, 'shareCode')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ color: '#F59E0B', textAlign: 'center', marginBottom: 12 }}>{ta(language, 'generateCodeFirst')}</Text>
          )}
          <TouchableOpacity
            style={[styles.submitButton, { marginTop: 12, backgroundColor: '#7C3AED' }]}
            onPress={result.hasLoan ? runContract : askAddLoan}
            disabled={contractBusy}
          >
            {contractBusy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="document-text" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>{ta(language, 'contractPromptTitle')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitButton, { marginTop: 12, backgroundColor: '#334155' }]}
            onPress={() => router.replace(`/admin/client-details?id=${result.id}`)}
          >
            <Text style={styles.submitButtonText}>{ta(language, 'openClient')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ alignItems: 'center', marginTop: 16 }} onPress={() => router.back()}>
            <Text style={{ color: '#94A3B8' }}>{ta(language, 'done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{t('addNewClient')}</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            {fromStatement && (
              <View style={{ backgroundColor: '#1E3A5F', borderRadius: 10, padding: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="document-text" size={18} color="#93C5FD" />
                <Text style={{ color: '#BFDBFE', marginLeft: 8, flex: 1, fontSize: 13 }}>{ta(language, 'prefilledBanner')}</Text>
              </View>
            )}
            <Text style={styles.label}>{ta(language, 'firstName')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={ta(language, 'firstName')}
                placeholderTextColor="#64748B"
                value={form.first_name}
                onChangeText={(text) => setForm({ ...form, first_name: text })}
              />
            </View>

            <Text style={styles.label}>{ta(language, 'lastName')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={ta(language, 'lastName')}
                placeholderTextColor="#64748B"
                value={form.last_name}
                onChangeText={(text) => setForm({ ...form, last_name: text })}
              />
            </View>

            <Text style={styles.label}>{t('phoneNumber')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterPhone')}
                placeholderTextColor="#64748B"
                value={form.phone}
                onChangeText={(text) => setForm({ ...form, phone: text })}
                keyboardType="phone-pad"
              />
            </View>

            <Text style={styles.label}>{t('emailAddress')} ({ta(language, 'emailOptional')})</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterEmail')}
                placeholderTextColor="#64748B"
                value={form.email}
                onChangeText={(text) => setForm({ ...form, email: text })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>{t('address')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="location" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterAddress')}
                placeholderTextColor="#64748B"
                value={form.address}
                onChangeText={(text) => setForm({ ...form, address: text })}
              />
            </View>

            <Text style={styles.label}>{ta(language, 'personalId')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="card" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterBirthNumber')}
                placeholderTextColor="#64748B"
                value={form.birth_number}
                onChangeText={(text) => setForm({ ...form, birth_number: text })}
              />
            </View>
            {form.birth_number.trim() !== '' && (
              <Text style={{ marginTop: 6, fontSize: 12, color: idCheck.valid ? '#10B981' : '#F59E0B' }}>
                {idCheck.valid
                  ? `${ta(language, 'idOk')} · ${idCheck.birthDate}`
                  : ta(language, `idBad_${idCheck.reason === 'empty' ? 'format' : idCheck.reason}`)}
              </Text>
            )}

            <View style={styles.sectionDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.sectionTitle}>{t('emiDetails')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.label}>{t('emiAmount')}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>{currencySymbol}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('enterEmiAmount')}
                placeholderTextColor="#64748B"
                value={form.loan_amount}
                onChangeText={(text) => setForm({ ...form, loan_amount: text })}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>{ta(language, 'downPayment')}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>{currencySymbol}</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#64748B"
                value={form.down_payment}
                onChangeText={(text) => setForm({ ...form, down_payment: text })}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>{t('interestRateMonthly')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="trending-up" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterMonthlyInterestRate')}
                placeholderTextColor="#64748B"
                value={form.interest_rate}
                onChangeText={(text) => setForm({ ...form, interest_rate: text })}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>{t('loanGivenDate')}</Text>
            <DatePicker
              value={form.loan_given_date}
              onChange={(date) => setForm({ ...form, loan_given_date: date })}
              placeholder={t('selectDate')}
              testID="loan-given-date-input"
            />

            <Text style={styles.label}>{t('emiDueDate')}</Text>
            <DatePicker
              value={form.emi_due_date}
              onChange={(date) => setForm({ ...form, emi_due_date: date })}
              placeholder={t('selectDate')}
              minDate={new Date(Date.now() + 86400000)}
              testID="emi-due-date-input"
            />

            {/* Live Loan Preview Card */}
            {loanPreview && (
              <View style={styles.previewCard} data-testid="loan-preview-card">
                <View style={styles.previewHeader}>
                  <Ionicons name="calculator" size={20} color="#10B981" />
                  <Text style={styles.previewTitle}>
                    {language === 'et' ? 'Laenu eelvaade (kuupõhine intress)' : 'Loan Preview (Month-based Interest)'}
                  </Text>
                </View>
                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Põhisumma' : 'Principal'}</Text>
                    <Text style={styles.previewValue}>{formatAmount(loanPreview.principal)}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Kestus' : 'Duration'}</Text>
                    <Text style={styles.previewValue}>{loanPreview.months} {language === 'et' ? 'kuud' : 'month(s)'}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Intress kokku' : 'Total Interest'}</Text>
                    <Text style={[styles.previewValue, { color: '#F59E0B' }]}>{formatAmount(loanPreview.totalInterest)}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Kokku tasuda' : 'Total Due'}</Text>
                    <Text style={[styles.previewValue, styles.previewTotal]}>{formatAmount(loanPreview.totalAmount)}</Text>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={() => handleSubmit()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>{t('createClient')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  form: {
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  currencySymbol: {
    fontSize: 18,
    color: '#64748B',
    marginRight: 8,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E3050',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    height: 56,
    marginTop: 32,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  // Date Picker styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContent: {
    width: '90%',
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  datePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  datePickerLabel: {
    fontSize: 16,
    color: '#94A3B8',
    width: 60,
  },
  datePickerSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B1527',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginLeft: 16,
  },
  datePickerArrow: {
    padding: 4,
  },
  datePickerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    minWidth: 100,
    textAlign: 'center',
  },
  datePreview: {
    backgroundColor: '#2563EB20',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginVertical: 16,
  },
  datePreviewText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  datePickerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  datePickerCancelButton: {
    backgroundColor: '#1E3050',
  },
  datePickerConfirmButton: {
    backgroundColor: '#2563EB',
  },
  datePickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Loan Preview Card styles
  previewCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewItem: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: '#0B1527',
    borderRadius: 12,
    padding: 14,
  },
  previewLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  previewTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
});
  
