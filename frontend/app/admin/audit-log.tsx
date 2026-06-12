import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useTheme } from '../../src/context/ThemeContext';
import API_URL from '../../src/constants/api';
import { EnterpriseGate } from '../../src/components/EnterpriseGate';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../src/utils/secureStorage';

interface AuditLog {
  id: string;
  admin_id: string;
  admin_username: string;
  action_type: string;
  target_type: string;
  target_id: string;
  target_name: string;
  details: string;
  ip_address: string;
  created_at: string;
}

interface Summary {
  total_actions: number;
  period_days: number;
  action_counts: { [key: string]: number };
  daily_activity: { [key: string]: number };
  top_admins: Array<{ admin_id: string; username: string; action_count: number }>;
}

export default function AuditLogPage() {
  const router = useRouter();
  const { language, t } = useLanguage();
  const { colors } = useTheme();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [actionTypes, setActionTypes] = useState<string[]>([]);

  const fetchLogs = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;

      let url = `${API_URL}/api/audit-logs?admin_token=${adminToken}&limit=100`;
      if (filter) {
        url += `&action_type=${filter}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;

      const response = await fetch(`${API_URL}/api/audit-logs/summary?admin_token=${adminToken}&days=7`);
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchActionTypes = async () => {
    try {
      const adminToken = await getSecureItem('admin_token');
      if (!adminToken) return;

      const response = await fetch(`${API_URL}/api/audit-logs/action-types?admin_token=${adminToken}`);
      if (response.ok) {
        const data = await response.json();
        setActionTypes(data.action_types || []);
      }
    } catch (error) {
      console.error('Failed to fetch action types:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchLogs(), fetchSummary(), fetchActionTypes()]);
      setLoading(false);
    };
    init();
  }, [filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchLogs(), fetchSummary()]);
    setRefreshing(false);
  }, [filter]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(t('enus'), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return 'log-in';
    if (action.includes('create')) return 'add-circle';
    if (action.includes('update') || action.includes('adjust')) return 'pencil';
    if (action.includes('delete')) return 'trash';
    if (action.includes('lock')) return 'lock-closed';
    if (action.includes('unlock')) return 'lock-open';
    if (action.includes('payment')) return 'cash';
    if (action.includes('credit')) return 'star';
    return 'document-text';
  };

  const getActionColor = (action: string) => {
    if (action.includes('login')) return '#2563EB';
    if (action.includes('create')) return '#10B981';
    if (action.includes('delete')) return '#EF4444';
    if (action.includes('lock')) return '#F59E0B';
    if (action.includes('payment')) return '#10B981';
    return '#64748B';
  };

  const formatActionType = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    <EnterpriseGate featureName="Audit Log" requiredPlan="enterprise" featureKey="audit_log">
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface }]}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t('auditLog')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Summary Card */}
        {summary && (
          <View style={[styles.summaryCard, { backgroundColor: colors.surface }]} data-testid="audit-summary-card">
            <Text style={[styles.summaryTitle, { color: colors.text }]}>
              {t('last7Days')}
            </Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{summary.total_actions}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>
                  {t('actions')}
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{Object.keys(summary.action_counts).length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>
                  {t('types')}
                </Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: colors.text }]}>{summary.top_admins.length}</Text>
                <Text style={[styles.summaryStatLabel, { color: colors.textMuted }]}>
                  {t('admins')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterChip, { backgroundColor: colors.surface, borderColor: colors.border }, !filter && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterChipText, { color: colors.textMuted }, !filter && styles.filterChipTextActive]}>
              {t('all')}
            </Text>
          </TouchableOpacity>
          {actionTypes.slice(0, 6).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterChip, { backgroundColor: colors.surface, borderColor: colors.border }, filter === type && styles.filterChipActive]}
              onPress={() => setFilter(type)}
            >
              <Text style={[styles.filterChipText, { color: colors.textMuted }, filter === type && styles.filterChipTextActive]}>
                {formatActionType(type)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Logs List */}
        <View style={styles.logsList}>
          {logs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                {t('noLogsFound')}
              </Text>
            </View>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={[styles.logItem, { backgroundColor: colors.surface }]} data-testid={`log-item-${log.id}`}>
                <View style={[styles.logIcon, { backgroundColor: `${getActionColor(log.action_type)}20` }]}>
                  <Ionicons
                    name={getActionIcon(log.action_type) as any}
                    size={18}
                    color={getActionColor(log.action_type)}
                  />
                </View>
                <View style={styles.logContent}>
                  <View style={styles.logHeader}>
                    <Text style={[styles.logAction, { color: colors.text }]}>{formatActionType(log.action_type)}</Text>
                    <Text style={[styles.logTime, { color: colors.textMuted }]}>{formatDate(log.created_at)}</Text>
                  </View>
                  <Text style={[styles.logAdmin, { color: colors.textMuted }]}>
                    <Ionicons name="person" size={12} color={colors.textMuted} /> {log.admin_username}
                  </Text>
                  {log.target_name && (
                    <Text style={[styles.logTarget, { color: colors.textMuted }]}>
                      <Ionicons name="arrow-forward" size={12} color={colors.textMuted} /> {log.target_name}
                    </Text>
                  )}
                  {log.details && (
                    <Text style={[styles.logDetails, { color: colors.textSecondary }]} numberOfLines={2}>{log.details}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
    </EnterpriseGate>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  // Summary Card
  summaryCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  summaryStatLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  // Filter
  filterContainer: {
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#152035',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
  },
  filterChipText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  // Logs
  logsList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  logItem: {
    flexDirection: 'row',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logContent: {
    flex: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  logTime: {
    fontSize: 11,
    color: '#64748B',
  },
  logAdmin: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 2,
  },
  logTarget: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  logDetails: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
