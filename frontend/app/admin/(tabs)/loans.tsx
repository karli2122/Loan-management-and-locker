import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getApiUrl, API_BASE_URL } from '../../../src/utils/api';
import { useLanguage } from '../../../src/context/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';


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
}

export default function LoansTab() {
  const router = useRouter();
  const { language } = useLanguage();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchClients = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_BASE_URL}/api/clients?limit=500&admin_token=${token}`);
      const data = await response.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.includes(searchQuery)
  );

  const renderClient = ({ item }: { item: Client }) => (
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
      {item.principal_amount && (
        <View style={styles.loanInfo}>
          <View style={styles.loanInfoRow}>
            <Text style={styles.loanInfoLabel}>
              {language === 'et' ? 'Laenusumma' : 'Loan Amount'}
            </Text>
            <Text style={styles.loanInfoValue}>€{item.principal_amount.toFixed(2)}</Text>
          </View>
          {item.total_amount_due && (
            <View style={styles.loanInfoRow}>
              <Text style={styles.loanInfoLabel}>
                {language === 'et' ? 'Võlgnevus' : 'Amount Due'}
              </Text>
              <Text style={[styles.loanInfoValue, { color: '#F59E0B' }]}>
                €{item.total_amount_due.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {language === 'et' ? 'Laenud' : 'Loans'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/admin/add-client')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

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
  listContainer: {
    padding: 16,
    paddingTop: 0,
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
    gap: 8,
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