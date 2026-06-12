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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

interface PendingReminder {
  client_id: string;
  client_name: string;
  phone: string;
  monthly_emi: number;
  outstanding_balance: number;
  next_payment_due: string | null;
  days_until_due: number;
  reminder_type: string;
  has_push_token: boolean;
}

interface ReminderSummary {
  total: number;
  overdue: number;
  due_today: number;
  due_soon: number;
  upcoming: number;
  with_push_token: number;
}

export default function PaymentReminders() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { formatAmount, currencySymbol } = useCurrency();
  const [reminders, setReminders] = useState<PendingReminder[]>([]);
  const [summary, setSummary] = useState<ReminderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingClient, setSendingClient] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReminders = async () => {
    try {
      const token = await getSecureItem('admin_token');
      if (!token) {
        router.replace('/admin/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/reminders/pending?admin_token=${token}`);
      const data = await response.json();

      if (response.ok) {
        setReminders(data.reminders || []);
        setSummary(data.summary || null);
      } else {
        Alert.alert('Error', data.error || 'Failed to fetch reminders');
      }
    } catch (error) {
      console.error('Failed to fetch reminders:', error);
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchReminders();
    setRefreshing(false);
  }, []);

  const sendAllReminders = async () => {
    Alert.alert(
      t('sendReminders'),
      t('areYouSureYouWantTo'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('send'),
          onPress: async () => {
            setSending(true);
            try {
              const token = await getSecureItem('admin_token');
              const response = await fetch(`${API_URL}/api/reminders/send-push?admin_token=${token}`, {
                method: 'POST',
              });
              const data = await response.json();

              if (response.ok) {
                Alert.alert(
                  t('success'),
                  language === 'et'
                    ? `Saadetud: ${data.notifications_sent}, Ebaõnnestunud: ${data.notifications_failed}`
                    : `Sent: ${data.notifications_sent}, Failed: ${data.notifications_failed}`
                );
                fetchReminders();
              } else {
                Alert.alert('Error', data.error || 'Failed to send reminders');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to send reminders');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  const sendSingleReminder = async (clientId: string, clientName: string) => {
    setSendingClient(clientId);
    try {
      const token = await getSecureItem('admin_token');
      const response = await fetch(`${API_URL}/api/reminders/send-single/${clientId}?admin_token=${token}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          t('success'),
          language === 'et'
            ? `Meeldetuletus saadetud: ${clientName}`
            : `Reminder sent to: ${clientName}`
        );
      } else {
        Alert.alert('Error', data.error || data.message || 'Failed to send reminder');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to send reminder');
    } finally {
      setSendingClient(null);
    }
  };

  const getReminderTypeColor = (type: string) => {
    switch (type) {
      case 'overdue': return '#EF4444';
      case 'due_today': return '#F59E0B';
      case 'due_soon': return '#FBBF24';
      default: return '#10B981';
    }
  };

  const getReminderTypeText = (type: string) => {
    const labels: Record<string, { en: string; et: string }> = {
      overdue: { en: 'Overdue', et: 'Tähtajast üle' },
      due_today: { en: 'Due Today', et: 'Täna tähtaeg' },
      due_soon: { en: 'Due Soon', et: 'Peagi tähtaeg' },
      upcoming: { en: 'Upcoming', et: 'Tulemas' },
    };
    return labels[type]?.[language] || type;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString(t('enus'), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {t('paymentReminders')}
        </Text>
        <TouchableOpacity
          style={[styles.sendAllButton, sending && styles.sendingButton]}
          onPress={sendAllReminders}
          disabled={sending || (summary?.with_push_token || 0) === 0}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendAllText}>
                {t('sendAll')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {summary && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#7F1D1D' }]}>
              <Text style={styles.summaryValue}>{summary.overdue}</Text>
              <Text style={styles.summaryLabel}>
                {t('overdue')}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#78350F' }]}>
              <Text style={styles.summaryValue}>{summary.due_today}</Text>
              <Text style={styles.summaryLabel}>
                {t('today')}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#713F12' }]}>
              <Text style={styles.summaryValue}>{summary.due_soon}</Text>
              <Text style={styles.summaryLabel}>
                {t('soon')}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#14532D' }]}>
              <Text style={styles.summaryValue}>{summary.upcoming}</Text>
              <Text style={styles.summaryLabel}>
                {t('upcoming')}
              </Text>
            </View>
          </View>
          <View style={styles.pushTokenInfo}>
            <Ionicons name="phone-portrait" size={16} color="#64748B" />
            <Text style={styles.pushTokenText}>
              {summary.with_push_token} / {summary.total} {t('withPush')}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchClients') || 'Search by name or phone...'}
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          data-testid="reminder-search-input"
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {(() => {
          const filtered = reminders.filter(r => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (r.client_name || '').toLowerCase().includes(q) || (r.phone || '').includes(q);
          });
          if (filtered.length === 0) {
            return (
              <View style={styles.emptyContainer}>
                <Ionicons name={searchQuery ? 'search-outline' : 'checkmark-circle'} size={64} color={searchQuery ? '#334155' : '#10B981'} />
                <Text style={styles.emptyText}>
                  {searchQuery ? (t('noResultsFound') || 'No results found') : t('noPendingReminders')}
                </Text>
              </View>
            );
          }
          return filtered.map((reminder) => (
            <View key={reminder.client_id} style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <View style={styles.clientInfo}>
                  <Text style={styles.clientName}>{reminder.client_name}</Text>
                  <Text style={styles.clientPhone}>{reminder.phone}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: getReminderTypeColor(reminder.reminder_type) }]}>
                  <Text style={styles.badgeText}>{getReminderTypeText(reminder.reminder_type)}</Text>
                </View>
              </View>

              <View style={styles.reminderDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('outstanding')}</Text>
                  <Text style={styles.detailValue}>{formatAmount(reminder.outstanding_balance, 2)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('dueDate')}</Text>
                  <Text style={styles.detailValue}>{formatDate(reminder.next_payment_due)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('days')}</Text>
                  <Text style={[styles.detailValue, { color: getReminderTypeColor(reminder.reminder_type) }]}>
                    {reminder.days_until_due < 0 
                      ? `${Math.abs(reminder.days_until_due)} ${t('overdue2')}`
                      : `${reminder.days_until_due} ${t('days2')}`
                    }
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !reminder.has_push_token && styles.sendButtonDisabled,
                  sendingClient === reminder.client_id && styles.sendingButton
                ]}
                onPress={() => sendSingleReminder(reminder.client_id, reminder.client_name)}
                disabled={!reminder.has_push_token || sendingClient === reminder.client_id}
              >
                {sendingClient === reminder.client_id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons
                      name={reminder.has_push_token ? 'send' : 'alert-circle'}
                      size={18}
                      color="#fff"
                    />
                    <Text style={styles.sendButtonText}>
                      {reminder.has_push_token
                        ? (t('sendReminder'))
                        : (t('noPushToken'))
                      }
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ));
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    marginLeft: 8,
    padding: 0,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  sendAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  sendingButton: {
    backgroundColor: '#3B82F6',
  },
  sendAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  pushTokenInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  pushTokenText: {
    fontSize: 13,
    color: '#64748B',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 16,
  },
  reminderCard: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  clientPhone: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  reminderDetails: {
    backgroundColor: '#0B1527',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#475569',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
