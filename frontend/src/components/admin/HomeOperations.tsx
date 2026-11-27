import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authedFetch } from '../../utils/adminAuth';
import API_URL from '../../constants/api';
import { StatusChip } from '../../theme/StatusChip';
import { LOAN_STATUS } from '../../theme/loanStatus';

type HomeRow = {
  id: string;
  name: string;
  phone?: string;
  outstanding_balance: number;
  next_payment_due?: string | null;
  days_overdue?: number;
  is_locked: boolean;
  lock_level?: string;
  heartbeat_status?: string;
};

type HomePayload = {
  today?: string;
  due_today: HomeRow[];
  overdue: HomeRow[];
  locked_devices: HomeRow[];
  collected_this_month: number;
  counts: { due_today: number; overdue: number; locked_devices: number };
};

export function HomeOperations({
  colors,
  formatAmount,
  t,
}: {
  colors: any;
  formatAmount: (n: number) => string;
  t: (k: string) => string;
}) {
  const router = useRouter();
  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/dashboard/home`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      console.log('dashboard home error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleLock = async (row: HomeRow) => {
    const action = row.is_locked ? 'unlock' : 'lock';
    Alert.alert(
      row.is_locked ? (t('unlockDevice') || 'Unlock device') : (t('lockDevice') || 'Lock device'),
      `${row.name}`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: row.is_locked ? 'Unlock' : 'Lock',
          style: row.is_locked ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(row.id);
            try {
              const url = row.is_locked
                ? `${API_URL}/api/clients/${row.id}/unlock`
                : `${API_URL}/api/clients/${row.id}/lock?lock_level=full`;
              const res = await authedFetch(url, { method: 'POST' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              await load();
            } catch (e: any) {
              Alert.alert(t('error') || 'Error', e.message || 'Request failed');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const Card = ({
    title,
    count,
    color,
    icon,
    rows,
  }: {
    title: string;
    count: number;
    color: string;
    icon: any;
    rows: HomeRow[];
  }) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 8, flex: 1 }}>{title}</Text>
        <View style={{ backgroundColor: color, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{count}</Text>
        </View>
      </View>
      {rows.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>None</Text>
      ) : (
        rows.slice(0, 8).map((row) => (
          <TouchableOpacity
            key={row.id}
            onPress={() => router.push(`/admin/client-details?id=${row.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border || '#1E3050' }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{row.name}</Text>
                <StatusChip
                  input={{
                    is_locked: row.is_locked,
                    lock_level: row.lock_level,
                    outstanding_balance: row.outstanding_balance,
                    days_overdue: row.days_overdue,
                    next_payment_due: row.next_payment_due,
                  }}
                  compact
                />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {formatAmount(row.outstanding_balance || 0)}
                {row.days_overdue ? ` · ${row.days_overdue}d overdue` : ''}
                {row.next_payment_due ? ` · due ${String(row.next_payment_due).slice(0, 10)}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => toggleLock(row)}
              disabled={busyId === row.id}
              style={{ backgroundColor: row.is_locked ? '#059669' : '#DC2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginLeft: 8 }}
              accessibilityLabel={row.is_locked ? 'Unlock' : 'Lock'}
            >
              {busyId === row.id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name={row.is_locked ? 'lock-open' : 'lock-closed'} size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}
    </View>
  );

  if (!data && loading) {
    return (
      <View style={{ padding: 16, alignItems: 'center' }}>
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (!data) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="cash" size={22} color="#10B981" />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('collectedThisMonth') || 'Collected this month'}</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{formatAmount(data.collected_this_month || 0)}</Text>
        </View>
        <TouchableOpacity onPress={load}>
          <Ionicons name="refresh" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Card title={t('dueToday') || "Today's due payments"} count={data.counts.due_today} color={LOAN_STATUS.dueSoon.color} icon="today" rows={data.due_today} />
      <Card title={t('overdueClients') || 'Overdue clients'} count={data.counts.overdue} color={LOAN_STATUS.overdue.color} icon="alert-circle" rows={data.overdue} />
      <Card title={t('lockedDevices') || 'Locked devices'} count={data.counts.locked_devices} color={LOAN_STATUS.locked.color} icon="lock-closed" rows={data.locked_devices} />
    </View>
  );
}
