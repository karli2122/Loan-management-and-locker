import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HB_COLORS, formatAgo, heartbeatAgeMs, heartbeatStatus } from '../../utils/heartbeat';
import { ta } from '../../utils/adminI18n';

interface ChipProps {
  icon: any;
  label: string;
  color: string;
}

const Chip = ({ icon, label, color }: ChipProps) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: color + '22',
      borderColor: color + '66',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginRight: 6,
      marginTop: 4,
    }}
  >
    <Ionicons name={icon} size={11} color={color} />
    <Text style={{ color, fontSize: 11, fontWeight: '600', marginLeft: 3 }}>{label}</Text>
  </View>
);

const TAMPER_LABELS: Record<string, { en: string; et: string }> = {
  permission_revoked: { en: 'Permission revoked', et: 'Luba eemaldatud' },
  device_admin_disabled: { en: 'Device admin disabled', et: 'Seadme admin keelatud' },
  admin_disabled: { en: 'Device admin disabled', et: 'Seadme admin keelatud' },
  uninstall_attempt: { en: 'Uninstall attempt', et: 'Eemaldamiskatse' },
  accessibility_disabled: { en: 'Accessibility off', et: 'Juurdepääsetavus väljas' },
  location_disabled: { en: 'Location off', et: 'Asukoht väljas' },
  overlay_disabled: { en: 'Overlay off', et: 'Ülekate väljas' },
};

export function tamperTypeLabel(type: string | null | undefined, language: string): string {
  if (!type) return '';
  const known = TAMPER_LABELS[type];
  if (known) return language === 'et' ? known.et : known.en;
  return type.replace(/_/g, ' ');
}

/**
 * Compact status chips for a client record: lock, check-in, tamper, reboot, device admin.
 * Works with the fields the live server returns.
 */
export function ClientChips({
  client,
  language,
  showLastSeen = true,
  showLock = true,
}: {
  client: any;
  language: string;
  showLastSeen?: boolean;
  showLock?: boolean;
}) {
  if (!client) return null;
  const chips: React.ReactNode[] = [];
  const registered = !!client.is_registered;

  if (showLock) {
    if (client.is_locked) {
      chips.push(<Chip key="lock" icon="lock-closed" label={ta(language, 'chipLocked')} color="#EF4444" />);
    } else if (client.warning_message) {
      chips.push(<Chip key="warn" icon="alert-circle" label={ta(language, 'chipWarning')} color="#F59E0B" />);
    }
  }

  if (!registered) {
    chips.push(<Chip key="reg" icon="time" label={ta(language, 'chipNotRegistered')} color="#64748B" />);
  } else if (showLastSeen) {
    const st = heartbeatStatus(client.last_heartbeat);
    chips.push(
      <Chip
        key="hb"
        icon="pulse"
        label={st === 'never' ? ta(language, 'neverSeen') : formatAgo(client.last_heartbeat, language)}
        color={HB_COLORS[st]}
      />,
    );
  }

  const tamperN = Number(client.tamper_attempts || 0);
  if (tamperN > 0) {
    const type = tamperTypeLabel(client.last_tamper_type, language);
    const age = heartbeatAgeMs(client.last_tamper_attempt);
    const recent = age !== null && age < 48 * 3600 * 1000;
    chips.push(
      <Chip
        key="tamper"
        icon="warning"
        label={`${tamperN}× ${type || ta(language, 'chipTamper')}${client.last_tamper_attempt ? ` · ${formatAgo(client.last_tamper_attempt, language)}` : ''}`}
        color={recent ? '#EF4444' : '#F97316'}
      />,
    );
  }

  const rebootAge = heartbeatAgeMs(client.last_reboot);
  if (registered && rebootAge !== null && rebootAge < 24 * 3600 * 1000) {
    chips.push(<Chip key="reboot" icon="refresh" label={`${ta(language, 'chipRebooted')} ${formatAgo(client.last_reboot, language)}`} color="#3B82F6" />);
  }

  if (registered && client.admin_mode_active === false) {
    chips.push(<Chip key="admin" icon="shield-outline" label={ta(language, 'chipAdminOff')} color="#EF4444" />);
  }

  if (!chips.length) return null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{chips}</View>;
}
