import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_URL from '../../src/constants/api';

interface LoanSummary {
  loan_amount: number;
  total_paid: number;
  outstanding_balance: number;
  progress_percent: number;
  monthly_emi: number;
  interest_rate: number;
  loan_tenure_months: number;
  loan_start_date: string | null;
}

interface PaymentStatus {
  next_payment_due: string | null;
  days_until_due: number | null;
  days_overdue: number;
  is_overdue: boolean;
  late_fees_accumulated: number;
}

interface DeviceStatus {
  is_locked: boolean;
  is_registered: boolean;
  device_model: string;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
}

export default function ClientPortalDashboard() {
  const router = useRouter();
  const [language, setLanguage] = useState<'et' | 'en'>('et');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientName, setClientName] = useState('');
  const [loanSummary, setLoanSummary] = useState<LoanSummary | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPayments, setShowPayments] = useState(false);

  const fetchStatus = async () => {
    try {
      const clientId = await AsyncStorage.getItem('portal_client_id');
      const code = await AsyncStorage.getItem('portal_registration_code');
      
      if (!clientId || !code) {
        router.replace('/client/portal-login');
        return;
      }

      const response = await fetch(
        `${API_URL}/api/client/portal/status?client_id=${clientId}&registration_code=${code}`
      );

      if (!response.ok) {
        if (response.status === 401) {
          await handleLogout();
          return;
        }
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setClientName(data.name);
      setLoanSummary(data.loan_summary);
      setPaymentStatus(data.payment_status);
      setDeviceStatus(data.device_status);
    } catch (error) {
      console.error('Error fetching status:', error);
      Alert.alert(
        language === 'et' ? 'Viga' : 'Error',
        language === 'et' ? 'Staatuse laadimine ebaõnnestus' : 'Failed to load status'
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const clientId = await AsyncStorage.getItem('portal_client_id');
      const code = await AsyncStorage.getItem('portal_registration_code');
      
      if (!clientId || !code) return;

      const response = await fetch(
        `${API_URL}/api/client/portal/payments?client_id=${clientId}&registration_code=${code}`
      );

      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['portal_client_id', 'portal_client_name', 'portal_registration_code']);
    router.replace('/client/portal-login');
  };

  useEffect(() => {
    fetchStatus();
    fetchPayments();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchPayments()]);
    setRefreshing(false);
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `€${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>
            {language === 'et' ? 'Laadimine...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            {language === 'et' ? 'Tere tulemast' : 'Welcome'}
          </Text>
          <Text style={styles.clientName}>{clientName}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.langSwitcher}>
            <TouchableOpacity
              style={[styles.langButton, language === 'et' && styles.langButtonActive]}
              onPress={() => setLanguage('et')}
            >
              <Text style={[styles.langText, language === 'et' && styles.langTextActive]}>ET</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langButton, language === 'en' && styles.langButtonActive]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {/* Progress Card */}
        {loanSummary && loanSummary.outstanding_balance > 0 ? (
          <>
          <View style={styles.progressCard} data-testid="loan-progress-card">
            <Text style={styles.cardTitle}>
              {language === 'et' ? 'Laenu progress' : 'Loan Progress'}
            </Text>
            
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${loanSummary.progress_percent}%` }]} />
              </View>
              <Text style={styles.progressPercent}>{loanSummary.progress_percent.toFixed(1)}%</Text>
            </View>

            <View style={styles.progressStats}>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatLabel}>
                  {language === 'et' ? 'Makstud' : 'Paid'}
                </Text>
                <Text style={[styles.progressStatValue, { color: '#10B981' }]}>
                  {formatCurrency(loanSummary.total_paid)}
                </Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatLabel}>
                  {language === 'et' ? 'Jääk' : 'Remaining'}
                </Text>
                <Text style={[styles.progressStatValue, { color: '#F59E0B' }]}>
                  {formatCurrency(loanSummary.outstanding_balance)}
                </Text>
              </View>
            </View>
          </View>

        {/* Payment Status Card */}
        {paymentStatus && (
          <View style={[
            styles.paymentStatusCard,
            paymentStatus.is_overdue && styles.paymentStatusCardOverdue
          ]} data-testid="payment-status-card">
            <View style={styles.paymentStatusHeader}>
              <Ionicons 
                name={paymentStatus.is_overdue ? 'warning' : 'calendar'} 
                size={24} 
                color={paymentStatus.is_overdue ? '#EF4444' : '#4F46E5'} 
              />
              <Text style={styles.paymentStatusTitle}>
                {paymentStatus.is_overdue 
                  ? (language === 'et' ? 'Makse on hilinenud!' : 'Payment Overdue!')
                  : (language === 'et' ? 'Järgmine makse' : 'Next Payment')
                }
              </Text>
            </View>

            <View style={styles.paymentStatusContent}>
              <View style={styles.paymentStatusRow}>
                <Text style={styles.paymentStatusLabel}>
                  {language === 'et' ? 'Kuumakse' : 'Monthly EMI'}
                </Text>
                <Text style={styles.paymentStatusValue}>
                  {formatCurrency(loanSummary?.monthly_emi || 0)}
                </Text>
              </View>
              
              <View style={styles.paymentStatusRow}>
                <Text style={styles.paymentStatusLabel}>
                  {language === 'et' ? 'Tähtaeg' : 'Due Date'}
                </Text>
                <Text style={styles.paymentStatusValue}>
                  {formatDate(paymentStatus.next_payment_due)}
                </Text>
              </View>

              {paymentStatus.is_overdue ? (
                <View style={styles.overdueInfo}>
                  <Text style={styles.overdueLabel}>
                    {language === 'et' ? 'Hilinenud päevi' : 'Days Overdue'}
                  </Text>
                  <Text style={styles.overdueValue}>{paymentStatus.days_overdue}</Text>
                </View>
              ) : paymentStatus.days_until_due !== null && (
                <View style={styles.daysUntilDue}>
                  <Text style={styles.daysUntilDueLabel}>
                    {language === 'et' ? 'Päevi tähtajani' : 'Days Until Due'}
                  </Text>
                  <Text style={styles.daysUntilDueValue}>{paymentStatus.days_until_due}</Text>
                </View>
              )}

              {paymentStatus.late_fees_accumulated > 0 && (
                <View style={styles.lateFeeRow}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.lateFeeLabel}>
                    {language === 'et' ? 'Viivised' : 'Late Fees'}
                  </Text>
                  <Text style={styles.lateFeeValue}>
                    {formatCurrency(paymentStatus.late_fees_accumulated)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Loan Details Card */}
        {loanSummary && (
          <View style={styles.detailsCard} data-testid="loan-details-card">
            <Text style={styles.cardTitle}>
              {language === 'et' ? 'Laenu andmed' : 'Loan Details'}
            </Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'et' ? 'Laenu summa' : 'Loan Amount'}
              </Text>
              <Text style={styles.detailValue}>{formatCurrency(loanSummary.loan_amount)}</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'et' ? 'Intressimäär' : 'Interest Rate'}
              </Text>
              <Text style={styles.detailValue}>{loanSummary.interest_rate}%</Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'et' ? 'Periood' : 'Tenure'}
              </Text>
              <Text style={styles.detailValue}>
                {loanSummary.loan_tenure_months} {language === 'et' ? 'kuud' : 'months'}
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>
                {language === 'et' ? 'Alguskuupäev' : 'Start Date'}
              </Text>
              <Text style={styles.detailValue}>{formatDate(loanSummary.loan_start_date)}</Text>
            </View>
          </View>
        )}
        </>
        ) : (
          <View style={styles.allPaidCard} data-testid="all-paid-card">
            <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            <Text style={styles.allPaidTitle}>
              {language === 'et' ? 'Kõik makstud' : 'All Paid'}
            </Text>
            <Text style={styles.allPaidSubtext}>
              {language === 'et' ? 'Teil pole aktiivseid laene' : 'You have no active loans'}
            </Text>
          </View>
        )}

        {/* Device Status Card */}
        {deviceStatus && (
          <View style={styles.deviceCard} data-testid="device-status-card">
            <View style={styles.deviceHeader}>
              <Ionicons 
                name="phone-portrait" 
                size={20} 
                color={deviceStatus.is_locked ? '#EF4444' : '#10B981'} 
              />
              <Text style={styles.cardTitle}>
                {language === 'et' ? 'Seadme olek' : 'Device Status'}
              </Text>
            </View>
            
            <View style={styles.deviceStatusRow}>
              <Text style={styles.deviceLabel}>
                {language === 'et' ? 'Mudel' : 'Model'}
              </Text>
              <Text style={styles.deviceValue}>{deviceStatus.device_model || '-'}</Text>
            </View>
            
            <View style={styles.deviceStatusRow}>
              <Text style={styles.deviceLabel}>
                {language === 'et' ? 'Olek' : 'Status'}
              </Text>
              <View style={[
                styles.statusBadge,
                deviceStatus.is_locked ? styles.statusBadgeLocked : styles.statusBadgeActive
              ]}>
                <Text style={styles.statusBadgeText}>
                  {deviceStatus.is_locked 
                    ? (language === 'et' ? 'Lukustatud' : 'Locked')
                    : (language === 'et' ? 'Aktiivne' : 'Active')
                  }
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 13,
    color: '#94A3B8',
  },
  clientName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  langButtonActive: {
    backgroundColor: '#4F46E5',
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  // Progress Card
  progressCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 12,
    backgroundColor: '#334155',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    minWidth: 50,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStat: {
    alignItems: 'center',
  },
  progressStatLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  progressStatValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  // Payment Status Card
  paymentStatusCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4F46E530',
  },
  paymentStatusCardOverdue: {
    borderColor: '#EF444450',
    backgroundColor: '#1F1515',
  },
  paymentStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  paymentStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  paymentStatusContent: {
    gap: 12,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentStatusLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  paymentStatusValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  overdueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EF444420',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  overdueLabel: {
    fontSize: 13,
    color: '#EF4444',
  },
  overdueValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
  },
  daysUntilDue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#4F46E520',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  daysUntilDueLabel: {
    fontSize: 13,
    color: '#4F46E5',
  },
  daysUntilDueValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
  lateFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EF444420',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  lateFeeLabel: {
    flex: 1,
    fontSize: 13,
    color: '#EF4444',
  },
  lateFeeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  // Details Card
  detailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  detailLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  // Device Card
  deviceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  deviceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  deviceLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  deviceValue: {
    fontSize: 14,
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusBadgeActive: {
    backgroundColor: '#10B98120',
  },
  statusBadgeLocked: {
    backgroundColor: '#EF444420',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  // Payments
  paymentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paymentsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentsContainer: {
    backgroundColor: '#1E293B',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 16,
    marginTop: -16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#334155',
  },
  noPayments: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 14,
    paddingVertical: 20,
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  paymentItemLeft: {},
  paymentAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
  },
  paymentDate: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentMethodText: {
    fontSize: 12,
    color: '#64748B',
  },
  allPaidCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  allPaidTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10B981',
  },
  allPaidSubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
