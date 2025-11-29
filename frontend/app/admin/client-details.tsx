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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
}

export default function ClientDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t } = useLanguage();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [warningModal, setWarningModal] = useState(false);
  const [lockModal, setLockModal] = useState(false);
  const [editDeviceModal, setEditDeviceModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');
  const [editDeviceMake, setEditDeviceMake] = useState('');
  const [editDeviceModel, setEditDeviceModel] = useState('');
  const [editDevicePrice, setEditDevicePrice] = useState('');

  const fetchClient = async () => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}`);
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
  }, [id]);

  const handleLock = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/lock?message=${encodeURIComponent(lockMessage)}`, {
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
            const response = await fetch(`${API_URL}/api/clients/${id}/unlock`, {
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
      const response = await fetch(
        `${API_URL}/api/clients/${id}/warning?message=${encodeURIComponent(warningMessage)}`,
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

  const handleDelete = async () => {
    Alert.alert(t('deleteClient'), t('deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            const response = await fetch(`${API_URL}/api/clients/${id}`, {
              method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete client');
            Alert.alert(t('success'), t('clientDeletedSuccess'));
            router.back();
          } catch (error: any) {
            Alert.alert(t('error'), error.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/fetch-price`);
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

      const response = await fetch(`${API_URL}/api/clients/${id}`, {
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
          <Text style={styles.regCode}>{t('registrationCode')}: {client.registration_code}</Text>
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

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>{t('quickActions')}</Text>
          
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
        </View>
      </ScrollView>

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
  regCode: {
    fontSize: 14,
    color: '#64748B',
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
});
