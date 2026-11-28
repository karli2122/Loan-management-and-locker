import { authedFetch, responseError } from '../../src/utils/adminAuth';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import DocumentVaultModal from '../../src/components/admin/DocumentVaultModal';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useTheme } from '../../src/context/ThemeContext';
import { useEnterpriseAccess } from '../../src/hooks/useEnterpriseAccess';
import API_URL from '../../src/constants/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  styles,
  ClientInfoCard,
  ContactInfo,
  DeviceInfo,
  LoanOverview,
  MultiLoanOverview,
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
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';
import { DeviceHealthCard } from '../../src/components/admin/DeviceHealthCard';
import { stripLockMarker, withRestrictedMarker } from '../../src/utils/lockCompat';
import { LockStatusBanner } from '../../src/components/admin/LockStatusBanner';
import { ConfirmDeleteModal } from '../../src/components/admin/ConfirmDeleteModal';
import { parseAmount, round2 } from '../../src/utils/money';
import { recordLockRequest } from '../../src/utils/lockRequests';
import { shareHandover } from '../../src/utils/handover';
import { ta } from '../../src/utils/adminI18n';
import { invalidateClients } from '../../src/utils/clientsStore';
import { parseServerDate } from '../../src/utils/heartbeat';

export default function ClientDetails() {
  const router = useRouter();
  const { id, pay } = useLocalSearchParams();
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const { colors } = useTheme();
  const { plan, canAccess, loading: planLoading } = useEnterpriseAccess();

  // Core state
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [adminToken, setAdminToken] = useState<string>('');

  // Modal visibility
  const [warningModal, setWarningModal] = useState(false);
  const [lockModal, setLockModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [editDeviceModal, setEditDeviceModal] = useState(false);
  const [editClientModal, setEditClientModal] = useState(false);
  const [editLoanModal, setEditLoanModal] = useState(false);
  // Remove unused restructure state
  const [loanRefreshKey, setLoanRefreshKey] = useState(0);
  const [docVaultModal, setDocVaultModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lockSyncKey, setLockSyncKey] = useState(0);
  const [paymentDate, setPaymentDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [receipt, setReceipt] = useState<null | {
    amount: number; date: string; method: string; outstanding: number | null; fullyPaid: boolean; notes: string; ref?: string;
  }>(null);
  const paySubmitting = useRef(false);
  const payPrompted = useRef(false);

  // Modal form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedLoanId, setSelectedLoanId] = useState(null);  // For multi-loan payment
  const [selectedLoan, setSelectedLoan] = useState(null);  // Selected loan details
  const [warningMessage, setWarningMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [lockLevel, setLockLevel] = useState('full');
  const [lockAllowlist, setLockAllowlist] = useState('');
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
  const getAdminToken = async () => await getSecureItem('admin_token');

  const buildAdminTokenQuery = async (hasQuery = false) => {
    const token = await getAdminToken();
    return token ? `${hasQuery ? '&' : '?'}admin_token=${token}` : '';
  };

  // ─── Data fetching ─────────────────────────────────────────────

  // Returns the loaded client. A failed refresh (network error, server error, expired token)
  // never leaves the screen and never clears what is shown: it only raises the offline banner.
  const fetchClient = async (): Promise<Client | null> => {
    try {
      const token = await getAdminToken();
      if (!token) return null; // session flow takes over
      setAdminToken(token);
      const response = await authedFetch(`${API_URL}/api/clients/${id}`);
      if (response.status === 401) return null; // handled centrally (session expired screen)
      if (response.status === 404) {
        Alert.alert(t('error'), language === 'et' ? 'Klienti ei leitud' : 'Client not found');
        router.back();
        return null;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setClient(data);
      setLockMessage(stripLockMarker(data.lock_message));
      setOffline(false);
      return data;
    } catch (error) {
      setOffline(true);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanHistory = async () => {
    try {
      setLoanHistoryLoading(true);
      const token = await getAdminToken();
      if (!token) return;
      const response = await authedFetch(`${API_URL}/api/clients/${id}/loan-history?admin_token=${token}`);
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
      const response = await authedFetch(`${API_URL}/api/loans/${id}/payments?admin_token=${token}`);
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
  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchClient();
      fetchLoanHistory();
    }, [id])
  );

  const isModalOpenRef = useRef(false);
  useEffect(() => {
    isModalOpenRef.current = warningModal || lockModal || paymentModal || editDeviceModal || editClientModal || editLoanModal || deleteModal || !!receipt;
  }, [warningModal, lockModal, paymentModal, editDeviceModal, editClientModal, editLoanModal, deleteModal, receipt]);

  // Opened from the overdue queue ("Record payment"): jump straight into the payment dialog.
  useEffect(() => {
    if (pay === '1' && client && !payPrompted.current) {
      payPrompted.current = true;
      openPaymentModal(paymentDue());
    }
  }, [client, pay]);

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
    // Check plan - Professional gets device_admin only, Enterprise/Custom gets choice
    if (plan === 'professional') {
      // Professional plan - automatically generate device_admin code
      generateCodeWithMode('device_admin');
    } else if (plan === 'enterprise' || plan === 'custom') {
      // Enterprise/Custom plan - show mode selection
      Alert.alert(
        t('generateNewKey'),
        language === 'et'
          ? 'Valige lukurežiim:\n\nDevice Admin (8-kohaline kood) — Standardne lukustus, ülekate\nDevice Owner (9-kohaline kood) — Täielik kiosk ja rakenduste peatamine'
          : 'Select lock mode:\n\nDevice Admin (8-digit code) — Standard overlay lock\nDevice Owner (9-digit code) — Silent kiosk and app restrictions',
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
    } else {
      // Starter or unknown plan - show upgrade message
      Alert.alert(
        'Professional Feature',
        'Registration key generation requires the Professional plan or higher.',
        [{ text: 'OK' }]
      );
    }
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
              const token = await getSecureItem('admin_token');
              if (!token) { Alert.alert(t('error'), 'Not authenticated'); return; }
              const response = await authedFetch(`${API_URL}/api/clients/${id}/generate-code?admin_token=${token}&lock_mode=${lockMode}`, { method: 'POST' });
              if (!response.ok) throw new Error(await responseError(response, 'Failed to generate code'));
              const data = await response.json();
              if (client) setClient({ ...client, registration_code: data.registration_code, lock_mode: data.lock_mode });
              const modeLabel = lockMode === 'device_owner' ? 'Device Owner (9-digit code)' : 'Device Admin (8-digit code)';
              invalidateClients();
              Alert.alert(
                t('success'),
                language === 'et'
                  ? `Uus registreerimiskood: ${data.registration_code}\nRežiim: ${modeLabel}`
                  : `New registration code: ${data.registration_code}\nMode: ${modeLabel}`,
                [
                  { text: 'OK', style: 'cancel' },
                  {
                    text: ta(language, 'shareCode'),
                    onPress: () => shareHandover({ name: client?.name, code: data.registration_code, language }),
                  },
                ],
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
      const level = (lockLevel || 'full').toLowerCase();

      if (level === 'warning') {
        // Warning keeps the phone usable and shows the message. The live API has no
        // lock levels, so use the existing /warning endpoint (works on old and new API).
        if (client?.is_locked) {
          const unlockQuery = await buildAdminTokenQuery();
          await authedFetch(`${API_URL}/api/clients/${id}/unlock${unlockQuery}`, { method: 'POST' });
        }
        const msg = lockMessage.trim() || (language === 'et'
          ? 'Teie makse on hilinenud. Palun tasuge, et vältida telefoni lukustamist.'
          : 'Your payment is overdue. Please pay to avoid your phone being locked.');
        const response = await authedFetch(`${API_URL}/api/clients/${id}/warning?message=${encodeURIComponent(msg)}${adminQuery}`, { method: 'POST' });
        if (!response.ok) throw new Error(await responseError(response, 'Failed to send warning'));
        if (client?.is_locked) await recordLockRequest(String(id), 'unlock', client?.last_heartbeat);
        await fetchClient();
        setLockSyncKey((k) => k + 1);
        invalidateClients();
        setLockModal(false);
        Alert.alert(t('success'), t('warningSentSuccess') || 'Warning sent');
        return;
      }

      // Restricted: the live API ignores lock_level, so the request also travels as an
      // invisible marker in the lock message, which the client app understands.
      const message = level === 'restricted' ? withRestrictedMarker(lockMessage) : stripLockMarker(lockMessage);
      const allow = level === 'restricted' && lockAllowlist.trim() ? `&lock_allowlist=${encodeURIComponent(lockAllowlist)}` : '';
      const response = await authedFetch(`${API_URL}/api/clients/${id}/lock?message=${encodeURIComponent(message)}&lock_level=${encodeURIComponent(level)}${allow}${adminQuery}`, { method: 'POST' });
      if (!response.ok) throw new Error(await responseError(response, 'Failed to lock device'));
      const lockResult = await response.json().catch(() => ({}));
      await recordLockRequest(String(id), 'lock', client?.last_heartbeat);
      await fetchClient();
      setLockSyncKey((k) => k + 1);
      invalidateClients();
      setLockModal(false);
      if (lockResult.lock_fallback_reason === 'device_admin_no_package_suspend') {
        Alert.alert(
          t('success') || 'Locked',
          'Restricted mode is not available on Device Admin. The device was fully locked with the overlay lock screen instead.',
        );
      } else {
        Alert.alert(t('success'), t('deviceLockedSuccess'));
      }
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
            const response = await authedFetch(`${API_URL}/api/clients/${id}/unlock${adminQuery}`, { method: 'POST' });
            if (!response.ok) throw new Error(await responseError(response, 'Failed to unlock device'));
            await recordLockRequest(String(id), 'unlock', client?.last_heartbeat);
            await fetchClient();
            setLockSyncKey((k) => k + 1);
            invalidateClients();
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
      const response = await authedFetch(`${API_URL}/api/clients/${id}/warning?message=${encodeURIComponent(warningMessage)}${adminQuery}`, { method: 'POST' });
      if (!response.ok) throw new Error(await responseError(response, 'Failed to send warning'));
      await fetchClient();
      invalidateClients();
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
            const response = await authedFetch(`${API_URL}/api/clients/${id}/allow-uninstall${adminQuery}`, { method: 'POST' });
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

  const handleDelete = () => setDeleteModal(true);

  const performDelete = async () => {
    setActionLoading(true);
    try {
      const deleteRes = await authedFetch(`${API_URL}/api/clients/${id}`, { method: 'DELETE' });
      if (!deleteRes.ok) throw new Error(await responseError(deleteRes, 'Failed to delete client'));
      invalidateClients();
      setDeleteModal(false);
      Alert.alert(t('success'), t('clientDeletedSuccess'));
      router.back();
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    try {
      const adminQuery = await buildAdminTokenQuery();
      const response = await authedFetch(`${API_URL}/api/clients/${id}/fetch-price${adminQuery}`);
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
      const response = await authedFetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
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
      const response = await authedFetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateData),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || 'Failed to update client info'); }
      await fetchClient();
      setEditClientModal(false);
      Alert.alert(t('success'), t('clientInfoUpdated'));
    } catch (error: any) { Alert.alert(t('error'), error.message); }
    finally { setActionLoading(false); }
  };

  // Amounts the payment dialog can fill in for the admin.
  const localDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const numOrNull = (x: any): number | null =>
    x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x);

  // null = unknown. For a selected loan only that loan's own balance counts (never the client total).
  const paymentOutstanding = (): number | null => {
    const o = selectedLoanId ? numOrNull((selectedLoan as any)?.outstanding_balance) : numOrNull(client?.outstanding_balance);
    return o === null ? null : Math.max(0, o);
  };
  const paymentDue = (): number => {
    const outstanding = paymentOutstanding();
    if (outstanding === null || outstanding <= 0) return 0;
    const emi = Number((selectedLoan as any)?.monthly_emi ?? client?.monthly_emi ?? 0);
    return round2(emi > 0 ? Math.min(emi, outstanding) : outstanding);
  };

  const openPaymentModal = (prefill?: number) => {
    setPaymentDate(localDate());
    setPaymentAmount(prefill !== undefined && prefill > 0 ? String(round2(prefill)) : '');
    setPaymentNotes('');
    setPaymentModal(true);
  };

  const handleRecordPayment = async () => {
    if (paySubmitting.current) return; // double-tap guard
    const amount = parseAmount(paymentAmount);
    const outstanding = paymentOutstanding();
    if (amount === null || amount <= 0) {
      Alert.alert(t('error'), ta(language, 'invalidAmount'));
      return;
    }
    if (outstanding !== null && outstanding <= 0.005) {
      Alert.alert(t('error'), ta(language, 'fullyPaid'));
      return;
    }
    if (outstanding !== null && amount > outstanding + 0.005) {
      Alert.alert(t('error'), ta(language, 'amountTooHigh', { max: formatAmount(outstanding) }));
      return;
    }
    paySubmitting.current = true;
    setActionLoading(true);
    let data: any = {};
    let paidAmount = amount;
    const today = localDate();
    try {
      const datePart = paymentDate && paymentDate !== today ? `${paymentDate}T12:00:00` : undefined;
      const endpoint = selectedLoanId
        ? `${API_URL}/api/loans/${selectedLoanId}/payment?amount=${amount}&payment_method=${encodeURIComponent(paymentMethod)}&notes=${encodeURIComponent(paymentNotes || '')}${datePart ? `&payment_date=${encodeURIComponent(datePart)}` : ''}`
        : `${API_URL}/api/loans/${id}/payments`;

      const response = await authedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: selectedLoanId
          ? undefined
          : JSON.stringify({ amount, payment_method: paymentMethod, notes: paymentNotes, ...(datePart ? { payment_date: datePart } : {}) }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Failed to record payment'));
      data = (await response.json().catch(() => null)) ?? {};
    } catch (error: any) {
      // A timeout may still have been recorded by the server: the admin must check before retrying.
      const aborted = error?.name === 'AbortError';
      Alert.alert(
        t('error'),
        aborted
          ? (language === 'et'
              ? 'Server ei vastanud õigel ajal. Makse võib olla salvestatud – kontrollige makseajalugu enne uuesti proovimist.'
              : 'The server did not answer in time. The payment may have been recorded – check the payment history before trying again.')
          : (error?.message || 'Failed to record payment'),
      );
      if (aborted) { invalidateClients(); fetchClient(); setLoanRefreshKey(prev => prev + 1); }
      paySubmitting.current = false;
      setActionLoading(false);
      return;
    }

    // The payment IS recorded from here on: nothing below may report it as failed.
    try {
      const pick = (...vals: any[]) => {
        for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
        return null;
      };
      let newOutstanding = pick(data.new_outstanding, data.updated_balance?.outstanding_balance, data.outstanding_balance);
      paidAmount = pick(data.payment_amount, data.payment?.amount) ?? amount;

      setPaymentModal(false);
      setPaymentAmount('');
      const notes = paymentNotes;
      setPaymentNotes('');
      setSelectedLoanId(null);
      setSelectedLoan(null);
      setLoanRefreshKey(prev => prev + 1);
      invalidateClients();
      const refreshed = await fetchClient().catch(() => null);
      if (newOutstanding === null && refreshed && numOrNull(refreshed.outstanding_balance) !== null) {
        newOutstanding = numOrNull(refreshed.outstanding_balance);
      }
      // "Fully paid" only when the server says so, or we KNOW the balance is zero.
      const fullyPaid = data.loan_fully_paid === true || (newOutstanding !== null && newOutstanding <= 0.005);
      setReceipt({
        amount: paidAmount,
        date: paymentDate || today,
        method: paymentMethod,
        outstanding: newOutstanding,
        fullyPaid,
        notes,
        ref: data.payment?.id || data.payment_id || data.id,
      });
    } catch {
      setReceipt({ amount: paidAmount, date: paymentDate, method: paymentMethod, outstanding: null, fullyPaid: false, notes: '' });
    } finally {
      paySubmitting.current = false;
      setActionLoading(false);
    }
  };

  const shareReceipt = async () => {
    if (!receipt || !client) return;
    const methodLabel = receipt.method === 'cash' ? t('cash') : receipt.method === 'bank_transfer' ? t('transfer') : t('card');
    const lines = [
      `PayLock – ${ta(language, 'receipt')}`,
      `${t('client') || 'Client'}: ${client.name}`,
      `${ta(language, 'paid')}: ${formatAmount(receipt.amount)}`,
      `${ta(language, 'paymentDate')}: ${receipt.date}`,
      `${t('paymentMethod')}: ${methodLabel}`,
      receipt.outstanding !== null ? `${ta(language, 'outstanding')}: ${formatAmount(receipt.outstanding)}` : '',
      receipt.fullyPaid ? ta(language, 'fullyPaid') : '',
      receipt.notes ? `${t('notesOptional')}: ${receipt.notes}` : '',
      receipt.ref ? `Ref: ${String(receipt.ref).slice(0, 8)}` : '',
    ].filter(Boolean);
    try { await Share.share({ message: lines.join('\n') }); } catch {}
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
      const token = await getSecureItem('admin_token');
      const params = new URLSearchParams({
        loan_amount: editLoanAmount, interest_rate: editInterestRate,
        loan_start_date: editLoanStartDate, due_date: editLoanDueDate, admin_token: token || '',
      });
      const response = await authedFetch(`${API_URL}/api/loans/${id}/preview?${params.toString()}`);
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
      const token = await getSecureItem('admin_token');
      
      // Use the specific loan ID if editing individual loan, otherwise use client ID
      const endpoint = selectedLoanId 
        ? `${API_URL}/api/loans/${selectedLoanId}?admin_token=${token}&loan_amount=${parseFloat(editLoanAmount)}&interest_rate=${parseFloat(editInterestRate)}${editLoanStartDate ? `&loan_given_date=${editLoanStartDate}` : ''}${editLoanDueDate ? `&due_date=${editLoanDueDate}` : ''}`
        : `${API_URL}/api/loans/${id}/edit?admin_token=${token}`;
      
      const response = selectedLoanId
        ? await authedFetch(endpoint, { method: 'PUT' })
        : await authedFetch(endpoint, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              loan_amount: parseFloat(editLoanAmount), interest_rate: parseFloat(editInterestRate),
              loan_start_date: editLoanStartDate || undefined, due_date: editLoanDueDate || undefined,
            }),
          });
      
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.detail || 'Failed to update loan'); }
      const data = await response.json();
      
      const successMsg = selectedLoanId
        ? `Loan updated successfully!`
        : `Loan updated!\n\nMonthly EMI: ${formatAmount(data.loan_details?.monthly_emi || 0)}\nTotal: ${formatAmount(data.loan_details?.total_amount_due || 0)}`;
      
      Alert.alert(t('success'), language === 'et' ? 'Laen uuendatud!' : successMsg);
      setEditLoanModal(false);
      setSelectedLoanId(null);
      setSelectedLoan(null);
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

  // The deployed server needs ?admin_token= on the contract URL. The file is downloaded inside
  // the app (never opened in the browser) so the token does not end up in browser history.
  const handleShareContract = async () => {
    try {
      const token = await getSecureItem('admin_token');
      if (!token) return;
      const downloadUrl = `${API_URL}/api/contracts/${id}/download?admin_token=${encodeURIComponent(token)}&language=${language}`;
      const fileUri = `${FileSystem.cacheDirectory}loan-contract-${id}.pdf`;
      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri);
      if (downloadResult.status === 401) { await authedFetch(`${API_URL}/api/admin/credits`); return; }
      if (downloadResult.status && downloadResult.status >= 400) throw new Error(`Contract download failed (${downloadResult.status})`);
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
  const handleDownloadContract = handleShareContract;

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

  if (!client) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>{t('clientDetails')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Ionicons name="cloud-offline" size={48} color="#F59E0B" />
          <Text style={{ color: colors.text, marginVertical: 12, textAlign: 'center' }}>{ta(language, 'offlineBanner')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); fetchClient(); }} style={{ backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{ta(language, 'retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
        {offline && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#B45309', marginHorizontal: 16, marginTop: 12, padding: 10, borderRadius: 10 }}>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={{ color: '#fff', flex: 1, marginLeft: 8, fontSize: 13 }}>{ta(language, 'offlineBanner')}</Text>
          </View>
        )}
        <ClientInfoCard
          client={client}
          language={language}
          colors={colors}
          t={t}
          isSuperAdmin={isSuperAdmin}
          generatingCode={generatingCode}
          onGenerateCode={handleGenerateCode}
          canAccessCreditScore={canAccess('credit_scoring')}
          canAccessDeviceLock={canAccess('device_lock')}
          canAccessRegistrationCode={canAccess('registration_code')}
        />

        <LockStatusBanner client={client} language={language} refreshKey={lockSyncKey} />

        <ContactInfo
          client={client}
          language={language}
          t={t}
          onEdit={openEditClientModal}
        />

        {/* Device Info - Professional Feature, hidden when uninstall allowed */}
        {!client.uninstall_allowed && canAccess('device_info') ? (
          <>
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
          {id ? <DeviceHealthCard clientId={String(id)} client={client} colors={colors} language={language} /> : null}
          </>
        ) : !client.uninstall_allowed ? (
          <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: '#1E3A5F', borderRadius: 12, padding: 16, alignItems: 'center' }}>
            <View style={{ backgroundColor: 'rgba(100, 116, 139, 0.2)', borderRadius: 50, padding: 12, marginBottom: 8 }}>
              <Ionicons name="phone-portrait-outline" size={24} color="#64748B" />
            </View>
            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
              Device information requires Professional plan
            </Text>
          </View>
        ) : null}

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
            <MultiLoanOverview
              clientId={id}
              clientName={client?.name}
              refreshKey={loanRefreshKey}
              adminPlan={plan}
              onRecordPayment={(loanId, loan, dueTodayAmount) => {
                setSelectedLoanId(loanId);
                setSelectedLoan(loan);
                openPaymentModal(dueTodayAmount > 0 ? dueTodayAmount : 0);
              }}
              onAddNewLoan={() => router.push(`/admin/add-loan?clientId=${id}`)}
              onEditLoan={(loanId, loan) => {
                setSelectedLoanId(loanId);
                setSelectedLoan(loan);
                setEditLoanAmount(String(loan.loan_amount || ''));
                setEditInterestRate(String(loan.interest_rate || ''));
                setEditLoanStartDate(loan.loan_given_date || '');
                setEditLoanDueDate(loan.due_date || '');
                setEditLoanModal(true);
              }}
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
          onToggleLock={canAccess('device_lock') ? (client.is_locked ? handleUnlock : () => setLockModal(true)) : () => Alert.alert('Professional Feature', 'Device lock/unlock requires the Professional plan.', [{ text: 'OK' }])}
          onAllowUninstall={handleAllowUninstall}
          canAccessDeviceLock={canAccess('device_lock')}
        />

        {/* Documents Button */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 16, paddingHorizontal: 16 }}>
          {canAccess('document_vault') ? (
            <TouchableOpacity onPress={() => setDocVaultModal(true)}
              style={{ flex: 1, backgroundColor: '#1E3A5F', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="folder" size={18} color="#10B981" />
              <Text style={{ color: '#A7F3D0', fontWeight: '600', fontSize: 13, marginLeft: 6 }}>Documents</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              onPress={() => Alert.alert('Enterprise Feature', 'Document vault requires the Enterprise plan or higher. Would you like to upgrade?', [
                { text: t('cancel'), style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/admin/settings') },
              ])}
              style={{ flex: 1, backgroundColor: '#1E3A5F', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
              <Ionicons name="lock-closed" size={18} color="#64748B" />
              <Text style={{ color: '#64748B', fontWeight: '600', fontSize: 13, marginLeft: 6 }}>Documents</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Chat FAB - Only for enterprise/custom plans */}
      {(plan === 'enterprise' || plan === 'custom') && (
      <TouchableOpacity
        style={{
          position: 'absolute', bottom: 60, right: 24, backgroundColor: '#10B981',
          width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center',
          elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, zIndex: 100,
        }}
        onPress={async () => {
          setShowChat(true);
          setChatLoading(true);
          try {
            const token = await getAdminToken();
            const resp = await authedFetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
            if (resp.ok) {
              const data = await resp.json();
              setChatMessages(data.messages || []);
              authedFetch(`${API_URL}/api/messages/mark-read?client_id=${id}&admin_token=${token}`, { method: 'POST' }).catch(() => {});
            }
          } catch (e) { console.log('Chat fetch error', e); }
          setChatLoading(false);
          setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 200);
        }}
        data-testid="admin-chat-fab"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </TouchableOpacity>
      )}

      {/* Chat Modal */}
      {showChat && (
        <Modal visible={showChat} animationType="slide" transparent onRequestClose={() => setShowChat(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

                <ScrollView ref={chatScrollRef} style={{ flex: 1, marginBottom: 12 }} contentContainerStyle={{ padding: 10 }} onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}>
                  {chatLoading ? (
                    <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
                  ) : chatMessages.length === 0 ? (
                    <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>No messages yet. Start a conversation.</Text>
                  ) : (
                    chatMessages.map((msg, i) => {
                      // Date grouping: show date separator when date changes
                      const msgDate = msg.created_at ? new Date(msg.created_at).toLocaleDateString() : '';
                      const prevMsgDate = i > 0 && chatMessages[i - 1].created_at 
                        ? new Date(chatMessages[i - 1].created_at).toLocaleDateString() 
                        : '';
                      const showDateSep = msgDate && msgDate !== prevMsgDate;
                      
                      return (
                        <View key={msg.id || i}>
                          {showDateSep && (
                            <View style={{ alignItems: 'center', marginVertical: 12 }}>
                              <View style={{ backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
                                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>{msgDate}</Text>
                              </View>
                            </View>
                          )}
                          <View style={{
                            alignSelf: msg.sender_type === 'admin' ? 'flex-end' : 'flex-start',
                            backgroundColor: msg.sender_type === 'admin' ? '#10B981' : colors.surface,
                            padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: '80%',
                          }}>
                            <Text style={{ color: msg.sender_type === 'admin' ? '#fff' : colors.text, fontSize: 14 }}>{msg.text}</Text>
                            <Text style={{ color: msg.sender_type === 'admin' ? '#A7F3D0' : colors.textMuted, fontSize: 10, marginTop: 4 }}>
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 16 }}>
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
                        const resp = await authedFetch(`${API_URL}/api/messages?client_id=${id}&text=${encodeURIComponent(chatText)}&admin_token=${token}`, { method: 'POST' });
                        if (resp.ok) {
                          setChatText('');
                          const refreshResp = await authedFetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
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
                        const resp = await authedFetch(`${API_URL}/api/messages?client_id=${id}&text=${encodeURIComponent(chatText)}&admin_token=${token}`, { method: 'POST' });
                        if (resp.ok) {
                          setChatText('');
                          const refreshResp = await authedFetch(`${API_URL}/api/messages?client_id=${id}&admin_token=${token}`);
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
      )}

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
        paymentDate={paymentDate}
        onChangeDate={setPaymentDate}
        dueAmount={paymentDue()}
        fullAmount={paymentOutstanding() ?? 0}
        onPayDue={() => setPaymentAmount(String(paymentDue()))}
        onPayFull={() => setPaymentAmount(String(round2(paymentOutstanding() ?? 0)))}
        formatAmount={formatAmount}
      />
      <ConfirmDeleteModal
        visible={deleteModal}
        clientName={client?.name || ''}
        language={language}
        blockedRegistered={!!client?.is_registered && !client?.uninstall_allowed}
        busy={actionLoading}
        onCancel={() => setDeleteModal(false)}
        onConfirm={performDelete}
        cancelLabel={t('cancel')}
      />
      <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#152035', borderRadius: 16, padding: 20 }}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 6 }}>{ta(language, 'paymentRecorded')}</Text>
            </View>
            {receipt && (
              <>
                <Text style={{ color: '#CBD5E1', fontSize: 15, marginVertical: 2 }}>{ta(language, 'paid')}: {formatAmount(receipt.amount)}</Text>
                <Text style={{ color: '#CBD5E1', fontSize: 15, marginVertical: 2 }}>
                  {receipt.outstanding !== null ? `${ta(language, 'outstanding')}: ${formatAmount(receipt.outstanding)}` : ta(language, 'balanceUnknown')}
                </Text>
                {receipt.fullyPaid && <Text style={{ color: '#10B981', fontWeight: '700', marginTop: 6 }}>{ta(language, 'fullyPaid')}</Text>}
              </>
            )}
            <View style={{ flexDirection: 'row', marginTop: 16 }}>
              <TouchableOpacity onPress={() => setReceipt(null)} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#334155', alignItems: 'center', marginRight: 8 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{ta(language, 'done')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareReceipt} style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{ta(language, 'shareReceipt')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
        lockLevel={lockLevel}
        onChangeLevel={setLockLevel}
        lockAllowlist={lockAllowlist}
        onChangeAllowlist={setLockAllowlist}
        restrictedSupported={client?.device_owner_active != null ? !!client.device_owner_active : client?.lock_mode === 'device_owner'}
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

      {/* Document Vault Modal */}
      <DocumentVaultModal
        clientId={client?.id || ''}
        clientName={client?.name || ''}
        adminToken={adminToken}
        colors={colors}
        visible={docVaultModal}
        onClose={() => setDocVaultModal(false)}
      />
    </SafeAreaView>
  );
}
