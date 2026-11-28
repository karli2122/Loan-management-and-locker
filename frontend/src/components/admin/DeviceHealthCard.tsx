import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authedFetch } from '../../utils/adminAuth';
import API_URL from '../../constants/api';
import { StatusChip } from '../../theme/StatusChip';
import { HB_COLORS, formatAgo, heartbeatStatus, parseServerDate } from '../../utils/heartbeat';
import { ta } from '../../utils/adminI18n';
import { tamperTypeLabel } from './ClientChips';

// The deployed server has no /device-health endpoint. After the first 404 we stop asking and
// build the card from the client record (the fields the old server does return).
let endpointUnsupported = false;

function fmt(value: any) {
  const d = parseServerDate(value);
  return d ? d.toLocaleString() : '—';
}

function fromClient(c: any) {
  return {
    heartbeat_status: heartbeatStatus(c?.last_heartbeat),
    last_check_in: c?.last_heartbeat,
    location: c?.latitude != null ? { latitude: c.latitude, longitude: c.longitude } : null,
    last_location_update: c?.last_location_update,
    tamper: { attempts: c?.tamper_attempts || 0, last_type: c?.last_tamper_type, last_at: c?.last_tamper_attempt },
    last_reboot: c?.last_reboot,
    lock_mode: c?.lock_mode,
    device_admin_active: c?.admin_mode_active,
    device_owner_active: c?.device_owner_active,
    app_version: c?.app_version,
    android_version: c?.android_version,
    device_model: [c?.device_make, c?.device_model].filter(Boolean).join(' '),
    battery_level: c?.battery_level,
    is_locked: c?.is_locked,
    lock_level: c?.lock_level,
    outstanding_balance: c?.outstanding_balance,
    days_overdue: c?.days_overdue,
    next_payment_due: c?.next_payment_due,
  };
}

export function DeviceHealthCard({
  clientId,
  client,
  colors,
  language = 'en',
}: {
  clientId: string;
  client?: any;
  colors: any;
  language?: string;
}) {
  const [remote, setRemote] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clientId || endpointUnsupported) return;
    setLoading(true);
    try {
      const res = await authedFetch(`${API_URL}/api/clients/${clientId}/device-health`);
      if (res.ok) setRemote(await res.json());
      else if (res.status === 404 || res.status === 405) endpointUnsupported = true;
    } catch {
      // network problem: fall back to the client record below
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, client?.last_heartbeat]);

  const health: any = { ...fromClient(client), ...(remote || {}) };
  if (!client && !remote) {
    return loading ? (
      <View style={{ padding: 16 }}>
        <ActivityIndicator color="#2563EB" />
      </View>
    ) : null;
  }

  const status = health.heartbeat_status || 'never';
  const color = HB_COLORS[status as keyof typeof HB_COLORS] || '#64748B';
  const loc = health.location || {};
  const enrollment = (health.lock_mode || health.capabilities?.enrollment || 'device_admin') === 'device_owner'
    ? 'Device Owner (9-digit code)'
    : 'Device Admin (8-digit code)';
  const tamperType = tamperTypeLabel(health.tamper?.last_type, language);
  const rows: { icon: string; label: string; value: string }[] = [
    { icon: 'pulse', label: ta(language, 'lastCheckIn'), value: health.last_check_in ? `${fmt(health.last_check_in)} (${formatAgo(health.last_check_in, language)})` : ta(language, 'neverSeen') },
  ];
  if (health.battery_level != null) rows.push({ icon: 'battery-half', label: ta(language, 'battery'), value: `${health.battery_level}%` });
  rows.push(
    { icon: 'location', label: ta(language, 'locationLabel'), value: loc.latitude != null ? `${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}` : '—' },
    {
      icon: 'warning',
      label: ta(language, 'tamperLabel'),
      value: `${health.tamper?.attempts || 0}${tamperType ? ` · ${tamperType}` : ''}${health.tamper?.last_at ? ` · ${formatAgo(health.tamper.last_at, language)}` : ''}`,
    },
    { icon: 'refresh', label: ta(language, 'lastReboot'), value: fmt(health.last_reboot) },
    { icon: 'shield', label: ta(language, 'enrollment'), value: enrollment },
    {
      icon: 'shield-checkmark',
      label: ta(language, 'deviceAdminLabel'),
      value: health.device_admin_active === undefined || health.device_admin_active === null ? '—' : health.device_admin_active ? ta(language, 'active') : ta(language, 'inactive'),
    },
  );
  if (health.app_version) rows.push({ icon: 'information-circle', label: 'App', value: String(health.app_version) });
  if (health.android_version || health.device_model) rows.push({ icon: 'phone-portrait', label: 'Android', value: String(health.android_version || health.device_model) });

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{ta(language, 'deviceHealth')}</Text>
        <StatusChip
          input={{
            is_locked: health.is_locked,
            lock_level: health.lock_level,
            outstanding_balance: health.outstanding_balance,
            days_overdue: health.days_overdue,
            next_payment_due: health.next_payment_due,
          }}
          compact
          style={{ marginRight: 8 }}
        />
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
