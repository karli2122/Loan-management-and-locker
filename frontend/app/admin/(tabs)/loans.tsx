import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrency } from '../../../src/context/CurrencyContext';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useTheme } from '../../../src/context/ThemeContext';
import { useEnterpriseAccess } from '../../../src/hooks/useEnterpriseAccess';
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
  credit_score?: number;
  imported?: boolean;
  import_needs_review?: boolean;
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
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const { colors } = useTheme();
  const { plan, canAccess, loading: planLoading } = useEnterpriseAccess();
  const [clients, setClients] = useState<Client[]>([]);
  const [paidLoans, setPaidLoans] = useState<PaidLoan[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'given' | 'archived' | 'imported'>('given');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'today' | 'tomorrow' | 'next3days'>('all');

  // Helper to handle feature locked alert
  const showFeatureLockedAlert = (featureName: string, requiredPlan: string) => {
    Alert.alert(
      `${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} Feature`,
      `${featureName} requires the ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan or higher. Would you like to upgrade?`,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/admin/settings') },
      ]
    );
  };

  // Derive filter from URL params directly
  const filterParam = params?.filter?.toString().toLowerCase() || undefined;

  const fetchClients = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        setClients([]);
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

  // Sync filter state with URL params
  useEffect(() => {
    if (filterParam) {
      setFilter(filterParam);
      if (filterParam === 'paid') {
        setTab('archived');
        setPaymentFilter('all');
      } else {
        setTab('given');
      }
    } else {
      setFilter(undefined);
    }
  }, [filterParam]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients();
    await fetchPaidLoans();
    setRefreshing(false);
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchClients();
      fetchPaidLoans();
    }, [])
  );

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
      // Show clients with active loans (outstanding > 0) that are NOT imported or have been reviewed
      list = list.filter(
        (c) => getLoanAmount(c) > 0 && getOutstanding(c) > 0 && !c.import_needs_review
      );
    } else if (tab === 'imported') {
      // Show only clients that need review (imported but not yet completed)
      list = list.filter(
        (c) => c.import_needs_review === true
      );
    }

    // Apply payment date filter (only for given tab)
    if (tab === 'given') {
      list = list.filter((c) => matchesPaymentFilter(c, paymentFilter));
    }

    return list.filter(
      (client) =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.phone.includes(searchQuery)
    );
  }, [clients, filter, searchQuery, tab, paymentFilter]);

  // Credit score color helper
  const getCreditScoreColor = (score: number) => {
    if (score >= 800) return '#10B981'; // excellent - green
    if (score >= 650) return '#3B82F6'; // good - blue
    if (score >= 500) return '#F59E0B'; // fair - amber
    if (score >= 350) return '#F97316'; // poor - orange
    return '#EF4444'; // very poor - red
  };

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
      
      if (diffDays === 0) return t('today');
      if (diffDays === 1) return t('tomorrow');
      if (diffDays < 0) return `${Math.abs(diffDays)} ${t('daysOverdue')}`;
      return date.toLocaleDateString(t('enus'), { 
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
            <View style={styles.clientNameRow}>
              <Text style={[styles.clientName, { color: colors.text }]}>{item.name}</Text>
              {canAccess('credit_scoring') && item.credit_score != null && (
                <View style={[styles.creditScoreBadge, { backgroundColor: getCreditScoreColor(item.credit_score) + '20' }]}>
                  <Ionicons name="star" size={10} color={getCreditScoreColor(item.credit_score)} />
                  <Text style={[styles.creditScoreText, { color: getCreditScoreColor(item.credit_score) }]}>{item.credit_score}</Text>
                </View>
              )}
            </View>
            {item.import_needs_review && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{t('imported') || 'IMPORTED'}</Text>
                </View>
                <Text style={{ color: '#F59E0B', fontSize: 10, marginLeft: 4 }}>{t('needsReview') || 'Needs review'}</Text>
              </View>
            )}
            {!item.import_needs_review && <Text style={[styles.clientPhone, { color: colors.textMuted }]}>{item.phone}</Text>}
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
                  {t('emi')}
                </Text>
                <Text style={[styles.loanDetailValue, { color: colors.text }]}>{formatAmount(totalLoan, 0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                  {t('paid')}
                </Text>
                <Text style={[styles.loanDetailValue, { color: colors.success }]}>{formatAmount(paid, 0)}</Text>
              </View>
              
              <View style={styles.loanDetailItem}>
                <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                  {t('due')}
                </Text>
                <Text style={[styles.loanDetailValue, { color: outstanding > 0 ? colors.warning : colors.success }]}>
                  {formatAmount(outstanding, 0)}
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
                    {item.days_overdue} {t('days2')}
                  </Text>
                </View>
              )}
              
              {(item.is_late || (item.late_fees_accumulated ?? 0) > 0) && (
                <View style={styles.lateFeeBadge}>
                  <Ionicons name="cash" size={12} color="#DC2626" />
                  <Text style={styles.lateFeeText}>
                    {t('lateFee')}: {formatAmount(item.late_fees_accumulated ?? 0)}
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
      return date.toLocaleDateString(t('enus'), {
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
            <View style={styles.clientNameRow}>
              <Text style={[styles.clientName, { color: colors.text }]}>{item.client_name}</Text>
              {canAccess('credit_scoring') && item.final_credit_score != null && item.final_credit_score > 0 && (
                <View style={[styles.creditScoreBadge, { backgroundColor: getCreditScoreColor(item.final_credit_score) + '20' }]}>
                  <Ionicons name="star" size={10} color={getCreditScoreColor(item.final_credit_score)} />
                  <Text style={[styles.creditScoreText, { color: getCreditScoreColor(item.final_credit_score) }]}>{item.final_credit_score}</Text>
                </View>
              )}
            </View>
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
              {t('archived')}: {formatDate(item.archived_at)}
            </Text>
          </View>
          
          {/* Loan Summary */}
          <View style={styles.loanDetailsGrid}>
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {t('emi')}
              </Text>
              <Text style={[styles.loanDetailValue, { color: colors.text }]}>{formatAmount(item.loan_amount?.toFixed(0) || '0')}</Text>
            </View>
            
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {t('totalPaid')}
              </Text>
              <Text style={[styles.loanDetailValue, { color: '#10B981' }]}>{formatAmount(item.total_paid?.toFixed(0) || '0')}</Text>
            </View>
            
            <View style={styles.loanDetailItem}>
              <Text style={[styles.loanDetailLabel, { color: colors.textMuted }]}>
                {t('interest')}
              </Text>
              <Text style={[styles.loanDetailValue, { color: '#F59E0B' }]}>{formatAmount(item.total_interest?.toFixed(0) || '0')}</Text>
            </View>
          </View>
          
          {/* Payment Count Badge */}
          <View style={styles.paymentInfoRow}>
            <View style={[styles.nextPaymentBadge, { backgroundColor: 'rgba(79, 70, 229, 0.1)' }]}>
              <Ionicons name="cash-outline" size={12} color="#2563EB" />
              <Text style={[styles.nextPaymentText, { color: '#2563EB' }]}>
                {item.payment_count} {t('payments2')}
              </Text>
            </View>
            
            {canAccess('credit_scoring') && (
              <View style={[styles.nextPaymentBadge, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                <Ionicons name="star" size={12} color="#10B981" />
                <Text style={[styles.nextPaymentText, { color: '#10B981' }]}>
                  {t('score')}: {item.final_credit_score || 'N/A'}
                </Text>
              </View>
            )}
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
          {t('loans')}
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
              ? t('filterOverdue')
              : t('filterPaid')}
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
            {t('given')}
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
            {t('archived')}
          </Text>
          {paidLoans.length > 0 && (
            <View style={styles.badgeSmall}>
              <Text style={styles.badgeTextSmall}>{paidLoans.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, { backgroundColor: colors.surface, borderColor: colors.border }, tab === 'imported' && styles.tabButtonActive]}
          onPress={() => {
            setTab('imported');
            setPaymentFilter('all');
          }}
          data-testid="loans-tab-imported"
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, tab === 'imported' && styles.tabTextActive]}>
            {t('imported') || 'Imported'}
          </Text>
          {clients.filter(c => c.import_needs_review).length > 0 && (
            <View style={[styles.badgeSmall, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.badgeTextSmall}>{clients.filter(c => c.import_needs_review).length}</Text>
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
              {t('all')}
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
              {t('today')}
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
              {t('tomorrow')}
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
              {t('next3Days')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={tab === 'archived' 
            ? (t('searchArchivedLoans'))
            : (t('searchClients'))}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="archive-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('noArchivedLoansFound')}
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                {t('loansAreAutomaticallyArchivedWhenFully')}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {t('noClientsFound')}
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
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
    backgroundColor: '#152035',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
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
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2563EB',
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
  clientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  creditScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  creditScoreText: {
    fontSize: 11,
    fontWeight: '700',
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
    borderTopColor: '#1E3050',
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
    backgroundColor: '#1E3050',
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
    backgroundColor: '#2563EB20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  nextPaymentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
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
    backgroundColor: '#152035',
    borderWidth: 1,
    borderColor: '#1E3050',
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
    backgroundColor: '#152035',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 42,
    minWidth: 60,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1E3050',
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
