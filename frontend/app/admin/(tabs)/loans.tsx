import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';
import API_URL from '../../../src/constants/api';


interface Client {
  id: string;
  name: string;
  phone: string;
  device_model: string;
  is_locked: boolean;
  registration_date: string;
  principal_amount?: number;
  total_amount_due?: number;
  next_payment_due?: string;
  outstanding_balance?: number;
  days_overdue?: number;
  total_paid?: number;
}

export default function LoansTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { language } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'given' | 'settled'>('given');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'today' | 'tomorrow' | 'next3days'>('all');

  const fetchClients = async () => {
    try {
      const adminId = await AsyncStorage.getItem('admin_id');
      const query = adminId ? `?limit=500&admin_id=${adminId}` : '?limit=500';
      const response = await fetch(`${API_URL}/api/clients${query}`);
      if (!response.ok) {
        console.error('API error:', response.status);
        setClients([]);
        return;
      }
      const data = await response.json();
      // Handle various API response formats
      const clientList = data?.clients || (Array.isArray(data) ? data : []);
      setClients(clientList);
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (params?.filter) {
      const f = params.filter.toString().toLowerCase();
      setFilter(f);
      if (f === 'paid') {
        setTab('settled');
      }
    } else {
      setFilter(undefined);
    }
  }, [params]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  };

  // Helper function to check if date matches filter
  const matchesPaymentFilter = (client: Client, filterType: string): boolean => {
    if (filterType === 'all') return true;
    if (!client.next_payment_due) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paymentDate = new Date(client.next_payment_due);
    paymentDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.ceil((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (filterType === 'today') return diffDays === 0;
    if (filterType === 'tomorrow') return diffDays === 1;
    if (filterType === 'next3days') return diffDays >= 0 && diffDays <= 3;
    return true;
  };

  const filteredClients = useMemo(() => {
    let list = clients;
    
    // Helper to get loan amount (checks both fields)
    const getLoanAmount = (c: Client) => c.total_amount_due || c.principal_amount || 0;
    const getOutstanding = (c: Client) => c.outstanding_balance ?? getLoanAmount(c);
    
    if (filter === 'overdue') {
      list = list.filter(
        (c) => getOutstanding(c) > 0 && (c.days_overdue ?? 0) > 0
      );
    } else if (filter === 'paid') {
      list = list.filter(
        (c) => getOutstanding(c) === 0 && (c.total_paid ?? 0) > 0
      );
    }

    if (tab === 'given') {
      // Show clients with active loans (outstanding > 0)
      list = list.filter(
        (c) => getLoanAmount(c) > 0 && getOutstanding(c) > 0
      );
    } else if (tab === 'settled') {
      // Show clients with settled loans (outstanding = 0 but had a loan)
      list = list.filter(
        (c) => getLoanAmount(c) > 0 && getOutstanding(c) === 0
      );
    }

    // Apply payment date filter
    list = list.filter((c) => matchesPaymentFilter(c, paymentFilter));

    return list.filter(
      (client) =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.phone.includes(searchQuery)
    );
  }, [clients, filter, searchQuery, tab, paymentFilter]);

  const renderClient = ({ item }: { item: Client }) => {
    // Calculate payment progress - check both principal_amount and total_amount_due
    const totalLoan = item.total_amount_due || item.principal_amount || 0;
    const paid = item.total_paid || 0;
    const outstanding = item.outstanding_balance ?? totalLoan;
    const progressPercent = totalLoan > 0 ? Math.min((paid / totalLoan) * 100, 100) : 0;
    
    // Check if client has any loan data
    const hasLoanData = totalLoan > 0;
    
    // Format next payment date
    const formatPaymentDate = (dateStr?: string) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const paymentDate = new Date(dateStr);
      paymentDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return language === 'et' ? 'Täna' : 'Today';
      if (diffDays === 1) return language === 'et' ? 'Homme' : 'Tomorrow';
      if (diffDays < 0) return `${Math.abs(diffDays)} ${language === 'et' ? 'päeva üle tähtaja' : 'days overdue'}`;
      return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-US', { 
        day: 'numeric', 
        month: 'short' 
      });
    };

    return (
      <TouchableOpacity
        style={styles.clientCard}
        onPress={() => router.push(`/admin/client-details?id=${item.id}`)}
      >
        <View style={styles.clientHeader}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.name}</Text>
            <Text style={styles.clientPhone}>{item.phone}</Text>
          </View>
          <View style={[styles.statusBadge, item.is_locked ? styles.statusLocked : styles.statusUnlocked]}>
            <Ionicons
              name={item.is_locked ? 'lock-closed' : 'lock-open'}
              size={14}
              color="#fff"
            />
          </View>
        </View>
        
        {hasLoanData && (
          <View style={styles.loanInfo}>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={styles.progressText}>{progressPercent.toFixed(0)}%</Text>
            </View>
            
            {/* Loan Details Grid */}
            <View style={styles.loanDetailsGrid}>
              <View style={styles.loanDetailItem}>
                <Text style={styles.loanDetailLabel}>
                  {language === 'et' ? 'Laen' : 'Loan'}
                </Text>
                <Text style={styles.loanDetailValue}>€{totalLoan.toFixed(0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={styles.loanDetailLabel}>
                  {language === 'et' ? 'Makstud' : 'Paid'}
                </Text>
                <Text style={[styles.loanDetailValue, { color: '#10B981' }]}>€{paid.toFixed(0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={styles.loanDetailLabel}>
                  {language === 'et' ? 'Võlg' : 'Due'}
                </Text>
                <Text style={[styles.loanDetailValue, { color: outstanding > 0 ? '#F59E0B' : '#10B981' }]}>
                  €{outstanding.toFixed(0)}
                </Text>
              </View>
            </View>
            
            {/* Next Payment & Overdue Info */}
            <View style={styles.paymentInfoRow}>
              {item.next_payment_due && (
                <View style={styles.nextPaymentBadge}>
                  <Ionicons name="calendar" size={12} color="#4F46E5" />
                  <Text style={styles.nextPaymentText}>
                    {formatPaymentDate(item.next_payment_due)}
                  </Text>
                </View>
              )}
              
              {(item.days_overdue ?? 0) > 0 && (
                <View style={styles.overdueBadge}>
                  <Ionicons name="alert-circle" size={12} color="#EF4444" />
                  <Text style={styles.overdueText}>
                    {item.days_overdue} {language === 'et' ? 'päeva' : 'days'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Laenud' : 'Loans'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/admin/add-loan')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {filter && (
        <View style={styles.filterBanner}>
          <Text style={styles.filterText}>
            {filter === 'overdue'
              ? language === 'et'
                ? 'Filtreeritud: võlglased'
                : 'Filter: Overdue'
              : language === 'et'
              ? 'Filtreeritud: tasutud'
              : 'Filter: Paid'}
          </Text>
          <TouchableOpacity onPress={() => setFilter(undefined)}>
            <Ionicons name="close-circle" size={20} color="#E2E8F0" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'given' && styles.tabButtonActive]}
          onPress={() => setTab('given')}
        >
          <Text style={[styles.tabText, tab === 'given' && styles.tabTextActive]}>
            {language === 'et' ? 'Antud' : 'Given'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === 'settled' && styles.tabButtonActive]}
          onPress={() => {
            setTab('settled');
            setPaymentFilter('all'); // Reset payment filter when switching to settled tab
          }}
        >
          <Text style={[styles.tabText, tab === 'settled' && styles.tabTextActive]}>
            {language === 'et' ? 'Tasutud' : 'Settled'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Payment Date Filter - Only show for 'given' tab */}
      {tab === 'given' && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.paymentFilterContainer}
          contentContainerStyle={styles.paymentFilterContent}
        >
          <TouchableOpacity
            style={[styles.paymentFilterButton, paymentFilter === 'all' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('all')}
          >
            <Text style={[styles.paymentFilterText, paymentFilter === 'all' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Kõik' : 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, paymentFilter === 'today' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('today')}
          >
            <Ionicons 
              name="today" 
              size={14} 
              color={paymentFilter === 'today' ? '#fff' : '#94A3B8'} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, paymentFilter === 'today' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Täna' : 'Today'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, paymentFilter === 'tomorrow' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('tomorrow')}
          >
            <Ionicons 
              name="calendar" 
              size={14} 
              color={paymentFilter === 'tomorrow' ? '#fff' : '#94A3B8'} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, paymentFilter === 'tomorrow' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Homme' : 'Tomorrow'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, paymentFilter === 'next3days' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('next3days')}
          >
            <Ionicons 
              name="calendar-outline" 
              size={14} 
              color={paymentFilter === 'next3days' ? '#fff' : '#94A3B8'} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, paymentFilter === 'next3days' && styles.paymentFilterTextActive]}>
              {language === 'et' ? '3 päeva' : 'Next 3 days'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder={language === 'et' ? 'Otsi kliente...' : 'Search clients...'}
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredClients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#64748B" />
            <Text style={styles.emptyText}>
              {language === 'et' ? 'Kliente ei leitud' : 'No clients found'}
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  tabText: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 96,
  },
  clientCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  clientPhone: {
    fontSize: 14,
    color: '#94A3B8',
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLocked: {
    backgroundColor: '#EF4444',
  },
  statusUnlocked: {
    backgroundColor: '#10B981',
  },
  loanInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 10,
  },
  loanInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  loanInfoLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  loanInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Progress bar styles
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    width: 36,
    textAlign: 'right',
  },
  // Loan details grid
  loanDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  loanDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  loanDetailLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
  },
  loanDetailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Payment info row
  paymentInfoRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  nextPaymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4F46E520',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextPaymentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  overdueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF444420',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  overdueText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
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
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  paymentFilterContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    maxHeight: 40,
  },
  paymentFilterContent: {
    gap: 8,
  },
  paymentFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paymentFilterButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  paymentFilterText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  paymentFilterTextActive: {
    color: '#fff',
  },
});
