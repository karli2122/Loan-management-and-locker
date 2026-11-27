import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authedFetch } from '../../utils/adminAuth';
import API_URL from '../../constants/api';

const STATUS_COLOR: Record<string, string> = {
  online: '#10B981',
  stale: '#F59E0B',
  offline: '#EF4444',
};

function fmt(value: any) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  } catch {
    return String(value);
  }
}

export function DeviceHealthCard({ clientId, colors }: { clientId: string; colors: any }) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/clients/${clientId}/device-health`);
      if (res.ok) setHealth(await res.json());
    } catch (e) {
      console.log('device health error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [clientId]);

  if (!health && loading) {
    return (
      <View style={{ padding: 16 }}>
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (!health) return null;

  const status = health.heartbeat_status || 'offline';
  const color = STATUS_COLOR[status] || '#64748B';
  const loc = health.location || {};
  const rows = [
    { icon: 'pulse', label: 'Last check-in', value: fmt(health.last_check_in) },
    { icon: 'battery-half', label: 'Battery', value: health.battery_level != null ? `${health.battery_level}%` : '—' },
    {
      icon: 'location',
      label: 'Location',
      value: loc.latitude != null ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}` : '—',
    },
    {
      icon: 'warning',
      label: 'Tamper',
      value: `${health.tamper?.attempts || 0} attempt(s)${health.tamper?.last_type ? ` · ${health.tamper.last_type}` : ''}`,
    },
    { icon: 'refresh', label: 'Last reboot', value: fmt(health.last_reboot) },
    {
      icon: 'shield',
      label: 'Enrollment',
      value: (health.lock_mode || health.capabilities?.enrollment || 'device_admin') === 'device_owner'
        ? 'Device Owner (9-digit code)'
        : 'Device Admin (8-digit code)',
    },
    {
      icon: 'shield-checkmark',
      label: 'Device Admin',
      value: health.device_admin_active ? 'Active' : 'Inactive',
    },
    {
      icon: 'hardware-chip',
      label: 'Device Owner',
      value: health.device_owner_active ? 'Active' : 'Inactive',
    },
    {
      icon: 'lock-closed',
      label: 'Lock levels',
      value: (health.capabilities?.supported_lock_levels || ['none', 'warning', 'full']).join(', '),
    },
    { icon: 'information-circle', label: 'App version', value: health.app_version || '—' },
    { icon: 'phone-portrait', label: 'Android', value: health.android_version || health.device_model || '—' },
  ];

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }}>Device health</Text>
        <View style={{ backgroundColor: color, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11, textTransform: 'uppercase' }}>{status}</Text>
        </View>
        <TouchableOpacity onPress={load}>
          <Ionicons name="refresh" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Ionicons name={row.icon as any} size={16} color="#64748B" />
          <Text style={{ color: colors.textMuted, marginLeft: 8, width: 120, fontSize: 13 }}>{row.label}</Text>
          <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{row.value}</Text>
        </View>
      ))}
      {(health.capabilities?.gaps || []).length > 0 && (
        <View style={{ marginTop: 8, backgroundColor: 'rgba(245, 158, 11, 0.12)', borderRadius: 8, padding: 10 }}>
          <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>Capability gaps</Text>
          {health.capabilities.gaps.map((gap: string) => (
            <Text key={gap} style={{ color: colors.text, fontSize: 12, marginTop: 2 }}>• {gap}</Text>
          ))}
        </View>
      )}
    </View>
  );
}
