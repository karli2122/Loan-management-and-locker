import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { useTheme } from '../../../src/context/ThemeContext';
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
  is_late?: boolean;
  late_fees_accumulated?: number;
}

interface PaidLoan {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  loan_amount: number;
  total_paid: number;
  total_interest: number;
  loan_tenure_months: number;
  paid_date: string;
  archived_at: string;
  payment_count: number;
  final_credit_score: number;
}

export default function LoansTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { language } = useLanguage();
  const { colors } = useTheme();
  const [clients, setClients] = useState<Client[]>([]);
  const [paidLoans, setPaidLoans] = useState<PaidLoan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'given' | 'archived'>('given');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'today' | 'tomorrow' | 'next3days'>('all');

  const fetchClients = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setClients([]);
        setLoading(false);
        return;
      }
      const response = await fetch(`${API_URL}/api/clients?limit=500&admin_token=${adminToken}`);
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

  const fetchPaidLoans = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setPaidLoans([]);
        return;
      }
      const response = await fetch(`${API_URL}/api/paid-loans?admin_token=${adminToken}`);
      if (!response.ok) {
        console.error('Failed to fetch paid loans:', response.status);
        setPaidLoans([]);
        return;
      }
      const data = await response.json();
      setPaidLoans(data.paid_loans || []);
    } catch (error) {
      console.error('Error fetching paid loans:', error);
      setPaidLoans([]);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchPaidLoans();
  }, []);

  useEffect(() => {
    if (params?.filter) {
      const f = params.filter.toString().toLowerCase();
      setFilter(f);
      if (f === 'paid') {
        setTab('archived');
      } else {
        setTab('given');
      }
    } else {
      setFilter(undefined);
      setTab('given');
      setPaymentFilter('all');
    }
  }, [params]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    await fetchPaidLoans();
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
        style={[styles.clientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push(`/admin/client-details?id=${item.id}`)}
      >
        <View style={styles.clientHeader}>
          <View style={[styles.clientAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.clientAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={[styles.clientName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.clientPhone, { color: colors.textMuted }]}>{item.phone}</Text>
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
          <View style={[styles.loanInfo, { borderTopColor: colors.border }]}>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progressPercent.toFixed(0)}%</Text>
            </View>
            
            {/* Loan Details Grid */}
            <View style={styles.loanDetailsGrid}>
              <View style={styles.loanDetailItem}>
                <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                  {language === 'et' ? 'Laen' : 'Loan'}
                </Text>
                <Text style={[styles.loanDetailValue, { color: colors.text }]}>€{totalLoan.toFixed(0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                  {language === 'et' ? 'Makstud' : 'Paid'}
                </Text>
                <Text style={[styles.loanDetailValue, { color: colors.success }]}>€{paid.toFixed(0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                  {language === 'et' ? 'Võlg' : 'Due'}
                </Text>
                <Text style={[styles.loanDetailValue, { color: outstanding > 0 ? colors.warning : colors.success }]}>
                  €{outstanding.toFixed(0)}
                </Text>
              </View>
            </View>
            
            {/* Next Payment & Overdue Info */}
            <View style={styles.paymentInfoRow}>
              {item.next_payment_due && (
                <View style={[styles.nextPaymentBadge, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="calendar" size={12} color={colors.primary} />
                  <Text style={[styles.nextPaymentText, { color: colors.primary }]}>
                    {formatPaymentDate(item.next_payment_due)}
                  </Text>
                </View>
              )}
              
              {(item.days_overdue ?? 0) > 0 && (
                <View style={styles.overdueBadge}>
                  <Ionicons name="alert-circle" size={12} color={colors.error} />
                  <Text style={[styles.overdueText, { color: colors.error }]}>
                    {item.days_overdue} {language === 'et' ? 'päeva' : 'days'}
                  </Text>
                </View>
              )}
              
              {(item.is_late || (item.late_fees_accumulated ?? 0) > 0) && (
                <View style={styles.lateFeeBadge}>
                  <Ionicons name="cash" size={12} color="#DC2626" />
                  <Text style={styles.lateFeeText}>
                    {language === 'et' ? 'Viivis' : 'Late Fee'}: €{(item.late_fees_accumulated ?? 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };
  
  // Render function for archived (paid) loans
  const renderPaidLoan = ({ item }: { item: PaidLoan }) => {
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    };
    
    return (
      <View style={[styles.clientCard, { backgroundColor: colors.surface }]}>
        <View style={styles.clientHeader}>
          <View style={[styles.clientAvatar, { backgroundColor: '#10B981' }]}>
            <Ionicons name="checkmark" size={18} color="#fff" />
          </View>
          <View style={styles.clientInfo}>
            <Text style={[styles.clientName, { color: colors.text }]}>{item.client_name}</Text>
            <Text style={[styles.clientPhone, { color: colors.textMuted }]}>{item.client_phone}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: '#10B981' }]}>
            <Ionicons name="archive" size={14} color="#fff" />
          </View>
        </View>
        
        <View style={[styles.loanInfo, { borderTopColor: colors.border }]}>
          {/* Archived Date */}
          <View style={[styles.archivedDateBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="calendar-outline" size={12} color="#10B981" />
            <Text style={[styles.archivedDateText, { color: colors.textMuted }]}>
              {language === 'et' ? 'Arhiveeritud' : 'Archived'}: {formatDate(item.archived_at)}
            </Text>
          </View>
          
          {/* Loan Summary */}
          <View style={styles.loanDetailsGrid}>
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Laen' : 'Loan'}
              </Text>
              <Text style={[styles.loanDetailValue, { color: colors.text }]}>€{item.loan_amount?.toFixed(0) || '0'}</Text>
            </View>
            
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Makstud' : 'Total Paid'}
              </Text>
              <Text style={[styles.loanDetailValue, { color: '#10B981' }]}>€{item.total_paid?.toFixed(0) || '0'}</Text>
            </View>
            
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {language === 'et' ? 'Intress' : 'Interest'}
              </Text>
              <Text style={[styles.loanDetailValue, { color: '#F59E0B' }]}>€{item.total_interest?.toFixed(0) || '0'}</Text>
            </View>
          </View>
          
          {/* Payment Count Badge */}
          <View style={styles.paymentInfoRow}>
            <View style={[styles.nextPaymentBadge, { backgroundColor: 'rgba(79, 70, 229, 0.1)' }]}>
              <Ionicons name="cash-outline" size={12} color="#4F46E5" />
              <Text style={[styles.nextPaymentText, { color: '#4F46E5' }]}>
                {item.payment_count} {language === 'et' ? 'makset' : 'payments'}
              </Text>
            </View>
            
            <View style={[styles.nextPaymentBadge, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="star" size={12} color="#10B981" />
              <Text style={[styles.nextPaymentText, { color: '#10B981' }]}>
                {language === 'et' ? 'Krediidiskoor' : 'Score'}: {item.final_credit_score || 'N/A'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Filter paid loans based on search
  const filteredPaidLoans = useMemo(() => {
    if (!searchQuery) return paidLoans;
    return paidLoans.filter(
      (loan) =>
        loan.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        loan.client_phone?.includes(searchQuery)
    );
  }, [paidLoans, searchQuery]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
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
        <View style={[styles.filterBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.filterText, { color: colors.textSecondary }]}>
            {filter === 'overdue'
              ? language === 'et'
                ? 'Filtreeritud: võlglased'
                : 'Filter: Overdue'
              : language === 'et'
              ? 'Filtreeritud: tasutud'
              : 'Filter: Paid'}
          </Text>
          <TouchableOpacity onPress={() => setFilter(undefined)}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabButton, { backgroundColor: colors.surface, borderColor: colors.border }, tab === 'given' && styles.tabButtonActive]}
          onPress={() => setTab('given')}
          data-testid="loans-tab-given"
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, tab === 'given' && styles.tabTextActive]}>
            {language === 'et' ? 'Antud' : 'Given'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, { backgroundColor: colors.surface, borderColor: colors.border }, tab === 'archived' && styles.tabButtonActive]}
          onPress={() => {
            setTab('archived');
            setPaymentFilter('all');
          }}
          data-testid="loans-tab-archived"
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, tab === 'archived' && styles.tabTextActive]}>
            {language === 'et' ? 'Arhiveeritud' : 'Archived'}
          </Text>
          {paidLoans.length > 0 && (
            <View style={styles.badgeSmall}>
              <Text style={styles.badgeTextSmall}>{paidLoans.length}</Text>
            </View>
          )}
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
            style={[styles.paymentFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }, paymentFilter === 'all' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('all')}
            data-testid="payment-filter-all"
          >
            <Text style={[styles.paymentFilterText, { color: colors.textMuted }, paymentFilter === 'all' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Kõik' : 'All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }, paymentFilter === 'today' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('today')}
            data-testid="payment-filter-today"
          >
            <Ionicons 
              name="today" 
              size={14} 
              color={paymentFilter === 'today' ? '#fff' : colors.textMuted} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, { color: colors.textMuted }, paymentFilter === 'today' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Täna' : 'Today'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }, paymentFilter === 'tomorrow' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('tomorrow')}
            data-testid="payment-filter-tomorrow"
          >
            <Ionicons 
              name="calendar" 
              size={14} 
              color={paymentFilter === 'tomorrow' ? '#fff' : colors.textMuted} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, { color: colors.textMuted }, paymentFilter === 'tomorrow' && styles.paymentFilterTextActive]}>
              {language === 'et' ? 'Homme' : 'Tomorrow'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.paymentFilterButton, { backgroundColor: colors.surface, borderColor: colors.border }, paymentFilter === 'next3days' && styles.paymentFilterButtonActive]}
            onPress={() => setPaymentFilter('next3days')}
            data-testid="payment-filter-next3days"
          >
            <Ionicons 
              name="calendar-outline" 
              size={14} 
              color={paymentFilter === 'next3days' ? '#fff' : colors.textMuted} 
              style={{ marginRight: 4 }} 
            />
            <Text style={[styles.paymentFilterText, { color: colors.textMuted }, paymentFilter === 'next3days' && styles.paymentFilterTextActive]}>
              {language === 'et' ? '3 päeva' : 'Next 3 days'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={tab === 'archived' 
            ? (language === 'et' ? 'Otsi arhiveeritud laene...' : 'Search archived loans...')
            : (language === 'et' ? 'Otsi kliente...' : 'Search clients...')}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {tab === 'archived' ? (
        <FlatList
          data={filteredPaidLoans}
          renderItem={renderPaidLoan}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="archive-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {language === 'et' ? 'Arhiveeritud laene ei leitud' : 'No archived loans found'}
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                {language === 'et' 
                  ? 'Laenud arhiveeritakse automaatselt, kui need on täielikult tasutud'
                  : 'Loans are automatically archived when fully paid'}
              </Text>
            </View>
          }
        />
      ) : (
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
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {language === 'et' ? 'Kliente ei leitud' : 'No clients found'}
              </Text>
            </View>
          }
        />
      )}
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
    justifyContent: 'center',
    flexDirection: 'row',
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
  lateFeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC262620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DC262640',
  },
  lateFeeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
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
    maxHeight: 56,
  },
  paymentFilterContent: {
    gap: 8,
  },
  paymentFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paymentFilterButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  paymentFilterText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentFilterTextActive: {
    color: '#fff',
  },
  // Badge styles for archived count
  badgeSmall: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 6,
  },
  badgeTextSmall: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Archived date badge
  archivedDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  archivedDateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Empty subtext for archived tab
  emptySubText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
    lineHeight: 18,
  },
});
