import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import API_URL from '../../src/constants/api';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { useTheme } from '../../src/context/ThemeContext';
import { authedFetch, responseError } from '../../src/utils/adminAuth';
import { useClients, clientOutstanding, clientDaysOverdue, invalidateClients } from '../../src/utils/clientsStore';
import { parseServerDate } from '../../src/utils/heartbeat';
import { recordLockRequest } from '../../src/utils/lockRequests';
import { ClientChips } from '../../src/components/admin/ClientChips';
import { ta } from '../../src/utils/adminI18n';

const isToday = (v: any): boolean => {
  const d = parseServerDate(v);
  if (!d) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const phoneDigits = (p: any) => String(p || '').replace(/[^\d]/g, '');

type Row = { c: any; days: number; owed: number };

export default function OverdueQueue() {
  const router = useRouter();
  const { dueToday } = useLocalSearchParams<{ dueToday?: string }>();
  const { language } = useLanguage();
  const { formatAmount } = useCurrency();
  const { colors } = useTheme();
  const { clients, loaded, refreshing, error, refresh } = useClients();
  const [includeDue, setIncludeDue] = useState(dueToday === '1');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null); // client id or 'bulk'
  const [progress, setProgress] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    for (const c of clients) {
      const owed = clientOutstanding(c);
      if (owed <= 0) continue;
      const days = clientDaysOverdue(c);
      if (days > 0 || (includeDue && isToday(c.next_payment_due))) list.push({ c, days, owed });
    }
    list.sort((a, b) => b.days - a.days || b.owed - a.owed);
    return list;
  }, [clients, includeDue]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const warnOne = async (c: any, silent = false) => {
    const res = await authedFetch(`${API_URL}/api/clients/${c.id}/warning?message=${encodeURIComponent(ta(language, 'defaultWarning'))}`, { method: 'POST' });
    if (!res.ok) throw new Error(await responseError(res, 'Failed'));
    return true;
  };
  const lockOne = async (c: any) => {
    const res = await authedFetch(`${API_URL}/api/clients/${c.id}/lock?message=${encodeURIComponent(ta(language, 'defaultWarning'))}`, { method: 'POST' });
    if (!res.ok) throw new Error(await responseError(res, 'Failed'));
    await recordLockRequest(String(c.id), 'lock', c.last_heartbeat);
    return true;
  };

  const single = async (kind: 'warn' | 'lock', c: any) => {
    const run = async () => {
      setBusy(String(c.id));
      try {
        kind === 'warn' ? await warnOne(c) : await lockOne(c);
        invalidateClients();
        await refresh(true);
        Alert.alert(ta(language, 'bulkDone'), c.name || '');
      } catch (e: any) {
        Alert.alert(language === 'et' ? 'Viga' : 'Error', e?.message || 'Failed');
      } finally {
        setBusy(null);
      }
    };
    if (kind === 'lock') {
      Alert.alert(ta(language, 'lockAction'), `${c.name || ''}?`, [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        { text: ta(language, 'lockAction'), style: 'destructive', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const bulk = (kind: 'warn' | 'lock') => {
    const targets = rows.filter((r) => selected.has(String(r.c.id))).map((r) => r.c);
    if (!targets.length) return;
    const run = async () => {
      setBusy('bulk');
      let ok = 0;
      const failed: string[] = [];
      let idx = 0;
      const worker = async () => {
        while (idx < targets.length) {
          const c = targets[idx++];
          try {
            kind === 'warn' ? await warnOne(c) : await lockOne(c);
            ok++;
          } catch {
            failed.push(c.name || String(c.id));
          }
          setProgress(`${ok + failed.length}/${targets.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setProgress(null);
      setBusy(null);
      setSelected(new Set());
      invalidateClients();
      refresh(true);
      Alert.alert(
        ta(language, 'bulkDone'),
        `${ok}/${targets.length} ✓` + (failed.length ? `\n${language === 'et' ? 'Ebaõnnestus' : 'Failed'}: ${failed.slice(0, 8).join(', ')}` : ''),
      );
    };
    Alert.alert(
      kind === 'lock' ? ta(language, 'lockSelected') : ta(language, 'warnSelected'),
      `${targets.length}`,
      [
        { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
        { text: 'OK', style: kind === 'lock' ? 'destructive' : 'default', onPress: run },
      ],
    );
  };

  const call = (c: any) => c.phone && Linking.openURL(`tel:${String(c.phone).replace(/\s/g, '')}`);
  const whatsapp = (c: any, owed: number) => {
    const digits = phoneDigits(c.phone);
    if (!digits) return;
    const msg = ta(language, 'whatsappText', { name: c.name || '', amount: formatAmount(owed) });
    Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`).catch(() =>
      Alert.alert('WhatsApp', language === 'et' ? 'WhatsAppi ei saanud avada' : 'Could not open WhatsApp'),
    );
  };

  const ActionBtn = ({ icon, color, label, onPress, disabled }: any) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[s.act, { backgroundColor: color + '22', borderColor: color + '66', opacity: disabled ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: '700', marginTop: 2 }}>{label}</Text>
    </TouchableOpacity>
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      const { c, days, owed } = item;
      const id = String(c.id);
      const isSel = selected.has(id);
      const rowBusy = busy === id || busy === 'bulk';
      return (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: isSel ? '#2563EB' : colors.border }]}>
          <TouchableOpacity style={s.top} onPress={() => toggle(id)} onLongPress={() => router.push(`/admin/client-details?id=${id}`)} activeOpacity={0.8}>
            <Ionicons name={isSel ? 'checkbox' : 'square-outline'} size={22} color={isSel ? '#2563EB' : colors.textMuted} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <TouchableOpacity onPress={() => router.push(`/admin/client-details?id=${id}`)}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{c.name || '—'}</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.phone || ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: days > 0 ? '#EF4444' : '#F59E0B', fontWeight: '800', fontSize: 14 }}>
                {days > 0 ? `${days} ${ta(language, 'daysLate')}` : ta(language, 'dueTodayShort')}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{formatAmount(owed)}</Text>
            </View>
          </TouchableOpacity>
          <ClientChips client={c} language={language} />
          <View style={s.actions}>
            <ActionBtn icon="call" color="#10B981" label={ta(language, 'callAction')} onPress={() => call(c)} disabled={!c.phone} />
            <ActionBtn icon="logo-whatsapp" color="#22C55E" label={ta(language, 'whatsappAction')} onPress={() => whatsapp(c, owed)} disabled={!phoneDigits(c.phone)} />
            <ActionBtn icon="warning" color="#F59E0B" label={ta(language, 'warnAction')} onPress={() => single('warn', c)} disabled={rowBusy} />
            <ActionBtn icon="lock-closed" color="#EF4444" label={ta(language, 'lockAction')} onPress={() => single('lock', c)} disabled={rowBusy || !!c.is_locked} />
            <ActionBtn icon="cash" color="#3B82F6" label={ta(language, 'payAction')} onPress={() => router.push(`/admin/client-details?id=${id}&pay=1`)} />
          </View>
        </View>
      );
    },
    [selected, busy, colors, language, formatAmount],
  );

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(String(r.c.id)));
  const totalOwed = rows.reduce((sum, r) => sum + r.owed, 0);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[s.back, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{ta(language, 'queueTitle')}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{rows.length} · {formatAmount(totalOwed)}</Text>
        </View>
        <TouchableOpacity onPress={() => setIncludeDue((v) => !v)} style={[s.pill, { backgroundColor: includeDue ? '#2563EB' : colors.surface, borderColor: colors.border }]}>
          <Text style={{ color: includeDue ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '600' }}>{ta(language, 'includeDueToday')}</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.banner}>
          <Ionicons name="cloud-offline" size={16} color="#fff" />
          <Text style={{ color: '#fff', flex: 1, marginLeft: 8, fontSize: 13 }}>{ta(language, 'offlineBanner')}</Text>
          <TouchableOpacity onPress={() => refresh(true)}><Text style={{ color: '#fff', fontWeight: '700' }}>{ta(language, 'retry')}</Text></TouchableOpacity>
        </View>
      )}

      {rows.length > 0 && (
        <View style={s.bar}>
          <TouchableOpacity onPress={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => String(r.c.id))))}>
            <Text style={{ color: '#3B82F6', fontWeight: '600' }}>{allSelected ? ta(language, 'clearSelection') : ta(language, 'selectAll')}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }}>{selected.size > 0 ? `${selected.size} ✓` : ''}{progress ? `  ${progress}` : ''}</Text>
        </View>
      )}

      {!loaded ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#3B82F6" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.c.id)}
          renderItem={renderItem}
          extraData={selected}
          contentContainerStyle={{ padding: 12, paddingBottom: selected.size ? 90 : 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor="#3B82F6" />}
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>{ta(language, 'queueEmpty')}</Text>}
        />
      )}

      {selected.size > 0 && (
        <View style={[s.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TouchableOpacity disabled={busy === 'bulk'} onPress={() => bulk('warn')} style={[s.bulkBtn, { backgroundColor: '#F59E0B' }]}>
            {busy === 'bulk' ? <ActivityIndicator color="#fff" /> : <Text style={s.bulkTxt}>{ta(language, 'warnSelected')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity disabled={busy === 'bulk'} onPress={() => bulk('lock')} style={[s.bulkBtn, { backgroundColor: '#EF4444' }]}>
            <Text style={s.bulkTxt}>{ta(language, 'lockSelected')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B45309', padding: 10, marginHorizontal: 12, marginTop: 8, borderRadius: 10 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  act: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1, marginHorizontal: 3 },
  bulkBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: 12, borderTopWidth: 1 },
  bulkBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, marginHorizontal: 4 },
  bulkTxt: { color: '#fff', fontWeight: '800' },
});
