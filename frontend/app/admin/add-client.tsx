import React, { useState, useMemo } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getAuthInfo, handleAuthFailure } from '../../src/utils/adminAuth';
import { DatePicker } from '../../src/components/DatePicker';


export default function AddClient() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    birth_number: '',
    loan_amount: '',
    loan_given_date: new Date().toISOString().split('T')[0],
    emi_due_date: '',
    interest_rate: '',
  });

  // Live preview calculation (single payment, not EMI)
  const loanPreview = React.useMemo(() => {
    const amount = parseFloat(form.loan_amount);
    const rate = parseFloat(form.interest_rate);
    if (!form.emi_due_date || !form.loan_given_date || isNaN(amount) || amount <= 0 || isNaN(rate) || rate < 0) return null;

    const start = new Date(form.loan_given_date);
    const due = new Date(form.emi_due_date);
    const diffMs = due.getTime() - start.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Single payment: Interest = Principal × (Rate/100) × (Days/30)
    const totalInterest = amount * (rate / 100) * (days / 30);
    const totalAmount = amount + totalInterest;

    return {
      principal: amount,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      days,
    };
  }, [form.loan_amount, form.interest_rate, form.loan_given_date, form.emi_due_date]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    // Validate loan fields if any loan info is provided
    const hasLoanInfo = form.loan_amount || form.interest_rate || form.emi_due_date;
    if (hasLoanInfo) {
      if (!form.loan_amount || !form.interest_rate || !form.emi_due_date) {
        Alert.alert(t('error'), language === 'et' 
          ? 'Kui lisate laenuandmeid, täitke kõik laenuväljad (summa, intress, tähtaeg)'
          : 'If adding loan details, please fill all loan fields (amount, interest, due date)');
        return;
      }
    }

    setLoading(true);
    try {
      const auth = await getAuthInfo();
      if (!auth) { await handleAuthFailure(router, language); return; }

      // Step 1: Create client
      const clientData = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
        birth_number: form.birth_number,
      };
      
      console.log('Creating client:', clientData);
      const clientResponse = await fetch(`${API_URL}/api/clients?admin_token=${auth.token}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(clientData),
      });

      if (clientResponse.status === 401) {
        await handleAuthFailure(router, language);
        return;
      }

      const clientText = await clientResponse.text();
      let client;
      try {
        client = JSON.parse(clientText);
      } catch (e) {
        console.error('Parse error:', clientText.substring(0, 200));
        throw new Error('Server error. Please try again.');
      }

      if (!clientResponse.ok) {
        let errorMessage = 'Failed to create client';
        if (client.detail) {
          if (typeof client.detail === 'string') errorMessage = client.detail;
          else if (Array.isArray(client.detail)) errorMessage = client.detail.map((err: any) => err.msg || err.message).join(', ');
        }
        throw new Error(errorMessage);
      }

      console.log('Client created:', client.id);

      // Step 2: Setup loan if loan data provided
      if (hasLoanInfo && form.loan_amount && form.interest_rate && form.emi_due_date) {
        const loanData = {
          loan_amount: parseFloat(form.loan_amount),
          interest_rate: parseFloat(form.interest_rate),
          given_date: form.loan_given_date,
          due_date: form.emi_due_date,
          down_payment: 0,
        };

        console.log('Setting up loan:', loanData);
        const loanResponse = await fetch(`${API_URL}/api/loans/${client.id}/setup?admin_token=${auth.token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loanData),
        });

        if (!loanResponse.ok) {
          const loanError = await loanResponse.text();
          console.error('Loan setup error:', loanError);
          // Client created but loan failed - still show partial success
          Alert.alert(
            t('partialSuccess') || 'Partial Success',
            language === 'et' 
              ? `Klient loodud, kuid laenu seadistamine ebaõnnestus: ${loanError}`
              : `Client created, but loan setup failed: ${loanError}`,
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        }

        const loanResult = await loanResponse.json();
        console.log('Loan setup complete:', loanResult);
        
        const details = loanResult.loan_details || {};
        Alert.alert(
          t('success'),
          language === 'et'
            ? `Klient ja laen loodud!\nKokku tasuda: ${formatAmount(details.total_amount || 0)}\nTähtaeg: ${form.emi_due_date}`
            : `Client and loan created!\nTotal due: ${formatAmount(details.total_amount || 0)}\nDue: ${form.emi_due_date}`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          t('success'),
          t('clientCreatedGoToClientDetails'),
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Add client error:', error);
      let errorMessage = 'Something went wrong';
      if (typeof error === 'string') errorMessage = error;
      else if (error instanceof Error) errorMessage = error.message;
      else if (error && typeof error === 'object') errorMessage = error.message || error.detail || JSON.stringify(error);
      Alert.alert(t('error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
            <Text style={styles.label}>{t('fullName')} *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('enterClientName')}
                placeholderTextColor="#64748B"
                value={form.name}
                onChangeText={(text) => setForm({ ...form, name: text })}
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

            <Text style={styles.label}>{t('emailAddress')} *</Text>
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

            <Text style={styles.label}>{t('birthNumber')}</Text>
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
                keyboardType="numeric"
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
                keyboardType="numeric"
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
                    {language === 'et' ? 'Laenu eelvaade (ühekordne makse)' : 'Loan Preview (Single Payment)'}
                  </Text>
                </View>
                <View style={styles.previewGrid}>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Põhisumma' : 'Principal'}</Text>
                    <Text style={styles.previewValue}>{formatAmount(loanPreview.principal)}</Text>
                  </View>
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>{language === 'et' ? 'Kestus' : 'Duration'}</Text>
                    <Text style={styles.previewValue}>{loanPreview.days} {language === 'et' ? 'päeva' : 'days'}</Text>
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
              onPress={handleSubmit}
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
  
