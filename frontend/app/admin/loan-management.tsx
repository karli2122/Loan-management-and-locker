import React, { useState, useEffect } from 'react';
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
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';


interface LoanDetails {
  loan_amount: number;
  interest_rate: number;
  loan_tenure_months: number;
  monthly_emi: number;
  total_amount_due: number;
  total_paid: number;
  outstanding_balance: number;
  loan_start_date: string | null;
  last_payment_date: string | null;
  next_payment_due: string | null;
  days_overdue: number;
  auto_lock_enabled: boolean;
  auto_lock_grace_days: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  recorded_by: string;
}

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  is_locked: boolean;
}

export default function LoanManagement() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t } = useLanguage();
  
  const [client, setClient] = useState<Client | null>(null);
  const [loanDetails, setLoanDetails] = useState<LoanDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [adminId, setAdminId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Modals
  const [setupLoanModal, setSetupLoanModal] = useState(false);
  const [recordPaymentModal, setRecordPaymentModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [editLoanModal, setEditLoanModal] = useState(false);
  
  // Loan setup form
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('10');
  const [tenure, setTenure] = useState('12');
  
  // Edit loan form
  const [editLoanAmount, setEditLoanAmount] = useState('');
  const [editInterestRate, setEditInterestRate] = useState('');
  const [editTenure, setEditTenure] = useState('');
  
  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  
  // Settings
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [graceDays, setGraceDays] = useState('3');

  useEffect(() => {
    fetchData();
  }, [id]);

  const getAdminId = async () => {
    if (adminId) return adminId;
    const stored = await AsyncStorage.getItem('admin_id');
    if (stored) {
      setAdminId(stored);
      return stored;
    }
    return null;
  };

  const fetchData = async () => {
    try {
      const scope = await getAdminId();
      const adminQuery = scope ? `?admin_id=${scope}` : '';
      // Fetch client details
      const clientRes = await fetch(`${API_URL}/api/clients/${id}${adminQuery}`);
      const clientData = await clientRes.json();
      setClient(clientData);
      
      // Extract loan details from client
      setLoanDetails({
        loan_amount: clientData.loan_amount || 0,
        interest_rate: clientData.interest_rate || 10,
        loan_tenure_months: clientData.loan_tenure_months || 12,
        monthly_emi: clientData.monthly_emi || 0,
        total_amount_due: clientData.total_amount_due || 0,
        total_paid: clientData.total_paid || 0,
        outstanding_balance: clientData.outstanding_balance || 0,
        loan_start_date: clientData.loan_start_date,
        last_payment_date: clientData.last_payment_date,
        next_payment_due: clientData.next_payment_due,
        days_overdue: clientData.days_overdue || 0,
        auto_lock_enabled: clientData.auto_lock_enabled !== false,
        auto_lock_grace_days: clientData.auto_lock_grace_days || 3,
      });
      
      setAutoLockEnabled(clientData.auto_lock_enabled !== false);
      setGraceDays(String(clientData.auto_lock_grace_days || 3));
      
      // Fetch payment history
      if (clientData.loan_start_date) {
        const paymentsRes = await fetch(`${API_URL}/api/loans/${id}/payments`);
        const paymentsData = await paymentsRes.json();
        setPayments(paymentsData.payments || []);
        
        // Fetch payment schedule
        const scheduleRes = await fetch(`${API_URL}/api/loans/${id}/schedule`);
        const scheduleData = await scheduleRes.json();
        setSchedule(scheduleData.schedule || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert(t('error'), 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupLoan = async () => {
    if (!loanAmount) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/loans/${id}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: parseFloat(loanAmount),
          interest_rate: parseFloat(interestRate),
          loan_tenure_months: parseInt(tenure),
        }),
      });

      if (!response.ok) throw new Error('Failed to setup loan');
      
      const data = await response.json();
      Alert.alert(t('success'), `Loan setup successfully!\nMonthly EMI: €${data.loan_details.monthly_emi}`);
      setSetupLoanModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openEditLoanModal = () => {
    if (loanDetails) {
      setEditLoanAmount(loanDetails.loan_amount.toString());
      setEditInterestRate(loanDetails.interest_rate.toString());
      setEditTenure(loanDetails.loan_tenure_months.toString());
      setEditLoanModal(true);
    }
  };

  const handleEditLoan = async () => {
    if (!editLoanAmount || !editInterestRate || !editTenure) {
      Alert.alert(t('error'), t('fillAllFields'));
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/loans/${id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: parseFloat(editLoanAmount),
          interest_rate: parseFloat(editInterestRate),
          loan_tenure_months: parseInt(editTenure),
        }),
      });

      if (!response.ok) throw new Error('Failed to update loan');
      
      const data = await response.json();
      Alert.alert(t('success'), `Loan updated successfully!\nNew Monthly EMI: €${data.loan_details?.monthly_emi || 'N/A'}`);
      setEditLoanModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount) {
      Alert.alert(t('error'), 'Please enter payment amount');
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
        `Payment recorded!\n\nPaid: €${data.payment.amount}\nOutstanding: €${data.updated_balance.outstanding_balance.toFixed(2)}`
      );
      setRecordPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSettings = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/loans/${id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_lock_enabled: autoLockEnabled,
          auto_lock_grace_days: parseInt(graceDays),
        }),
      });

      if (!response.ok) throw new Error('Failed to update settings');
      
      Alert.alert(t('success'), 'Settings updated successfully');
      setSettingsModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockUnlock = async (shouldLock: boolean) => {
    setActionLoading(true);
    try {
      const scope = await getAdminId();
      const adminQuery = scope ? `?admin_id=${scope}` : '';
      const endpoint = shouldLock ? 'lock' : 'unlock';
      const response = await fetch(`${API_URL}/api/clients/${id}/${endpoint}${adminQuery}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error(`Failed to ${endpoint} device`);
      
      Alert.alert(t('success'), `Device ${shouldLock ? 'locked' : 'unlocked'} successfully`);
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setActionLoading(false);
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

  const paymentProgress = loanDetails?.total_amount_due
    ? (loanDetails.total_paid / loanDetails.total_amount_due) * 100
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Loan Management</Text>
          <Text style={styles.headerSubtitle}>{client?.name}</Text>
        </View>
        <TouchableOpacity onPress={() => setSettingsModal(true)} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Loan Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleRow}>
              <Ionicons name="cash" size={28} color="#10B981" />
              <Text style={styles.summaryTitle}>Loan Overview</Text>
            </View>
            {!loanDetails?.loan_start_date ? (
              <TouchableOpacity
                style={styles.setupButton}
                onPress={() => setSetupLoanModal(true)}
              >
                <Ionicons name="add-circle" size={20} color="#4F46E5" />
                <Text style={styles.setupButtonText}>Setup Loan</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.editButton}
                onPress={openEditLoanModal}
              >
                <Ionicons name="create-outline" size={20} color="#4F46E5" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {loanDetails?.loan_start_date ? (
            <>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${paymentProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{paymentProgress.toFixed(1)}% paid</Text>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Total Loan</Text>
                  <Text style={styles.summaryValue}>€{loanDetails.total_amount_due.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Paid</Text>
                  <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                    €{loanDetails.total_paid.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Outstanding</Text>
                  <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                    €{loanDetails.outstanding_balance.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Monthly EMI</Text>
                  <Text style={styles.summaryValue}>€{loanDetails.monthly_emi.toFixed(2)}</Text>
                </View>
              </View>

              {loanDetails.days_overdue > 0 && (
                <View style={styles.overdueAlert}>
                  <Ionicons name="warning" size={20} color="#EF4444" />
                  <Text style={styles.overdueText}>
                    {loanDetails.days_overdue} days overdue
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.noLoanContainer}>
              <Ionicons name="information-circle" size={48} color="#64748B" />
              <Text style={styles.noLoanText}>No loan configured</Text>
              <Text style={styles.noLoanSubtext}>{'Tap "Setup Loan" to get started'}</Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        {loanDetails?.loan_start_date && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.recordPaymentButton]}
              onPress={() => setRecordPaymentModal(true)}
            >
              <Ionicons name="card" size={24} color="#fff" />
              <Text style={styles.actionButtonText}>Record Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, client?.is_locked ? styles.unlockButton : styles.lockButton]}
              onPress={() => handleLockUnlock(!client?.is_locked)}
              disabled={actionLoading}
            >
              <Ionicons name={client?.is_locked ? "lock-open" : "lock-closed"} size={24} color="#fff" />
              <Text style={styles.actionButtonText}>
                {client?.is_locked ? 'Unlock Device' : 'Lock Device'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment History ({payments.length})</Text>
            {payments.map((payment) => (
              <View key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentHeader}>
                  <View style={styles.paymentIcon}>
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  </View>
                  <View style={styles.paymentDetails}>
                    <Text style={styles.paymentAmount}>€{payment.amount.toFixed(2)}</Text>
                    <Text style={styles.paymentDate}>
                      {new Date(payment.payment_date).toLocaleDateString('et-EE')}
                    </Text>
                  </View>
                  <View style={styles.paymentMethod}>
                    <Text style={styles.paymentMethodText}>{payment.payment_method}</Text>
                  </View>
                </View>
                {payment.notes && (
                  <Text style={styles.paymentNotes}>{payment.notes}</Text>
                )}
                <Text style={styles.paymentRecorder}>By: {payment.recorded_by}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Payment Schedule */}
        {schedule.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Schedule</Text>
            {schedule.map((item) => (
              <View key={item.month} style={styles.scheduleItem}>
                <View style={styles.scheduleMonth}>
                  <Text style={styles.scheduleMonthText}>Month {item.month}</Text>
                </View>
                <View style={styles.scheduleDetails}>
                  <Text style={styles.scheduleDate}>
                    {new Date(item.due_date).toLocaleDateString('et-EE')}
                  </Text>
                  <Text style={styles.scheduleAmount}>€{item.amount_due.toFixed(2)}</Text>
                </View>
                <View style={[
                  styles.scheduleStatus,
                  item.status === 'paid' && styles.statusPaid,
                  item.status === 'overdue' && styles.statusOverdue,
                  item.status === 'pending' && styles.statusPending,
                ]}>
                  <Text style={styles.scheduleStatusText}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Setup Loan Modal */}
      <Modal visible={setupLoanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Setup Loan</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Loan Amount (€)</Text>
              <TextInput
                style={styles.input}
                value={loanAmount}
                onChangeText={setLoanAmount}
                placeholder="1000"
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Interest Rate (%)</Text>
              <TextInput
                style={styles.input}
                value={interestRate}
                onChangeText={setInterestRate}
                placeholder="10"
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tenure (Months)</Text>
              <TextInput
                style={styles.input}
                value={tenure}
                onChangeText={setTenure}
                placeholder="12"
                keyboardType="number-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setSetupLoanModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleSetupLoan}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Setup</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={recordPaymentModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Record Payment</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount (€)</Text>
              <TextInput
                style={styles.input}
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder={loanDetails?.monthly_emi.toFixed(2)}
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Method</Text>
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
                      {method.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={paymentNotes}
                onChangeText={setPaymentNotes}
                placeholder="Payment notes..."
                placeholderTextColor="#64748B"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setRecordPaymentModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleRecordPayment}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Record</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={settingsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Auto-Lock Settings</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Enable Auto-Lock</Text>
                <Text style={styles.settingDescription}>
                  Automatically lock device on missed payments
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, autoLockEnabled && styles.toggleActive]}
                onPress={() => setAutoLockEnabled(!autoLockEnabled)}
              >
                <View style={[styles.toggleThumb, autoLockEnabled && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {autoLockEnabled && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Grace Period (Days)</Text>
                <TextInput
                  style={styles.input}
                  value={graceDays}
                  onChangeText={setGraceDays}
                  placeholder="3"
                  keyboardType="number-pad"
                  placeholderTextColor="#64748B"
                />
                <Text style={styles.inputHelper}>
                  Device will auto-lock after this many days past due date
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setSettingsModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleUpdateSettings}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Loan Modal */}
      <Modal visible={editLoanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Loan</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Loan Amount (€)</Text>
              <TextInput
                style={styles.input}
                value={editLoanAmount}
                onChangeText={setEditLoanAmount}
                placeholder="1000"
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Monthly Interest Rate (%)</Text>
              <TextInput
                style={styles.input}
                value={editInterestRate}
                onChangeText={setEditInterestRate}
                placeholder="10"
                keyboardType="decimal-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tenure (Months)</Text>
              <TextInput
                style={styles.input}
                value={editTenure}
                onChangeText={setEditTenure}
                placeholder="12"
                keyboardType="number-pad"
                placeholderTextColor="#64748B"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setEditLoanModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleEditLoan}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Save Changes</Text>
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4F46E520',
    borderRadius: 8,
  },
  setupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#4F46E520',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'right',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  overdueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#EF444420',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  overdueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  noLoanContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noLoanText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 12,
  },
  noLoanSubtext: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  recordPaymentButton: {
    backgroundColor: '#10B981',
  },
  lockButton: {
    backgroundColor: '#EF4444',
  },
  unlockButton: {
    backgroundColor: '#10B981',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  paymentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B98120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentDetails: {
    flex: 1,
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  paymentDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  paymentMethod: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#4F46E520',
    borderRadius: 6,
  },
  paymentMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
    textTransform: 'capitalize',
  },
  paymentNotes: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  paymentRecorder: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  scheduleMonth: {
    width: 60,
  },
  scheduleMonthText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  scheduleDetails: {
    flex: 1,
    marginLeft: 12,
  },
  scheduleDate: {
    fontSize: 13,
    color: '#fff',
  },
  scheduleAmount: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scheduleStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPaid: {
    backgroundColor: '#10B98120',
  },
  statusOverdue: {
    backgroundColor: '#EF444420',
  },
  statusPending: {
    backgroundColor: '#F59E0B20',
  },
  scheduleStatusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 8,
  },
  input: {
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
  inputHelper: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
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
    backgroundColor: '#4F46E520',
    borderColor: '#4F46E5',
  },
  methodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'capitalize',
  },
  methodButtonTextActive: {
    color: '#4F46E5',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#334155',
  },
  modalConfirmButton: {
    backgroundColor: '#4F46E5',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#64748B',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#334155',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
});
