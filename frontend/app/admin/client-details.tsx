import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

interface LoanDetails {
  loan_amount: number;
  total_amount_due: number;
  total_paid: number;
  outstanding_balance: number;
  monthly_emi: number;
  next_payment_due: string | null;
  days_overdue: number;
}


interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  device_id: string;
  device_model: string;
  device_make: string;
  used_price_eur: number | null;
  price_fetched_at: string | null;
  registration_code: string;
  emi_amount: number;
  emi_due_date: string | null;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  latitude: number | null;
  longitude: number | null;
  last_location_update: string | null;
  is_registered: boolean;
  registered_at: string | null;
  created_at: string;
  tamper_attempts: number;
  last_tamper_attempt: string | null;
  last_reboot: string | null;
  admin_mode_active?: boolean;
  uninstall_allowed?: boolean;
  // Loan fields
  loan_amount?: number;
  total_amount_due?: number;
  total_paid?: number;
  outstanding_balance?: number;
  monthly_emi?: number;
  next_payment_due?: string | null;
  days_overdue?: number;
  loan_start_date?: string | null;
}

export default function ClientDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t, language } = useLanguage();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [warningModal, setWarningModal] = useState(false);
  const [lockModal, setLockModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [editDeviceModal, setEditDeviceModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [editDeviceMake, setEditDeviceMake] = useState('');
  const [editDeviceModel, setEditDeviceModel] = useState('');
  const [editDevicePrice, setEditDevicePrice] = useState('');
  const [userCredits, setUserCredits] = useState<number>(5);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  
  const getAdminToken = async () => {
    return await AsyncStorage.getItem('admin_token');
  };

  const buildAdminTokenQuery = async (hasQuery = false) => {
    const token = await getAdminToken();
    return token ? `${hasQuery ? '&' : '?'}admin_token=${token}` : '';
  };

  const fetchCredits = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (token) {
        const response = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
        if (response.ok) {
          const data = await response.json();
          setUserCredits(data.credits);
          setIsSuperAdmin(data.is_super_admin);
        }
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  const fetchClient = async () => {
    try {
      const token = await getAdminToken();
      if (!token) {
        Alert.alert(t('error'), 'Not authenticated');
        router.back();
        return;
      }
      const response = await fetch(`${API_URL}/api/clients/${id}?admin_token=${token}`);
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
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

  useEffect(() => {
    fetchClient();
    fetchCredits();
  }, [id]);

  const handleGenerateCode = async () => {
    // Credit check for non-superadmin users
    if (!isSuperAdmin && userCredits <= 0) {
      Alert.alert(
        language === 'et' ? 'Krediidid puuduvad' : 'No Credits',
        language === 'et' 
          ? 'Teil pole krediite võtme genereerimiseks. Palun pöörduge peaadmini poole.'
          : 'You have no credits to generate a key. Please contact the superadmin.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      language === 'et' ? 'Genereeri uus võti' : 'Generate New Key',
      language === 'et' 
        ? `See kulutab 1 krediiti. Teie saldo: ${isSuperAdmin ? '∞' : userCredits}. Jätkata?`
        : `This will use 1 credit. Your balance: ${isSuperAdmin ? '∞' : userCredits}. Continue?`,
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        {
          text: language === 'et' ? 'Genereeri' : 'Generate',
          onPress: async () => {
            setGeneratingCode(true);
            try {
              const token = await AsyncStorage.getItem('admin_token');
              if (!token) {
                Alert.alert(t('error'), 'Not authenticated');
                return;
              }
              
              const response = await fetch(`${API_URL}/api/clients/${id}/generate-code?admin_token=${token}`, {
                method: 'POST',
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.detail || 'Failed to generate code');
              }
              
              const data = await response.json();
              
              // Update client with new registration code
              if (client) {
                setClient({ ...client, registration_code: data.registration_code });
              }
              
              // Show the generated key
              setShowGeneratedKey(true);
              
              // Update credits
              if (!isSuperAdmin) {
                setUserCredits(prev => prev - 1);
              }
              
              Alert.alert(
                language === 'et' ? 'Õnnestus' : 'Success',
                language === 'et' 
                  ? `Uus registreerimiskood: ${data.registration_code}`
                  : `New registration code: ${data.registration_code}`
              );
            } catch (error: any) {
              Alert.alert(t('error'), error.message);
            } finally {
              setGeneratingCode(false);
            }
          },
        },
      ]
    );
  };

  const handleLock = async () => {
    setActionLoading(true);
    try {
      const adminQuery = await buildAdminTokenQuery(true);
      const response = await fetch(`${API_URL}/api/clients/${id}/lock?message=${encodeURIComponent(lockMessage)}${adminQuery}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to lock device');
      await fetchClient();
      setLockModal(false);
      Alert.alert(t('success'), t('deviceLockedSuccess'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
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
            const response = await fetch(`${API_URL}/api/clients/${id}/unlock${adminQuery}`, {
              method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to unlock device');
            await fetchClient();
            Alert.alert(t('success'), t('deviceUnlockedSuccess'));
          } catch (error: any) {
            Alert.alert(t('error'), error.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleSendWarning = async () => {
    if (!warningMessage.trim()) {
      Alert.alert(t('error'), t('enterWarningMessage'));
      return;
    }
    setActionLoading(true);
    try {
      const adminQuery = await buildAdminTokenQuery(true);
      const response = await fetch(
        `${API_URL}/api/clients/${id}/warning?message=${encodeURIComponent(warningMessage)}${adminQuery}`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error('Failed to send warning');
      await fetchClient();
      setWarningModal(false);
      setWarningMessage('');
      Alert.alert(t('success'), t('warningSentSuccess'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAllowUninstall = async () => {
    Alert.alert(
      'Allow App Uninstall',
      'This will signal the device to disable its protection, allowing the app to be uninstalled. Continue?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Allow',
          style: 'default',
          onPress: async () => {
            setActionLoading(true);
            try {
              const adminQuery = await buildAdminTokenQuery();
              const response = await fetch(`${API_URL}/api/clients/${id}/allow-uninstall${adminQuery}`, {
                method: 'POST',
              });
              if (!response.ok) throw new Error('Failed to allow uninstall');
              const data = await response.json();
              Alert.alert(t('success'), data.message + '\n\nYou can now delete this client.');
              await fetchClient(); // Refresh to show updated status
            } catch (error: any) {
              Alert.alert(t('error'), error.message);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    Alert.alert(
      language === 'et' ? 'Kustuta klient' : 'Delete Client',
      language === 'et' ? 'Kas olete kindel? See lubab ka rakenduse desinstallimise.' : 'Are you sure? This will also allow app uninstall on the device.',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: language === 'et' ? 'Jah, kustuta' : 'Yes, Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              const adminQuery = await buildAdminTokenQuery();
              // Step 1: Allow uninstall first
              const uninstallRes = await fetch(`${API_URL}/api/clients/${id}/allow-uninstall${adminQuery}`, {
                method: 'POST',
              });
              if (!uninstallRes.ok) {
                const err = await uninstallRes.json();
                throw new Error(err.detail || 'Failed to allow uninstall');
              }
              // Step 2: Delete client
              const deleteRes = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
                method: 'DELETE',
              });
              if (!deleteRes.ok) {
                const err = await deleteRes.json();
                throw new Error(err.detail || 'Failed to delete client');
              }
              Alert.alert(t('success'), t('clientDeletedSuccess'));
              router.back();
            } catch (error: any) {
              Alert.alert(t('error'), error.message);
            } finally {
              setActionLoading(false);
            }
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
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to fetch price');
      }
      const data = await response.json();
      // Refresh client data to show updated price
      await fetchClient();
      Alert.alert(
        t('success'),
        `${t('devicePrice')}: €${data.used_price_eur}\n${data.note || ''}`
      );
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setFetchingPrice(false);
    }
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
        if (!isNaN(priceNum) && priceNum >= 0) {
          updateData.used_price_eur = priceNum;
        }
      }

      const adminQuery = await buildAdminTokenQuery();
      const response = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) throw new Error('Failed to update device info');
      
      await fetchClient();
      setEditDeviceModal(false);
      Alert.alert(t('success'), t('deviceInfoUpdated'));
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount) {
      Alert.alert(t('error'), language === 'et' ? 'Palun sisesta summa' : 'Please enter payment amount');
      return;
    }

    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/loans/${id}/payments?admin_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          payment_method: paymentMethod,
          notes: paymentNotes,
        }),
      });

      if (!response.ok) throw new Error('Failed to record payment');
      
      const data = await response.json();
      Alert.alert(
        t('success'),
        language === 'et' 
          ? `Makse salvestatud!\n\nMakstud: €${data.payment.amount}\nJääk: €${data.updated_balance.outstanding_balance.toFixed(2)}`
          : `Payment recorded!\n\nPaid: €${data.payment.amount}\nOutstanding: €${data.updated_balance.outstanding_balance.toFixed(2)}`
      );
      setPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchClient();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openMap = () => {
    if (client?.latitude && client?.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`;
      Linking.openURL(url);
    } else {
      Alert.alert(t('error'), t('locationNotAvailable'));
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </SafeAreaView>
    );
  }

  if (!client) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('clientDetails')}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Client Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.clientName}>{client.name}</Text>
        <View style={[styles.statusBadge, client.is_locked ? styles.lockedBadge : styles.unlockedBadge]}>
          <Ionicons
            name={client.is_locked ? 'lock-closed' : 'lock-open'}
            size={14}
            color={client.is_locked ? '#EF4444' : '#10B981'}
          />
          <Text style={[styles.statusText, client.is_locked ? styles.lockedText : styles.unlockedText]}>
            {client.is_locked ? t('locked') : t('unlocked')}
          </Text>
        </View>
        {/* Admin Mode Status Badge */}
        {client.is_registered && (
          <View style={[styles.statusBadge, client.admin_mode_active ? styles.adminModeBadge : styles.adminModeOffBadge]}>
            <Ionicons
              name={client.admin_mode_active ? 'shield-checkmark' : 'shield'}
              size={14}
              color={client.admin_mode_active ? '#3B82F6' : '#F59E0B'}
            />
            <Text style={[styles.statusText, client.admin_mode_active ? styles.adminModeText : styles.adminModeOffText]}>
              {client.admin_mode_active 
                ? (language === 'et' ? 'Admin režiim SEES' : 'Admin mode ON')
                : (language === 'et' ? 'Admin režiim VÄLJAS' : 'Admin mode OFF')}
            </Text>
          </View>
        )}
        <View style={styles.regCodeRow}>
          {client.registration_code ? (
            <>
              <Text style={styles.regCode}>{t('registrationCode')}: {client.registration_code}</Text>
              <TouchableOpacity
                style={styles.copyButton}
                onPress={async () => {
                  await Share.share({ message: client.registration_code });
                }}
              >
                <Ionicons name="copy" size={18} color="#94A3B8" />
                <Text style={styles.copyText}>{t('copy')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.regCodeHidden}>
              {language === 'et' ? 'Võtit pole veel genereeritud' : 'Key not generated yet'}
            </Text>
          )}
        </View>
        {/* Generate Key Button - only show if key not yet generated */}
        {!client.registration_code && (
          <TouchableOpacity
            style={[
              styles.generateKeyButton,
              (!isSuperAdmin && userCredits <= 0) && styles.generateKeyButtonDisabled
            ]}
            onPress={handleGenerateCode}
            disabled={generatingCode}
            data-testid="generate-key-button"
          >
            {generatingCode ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="key" size={16} color="#fff" />
                <Text style={styles.generateKeyButtonText}>
                  {language === 'et' ? 'Genereeri võti' : 'Generate key'}
                </Text>
              </>
            )}
            <View style={styles.creditBadge}>
              <Ionicons name="ticket" size={12} color="#F59E0B" />
              <Text style={styles.creditBadgeText}>
                {isSuperAdmin ? '∞' : userCredits}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('contactInfo')}</Text>
          <View style={styles.infoRow}>
            <Ionicons name="call" size={18} color="#64748B" />
            <Text style={styles.infoText}>{client.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="mail" size={18} color="#64748B" />
            <Text style={styles.infoText}>{client.email}</Text>
          </View>
        </View>

        {/* EMI Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('emiDetails')}</Text>
          <View style={styles.emiCard}>
            <View style={styles.emiItem}>
              <Text style={styles.emiLabel}>{t('amount')}</Text>
              <Text style={styles.emiValue}>€{client.emi_amount.toLocaleString()}</Text>
            </View>
            <View style={styles.emiDivider} />
            <View style={styles.emiItem}>
              <Text style={styles.emiLabel}>{t('dueDate')}</Text>
              <Text style={styles.emiValue}>{client.emi_due_date || t('notSet')}</Text>
            </View>
          </View>
        </View>

        {/* Device Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('deviceInfo')}</Text>
            {client.is_registered && (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={openEditDeviceModal}
              >
                <Ionicons name="create-outline" size={18} color="#4F46E5" />
                <Text style={styles.editButtonText}>{t('edit')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {client.is_registered ? (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="phone-portrait" size={18} color="#64748B" />
                <Text style={styles.infoText}>{client.device_model || 'Unknown'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="finger-print" size={18} color="#64748B" />
                <Text style={styles.infoText}>{client.device_id || 'N/A'}</Text>
              </View>
              <TouchableOpacity style={styles.locationButton} onPress={openMap}>
                <Ionicons name="location" size={18} color="#3B82F6" />
                <Text style={styles.locationText}>
                  {client.latitude ? t('viewLocationOnMap') : t('locationNotAvailable')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.notRegistered}>
              <Ionicons name="time" size={24} color="#F59E0B" />
              <Text style={styles.notRegisteredText}>{t('deviceNotRegistered')}</Text>
            </View>
          )}
        </View>

        {/* Device Price Section */}
        {client.is_registered && client.device_model && client.device_model !== 'Unknown Device' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('estimatedValue')}</Text>
              <TouchableOpacity 
                style={styles.fetchPriceButton}
                onPress={handleFetchPrice}
                disabled={fetchingPrice}
              >
                {fetchingPrice ? (
                  <ActivityIndicator size="small" color="#4F46E5" />
                ) : (
                  <>
                    <Ionicons name="sync" size={16} color="#4F46E5" />
                    <Text style={styles.fetchPriceText}>{t('fetchPrice')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            
            {client.used_price_eur ? (
              <View style={styles.priceCard}>
                <View style={styles.priceIconContainer}>
                  <Ionicons name="pricetag" size={32} color="#10B981" />
                </View>
                <View style={styles.priceInfo}>
                  <Text style={styles.priceLabel}>{t('usedPrice')}</Text>
                  <Text style={styles.priceValue}>€{client.used_price_eur.toFixed(2)}</Text>
                  {client.price_fetched_at && (
                    <Text style={styles.priceDate}>
                      {new Date(client.price_fetched_at).toLocaleDateString('et-EE')}
                    </Text>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.noPriceCard}>
                <Ionicons name="information-circle" size={24} color="#64748B" />
                <Text style={styles.noPriceText}>{t('priceNotFetched')}</Text>
              </View>
            )}
          </View>
        )}

        {/* Loan Overview Section */}
        {client.loan_start_date && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{language === 'et' ? 'Laenu ülevaade' : 'Loan Overview'}</Text>
              <TouchableOpacity 
                style={styles.recordPaymentBtn}
                onPress={() => {
                  setPaymentAmount(client.monthly_emi?.toFixed(2) || '');
                  setPaymentModal(true);
                }}
              >
                <Ionicons name="card" size={16} color="#10B981" />
                <Text style={styles.recordPaymentBtnText}>{language === 'et' ? 'Lisa makse' : 'Record Payment'}</Text>
              </TouchableOpacity>
            </View>
            
            {/* Loan Progress */}
            <View style={styles.loanProgressCard}>
              <View style={styles.loanProgressBar}>
                <View 
                  style={[
                    styles.loanProgressFill, 
                    { width: `${client.total_amount_due ? (client.total_paid || 0) / client.total_amount_due * 100 : 0}%` }
                  ]} 
                />
              </View>
              <Text style={styles.loanProgressText}>
                {client.total_amount_due ? ((client.total_paid || 0) / client.total_amount_due * 100).toFixed(1) : 0}% {language === 'et' ? 'makstud' : 'paid'}
              </Text>
            </View>
            
            <View style={styles.loanStatsGrid}>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>{language === 'et' ? 'Laen kokku' : 'Total Loan'}</Text>
                <Text style={styles.loanStatValue}>€{(client.total_amount_due || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>{language === 'et' ? 'Makstud' : 'Paid'}</Text>
                <Text style={[styles.loanStatValue, { color: '#10B981' }]}>€{(client.total_paid || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>{language === 'et' ? 'Jääk' : 'Outstanding'}</Text>
                <Text style={[styles.loanStatValue, { color: '#EF4444' }]}>€{(client.outstanding_balance || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>{language === 'et' ? 'Kuumakse' : 'Monthly Payment'}</Text>
                <Text style={styles.loanStatValue}>€{(client.monthly_emi || 0).toFixed(2)}</Text>
              </View>
            </View>
            
            {(client.days_overdue || 0) > 0 && (
              <View style={styles.overdueAlert}>
                <Ionicons name="warning" size={20} color="#EF4444" />
                <Text style={styles.overdueAlertText}>
                  {client.days_overdue} {language === 'et' ? 'päeva üle tähtaja' : 'days overdue'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons - only show if device is registered */}
        {client.is_registered && (
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
            
            {/* Record Payment Button (if no loan_start_date, show option to go to loan management) */}
            {!client.loan_start_date && (
              <TouchableOpacity
                style={[styles.actionButton, styles.setupLoanButton]}
                onPress={() => router.push(`/admin/loan-management?id=${client.id}`)}
                disabled={actionLoading}
              >
                <Ionicons name="wallet" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>{language === 'et' ? 'Seadista laen' : 'Setup Loan'}</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.actionButton, client.is_locked ? styles.unlockButton : styles.lockButton]}
              onPress={client.is_locked ? handleUnlock : () => setLockModal(true)}
              disabled={actionLoading}
            >
              <Ionicons name={client.is_locked ? 'lock-open' : 'lock-closed'} size={20} color="#fff" />
              <Text style={styles.actionButtonText}>
                {client.is_locked ? t('unlockDevice') : t('lockDevice')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.warningButton]}
              onPress={() => setWarningModal(true)}
              disabled={actionLoading}
            >
              <Ionicons name="warning" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>{t('sendWarning')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.allowUninstallButton]}
              onPress={handleAllowUninstall}
              disabled={actionLoading}
            >
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Allow Uninstall</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={paymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{language === 'et' ? 'Salvesta makse' : 'Record Payment'}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Summa (€)' : 'Amount (€)'}</Text>
              <TextInput
                style={styles.paymentInput}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder={(client.monthly_emi || 0).toFixed(2)}
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Makseviis' : 'Payment Method'}</Text>
              <View style={styles.methodButtons}>
                {['cash', 'bank_transfer', 'card'].map((method) => (
                  <TouchableOpacity
                    key={method}
                    style={[
                      styles.methodButton,
                      paymentMethod === method && styles.methodButtonActive
                    ]}
                    onPress={() => setPaymentMethod(method)}
                  >
                    <Text style={[
                      styles.methodButtonText,
                      paymentMethod === method && styles.methodButtonTextActive
                    ]}>
                      {method === 'cash' ? (language === 'et' ? 'Sularaha' : 'Cash') :
                       method === 'bank_transfer' ? (language === 'et' ? 'Ülekanne' : 'Transfer') :
                       (language === 'et' ? 'Kaart' : 'Card')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{language === 'et' ? 'Märkmed (valikuline)' : 'Notes (Optional)'}</Text>
              <TextInput
                style={[styles.paymentInput, styles.textArea]}
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                placeholder={language === 'et' ? 'Makse märkmed...' : 'Payment notes...'}
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setPaymentModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.paymentConfirmButton]}
                onPress={handleRecordPayment}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{language === 'et' ? 'Salvesta' : 'Record'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Warning Modal */}
      <Modal visible={warningModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('sendWarning')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('enterWarningMessage')}
              placeholderTextColor="#64748B"
              value={warningMessage}
              onChangeText={setWarningMessage}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setWarningModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleSendWarning}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t('send')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lock Modal */}
      <Modal visible={lockModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('lockDevice')}</Text>
            <Text style={styles.modalSubtitle}>{t('customizeLockMessage')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('enterLockMessage')}
              placeholderTextColor="#64748B"
              value={lockMessage}
              onChangeText={setLockMessage}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setLockModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.lockConfirmButton]}
                onPress={handleLock}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t('lock')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Device Info Modal */}
      <Modal visible={editDeviceModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('editDeviceInfo')}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('deviceMake')}</Text>
              <TextInput
                style={styles.modalInput}
                value={editDeviceMake}
                onChangeText={setEditDeviceMake}
                placeholder={t('deviceMake')}
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('deviceModel')}</Text>
              <TextInput
                style={styles.modalInput}
                value={editDeviceModel}
                onChangeText={setEditDeviceModel}
                placeholder={t('deviceModel')}
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('usedPrice')} (EUR)</Text>
              <TextInput
                style={styles.modalInput}
                value={editDevicePrice}
                onChangeText={setEditDevicePrice}
                placeholder="0.00"
                placeholderTextColor="#64748B"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setEditDeviceModal(false)}
              >
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleSaveDeviceInfo}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>{t('saveChanges')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  clientName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 8,
  },
  lockedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  unlockedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  adminModeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    marginTop: 6,
  },
  adminModeOffBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    marginTop: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lockedText: {
    color: '#EF4444',
  },
  unlockedText: {
    color: '#10B981',
  },
  adminModeText: {
    color: '#3B82F6',
  },
  adminModeOffText: {
    color: '#F59E0B',
  },
  regCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  regCode: {
    fontSize: 14,
    color: '#64748B',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  copyText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  generateKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  generateKeyButtonDisabled: {
    backgroundColor: '#374151',
    opacity: 0.7,
  },
  generateKeyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
    gap: 4,
  },
  creditBadgeText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  regCodeHidden: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  infoText: {
    fontSize: 15,
    color: '#fff',
  },
  emiCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  emiItem: {
    flex: 1,
    alignItems: 'center',
  },
  emiLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  emiValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  emiDivider: {
    width: 1,
    backgroundColor: '#334155',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  locationText: {
    fontSize: 15,
    color: '#3B82F6',
  },
  notRegistered: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  notRegisteredText: {
    fontSize: 15,
    color: '#F59E0B',
  },
  actionsSection: {
    marginBottom: 40,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  lockButton: {
    backgroundColor: '#EF4444',
  },
  unlockButton: {
    backgroundColor: '#10B981',
  },
  warningButton: {
    backgroundColor: '#F59E0B',
  },
  allowUninstallButton: {
    backgroundColor: '#8B5CF6',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    fontSize: 16,
    color: '#fff',
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#334155',
  },
  modalConfirmButton: {
    backgroundColor: '#F59E0B',
  },
  lockConfirmButton: {
    backgroundColor: '#EF4444',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  fetchPriceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4F46E520',
    borderRadius: 8,
  },
  fetchPriceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B98120',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  priceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10B98130',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#10B981',
  },
  priceDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  noPriceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  noPriceText: {
    fontSize: 14,
    color: '#64748B',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4F46E520',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  // Loan section styles
  recordPaymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#10B98120',
    borderRadius: 8,
  },
  recordPaymentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  loanProgressCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  loanProgressBar: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  loanProgressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  loanProgressText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'right',
  },
  loanStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  loanStatItem: {
    flex: 1,
    minWidth: '40%',
  },
  loanStatLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  loanStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  overdueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EF444420',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  overdueAlertText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  setupLoanButton: {
    backgroundColor: '#4F46E5',
  },
  // Payment modal styles
  paymentInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#334155',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  methodButtonActive: {
    backgroundColor: '#10B98120',
    borderColor: '#10B981',
  },
  methodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  methodButtonTextActive: {
    color: '#10B981',
  },
  paymentConfirmButton: {
    backgroundColor: '#10B981',
  },
});
