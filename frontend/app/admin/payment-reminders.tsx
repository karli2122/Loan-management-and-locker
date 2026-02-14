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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import API_URL from '../../src/constants/api';

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
  const { language } = useLanguage();
  const [reminders, setReminders] = useState<PendingReminder[]>([]);
  const [summary, setSummary] = useState<ReminderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingClient, setSendingClient] = useState<string | null>(null);

  const fetchReminders = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
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
      language === 'et' ? 'Saada meeldetuletused' : 'Send Reminders',
      language === 'et' 
        ? 'Kas olete kindel, et soovite saata meeldetuletused kõigile klientidele?' 
        : 'Are you sure you want to send reminders to all clients with push tokens?',
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        {
          text: language === 'et' ? 'Saada' : 'Send',
          onPress: async () => {
            setSending(true);
            try {
              const token = await AsyncStorage.getItem('admin_token');
              const response = await fetch(`${API_URL}/api/reminders/send-push?admin_token=${token}`, {
                method: 'POST',
              });
              const data = await response.json();

              if (response.ok) {
                Alert.alert(
                  language === 'et' ? 'Õnnestus' : 'Success',
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
      const token = await AsyncStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/api/reminders/send-single/${clientId}?admin_token=${token}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          language === 'et' ? 'Õnnestus' : 'Success',
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
    return date.toLocaleDateString(language === 'et' ? 'et-EE' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
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
          {language === 'et' ? 'Maksemuljatused' : 'Payment Reminders'}
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
                {language === 'et' ? 'Saada kõik' : 'Send All'}
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
                {language === 'et' ? 'Tähtajast üle' : 'Overdue'}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#78350F' }]}>
              <Text style={styles.summaryValue}>{summary.due_today}</Text>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Täna' : 'Today'}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#713F12' }]}>
              <Text style={styles.summaryValue}>{summary.due_soon}</Text>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Peagi' : 'Soon'}
              </Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#14532D' }]}>
              <Text style={styles.summaryValue}>{summary.upcoming}</Text>
              <Text style={styles.summaryLabel}>
                {language === 'et' ? 'Tulemas' : 'Upcoming'}
              </Text>
            </View>
          </View>
          <View style={styles.pushTokenInfo}>
            <Ionicons name="phone-portrait" size={16} color="#64748B" />
            <Text style={styles.pushTokenText}>
              {summary.with_push_token} / {summary.total} {language === 'et' ? 'teavitustega' : 'with push'}
            </Text>
          </View>
        </View>
      )}

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {reminders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            <Text style={styles.emptyText}>
              {language === 'et' ? 'Ootavaid meeldetuletusi pole' : 'No pending reminders'}
            </Text>
          </View>
        ) : (
          reminders.map((reminder) => (
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
                  <Text style={styles.detailLabel}>{language === 'et' ? 'Kuumakse' : 'Monthly EMI'}</Text>
                  <Text style={styles.detailValue}>€{reminder.monthly_emi.toFixed(2)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{language === 'et' ? 'Võlgnevus' : 'Outstanding'}</Text>
                  <Text style={styles.detailValue}>€{reminder.outstanding_balance.toFixed(2)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{language === 'et' ? 'Tähtaeg' : 'Due Date'}</Text>
                  <Text style={styles.detailValue}>{formatDate(reminder.next_payment_due)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{language === 'et' ? 'Päevi' : 'Days'}</Text>
                  <Text style={[styles.detailValue, { color: getReminderTypeColor(reminder.reminder_type) }]}>
                    {reminder.days_until_due < 0 
                      ? `${Math.abs(reminder.days_until_due)} ${language === 'et' ? 'päeva üle' : 'overdue'}`
                      : `${reminder.days_until_due} ${language === 'et' ? 'päeva' : 'days'}`
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
                        ? (language === 'et' ? 'Saada meeldetuletus' : 'Send Reminder')
                        : (language === 'et' ? 'Pole push tokenit' : 'No Push Token')
                      }
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
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
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  sendingButton: {
    backgroundColor: '#6366F1',
  },
  sendAllText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#0F172A',
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
    backgroundColor: '#4F46E5',
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
