import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrency } from '../../../src/context/CurrencyContext';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useEnterpriseAccess } from '../../../src/hooks/useEnterpriseAccess';
import API_URL from '../../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../../src/utils/secureStorage';


interface Transaction {
  id: string;
  client_id: string;
  client_name: string;
  amount: number;
  date: string;
  type: 'disbursement' | 'payment';
  payment_method?: string;
  notes?: string;
}

export default function TransactionsTab() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const { colors } = useTheme();
  const { plan, canAccess, loading: planLoading } = useEnterpriseAccess();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'disbursement' | 'payment'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchTransactions = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) {
        setTransactions([]);
        return;
      }
      const response = await fetch(`${API_URL}/api/clients?limit=500&admin_token=${adminToken}`);
      if (!response.ok) {
        setTransactions([]);
        return;
      }
      const data = await response.json();
      const allTransactions: Transaction[] = [];

      const clients = data.clients || (Array.isArray(data) ? data : []);
      
      // Fetch payments for each client in parallel
      const paymentPromises = clients.map(async (client: any) => {
        const clientTransactions: Transaction[] = [];
        
        // Add loan disbursement as a transaction
        const loanAmount = client.loan_amount || client.principal_amount || 0;
        if (loanAmount > 0) {
          clientTransactions.push({
            id: `disbursement-${client.id}`,
            client_id: client.id,
            client_name: client.name,
            amount: loanAmount,
            date: client.loan_start_date || client.created_at || new Date().toISOString(),
            type: 'disbursement',
            notes: t('loanDisbursement'),
          });
        }

        // Fetch actual payments from the payments API
        try {
          const paymentsRes = await fetch(`${API_URL}/api/loans/${client.id}/payments?admin_token=${adminToken}`);
          if (paymentsRes.ok) {
            const payments = await paymentsRes.json();
            if (Array.isArray(payments)) {
              payments.forEach((payment: any) => {
                clientTransactions.push({
                  id: payment.id || `payment-${client.id}-${payment.payment_date}`,
                  client_id: client.id,
                  client_name: client.name,
                  amount: payment.amount,
                  date: payment.payment_date,
                  type: 'payment',
                  payment_method: payment.payment_method,
                  notes: payment.notes,
                });
              });
            }
          }
        } catch (e) {
          // Non-fatal — skip payments for this client
        }

        return clientTransactions;
      });

      const results = await Promise.all(paymentPromises);
      results.forEach(txns => allTransactions.push(...txns));

      // Sort by date (most recent first)
      allTransactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(t('enus'), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredTransactions = filter === 'all' 
    ? transactions 
    : transactions.filter(t => t.type === filter);

  // Paginated transactions
  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = filteredTransactions.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isDisbursement = item.type === 'disbursement';
    return (
      <TouchableOpacity
        style={[styles.paymentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/admin/client-details?id=${item.client_id}`)}
        data-testid={`transaction-${item.id}`}
      >
        <View style={styles.paymentHeader}>
          <View style={[styles.paymentIcon, isDisbursement && styles.disbursementIcon]}>
            <Ionicons 
              name={isDisbursement ? 'arrow-up-circle' : 'cash'} 
              size={24} 
              color={isDisbursement ? colors.warning : colors.success} 
            />
          </View>
          <View style={styles.paymentInfo}>
            <Text style={[styles.clientName, { color: colors.text }]}>{item.client_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.paymentDate, { color: colors.textMuted }]}>{formatDate(item.date)}</Text>
              <View style={[styles.typeBadge, isDisbursement ? styles.disbursementBadge : styles.paymentBadge]}>
                <Text style={styles.typeBadgeText}>
                  {isDisbursement 
                    ? (t('disbursed')) 
                    : (t('payment'))}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.amountContainer}>
            <Text style={[styles.amount, { color: isDisbursement ? colors.warning : colors.success }]}>
              {isDisbursement ? '-' : '+'}{formatAmount(item.amount)}
            </Text>
            {item.payment_method && (
              <Text style={[styles.paymentMethod, { color: colors.textMuted }]}>{item.payment_method}</Text>
            )}
          </View>
        </View>
        {item.notes && (
          <Text style={[styles.notes, { color: colors.textMuted }]} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('transactions')}
        </Text>
        {canAccess('reports') ? (
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => router.push('/admin/reports')}
          >
            <Ionicons name="analytics" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.filterButton, { opacity: 0.5 }]}
            onPress={() => Alert.alert(
              'Professional Feature',
              'Reports and analytics require the Professional plan or higher. Would you like to upgrade?',
              [
                { text: t('cancel') || 'Cancel', style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/admin/settings') },
              ]
            )}
          >
            <Ionicons name="lock-closed" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, { backgroundColor: colors.surface, borderColor: colors.border }, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, { color: colors.textMuted }, filter === 'all' && styles.filterTabTextActive]}>
            {t('all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, { backgroundColor: colors.surface, borderColor: colors.border }, filter === 'disbursement' && styles.filterTabActive]}
          onPress={() => setFilter('disbursement')}
        >
          <Text style={[styles.filterTabText, { color: colors.textMuted }, filter === 'disbursement' && styles.filterTabTextActive]}>
            {t('disbursements')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, { backgroundColor: colors.surface, borderColor: colors.border }, filter === 'payment' && styles.filterTabActive]}
          onPress={() => setFilter('payment')}
        >
          <Text style={[styles.filterTabText, { color: colors.textMuted }, filter === 'payment' && styles.filterTabTextActive]}>
            {t('payments')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={paginatedTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          filteredTransactions.length > pageSize ? (
            <View style={styles.paginationInfo}>
              <Text style={[styles.paginationText, { color: colors.textMuted }]}>
                {language === 'et' 
                  ? `Näitan ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filteredTransactions.length)} / ${filteredTransactions.length}`
                  : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filteredTransactions.length)} of ${filteredTransactions.length}`}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pageButton, { backgroundColor: colors.surface, borderColor: colors.border }, page === 1 && styles.pageButtonDisabled]}
                onPress={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="prev-page-btn"
              >
                <Ionicons name="chevron-back" size={18} color={page === 1 ? colors.textMuted : colors.text} />
              </TouchableOpacity>
              <Text style={[styles.pageInfo, { color: colors.text }]}>
                {page} / {totalPages}
              </Text>
              <TouchableOpacity
                style={[styles.pageButton, { backgroundColor: colors.surface, borderColor: colors.border }, page === totalPages && styles.pageButtonDisabled]}
                onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="next-page-btn"
              >
                <Ionicons name="chevron-forward" size={18} color={page === totalPages ? colors.textMuted : colors.text} />
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.text }]}>
              {t('noTransactionsFound')}
            </Text>
          </View>
        }
      />
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  filterTab: {
    flex: 1,
    backgroundColor: '#152035',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  filterTabActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterTabText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13,
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 96,
  },
  paymentCard: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10B98120',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  disbursementIcon: {
    backgroundColor: '#F59E0B20',
  },
  paymentInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  paymentDate: {
    fontSize: 13,
    color: '#94A3B8',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  disbursementBadge: {
    backgroundColor: '#F59E0B20',
  },
  paymentBadge: {
    backgroundColor: '#10B98120',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  disbursementAmount: {
    color: '#F59E0B',
  },
  paymentMethod: {
    fontSize: 11,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  notes: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E3050',
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  // Pagination styles
  paginationInfo: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  paginationText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 16,
    marginTop: 8,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageInfo: {
    fontSize: 14,
    fontWeight: '600',
  },
});
