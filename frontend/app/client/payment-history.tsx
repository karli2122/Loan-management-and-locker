import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  recorded_by: string;
}

interface PaymentHistoryData {
  payments: Payment[];
  total_paid: number;
  outstanding_balance: number;
  loan_amount: number;
  monthly_emi: number;
  next_payment_due: string | null;
}

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [data, setData] = useState<PaymentHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPaymentHistory = async () => {
    try {
      const clientId = await AsyncStorage.getItem('client_id');
      if (!clientId) {
        router.replace('/client/register');
        return;
      }

      const response = await fetch(`${API_URL}/api/payments/history/${clientId}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching payment history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentHistory();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPaymentHistory();
    setRefreshing(false);
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'cash':
        return 'cash';
      case 'bank_transfer':
      case 'bank':
        return 'business';
      case 'card':
        return 'card';
      default:
        return 'wallet';
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, Record<string, string>> = {
      cash: { et: 'Sularaha', en: 'Cash' },
      bank_transfer: { et: 'Pangaülekanne', en: 'Bank Transfer' },
      bank: { et: 'Pangaülekanne', en: 'Bank Transfer' },
      card: { et: 'Kaardimakse', en: 'Card' },
    };
    return labels[method.toLowerCase()]?.[language] || method;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  const progressPercent = data ? (data.total_paid / data.loan_amount) * 100 : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Maksete ajalugu' : 'Payment History'}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {language === 'et' ? 'Laenu ülevaade' : 'Loan Overview'}
          </Text>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(progressPercent, 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progressPercent.toFixed(1)}% {language === 'et' ? 'makstud' : 'paid'}
            </Text>
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Laenusumma' : 'Loan Amount'}
              </Text>
              <Text style={styles.summaryValue}>€{data?.loan_amount?.toFixed(2) || '0.00'}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Makstud' : 'Total Paid'}
              </Text>
              <Text style={[styles.summaryValue, { color: '#10B981' }]}>
                €{data?.total_paid?.toFixed(2) || '0.00'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Jääk' : 'Outstanding'}
              </Text>
              <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                €{data?.outstanding_balance?.toFixed(2) || '0.00'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Kuumakse' : 'Monthly EMI'}
              </Text>
              <Text style={styles.summaryValue}>€{data?.monthly_emi?.toFixed(2) || '0.00'}</Text>
            </View>
          </View>

          {data?.next_payment_due && (
            <View style={styles.nextPaymentSection}>
              <Ionicons name="calendar" size={18} color="#3B82F6" />
              <Text style={styles.nextPaymentText}>
                {language === 'et' ? 'Järgmine makse' : 'Next payment'}: {formatDate(data.next_payment_due)}
              </Text>
            </View>
          )}
        </View>

        {/* Payment Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>
            {language === 'et' ? 'Maksete ajatelg' : 'Payment Timeline'}
          </Text>

          {data?.payments && data.payments.length > 0 ? (
            data.payments.map((payment, index) => (
              <View key={payment.id} style={styles.timelineItem}>
                <View style={styles.timelineLine}>
                  <View style={styles.timelineDot} />
                  {index < data.payments.length - 1 && (
                    <View style={styles.timelineConnector} />
                  )}
                </View>
                <View style={styles.paymentCard}>
                  <View style={styles.paymentHeader}>
                    <View style={styles.paymentMethodBadge}>
                      <Ionicons
                        name={getPaymentMethodIcon(payment.payment_method) as any}
                        size={16}
                        color="#10B981"
                      />
                      <Text style={styles.paymentMethodText}>
                        {getPaymentMethodLabel(payment.payment_method)}
                      </Text>
                    </View>
                    <Text style={styles.paymentDate}>{formatDate(payment.payment_date)}</Text>
                  </View>
                  <Text style={styles.paymentAmount}>€{payment.amount.toFixed(2)}</Text>
                  {payment.notes && (
                    <Text style={styles.paymentNotes}>{payment.notes}</Text>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color="#334155" />
              <Text style={styles.emptyText}>
                {language === 'et' ? 'Makseid pole veel' : 'No payments yet'}
              </Text>
            </View>
          )}
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  progressSection: {
    marginBottom: 20,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'right',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  summaryItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  nextPaymentSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  nextPaymentText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  timelineSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  timelineLine: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    marginTop: 4,
  },
  timelineConnector: {
    flex: 1,
    width: 2,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  paymentCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginLeft: 12,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B98120',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paymentMethodText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  paymentDate: {
    fontSize: 12,
    color: '#64748B',
  },
  paymentAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  paymentNotes: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
});
