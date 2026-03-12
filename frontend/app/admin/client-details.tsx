import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useTheme } from '../../src/context/ThemeContext';
import API_URL from '../../src/constants/api';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  styles,
  ClientInfoCard,
  ContactInfo,
  DeviceInfo,
  LoanOverview,
  LoanHistory,
  PaymentHistory,
  ActionButtons,
  PaymentModal,
  WarningModal,
  LockModal,
  EditDeviceModal,
  EditClientModal,
  EditLoanModal,
} from '../../src/components/client-details';
import type { Client, LoanHistoryItem, LoanPreview } from '../../src/components/client-details';

export default function ClientDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const { colors } = useTheme();

  // Core state
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Modal visibility
  const [warningModal, setWarningModal] = useState(false);
  const [lockModal, setLockModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [editDeviceModal, setEditDeviceModal] = useState(false);
  const [editClientModal, setEditClientModal] = useState(false);
  const [editLoanModal, setEditLoanModal] = useState(false);

  // Modal form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [editDeviceMake, setEditDeviceMake] = useState('');
  const [editDeviceModel, setEditDeviceModel] = useState('');
  const [editDevicePrice, setEditDevicePrice] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientAddress, setEditClientAddress] = useState('');
  const [editLoanAmount, setEditLoanAmount] = useState('');
  const [editInterestRate, setEditInterestRate] = useState('');
  const [editLoanStartDate, setEditLoanStartDate] = useState('');
  const [editLoanDueDate, setEditLoanDueDate] = useState('');
  const [loanPreview, setLoanPreview] = useState<LoanPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Tab & history state
  const [activeTab, setActiveTab] = useState<'loan' | 'payments'>('loan');
  const [loanHistory, setLoanHistory] = useState<LoanHistoryItem[]>([]);
  const [loanHistoryLoading, setLoanHistoryLoading] = useState(false);
  const [showLoanHistory, setShowLoanHistory] = useState(false);
  const [loanHistorySearch, setLoanHistorySearch] = useState('');
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // ─── Auth helpers ──────────────────────────────────────────────
  const getAdminToken = async () => await AsyncStorage.getItem('admin_token');

  const handleAuthFailure = async () => {
    await AsyncStorage.multiRemove(['admin_token', 'admin_id', 'admin_username', 'admin_stay_signed_in']);
    Alert.alert(
      t('sessionExpired'),
      t('pleaseLogInAgain'),
      [{ text: 'OK', onPress: () => router.replace('/admin/login') }]
    );
  };

  const buildAdminTokenQuery = async (hasQuery = false) => {
    const token = await getAdminToken();
    return token ? `${hasQuery ? '&' : '?'}admin_token=${token}` : '';
  };

  // ─── Data fetching ─────────────────────────────────────────────

  const fetchClient = async () => {
    try {
      const token = await getAdminToken();
      if (!token) {
        Alert.alert(t('error'), 'Not authenticated');
        router.back();
        return;
      }
      const response = await fetch(`${API_URL}/api/clients/${id}?admin_token=${token}`);
      if (response.status === 401) { handleAuthFailure(); return; }
      if (!response.ok) throw new Error('Client not found');
      const data = await response.json();
      setClient(data);
      setLockMessage(data.lock_message);
    } catch (error) {
      Alert.alert(t('error'), 'Failed to load client details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanHistory = async () => {
    try {
      setLoanHistoryLoading(true);
      const token = await getAdminToken();
      if (!token) return;
      const response = await fetch(`${API_URL}/api/clients/${id}/loan-history?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setLoanHistory(data.loan_history || []);
      }
    } catch (error) {
      console.error('Failed to fetch loan history:', error);
    } finally {
      setLoanHistoryLoading(false);
    }
  };

  const fetchPaymentHistory = async () => {
    try {
      setPaymentHistoryLoading(true);
      const token = await getAdminToken();
      if (!token) return;
      const response = await fetch(`${API_URL}/api/loans/${id}/payments?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setPaymentHistory(data || []);
      }
    } catch (error) {
      console.error('Failed to fetch payment history:', error);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  // ─── Effects ───────────────────────────────────────────────────
  useEffect(() => { fetchClient(); }, [id]);

  const isModalOpenRef = useRef(false);
  useEffect(() => {
    isModalOpenRef.current = warningModal || lockModal || paymentModal || editDeviceModal || editClientModal || editLoanModal;
  }, [warningModal, lockModal, paymentModal, editDeviceModal, editClientModal, editLoanModal]);

  useEffect(() => {
    const interval = setInterval(() => { if (!isModalOpenRef.current) fetchClient(); }, 15000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if ((showLoanHistory || (client && !client.loan_start_date)) && loanHistory.length === 0) fetchLoanHistory();
  }, [showLoanHistory, client]);

  useEffect(() => {
    if (activeTab === 'payments' && paymentHistory.length === 0) fetchPaymentHistory();
  }, [activeTab]);

  // ─── Action handlers ──────────────────────────────────────────
  const handleGenerateCode = async () => {
    // Step 1: Ask which lock mode
    Alert.alert(
      t('generateNewKey'),
      language === 'et'
        ? 'Valige lukurežiim:\n\nDevice Admin (8-kohaline) — Standardne lukustus\nDevice Owner (9-kohaline) — Täielik kioski režiim'
        : 'Select lock mode:\n\nDevice Admin (8-digit) — Standard lock\nDevice Owner (9-digit) — Full kiosk mode',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Device Admin',
          onPress: () => generateCodeWithMode('device_admin'),
        },
        {
          text: 'Device Owner',
          onPress: () => generateCodeWithMode('device_owner'),
        },
      ]
    );
  };

  const generateCodeWithMode = async (lockMode: string) => {
    Alert.alert(
      t('confirm'),
      language === 'et'
        ? 'Genereerime uue koodi. Jätkata?'
        : 'Generate a new code. Continue?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('generate'),
          onPress: async () => {
            setGeneratingCode(true);
            try {
              const token = await AsyncStorage.getItem('admin_token');
              if (!token) { Alert.alert(t('error'), 'Not authenticated'); return; }
              const response = await fetch(`${API_URL}/api/clients/${id}/generate-code?admin_token=${token}&lock_mode=${lockMode}`, { method: 'POST' });
              if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || errorData.detail || 'Failed to generate code'); }
              const data = await response.json();
              if (client) setClient({ ...client, registration_code: data.registration_code, lock_mode: data.lock_mode });
              const modeLabel = lockMode === 'device_owner' ? 'Device Owner (9-digit)' : 'Device Admin (8-digit)';
              Alert.alert(
                t('success'),
                language === 'et'
                  ? `Uus registreerimiskood: ${data.registration_code}\nRežiim: ${modeLabel}`
                  : `New registration code: ${data.registration_code}\nMode: ${modeLabel}`
              );
            } catch (error: any) { Alert.alert(t('error'), error.message); }
            finally { setGeneratingCode(false); }
          },
        },
      ]
    );
  };

  const handleLock = async () => {
    setActionLoading(true);
    try {
      const adminQuery = await buildAdminTokenQuery(true);
      const response = await fetch(`${API_URL}/api/clients/${id}/lock?message=${encodeURIComponent(lockMessage)}${adminQuery}`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to lock device');
      await fetchClient();
      setLockModal(false);
      Alert.alert(t('success'), t('deviceLockedSuccess'));
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  const handleUnlock = async () => {
    Alert.alert(t('unlockDevice'), t('unlockConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('unlockDevice'),
        onPress: async () => {
          setActionLoading(true);
          try {
            const adminQuery = await buildAdminTokenQuery();
            const response = await fetch(`${API_URL}/api/clients/${id}/unlock${adminQuery}`, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to unlock device');
            await fetchClient();
            Alert.alert(t('success'), t('deviceUnlockedSuccess'));
          } catch (error: any) { Alert.alert(t('error'), error.message); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleSendWarning = async () => {
    if (!warningMessage.trim()) { Alert.alert(t('error'), t('enterWarningMessage')); return; }
    setActionLoading(true);
    try {
      const adminQuery = await buildAdminTokenQuery(true);
      const response = await fetch(`${API_URL}/api/clients/${id}/warning?message=${encodeURIComponent(warningMessage)}${adminQuery}`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to send warning');
      await fetchClient();
      setWarningModal(false);
      setWarningMessage('');
      Alert.alert(t('success'), t('warningSentSuccess'));
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  const handleAllowUninstall = async () => {
    Alert.alert('Allow App Uninstall', 'This will signal the device to disable its protection, allowing the app to be uninstalled. Continue?', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Allow', style: 'default',
        onPress: async () => {
          setActionLoading(true);
          try {
            const adminQuery = await buildAdminTokenQuery();
            const response = await fetch(`${API_URL}/api/clients/${id}/allow-uninstall${adminQuery}`, { method: 'POST' });
            if (!response.ok) throw new Error('Failed to allow uninstall');
            const data = await response.json();
            Alert.alert(t('success'), data.message + '\n\nYou can now delete this client.');
            await fetchClient();
          } catch (error: any) { Alert.alert(t('error'), error.message); }
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleDelete = async () => {
    Alert.alert(
      t('deleteClient'),
      t('areYouSureThisWillAlso'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yesDelete'), style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const adminQuery = await buildAdminTokenQuery();
              const deleteRes = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`, { method: 'DELETE' });
              if (!deleteRes.ok) { const err = await deleteRes.json(); throw new Error(err.detail || 'Failed to delete client'); }
              Alert.alert(t('success'), t('clientDeletedSuccess'));
              router.back();
            } catch (error: any) { Alert.alert(t('error'), error.message); }
            finally { setActionLoading(false); }
          },
        },
      ]
    );
  };

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    try {
      const adminQuery = await buildAdminTokenQuery();
      const response = await fetch(`${API_URL}/api/clients/${id}/fetch-price${adminQuery}`);
      if (!response.ok) { const error = await response.json(); throw new Error(error.detail || 'Failed to fetch price'); }
      const data = await response.json();
      await fetchClient();
      const rangeText = data.price_range?.min && data.price_range?.max
        ? `\n${t('range')}: ${formatAmount(data.price_range.min || 0, 0)} - ${formatAmount(data.price_range.max || 0, 0)}`
        : '';
      const countText = data.listing_count ? `\n${data.listing_count} ${t('listings')} (${data.source || 'ebay.de'})` : '';
      Alert.alert(t('success'), `${t('devicePrice')}: ${formatAmount(data.used_price_eur)}${rangeText}${countText}`);
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setFetchingPrice(false); }
  };

  const openEditDeviceModal = () => {
    if (client) {
      setEditDeviceMake(client.device_make || '');
      setEditDeviceModel(client.device_model || '');
      setEditDevicePrice(client.used_price_eur?.toString() || '');
      setEditDeviceModal(true);
    }
  };

  const handleSaveDeviceInfo = async () => {
    setActionLoading(true);
    try {
      const updateData: any = {};
      if (editDeviceMake.trim()) updateData.device_make = editDeviceMake.trim();
      if (editDeviceModel.trim()) updateData.device_model = editDeviceModel.trim();
      if (editDevicePrice.trim()) {
        const priceNum = parseFloat(editDevicePrice);
        if (!isNaN(priceNum) && priceNum >= 0) updateData.used_price_eur = priceNum;
      }
      const adminQuery = await buildAdminTokenQuery();
      const response = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData),
      });
      if (!response.ok) throw new Error('Failed to update device info');
      await fetchClient();
      setEditDeviceModal(false);
      Alert.alert(t('success'), t('deviceInfoUpdated'));
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  const openEditClientModal = () => {
    if (client) {
      setEditClientName(client.name || '');
      setEditClientPhone(client.phone || '');
      setEditClientEmail(client.email || '');
      setEditClientAddress(client.address || '');
      setEditClientModal(true);
    }
  };

  const handleSaveClientInfo = async () => {
    if (!editClientName.trim()) {
      Alert.alert(t('error'), t('nameIsRequired'));
      return;
    }
    setActionLoading(true);
    try {
      const updateData: any = {};
      if (editClientName.trim()) updateData.name = editClientName.trim();
      if (editClientPhone.trim()) updateData.phone = editClientPhone.trim();
      if (editClientEmail.trim()) updateData.email = editClientEmail.trim();
      if (editClientAddress.trim()) updateData.address = editClientAddress.trim();
      const adminQuery = await buildAdminTokenQuery();
      const response = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || 'Failed to update client info'); }
      await fetchClient();
      setEditClientModal(false);
      Alert.alert(t('success'), t('clientInfoUpdated'));
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount) {
      Alert.alert(t('error'), t('pleaseEnterPaymentAmount'));
      return;
    }
    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/loans/${id}/payments?admin_token=${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(paymentAmount), payment_method: paymentMethod, notes: paymentNotes }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || errorData.message || 'Failed to record payment'); }
      const data = await response.json();
      const paidAmount = data.payment?.amount ?? parseFloat(paymentAmount);
      const outstandingBalance = data.updated_balance?.outstanding_balance ?? 0;
      Alert.alert(
        t('success'),
        language === 'et'
          ? `Makse salvestatud!\n\nMakstud: ${formatAmount(paidAmount)}\nJ\u00e4\u00e4k: ${formatAmount(outstandingBalance)}`
          : `Payment recorded!\n\nPaid: ${formatAmount(paidAmount)}\nOutstanding: ${formatAmount(outstandingBalance)}`
      );
      setPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchClient();
    } catch (error: any) { Alert.alert(t('error'), error.message || 'Failed to record payment'); }
    finally { setActionLoading(false); }
  };

  // ─── Loan edit handlers ────────────────────────────────────────
  const formatDateForInput = (date: Date | string | null | undefined): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().split('T')[0];
  };

  const openEditLoanModal = () => {
    if (client) {
      setEditLoanAmount(client.loan_amount?.toString() || client.total_amount_due?.toString() || '');
      setEditInterestRate(client.interest_rate?.toString() || '2');
      setEditLoanStartDate(formatDateForInput(client.loan_start_date));
      setEditLoanDueDate(client.loan_due_date || formatDateForInput(client.next_payment_due) || '');
      setLoanPreview(null);
      setEditLoanModal(true);
    }
  };

  const fetchLoanPreview = async () => {
    if (!editLoanAmount || !editInterestRate || !editLoanStartDate || !editLoanDueDate) return;
    setPreviewLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const params = new URLSearchParams({
        loan_amount: editLoanAmount, interest_rate: editInterestRate,
        loan_start_date: editLoanStartDate, due_date: editLoanDueDate, admin_token: token || '',
      });
      const response = await fetch(`${API_URL}/api/loans/${id}/preview?${params.toString()}`);
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || 'Failed to calculate preview'); }
      const data = await response.json();
      setLoanPreview(data.preview);
    } catch (error: any) { console.error('Preview error:', error); setLoanPreview(null); }
    finally { setPreviewLoading(false); }
  };

  const handleSaveLoan = async () => {
    if (!editLoanAmount || !editInterestRate) {
      Alert.alert(t('error'), t('pleaseFillAllRequiredFields'));
      return;
    }
    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/loans/${id}/edit?admin_token=${token}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: parseFloat(editLoanAmount), interest_rate: parseFloat(editInterestRate),
          loan_start_date: editLoanStartDate || undefined, due_date: editLoanDueDate || undefined,
        }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || 'Failed to update loan'); }
      const data = await response.json();
      Alert.alert(
        t('success'),
        language === 'et'
          ? `Laen uuendatud!\n\nKuumakse: ${formatAmount(data.loan_details.monthly_emi)}\nKokku: ${formatAmount(data.loan_details.total_amount_due)}`
          : `Loan updated!\n\nMonthly EMI: ${formatAmount(data.loan_details.monthly_emi)}\nTotal: ${formatAmount(data.loan_details.total_amount_due)}`
      );
      setEditLoanModal(false);
      fetchClient();
    } catch (error: any) { Alert.alert(t('error'), error.message || 'Failed to update loan'); }
    finally { setActionLoading(false); }
  };

  // ─── Misc handlers ────────────────────────────────────────────
  const openMap = () => {
    if (client?.latitude && client?.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`;
      import('react-native').then(({ Linking }) => Linking.openURL(url));
    } else {
      Alert.alert(t('error'), t('locationNotAvailable'));
    }
  };

  const handleDownloadContract = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) { Alert.alert(t('error'), 'Not authenticated'); return; }
      const { Linking } = await import('react-native');
      Linking.openURL(`${API_URL}/api/contracts/${id}/download?admin_token=${token}&language=${language}`);
    } catch (error: any) { Alert.alert(t('error'), error.message); }
  };

  const handleShareContract = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) { Alert.alert(t('error'), 'Not authenticated'); return; }
      const downloadUrl = `${API_URL}/api/contracts/${id}/download?admin_token=${token}&language=${language}`;
      const fileUri = `${FileSystem.cacheDirectory}loan-contract-${id}.pdf`;
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('shareLoanContract'),
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('error'), t('sharingNotAvailableOnThisDevice'));
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') Alert.alert(t('error'), error.message);
    }
  };

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!client) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('clientDetails')}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} data-testid="delete-client-btn">
          <Ionicons name="trash" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try { await fetchClient(); }
              finally { setRefreshing(false); }
            }}
            tintColor="#2563EB"
            colors={['#2563EB']}
          />
        }
      >
        <ClientInfoCard
          client={client}
          language={language}
          colors={colors}
          t={t}
          isSuperAdmin={isSuperAdmin}
          generatingCode={generatingCode}
          onGenerateCode={handleGenerateCode}
        />

        <ContactInfo
          client={client}
          language={language}
          t={t}
          onEdit={openEditClientModal}
        />

        <DeviceInfo
          client={client}
          colors={colors}
          t={t}
          language={language}
          fetchingPrice={fetchingPrice}
          onEditDevice={openEditDeviceModal}
          onOpenMap={openMap}
          onFetchPrice={handleFetchPrice}
        />

        {/* Tab Navigation */}
        <View style={[styles.tabContainer, { backgroundColor: colors.surface, borderColor: colors.border }]} data-testid="client-detail-tabs">
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'loan' && styles.tabButtonActive]}
            onPress={() => setActiveTab('loan')}
            data-testid="tab-active-loan"
          >
            <Ionicons name="wallet" size={16} color={activeTab === 'loan' ? '#2563EB' : '#94A3B8'} />
            <Text style={[styles.tabButtonText, activeTab === 'loan' && styles.tabButtonTextActive]}>
              {t('activeLoan')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'payments' && styles.tabButtonActive]}
            onPress={() => setActiveTab('payments')}
            data-testid="tab-payment-history"
          >
            <Ionicons name="receipt" size={16} color={activeTab === 'payments' ? '#2563EB' : '#94A3B8'} />
            <Text style={[styles.tabButtonText, activeTab === 'payments' && styles.tabButtonTextActive]}>
              {t('paymentHistory')}
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'loan' && (
          <>
            <LoanOverview
              client={client}
              language={language}
              clientId={id as string}
              actionLoading={actionLoading}
              onEditLoan={openEditLoanModal}
              onRecordPayment={() => {
                setPaymentAmount(client.monthly_emi?.toFixed(2) || '');
                setPaymentModal(true);
              }}
              onAddNewLoan={() => router.push(`/admin/add-loan?client_id=${id}`)}
              onDownloadContract={handleDownloadContract}
              onShareContract={handleShareContract}
            />
            <LoanHistory
              loanHistory={loanHistory}
              loanHistoryLoading={loanHistoryLoading}
              showLoanHistory={showLoanHistory}
              loanHistorySearch={loanHistorySearch}
              language={language}
              colors={colors}
              onToggle={() => setShowLoanHistory(!showLoanHistory)}
              onSearchChange={setLoanHistorySearch}
            />
          </>
        )}

        {activeTab === 'payments' && (
          <PaymentHistory
            paymentHistory={paymentHistory}
            paymentHistoryLoading={paymentHistoryLoading}
            language={language}
            colors={colors}
          />
        )}

        <ActionButtons
          client={client}
          loanHistory={loanHistory}
          language={language}
          actionLoading={actionLoading}
          t={t}
          onSetupLoan={() => router.push(`/admin/add-loan?clientId=${client.id}`)}
          onRenewLoan={() => router.push(`/admin/add-loan?clientId=${client.id}&renew=true`)}
          onSendWarning={() => setWarningModal(true)}
          onToggleLock={client.is_locked ? handleUnlock : () => setLockModal(true)}
          onAllowUninstall={handleAllowUninstall}
        />
      </ScrollView>

      {/* Chat FAB */}
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: 24, right: 24, backgroundColor: '#10B981',
          width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
          elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, zIndex: 100,
        }}
        onPress={async () => {
          setShowChat(true);
          setChatLoading(true);
          try {
            const token = await getAdminToken();
            const resp = await fetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
            if (resp.ok) {
              const data = await resp.json();
              setChatMessages(data.messages || []);
              fetch(`${API_URL}/api/messages/mark-read?client_id=${id}&admin_token=${token}`, { method: 'POST' }).catch(() => {});
            }
          } catch (e) { console.log('Chat fetch error', e); }
          setChatLoading(false);
          setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 200);
        }}
        data-testid="admin-chat-fab"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal visible={showChat} animationType="slide" transparent onRequestClose={() => setShowChat(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', paddingTop: 16, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
                  Chat with {client?.name || 'Client'}
                </Text>
                <TouchableOpacity onPress={() => setShowChat(false)}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView ref={chatScrollRef} style={{ flex: 1, marginBottom: 12 }} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
                {chatLoading ? (
                  <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
                ) : chatMessages.length === 0 ? (
                  <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No messages yet. Start a conversation.</Text>
                ) : (
                  chatMessages.map((msg, i) => (
                    <View key={msg.id || i} style={{
                      alignSelf: msg.sender_type === 'admin' ? 'flex-end' : 'flex-start',
                      backgroundColor: msg.sender_type === 'admin' ? '#10B981' : colors.surface,
                      padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: '80%',
                    }}>
                      <Text style={{ color: msg.sender_type === 'admin' ? '#fff' : colors.text, fontSize: 14 }}>{msg.text}</Text>
                      <Text style={{ color: msg.sender_type === 'admin' ? '#A7F3D0' : colors.textMuted, fontSize: 10, marginTop: 4 }}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 32 }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }}
                  placeholder="Type a message..."
                  placeholderTextColor={colors.textMuted}
                  value={chatText}
                  onChangeText={setChatText}
                  onSubmitEditing={async () => {
                    if (!chatText.trim()) return;
                    try {
                      const token = await getAdminToken();
                      const resp = await fetch(`${API_URL}/api/messages?client_id=${id}&text=${encodeURIComponent(chatText)}&admin_token=${token}`, { method: 'POST' });
                      if (resp.ok) {
                        setChatText('');
                        const refreshResp = await fetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
                        if (refreshResp.ok) {
                          const data = await refreshResp.json();
                          setChatMessages(data.messages || []);
                        }
                      }
                    } catch (e) { Alert.alert('Error', 'Failed to send message'); }
                  }}
                />
                <TouchableOpacity
                  onPress={async () => {
                    if (!chatText.trim()) return;
                    try {
                      const token = await getAdminToken();
                      const resp = await fetch(`${API_URL}/api/messages?client_id=${id}&text=${encodeURIComponent(chatText)}&admin_token=${token}`, { method: 'POST' });
                      if (resp.ok) {
                        setChatText('');
                        const refreshResp = await fetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
                        if (refreshResp.ok) {
                          const data = await refreshResp.json();
                          setChatMessages(data.messages || []);
                        }
                      }
                    } catch (e) { Alert.alert('Error', 'Failed to send message'); }
                  }}
                  style={{ backgroundColor: '#10B981', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modals */}
      <PaymentModal
        visible={paymentModal}
        client={client}
        language={language}
        t={t}
        actionLoading={actionLoading}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        paymentNotes={paymentNotes}
        onChangeAmount={setPaymentAmount}
        onChangeMethod={setPaymentMethod}
        onChangeNotes={setPaymentNotes}
        onConfirm={handleRecordPayment}
        onClose={() => setPaymentModal(false)}
      />
      <WarningModal
        visible={warningModal}
        language={language}
        t={t}
        actionLoading={actionLoading}
        warningMessage={warningMessage}
        onChangeMessage={setWarningMessage}
        onConfirm={handleSendWarning}
        onClose={() => setWarningModal(false)}
      />
      <LockModal
        visible={lockModal}
        t={t}
        actionLoading={actionLoading}
        lockMessage={lockMessage}
        onChangeMessage={setLockMessage}
        onConfirm={handleLock}
        onClose={() => setLockModal(false)}
      />
      <EditDeviceModal
        visible={editDeviceModal}
        t={t}
        actionLoading={actionLoading}
        editDeviceMake={editDeviceMake}
        editDeviceModel={editDeviceModel}
        editDevicePrice={editDevicePrice}
        onChangeMake={setEditDeviceMake}
        onChangeModel={setEditDeviceModel}
        onChangePrice={setEditDevicePrice}
        onConfirm={handleSaveDeviceInfo}
        onClose={() => setEditDeviceModal(false)}
      />
      <EditClientModal
        visible={editClientModal}
        language={language}
        t={t}
        actionLoading={actionLoading}
        editClientName={editClientName}
        editClientPhone={editClientPhone}
        editClientEmail={editClientEmail}
        editClientAddress={editClientAddress}
        onChangeName={setEditClientName}
        onChangePhone={setEditClientPhone}
        onChangeEmail={setEditClientEmail}
        onChangeAddress={setEditClientAddress}
        onConfirm={handleSaveClientInfo}
        onClose={() => setEditClientModal(false)}
      />
      <EditLoanModal
        visible={editLoanModal}
        language={language}
        t={t}
        actionLoading={actionLoading}
        previewLoading={previewLoading}
        editLoanAmount={editLoanAmount}
        editInterestRate={editInterestRate}
        editLoanStartDate={editLoanStartDate}
        editLoanDueDate={editLoanDueDate}
        loanPreview={loanPreview}
        onChangeLoanAmount={(v) => { setEditLoanAmount(v); setLoanPreview(null); }}
        onChangeInterestRate={(v) => { setEditInterestRate(v); setLoanPreview(null); }}
        onChangeLoanStartDate={(v) => { setEditLoanStartDate(v); setLoanPreview(null); }}
        onChangeLoanDueDate={(v) => { setEditLoanDueDate(v); setLoanPreview(null); }}
        onFetchPreview={fetchLoanPreview}
        onConfirm={handleSaveLoan}
        onClose={() => { setEditLoanModal(false); setLoanPreview(null); }}
      />
    </SafeAreaView>
  );
}
