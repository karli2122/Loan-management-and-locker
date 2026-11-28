import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { computeLockSync, getLockRequest, LockRequest } from '../../utils/lockRequests';
import { formatAgo } from '../../utils/heartbeat';
import { ta } from '../../utils/adminI18n';

/**
 * Shows whether the phone has actually picked up the lock: pending vs applied,
 * with the last time the phone checked in.
 */
export function LockStatusBanner({ client, language, refreshKey }: { client: any; language: string; refreshKey?: any }) {
  const [req, setReq] = useState<LockRequest | null>(null);

  useEffect(() => {
    let alive = true;
    if (client?.id) getLockRequest(String(client.id)).then((r) => alive && setReq(r));
    return () => {
      alive = false;
    };
  }, [client?.id, client?.is_locked, client?.last_heartbeat, refreshKey]);

  if (!client) return null;
  const sync = computeLockSync(client, req);
  if (sync.state === 'unlocked' && !(req && req.action === 'unlock' && Date.now() - req.at < 60 * 60 * 1000)) {
    return null; // nothing noteworthy for an unlocked phone
  }

  let color = '#10B981';
  let icon: any = 'checkmark-circle';
  let text = ta(language, 'lockApplied');
  switch (sync.state) {
    case 'pending':
      color = '#F59E0B';
      icon = 'hourglass';
      text = client.is_locked ? ta(language, 'lockPending') : ta(language, 'unlockPending');
      break;
    case 'phone_offline':
      color = '#EF4444';
      icon = 'cloud-offline';
      text = ta(language, 'lockOffline');
      break;
    case 'unconfirmed':
      color = '#3B82F6';
      icon = 'information-circle';
      text = ta(language, 'lockUnconfirmed');
      break;
    case 'unlocked':
      color = '#10B981';
      icon = 'lock-open';
      text = ta(language, 'unlockedOk');
      break;
    default:
      break;
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color + '1F',
        borderColor: color + '77',
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        marginHorizontal: 16,
        marginTop: 12,
      }}
    >
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{text}</Text>
        <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>
          {ta(language, 'lastSeen')}: {sync.lastSeen ? formatAgo(sync.lastSeen, language) : ta(language, 'neverSeen')}
        </Text>
      </View>
    </View>
  );
}
