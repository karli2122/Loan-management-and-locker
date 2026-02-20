import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useTheme } from '../../src/context/ThemeContext';
import API_URL from '../../src/constants/api';


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
  is_registered: boolean;
  last_heartbeat?: string | null;
  admin_mode_active?: boolean;
  tamper_attempts?: number;
  outstanding_balance?: number;
  loan_amount?: number;
}

interface SilentClient {
  id: string;
  name: string;
  phone: string;
  last_heartbeat: string | null;
  is_locked: boolean;
  admin_mode_active: boolean;
  tamper_attempts: number;
}

export default function ClientsList() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [silentClients, setSilentClients] = useState<SilentClient[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'locked' | 'unlocked' | 'silent'>('all');
  const [silentLoading, setSilentLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const fetchClients = async () => {
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) {
        console.error('No admin token found');
        return;
      }
      const query = `?limit=500&admin_token=${adminToken}`;
      // Fetch with pagination - get first 500 records (increased limit for admin panel)
      const response = await fetch(`${API_URL}/api/clients${query}`);
      
      if (response.status === 401) {
        handleAuthFailure();
        return;
      }
      
      const data = await response.json();
      
      // Handle both old and new API response format
      const clientList = data.clients || data;
      setClients(clientList);
      applyFilters(clientList, searchQuery, filter);
      
      // Log pagination info if available
      if (data.pagination) {
        console.log(`Loaded ${data.pagination.skip + clientList.length} of ${data.pagination.total} clients`);
        if (data.pagination.has_more) {
          console.log('More clients available - consider implementing load more');
        }
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchSilentClients = async () => {
    setSilentLoading(true);
    try {
      const adminToken = await AsyncStorage.getItem('admin_token');
      if (!adminToken) return;
      
      // Silent clients: haven't sent heartbeat in 60 minutes
      const response = await fetch(`${API_URL}/api/clients/silent?admin_token=${adminToken}&minutes=60`);
      if (response.ok) {
        const data = await response.json();
        setSilentClients(data.silent_clients || []);
      }
    } catch (error) {
      console.error('Failed to fetch silent clients:', error);
    } finally {
      setSilentLoading(false);
    }
  };

  const applyFilters = (clientList: Client[], query: string, filterType: string) => {
    // Filter out null/undefined clients
    let filtered = clientList.filter(c => c && c.name && c.phone);

    if (query) {
      filtered = filtered.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(query.toLowerCase())) ||
          (c.phone && c.phone.includes(query)) ||
          (c.email && c.email.toLowerCase().includes(query.toLowerCase()))
      );
    }

    if (filterType === 'locked') {
      filtered = filtered.filter((c) => c.is_locked === true);
    } else if (filterType === 'unlocked') {
      filtered = filtered.filter((c) => c.is_locked === false || c.is_locked === undefined);
    }

    setFilteredClients(filtered);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (filter === 'silent') {
      fetchSilentClients();
    } else {
      applyFilters(clients, searchQuery, filter);
    }
  }, [searchQuery, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (filter === 'silent') {
      await fetchSilentClients();
    } else {
      await fetchClients();
    }
    setRefreshing(false);
  }, [filter]);

  const getFilterLabel = (f: string) => {
    switch (f) {
      case 'all': return t('all');
      case 'locked': return t('locked');
      case 'unlocked': return t('unlocked');
      case 'silent': return language === 'et' ? 'Kadunud' : 'Silent';
      default: return f;
    }
  };

  const formatLastSeen = (dateStr: string | null) => {
    if (!dateStr) return language === 'et' ? 'Kunagi pole ühendunud' : 'Never connected';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return language === 'et' ? `${diffDays} päeva tagasi` : `${diffDays} days ago`;
    } else if (diffHours > 0) {
      return language === 'et' ? `${diffHours} tundi tagasi` : `${diffHours} hours ago`;
    } else {
      return language === 'et' ? `${diffMins} minutit tagasi` : `${diffMins} minutes ago`;
    }
  };

  const renderSilentClient = ({ item }: { item: SilentClient }) => {
    if (!item || !item.id) return null;
    
    return (
      <TouchableOpacity
        style={[styles.clientCard, styles.silentClientCard, { backgroundColor: colors.surface, borderColor: colors.warning }]}
        onPress={() => router.push({ pathname: '/admin/client-details', params: { id: item.id } })}
        data-testid={`silent-client-${item.id}`}
      >
        <View style={styles.clientInfo}>
          <View style={styles.clientHeader}>
            <Text style={[styles.clientName, { color: colors.text }]}>{item.name || 'N/A'}</Text>
            <View style={styles.silentBadge}>
              <Ionicons name="alert-circle" size={12} color="#F97316" />
              <Text style={styles.silentBadgeText}>
                {language === 'et' ? 'Kadunud' : 'Silent'}
              </Text>
            </View>
          </View>
          <Text style={[styles.clientPhone, { color: colors.textMuted }]}>{item.phone || 'N/A'}</Text>
          <View style={styles.silentMeta}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.lastSeenText, { color: colors.textMuted }]}>
              {language === 'et' ? 'Viimati nähtud: ' : 'Last seen: '}
              {formatLastSeen(item.last_heartbeat)}
            </Text>
          </View>
          {item.tamper_attempts > 0 && (
            <View style={styles.tamperWarning}>
              <Ionicons name="warning" size={14} color={colors.error} />
              <Text style={[styles.tamperText, { color: colors.error }]}>
                {language === 'et' ? `${item.tamper_attempts} rikkumiskatset` : `${item.tamper_attempts} tamper attempts`}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderClient = ({ item }: { item: Client }) => {
    // Defensive null checks
    if (!item || !item.id) {
      return null;
    }
    
    return (
      <TouchableOpacity
        style={[styles.clientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: '/admin/client-details', params: { id: item.id } })}
      >
        <View style={styles.clientInfo}>
          <View style={styles.clientHeader}>
            <Text style={[styles.clientName, { color: colors.text }]}>{item.name || 'N/A'}</Text>
            <View style={[styles.statusBadge, item.is_locked ? styles.lockedBadge : styles.unlockedBadge]}>
              <Ionicons
                name={item.is_locked ? 'lock-closed' : 'lock-open'}
                size={12}
                color={item.is_locked ? '#EF4444' : '#10B981'}
              />
              <Text style={[styles.statusText, item.is_locked ? styles.lockedText : styles.unlockedText]}>
                {item.is_locked ? t('locked') : t('unlocked')}
              </Text>
            </View>
          </View>
          <Text style={[styles.clientPhone, { color: colors.textMuted }]}>{item.phone || 'N/A'}</Text>
          <View style={styles.clientMeta}>
            {(item.outstanding_balance || 0) > 0 ? (
              <Text style={[styles.emiAmount, { color: '#EF4444' }]}>
                {language === 'et' ? 'Jääk' : 'Outstanding'}: €{(item.outstanding_balance || 0).toLocaleString()}
              </Text>
            ) : (
              <Text style={[styles.emiAmount, { color: colors.textSecondary }]}>
                {language === 'et' ? 'Laen' : 'Loan'}: €{(item.loan_amount || item.emi_amount || 0).toLocaleString()}
              </Text>
            )}
            {item.is_registered ? (
              <View style={styles.registeredBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={styles.registeredText}>{t('registered')}</Text>
              </View>
            ) : (
              <View style={styles.pendingBadge}>
                <Ionicons name="time" size={14} color="#F59E0B" />
                <Text style={styles.pendingText}>{t('pending')}</Text>
              </View>
            )}
          </View>
          {item.last_heartbeat ? (
            <Text style={[styles.regCode, { color: colors.textMuted }]}>
              {language === 'et' ? 'Viimane ühendus' : 'Last seen'}: {(() => {
                const mins = Math.floor((Date.now() - new Date(item.last_heartbeat).getTime()) / 60000);
                if (mins < 1) return language === 'et' ? 'just nüüd' : 'just now';
                if (mins < 60) return `${mins}m ${language === 'et' ? 'tagasi' : 'ago'}`;
                const hours = Math.floor(mins / 60);
                if (hours < 24) return `${hours}h ${language === 'et' ? 'tagasi' : 'ago'}`;
                return `${Math.floor(hours / 24)}d ${language === 'et' ? 'tagasi' : 'ago'}`;
              })()}
            </Text>
          ) : item.registration_code ? (
            <Text style={[styles.regCode, { color: colors.textMuted }]}>{t('code')}: {item.registration_code}</Text>
          ) : (
            <Text style={[styles.regCodeNotGenerated, { color: colors.textMuted }]}>
              {language === 'et' ? 'Võti: pole genereeritud' : 'Key: not generated'}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('clients')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/admin/add-client')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setShowFilterPicker(true)}
          data-testid="filter-dropdown"
        >
          {filter === 'silent' && <Ionicons name="alert-circle" size={16} color="#F97316" style={{marginRight: 6}} />}
          <Text style={[
            styles.filterDropdownText,
            { color: colors.text },
            filter === 'silent' && styles.silentFilterDropdownText
          ]}>
            {getFilterLabel(filter)}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {filter === 'silent' && silentLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            {language === 'et' ? 'Laadin kadunud kliente...' : 'Loading silent clients...'}
          </Text>
        </View>
      ) : filter === 'silent' ? (
        <FlatList
          data={silentClients}
          keyExtractor={(item) => item.id}
          renderItem={renderSilentClient}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F97316" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle" size={64} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {language === 'et' ? 'Kadunud kliente pole!' : 'No silent clients!'}
              </Text>
              <Text style={[styles.emptySubText, { color: colors.textMuted }]}>
                {language === 'et' ? 'Kõik seadmed on ühendatud' : 'All devices are connected'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.text }]}>{t('noClientsFound')}</Text>
            </View>
          }
        />
      )}

      {/* Filter Picker Modal */}
      <Modal visible={showFilterPicker} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.filterModalOverlay} 
          activeOpacity={1}
          onPress={() => setShowFilterPicker(false)}
        >
          <View style={[styles.filterModalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.filterModalTitle, { color: colors.text }]}>
              {language === 'et' ? 'Filtreeri kliendid' : 'Filter Clients'}
            </Text>
            {(['all', 'locked', 'unlocked', 'silent'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterModalItem,
                  { borderBottomColor: colors.border },
                  filter === f && styles.filterModalItemActive
                ]}
                onPress={() => {
                  setFilter(f);
                  setShowFilterPicker(false);
                }}
              >
                {f === 'silent' && <Ionicons name="alert-circle" size={18} color={filter === f ? '#fff' : '#F97316'} style={{marginRight: 8}} />}
                <Text style={[
                  styles.filterModalItemText,
                  { color: colors.text },
                  filter === f && styles.filterModalItemTextActive,
                  f === 'silent' && filter !== f && styles.silentFilterModalText
                ]}>
                  {getFilterLabel(f)}
                </Text>
                {filter === f && (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1E293B',
  },
  filterButtonActive: {
    backgroundColor: '#4F46E5',
  },
  filterText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  clientInfo: {
    flex: 1,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  lockedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  unlockedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  lockedText: {
    color: '#EF4444',
  },
  unlockedText: {
    color: '#10B981',
  },
  clientPhone: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  clientMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emiAmount: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '500',
  },
  registeredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  registeredText: {
    fontSize: 12,
    color: '#10B981',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pendingText: {
    fontSize: 12,
    color: '#F59E0B',
  },
  regCode: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  regCodeNotGenerated: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  // Silent filter styles
  silentFilterButton: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderWidth: 1,
    borderColor: '#F97316',
    flexDirection: 'row',
    alignItems: 'center',
  },
  silentFilterButtonActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  silentFilterText: {
    color: '#F97316',
  },
  // Silent client card styles
  silentClientCard: {
    borderColor: '#F97316',
    borderWidth: 1,
    backgroundColor: 'rgba(249, 115, 22, 0.05)',
  },
  silentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
    gap: 4,
  },
  silentBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#F97316',
  },
  silentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  lastSeenText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  tamperWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tamperText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  // Loading styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 12,
  },
  // Dropdown filter styles
  filterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  filterDropdownText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  silentFilterDropdownText: {
    color: '#F97316',
  },
  // Filter modal styles
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  filterModalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  filterModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterModalItemActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterModalItemText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  filterModalItemTextActive: {
    color: '#fff',
  },
  silentFilterModalText: {
    color: '#F97316',
  },
});
