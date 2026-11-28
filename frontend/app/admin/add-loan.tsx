import { authedFetch, responseError } from '../../src/utils/adminAuth';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getErrorMessage } from '../../src/utils/errorHandler';
import { DatePicker } from '../../src/components/DatePicker';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';
import { parseAmount, round2 } from '../../src/utils/money';
import { useClients, invalidateClients } from '../../src/utils/clientsStore';
import { ta } from '../../src/utils/adminI18n';
import { shareLoanContract } from '../../src/utils/contract';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface LoanPlan {
  id: string;
  name: string;
  interest_rate: number;
  min_tenure_months: number;
  max_tenure_months: number;
  description: string;
}

export default function AddLoan() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const clientId = params.clientId;
  const renew = params.renew;
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [loading, setLoading] = useState(false);
  const { clients: storeClients, loaded: clientsLoaded } = useClients();
  const clients = storeClients as Client[];
  const loadingClients = !clientsLoaded;
  const submitting = useRef(false);
  const createdClientId = useRef<string | null>(null);
  const [downPayment, setDownPayment] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  
  // Client selection
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  
  // New client form
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientBirthNumber, setNewClientBirthNumber] = useState('');
  
  // Loan details
  const [loanPlans, setLoanPlans] = useState<LoanPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<LoanPlan | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('2');
  const [givenDate, setGivenDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [isRenewal, setIsRenewal] = useState(false);

  useEffect(() => {
    fetchLoanPlans();
  }, []);

  // Pre-select client if clientId is passed in URL
  useEffect(() => {
    if (clientId && clients.length > 0) {
      const preSelectedClient = clients.find(c => c.id === clientId);
      if (preSelectedClient) {
        setSelectedClient(preSelectedClient);
        setClientMode('existing');
      }
    }
  }, [clientId, clients]);

  // Pre-fill from last archived loan when renew=true
  useEffect(() => {
    // Handle renew param which may be string 'true' or array ['true']
    const isRenewMode = renew === 'true' || (Array.isArray(renew) && renew[0] === 'true');
    if (isRenewMode && clientId) {
      setIsRenewal(true);
      fetchLastLoanForRenewal();
    }
  }, [renew, clientId]);

  const fetchLastLoanForRenewal = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) {
        return;
      }
      const response = await authedFetch(
        `${API_URL}/api/paid-loans/${clientId}/latest?admin_token=${adminToken}`
      );
      if (response.ok) {
        const data = await response.json();
        // Use explicit checks for undefined/null instead of truthy checks (0 is valid)
        if (data.loan_amount !== undefined && data.loan_amount !== null) {
          setLoanAmount(String(data.loan_amount));
        }
        if (data.interest_rate !== undefined && data.interest_rate !== null) {
          setInterestRate(String(data.interest_rate));
        }
        if (data.loan_tenure_months !== undefined && data.loan_tenure_months !== null && data.loan_tenure_months > 0) {
          // Calculate due date from today + same tenure
          const today = new Date();
          const due = new Date(today);
          due.setMonth(due.getMonth() + data.loan_tenure_months);
          setDueDate(due.toISOString().split('T')[0]);
        }
      } else {
      }
    } catch (error) {
    }
  };

  // Real-time interest calculator (simple month-based method)
  // Example: 200 loan, 50% monthly rate, 2 months = 200 * 0.5 * 2 = 200
  const emiPreview = React.useMemo(() => {
    const gross = parseAmount(loanAmount);
    const rate = parseAmount(interestRate); // Monthly interest rate %
    const down = parseAmount(downPayment) || 0;
    if (!dueDate || !givenDate || gross === null || gross <= 0 || rate === null || rate < 0) return null;
    const amount = gross - down; // principal after the down payment
    if (amount <= 0) return null;

    const start = new Date(givenDate);
    const due = new Date(dueDate);
    const diffMs = due.getTime() - start.getTime();
    const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const months = Math.max(1, Math.round(days / 30)); // Round to nearest month

    // Simple month-based interest: principal * (rate/100) * months
    const totalInterest = amount * (rate / 100) * months;
    const totalAmount = amount + totalInterest;

    return {
      monthlyEmi: Math.round(totalAmount * 100) / 100, // Single payment
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      months,
      days,
    };
  }, [loanAmount, interestRate, downPayment, givenDate, dueDate]);

  const fetchLoanPlans = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) {
        return;
      }
      
      const response = await authedFetch(`${API_URL}/api/loan-plans?admin_token=${adminToken}`);
      if (response.ok) {
        const data = await response.json();
        setLoanPlans(data);
      } else {
      }
    } catch (error) {
    } finally {
      setLoadingPlans(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    if (!c) return false;
    const q = clientSearchQuery.toLowerCase();
    if (!q) return true;
    return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(clientSearchQuery);
  });

  const handlePlanSelect = (plan: LoanPlan) => {
    setSelectedPlan(plan);
    setInterestRate(plan.interest_rate.toString());
    // Set default due date based on plan's min tenure
    const defaultDate = new Date();
    defaultDate.setMonth(defaultDate.getMonth() + plan.min_tenure_months);
    setDueDate(defaultDate.toISOString().split('T')[0]);
    setShowPlanPicker(false);
  };

  const handleSubmit = async (skipDuplicateCheck = false) => {
    if (submitting.current) return;
    // Validate inputs
    if (clientMode === 'existing' && !selectedClient) {
      Alert.alert(t('error'), t('pleaseSelectAClient'));
      return;
    }

    const newEmail = newClientEmail.trim();
    if (clientMode === 'new') {
      if (!newClientName.trim() || !newClientPhone.trim()) {
        Alert.alert(t('error'), t('pleaseFillAllClientFields'));
        return;
      }
      if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        Alert.alert(t('error'), language === 'et' ? 'E-posti aadress ei ole korrektne' : 'Email address is not valid');
        return;
      }
    }

    const loanAmountNum = parseAmount(loanAmount);
    const interestRateNum = parseAmount(interestRate);
    const downNum = parseAmount(downPayment) || 0;

    if (!loanAmount.trim() || loanAmountNum === null || loanAmountNum <= 0) {
      Alert.alert(t('error'), t('pleaseEnterAValidLoanAmount'));
      return;
    }
    if (downNum < 0 || downNum >= loanAmountNum) {
      Alert.alert(t('error'), language === 'et' ? 'Sissemakse peab olema väiksem kui laenusumma' : 'Down payment must be smaller than the loan amount');
      return;
    }
    if (!interestRate.trim() || interestRateNum === null || interestRateNum < 0) {
      Alert.alert(t('error'), t('pleaseEnterAValidInterestRate'));
      return;
    }
    if (!dueDate) {
      Alert.alert(t('error'), t('pleaseSelectADueDate'));
      return;
    }

    // Validate due date is at least one day in the future (timezone-safe)
    const selectedDate = new Date(dueDate);
    selectedDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDate < tomorrow) {
      Alert.alert(t('error'), t('dueDateMustBeAtLeast'));
      return;
    }

    // Same phone number already in the client list?
    if (clientMode === 'new' && !createdClientId.current && !skipDuplicateCheck) {
      const key = (n: string) => (n || '').replace(/[^\d]/g, '').replace(/^0+/, '');
      const k = key(newClientPhone);
      const dup = k && clients.find((c) => key(c.phone) === k);
      if (dup) {
        Alert.alert(
          ta(language, 'duplicatePhoneTitle'),
          ta(language, 'duplicatePhoneBody', { name: dup.name || dup.phone }),
          [
            { text: t('cancel'), style: 'cancel' },
            { text: ta(language, 'createAnyway'), style: 'destructive', onPress: () => handleSubmit(true) },
          ],
        );
        return;
      }
    }

    submitting.current = true;
    setLoading(true);
    try {
      let targetClientId = selectedClient?.id;

      // Create new client if needed. The id is remembered, so retrying after a failed loan
      // setup reuses the same client instead of creating a duplicate.
      if (clientMode === 'new') {
        if (!createdClientId.current) {
          const newClientData: Record<string, string> = {
            name: newClientName.trim(),
            phone: newClientPhone.trim(),
            email: '',
          };
          // the deployed server's ClientCreate requires an email field: send '' when none was given
          newClientData.email = newEmail;
          if (newClientAddress.trim()) newClientData.address = newClientAddress.trim();
          if (newClientBirthNumber.trim()) newClientData.birth_number = newClientBirthNumber.trim();

          const clientResponse = await authedFetch(`${API_URL}/api/clients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newClientData),
          });
          if (clientResponse.status === 401) return;
          if (!clientResponse.ok) throw new Error(await responseError(clientResponse, `Failed to create client (${clientResponse.status})`));
          const newClient = await clientResponse.json();
          createdClientId.current = newClient.id;
          invalidateClients();
        }
        targetClientId = createdClientId.current!;
      }

      // Setup loan for the client
      const loanData = {
        loan_amount: loanAmountNum,
        interest_rate: interestRateNum,
        given_date: givenDate,
        due_date: dueDate,
        down_payment: downNum,
      };
      const loanResponse = await authedFetch(`${API_URL}/api/loans/${targetClientId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanData),
      });
      if (loanResponse.status === 401) return;
      if (!loanResponse.ok) {
        const msg = await responseError(loanResponse, `Failed to setup loan (${loanResponse.status})`);
        throw new Error(
          createdClientId.current
            ? (language === 'et'
                ? `${msg}\n\nKlient on juba loodud – proovige uuesti, klienti ei looda teist korda.`
                : `${msg}\n\nThe client was already created – retry and it will not be created twice.`)
            : msg,
        );
      }
      await loanResponse.json().catch(() => ({}));
      invalidateClients();
      createdClientId.current = null;

      const offerContract = params.contract === '1' && targetClientId;
      if (offerContract) {
        Alert.alert(
          ta(language, 'contractPromptTitle'),
          ta(language, 'contractPromptBody', { name: selectedClient?.name || '' }),
          [
            { text: ta(language, 'contractNo'), style: 'cancel', onPress: () => router.replace(`/admin/client-details?id=${targetClientId}`) },
            {
              text: ta(language, 'contractYes'),
              onPress: async () => {
                const r = await shareLoanContract(String(targetClientId), language, ta(language, 'contractPromptTitle'));
                if (!r.ok && r.error !== 'session_expired') Alert.alert(ta(language, 'contractFailed'), r.error || '');
                router.replace(`/admin/client-details?id=${targetClientId}`);
              },
            },
          ],
        );
      } else {
        Alert.alert(
          t('success'),
          language === 'et' ? `Laen loodud!` : `Loan created successfully!`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert(t('error'), getErrorMessage(error, 'Failed to add loan. Please try again.'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isRenewal
            ? (t('renewLoan'))
            : (t('addLoan'))}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {isRenewal && (
          <View style={styles.renewalBanner} data-testid="renewal-banner">
            <Ionicons name="refresh-circle" size={20} color="#10B981" />
            <Text style={styles.renewalBannerText}>
              {t('prefilledFromPreviousLoanAdjustAs')}
            </Text>
          </View>
        )}
        {/* Client Selection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('step1SelectOrCreateClient')}
          </Text>

          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeButton, clientMode === 'existing' && styles.modeButtonActive]}
              onPress={() => setClientMode('existing')}
            >
              <Ionicons
                name="people"
                size={18}
                color={clientMode === 'existing' ? '#fff' : '#94A3B8'}
              />
              <Text style={[styles.modeButtonText, clientMode === 'existing' && styles.modeButtonTextActive]}>
                {t('existing')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, clientMode === 'new' && styles.modeButtonActive]}
              onPress={() => setClientMode('new')}
            >
              <Ionicons
                name="person-add"
                size={18}
                color={clientMode === 'new' ? '#fff' : '#94A3B8'}
              />
              <Text style={[styles.modeButtonText, clientMode === 'new' && styles.modeButtonTextActive]}>
                {t('new')}
              </Text>
            </TouchableOpacity>
          </View>

          {clientMode === 'existing' ? (
            <TouchableOpacity
              style={[styles.pickerButton, { marginBottom: 16 }]}
              onPress={() => setShowClientPicker(true)}
              disabled={loadingClients}
              data-testid="select-client-picker"
            >
              <Ionicons name="person" size={20} color="#94A3B8" />
              <Text style={styles.pickerButtonText}>
                {selectedClient
                  ? `${selectedClient.name} (${selectedClient.phone})`
                  : loadingClients
                  ? (t('loading'))
                  : (t('selectClient'))}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#94A3B8" />
            </TouchableOpacity>
          ) : (
            <View style={styles.newClientForm}>
              <View style={styles.inputContainer}>
                <Ionicons name="person" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={t('name')}
                  placeholderTextColor="#64748B"
                  value={newClientName}
                  onChangeText={setNewClientName}
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="call" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={t('phone')}
                  placeholderTextColor="#64748B"
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="mail" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={`${t('email')} (${ta(language, 'emailOptional')})`}
                  placeholderTextColor="#64748B"
                  value={newClientEmail}
                  onChangeText={setNewClientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="location" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={t('address')}
                  placeholderTextColor="#64748B"
                  value={newClientAddress}
                  onChangeText={setNewClientAddress}
                />
              </View>
              <View style={styles.inputContainer}>
                <Ionicons name="card" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder={t('birthNumber')}
                  placeholderTextColor="#64748B"
                  value={newClientBirthNumber}
                  onChangeText={setNewClientBirthNumber}
                />
              </View>
            </View>
          )}
        </View>

        {/* Loan Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('step2LoanDetails')}
          </Text>

          {/* Loan Plan Selector (Optional) */}
          <Text style={styles.label}>
            {t('loanPlanOptional')}
          </Text>
          <TouchableOpacity
            style={[styles.pickerButton, { marginBottom: 16 }]}
            onPress={() => setShowPlanPicker(true)}
            disabled={loadingPlans}
            data-testid="select-plan-picker"
          >
            <Ionicons name="document-text" size={20} color="#94A3B8" />
            <Text style={styles.pickerButtonText}>
              {selectedPlan
                ? selectedPlan.name
                : loadingPlans
                ? (t('loading'))
                : (t('selectPlan'))}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
          </TouchableOpacity>

          <Text style={styles.label}>
            {language === 'et' ? `Laenusumma (${currencySymbol})` : `Loan Amount (${currencySymbol})`}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="cash" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor="#64748B"
              value={loanAmount}
              onChangeText={setLoanAmount}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>{ta(language, 'downPayment')} ({currencySymbol})</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="wallet" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748B"
              value={downPayment}
              onChangeText={setDownPayment}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>
            {t('interestRatePerMonth')}
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="trending-up" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="2"
              placeholderTextColor="#64748B"
              value={interestRate}
              onChangeText={setInterestRate}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.label}>
            {t('loanGivenDate')}
          </Text>
          <DatePicker
            value={givenDate}
            onChange={setGivenDate}
            placeholder={t('selectDate')}
            testID="given-date-input"
          />

          <Text style={styles.label}>
            {t('dueDate')}
          </Text>
          <DatePicker
            value={dueDate}
            onChange={setDueDate}
            placeholder={t('selectDate')}
            minDate={new Date(Date.now() + 86400000)}
            testID="due-date-input"
          />
          {dueDate && (
            <Text style={styles.dueDateInfo} data-testid="due-date-info">
              {(() => {
                const now = new Date();
                const due = new Date(dueDate);
                const diffMonths = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
                return language === 'et'
                  ? `~${Math.max(1, diffMonths)} kuud`
                  : `~${Math.max(1, diffMonths)} months`;
              })()}
            </Text>
          )}
        </View>

        {/* Loan Calculator Preview */}
        {emiPreview && (
          <View style={styles.emiPreviewCard} data-testid="emi-preview-card">
            <View style={styles.emiPreviewHeader}>
              <Ionicons name="calculator" size={20} color="#10B981" />
              <Text style={styles.emiPreviewTitle}>
                {t('loanCalculator')}
              </Text>
            </View>
            <View style={styles.emiPreviewGrid}>
              <View style={styles.emiPreviewItem}>
                <Text style={styles.emiPreviewLabel}>
                  {t('totalInterest')}
                </Text>
                <Text style={[styles.emiPreviewValueSmall, { color: '#F59E0B' }]}>
                  {formatAmount(emiPreview.totalInterest)}
                </Text>
              </View>
              <View style={styles.emiPreviewItem}>
                <Text style={styles.emiPreviewLabel}>
                  Due Amount
                </Text>
                <Text style={[styles.emiPreviewValue, { color: '#10B981' }]}>
                  {formatAmount(emiPreview.totalAmount)}
                </Text>
              </View>
              <View style={styles.emiPreviewItem}>
                <Text style={styles.emiPreviewLabel}>
                  {t('tenure')}
                </Text>
                <Text style={styles.emiPreviewValueSmall}>
                  {emiPreview.days} {language === 'et' ? 'päeva' : 'days'}
                </Text>
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
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>
                {t('createLoan')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Client Picker Modal */}
      <Modal visible={showClientPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('selectClient')}
              </Text>
              <TouchableOpacity onPress={() => setShowClientPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder={t('search')}
              placeholderTextColor="#64748B"
              value={clientSearchQuery}
              onChangeText={setClientSearchQuery}
            />

            <ScrollView style={styles.pickerList}>
              {filteredClients.map((client) => (
                <TouchableOpacity
                  key={client.id}
                  style={styles.pickerItem}
                  onPress={() => {
                    setSelectedClient(client);
                    setShowClientPicker(false);
                    setClientSearchQuery('');
                  }}
                >
                  <View style={styles.clientAvatar}>
                    <Text style={styles.clientAvatarText}>
                      {client.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{client.name}</Text>
                    <Text style={styles.pickerItemSubtext}>{client.phone}</Text>
                  </View>
                  {selectedClient?.id === client.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Loan Plan Picker Modal */}
      <Modal visible={showPlanPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('selectLoanPlan')}
              </Text>
              <TouchableOpacity onPress={() => setShowPlanPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerList}>
              {loanPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={styles.pickerItem}
                  onPress={() => handlePlanSelect(plan)}
                >
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{plan.name}</Text>
                    <Text style={styles.pickerItemSubtext}>
                      {plan.interest_rate}% | {plan.min_tenure_months}-{plan.max_tenure_months} {t('months')}
                    </Text>
                    {plan.description && (
                      <Text style={styles.pickerItemDesc}>{plan.description}</Text>
                    )}
                  </View>
                  {selectedPlan?.id === plan.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#152035',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#152035',
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  pickerButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  newClientForm: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
    marginTop: 12,
  },
  dueDateInfo: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#152035',
    borderWidth: 1,
    borderColor: '#1E3050',
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
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    marginTop: 8,
    marginBottom: 40,
  },
  // EMI Preview Card
  emiPreviewCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#10B98140',
  },
  emiPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  emiPreviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  emiPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emiPreviewItem: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: '#0B1527',
    borderRadius: 12,
    padding: 14,
  },
  emiPreviewLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  emiPreviewValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
  },
  emiPreviewValueSmall: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#152035',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  searchInput: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0B1527',
    borderWidth: 1,
    borderColor: '#1E3050',
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  pickerList: {
    maxHeight: 400,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#0B1527',
    marginBottom: 8,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  pickerItemSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  pickerItemDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  renewalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B98115',
    borderWidth: 1,
    borderColor: '#10B98130',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  renewalBannerText: {
    fontSize: 13,
    color: '#10B981',
    flex: 1,
  },
});
