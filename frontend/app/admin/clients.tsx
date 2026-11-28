import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useLanguage } from '../../src/context/LanguageContext';
import { useTheme } from '../../src/context/ThemeContext';
import { resolveLoanStatus } from '../../src/theme/loanStatus';
import { useClients, clientOutstanding, clientDaysOverdue } from '../../src/utils/clientsStore';
import { heartbeatAgeMs, heartbeatStatus, parseServerDate } from '../../src/utils/heartbeat';
import { ClientChips } from '../../src/components/admin/ClientChips';
import { ta } from '../../src/utils/adminI18n';

type FilterKey = 'all' | 'locked' | 'unlocked' | 'silent' | 'tamper' | 'unregistered';
type SortKey = 'overdue' | 'balance' | 'lastSeen' | 'name';

const PAGE_SIZE = 30;
const FILTERS: FilterKey[] = ['all', 'locked', 'unlocked', 'silent', 'tamper', 'unregistered'];
const SORTS: SortKey[] = ['overdue', 'balance', 'lastSeen', 'name'];

const text = (v: any) => (v === null || v === undefined ? '' : String(v));

export default function ClientsList() {
  const router = useRouter();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const { t, language } = useLanguage();
  const { formatAmount } = useCurrency();
  const { colors } = useTheme();
  const { clients, loaded, refreshing, error, refresh } = useClients();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('overdue');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [picker, setPicker] = useState<null | 'filter' | 'sort'>(null);

  useEffect(() => {
    if (filterParam && (FILTERS as string[]).includes(String(filterParam))) {
      setFilter(String(filterParam) as FilterKey);
    }
  }, [filterParam]);

  // Search / filter / sort are derived from state on every render, so a background refresh
  // can never reset them (the old list re-applied stale values after returning from a client).
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = clients.filter((c) => {
      if (q) {
        const hay = `${text(c.name)} ${text(c.phone)} ${text(c.email)} ${text(c.device_model)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case 'locked':
          return c.is_locked === true;
        case 'unlocked':
          return !c.is_locked;
        case 'silent':
          return !!c.is_registered && heartbeatStatus(c.last_heartbeat) !== 'online' && heartbeatStatus(c.last_heartbeat) !== 'stale';
        case 'tamper':
          return Number(c.tamper_attempts || 0) > 0 || (!!c.is_registered && c.admin_mode_active === false);
        case 'unregistered':
          return !c.is_registered;
        default:
          return true;
      }
    });
    const lastSeenKey = (c: any) => parseServerDate(c.last_heartbeat)?.getTime() ?? -1; // never seen first
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'overdue':
          return clientDaysOverdue(b) - clientDaysOverdue(a) || clientOutstanding(b) - clientOutstanding(a);
        case 'balance':
          return clientOutstanding(b) - clientOutstanding(a);
        case 'lastSeen':
          return lastSeenKey(a) - lastSeenKey(b);
        default:
          return text(a.name).localeCompare(text(b.name));
      }
    });
    return list;
  }, [clients, searchQuery, filter, sort]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [searchQuery, filter, sort]);

  const shown = filtered.slice(0, visible);

  const filterLabel = (f: FilterKey) => {
    switch (f) {
      case 'all': return t('all');
      case 'locked': return t('locked');
      case 'unlocked': return t('unlocked');
      case 'silent': return t('silent');
      case 'tamper': return ta(language, 'filterTamper');
      default: return ta(language, 'filterUnregistered');
    }
  };
  const sortLabel = (s: SortKey) => {
    switch (s) {
      case 'overdue': return ta(language, 'sortOverdue');
      case 'balance': return ta(language, 'sortBalance');
      case 'lastSeen': return ta(language, 'sortLastSeen');
      default: return ta(language, 'sortName');
    }
  };

  const renderClient = ({ item }: { item: any }) => {
    const outstanding = clientOutstanding(item);
    const daysOverdue = clientDaysOverdue(item);
    const isPaid = outstanding <= 0 && Number(item.loan_amount || 0) > 0;
    const isOverdue = daysOverdue > 0 && outstanding > 0;
    const dueColor = resolveLoanStatus({
      outstanding_balance: outstanding,
      loan_amount: item.loan_amount,
      days_overdue: daysOverdue,
      loan_due_date: item.loan_due_date || item.emi_due_date,
      next_payment_due: item.next_payment_due,
    }).color;
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: '/admin/client-details', params: { id: item.id } })}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {item.name || item.phone || '—'}
          </Text>
          <Text style={[styles.phone, { color: colors.textMuted }]}>{item.phone || '—'}</Text>
          <Text style={[styles.amount, { color: dueColor }]}>
            {isPaid ? '100% Paid' : `${t('due')}: ${formatAmount(outstanding)}`}
            {isOverdue ? ` (${daysOverdue}d ${t('overdue') || 'overdue'})` : ''}
          </Text>
          <ClientChips client={item} language={language} />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    );
  };

  const pickerItems = picker === 'sort' ? SORTS : FILTERS;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('clients')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/admin/add-client')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pickerRow}>
        <TouchableOpacity
          style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setPicker('filter')}
          data-testid="filter-dropdown"
        >
          <Ionicons name="filter" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{filterLabel(filter)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setPicker('sort')}
          data-testid="sort-dropdown"
        >
          <Ionicons name="swap-vertical" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>{sortLabel(sort)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {!!error && (
        <TouchableOpacity onPress={() => refresh(true)} style={styles.errorBanner}>
          <Ionicons name="cloud-offline" size={16} color="#fff" />
          <Text style={styles.errorText}>{ta(language, 'offlineBanner')}</Text>
          <Text style={styles.errorRetry}>{ta(language, 'retry')}</Text>
        </TouchableOpacity>
      )}

      {!loaded && clients.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderClient}
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (visible < filtered.length) setVisible((v) => v + PAGE_SIZE);
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} tintColor={colors.primary} />}
          ListFooterComponent={
            visible < filtered.length ? (
              <TouchableOpacity style={styles.loadMore} onPress={() => setVisible((v) => v + PAGE_SIZE)}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>
                  {ta(language, 'loadMore')} ({filtered.length - visible})
                </Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={{ color: colors.text, fontSize: 16, marginTop: 12 }}>{t('noClientsFound')}</Text>
            </View>
          }
        />
      )}

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPicker(null)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {picker === 'sort' ? ta(language, 'sortBy') : t('filterClients')}
            </Text>
            {pickerItems.map((k: any) => {
              const active = picker === 'sort' ? sort === k : filter === k;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.modalItem, { borderBottomColor: colors.border }, active && { backgroundColor: colors.primary }]}
                  onPress={() => {
                    if (picker === 'sort') setSort(k);
                    else setFilter(k);
                    setPicker(null);
                  }}
                >
                  <Text style={{ color: active ? '#fff' : colors.text, flex: 1 }}>
                    {picker === 'sort' ? sortLabel(k) : filterLabel(k)}
                  </Text>
                  {active && <Ionicons name="checkmark" size={20} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  backButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: 'bold' },
  addButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, paddingHorizontal: 14, borderRadius: 12 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16 },
  pickerRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  dropdown: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginRight: 8 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#B45309', marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10 },
  errorText: { color: '#fff', flex: 1, marginLeft: 8, fontSize: 13 },
  errorRetry: { color: '#fff', fontWeight: '700', textDecorationLine: 'underline' },
  listContent: { padding: 16, paddingTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '700' },
  phone: { fontSize: 14, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadMore: { alignItems: 'center', padding: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalContent: { borderRadius: 16, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderRadius: 8 },
});
