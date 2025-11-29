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

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  device_id: string;
  device_model: string;
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
}

export default function ClientDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [warningModal, setWarningModal] = useState(false);
  const [lockModal, setLockModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [lockMessage, setLockMessage] = useState('');

  const fetchClient = async () => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}`);
      if (!response.ok) throw new Error('Client not found');
      const data = await response.json();
      setClient(data);
      setLockMessage(data.lock_message);
    } catch (error) {
      Alert.alert('Error', 'Failed to load client details');
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
      Alert.alert('Success', 'Device locked successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async () => {
    Alert.alert('Unlock Device', 'Are you sure you want to unlock this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlock',
        onPress: async () => {
          setActionLoading(true);
          try {
            const response = await fetch(`${API_URL}/api/clients/${id}/unlock`, {
              method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to unlock device');
            await fetchClient();
            Alert.alert('Success', 'Device unlocked successfully');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleSendWarning = async () => {
    if (!warningMessage.trim()) {
      Alert.alert('Error', 'Please enter a warning message');
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
      Alert.alert('Success', 'Warning sent successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert('Delete Client', 'Are you sure you want to delete this client? This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            const response = await fetch(`${API_URL}/api/clients/${id}`, {
              method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete client');
            Alert.alert('Success', 'Client deleted successfully');
            router.back();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const openMap = () => {
    if (client?.latitude && client?.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${client.latitude},${client.longitude}`;
      Linking.openURL(url);
    } else {
      Alert.alert('Location Unavailable', 'No location data available for this device');
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
        <Text style={styles.title}>Client Details</Text>
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
              {client.is_locked ? 'Locked' : 'Unlocked'}
            </Text>
          </View>
          <Text style={styles.regCode}>Registration Code: {client.registration_code}</Text>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
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
          <Text style={styles.sectionTitle}>EMI Details</Text>
          <View style={styles.emiCard}>
            <View style={styles.emiItem}>
              <Text style={styles.emiLabel}>Amount</Text>
              <Text style={styles.emiValue}>₹{client.emi_amount.toLocaleString()}</Text>
            </View>
            <View style={styles.emiDivider} />
            <View style={styles.emiItem}>
              <Text style={styles.emiLabel}>Due Date</Text>
              <Text style={styles.emiValue}>{client.emi_due_date || 'Not set'}</Text>
            </View>
          </View>
        </View>

        {/* Device Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Information</Text>
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
                  {client.latitude ? 'View Location on Map' : 'Location not available'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.notRegistered}>
              <Ionicons name="time" size={24} color="#F59E0B" />
              <Text style={styles.notRegisteredText}>Device not registered yet</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={[styles.actionButton, client.is_locked ? styles.unlockButton : styles.lockButton]}
            onPress={client.is_locked ? handleUnlock : () => setLockModal(true)}
            disabled={actionLoading}
          >
            <Ionicons name={client.is_locked ? 'lock-open' : 'lock-closed'} size={20} color="#fff" />
            <Text style={styles.actionButtonText}>
              {client.is_locked ? 'Unlock Device' : 'Lock Device'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.warningButton]}
            onPress={() => setWarningModal(true)}
            disabled={actionLoading}
          >
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Send Warning</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Warning Modal */}
      <Modal visible={warningModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Warning</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter warning message"
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
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleSendWarning}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Send</Text>
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
            <Text style={styles.modalTitle}>Lock Device</Text>
            <Text style={styles.modalSubtitle}>Customize the lock message shown to the client</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter lock message"
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
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.lockConfirmButton]}
                onPress={handleLock}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Lock</Text>
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
});
