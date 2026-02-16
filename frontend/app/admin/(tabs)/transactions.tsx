import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useTheme } from '../../../src/context/ThemeContext';
import API_URL from '../../../src/constants/api';


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
  const { language } = useLanguage();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'disbursement' | 'payment'>('all');

  const fetchTransactions = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setTransactions([]);
        setLoading(false);
        return;
      }
      const response = await fetch(`${API_URL}/api/clients?limit=500&admin_token=${adminToken}`);
      if (!response.ok) {
        setTransactions([]);
        setLoading(false);
        return;
      }
      const data = await response.json();
      const allTransactions: Transaction[] = [];

      const clients = data.clients || (Array.isArray(data) ? data : []);
      clients.forEach((client: any) => {
        // Add loan disbursement as a transaction
        const loanAmount = client.loan_amount || client.principal_amount || 0;
        if (loanAmount > 0) {
          allTransactions.push({
            id: `disbursement-${client.id}`,
            client_id: client.id,
            client_name: client.name,
            amount: loanAmount,
            date: client.loan_start_date || client.created_at || new Date().toISOString(),
            type: 'disbursement',
            notes: language === 'et' ? 'Laenu väljastamine' : 'Loan disbursement',
          });
        }

        // Add payments as transactions
        if (client.payments_history && Array.isArray(client.payments_history)) {
          client.payments_history.forEach((payment: any) => {
            allTransactions.push({
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
      });

      // Sort by date (most recent first)
      allTransactions.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setTransactions(allTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredTransactions = filter === 'all' 
    ? transactions 
    : transactions.filter(t => t.type === filter);

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isDisbursement = item.type === 'disbursement';
    return (
      <TouchableOpacity
        style={styles.paymentCard}
        onPress={() => router.push(`/admin/client-details?id=${item.client_id}`)}
        data-testid={`transaction-${item.id}`}
      >
        <View style={styles.paymentHeader}>
          <View style={[styles.paymentIcon, isDisbursement && styles.disbursementIcon]}>
            <Ionicons 
              name={isDisbursement ? 'arrow-up-circle' : 'cash'} 
              size={24} 
              color={isDisbursement ? '#F59E0B' : '#10B981'} 
            />
          </View>
          <View style={styles.paymentInfo}>
            <Text style={styles.clientName}>{item.client_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.paymentDate}>{formatDate(item.date)}</Text>
              <View style={[styles.typeBadge, isDisbursement ? styles.disbursementBadge : styles.paymentBadge]}>
                <Text style={styles.typeBadgeText}>
                  {isDisbursement 
                    ? (language === 'et' ? 'Väljastus' : 'Disbursed') 
                    : (language === 'et' ? 'Makse' : 'Payment')}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.amountContainer}>
            <Text style={[styles.amount, isDisbursement && styles.disbursementAmount]}>
              {isDisbursement ? '-' : '+'}€{item.amount.toFixed(2)}
            </Text>
            {item.payment_method && (
              <Text style={styles.paymentMethod}>{item.payment_method}</Text>
            )}
          </View>
        </View>
        {item.notes && (
          <Text style={styles.notes} numberOfLines={2}>
            {item.notes}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Tehingud' : 'Transactions'}
        </Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => router.push('/admin/reports')}
        >
          <Ionicons name="analytics" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            {language === 'et' ? 'Kõik' : 'All'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'disbursement' && styles.filterTabActive]}
          onPress={() => setFilter('disbursement')}
        >
          <Text style={[styles.filterTabText, filter === 'disbursement' && styles.filterTabTextActive]}>
            {language === 'et' ? 'Väljastused' : 'Disbursements'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'payment' && styles.filterTabActive]}
          onPress={() => setFilter('payment')}
        >
          <Text style={[styles.filterTabText, filter === 'payment' && styles.filterTabTextActive]}>
            {language === 'et' ? 'Maksed' : 'Payments'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={64} color="#64748B" />
            <Text style={styles.emptyText}>
              {language === 'et' ? 'Tehinguid ei leitud' : 'No transactions found'}
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
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
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
    backgroundColor: '#4F46E5',
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
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterTabActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
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
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
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
    borderTopColor: '#334155',
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
});
