import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../../src/context/LanguageContext';

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
  is_registered: boolean;
}

export default function ClientsList() {
  const router = useRouter();
  const { t } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'locked' | 'unlocked'>('all');

  const fetchClients = async () => {
    try {
      const response = await fetch(`${API_URL}/api/clients`);
      const data = await response.json();
      setClients(data);
      applyFilters(data, searchQuery, filter);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const applyFilters = (clientList: Client[], query: string, filterType: string) => {
    let filtered = clientList;

    if (query) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.phone.includes(query) ||
          c.email.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (filterType === 'locked') {
      filtered = filtered.filter((c) => c.is_locked);
    } else if (filterType === 'unlocked') {
      filtered = filtered.filter((c) => !c.is_locked);
    }

    setFilteredClients(filtered);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    applyFilters(clients, searchQuery, filter);
  }, [searchQuery, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  }, []);

  const getFilterLabel = (f: string) => {
    switch (f) {
      case 'all': return t('all');
      case 'locked': return t('locked');
      case 'unlocked': return t('unlocked');
      default: return f;
    }
  };

  const renderClient = ({ item }: { item: Client }) => (
    <TouchableOpacity
      style={styles.clientCard}
      onPress={() => router.push({ pathname: '/admin/client-details', params: { id: item.id } })}
    >
      <View style={styles.clientInfo}>
        <View style={styles.clientHeader}>
          <Text style={styles.clientName}>{item.name}</Text>
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
        <Text style={styles.clientPhone}>{item.phone}</Text>
        <View style={styles.clientMeta}>
          <Text style={styles.emiAmount}>{t('emi')}: €{item.emi_amount.toLocaleString()}</Text>
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
        <Text style={styles.regCode}>{t('code')}: {item.registration_code}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#64748B" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('clients')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/admin/add-client')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#64748B" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.filterContainer}>
        {(['all', 'locked', 'unlocked'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterButton, filter === f && styles.filterButtonActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {getFilterLabel(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredClients}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#334155" />
            <Text style={styles.emptyText}>{t('noClientsFound')}</Text>
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
});
