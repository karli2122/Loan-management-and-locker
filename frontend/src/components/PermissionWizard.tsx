/**
 * Full-screen, one-step-at-a-time permission setup for Device Admin phones
 * (buyer's own phone, no adb / Device Owner). Steps that are already granted are
 * skipped, the screen re-checks automatically when the user comes back from Android
 * Settings, and only non-essential steps can be postponed ("Later").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devicePolicy } from '../utils/DevicePolicy';

export type WizardStepId =
  | 'deviceAdmin'
  | 'overlay'
  | 'battery'
  | 'notifications'
  | 'fullScreenIntent'
  | 'locationFg'
  | 'locationBg'
  | 'accessibility'
  | 'notificationListener'
  | 'usageStats'
  | 'autoStart';

const ORDER: WizardStepId[] = [
  'deviceAdmin',
  'overlay',
  'battery',
  'notifications',
  'fullScreenIntent',
  'locationFg',
  'locationBg',
  'accessibility',
  'notificationListener',
  'usageStats',
  'autoStart',
];

/** Steps that cannot be postponed. */
const ESSENTIAL: WizardStepId[] = [
  'deviceAdmin',
  'overlay',
  'battery',
  'notifications',
  'locationFg',
  'locationBg',
  'accessibility',
];

const LATER_KEY = 'wizard_later';
const LATER_MS = 24 * 60 * 60 * 1000;

const ICONS: Record<WizardStepId, keyof typeof Ionicons.glyphMap> = {
  deviceAdmin: 'shield-checkmark',
  overlay: 'layers',
  battery: 'battery-charging',
  notifications: 'notifications',
  fullScreenIntent: 'expand',
  locationFg: 'location',
  locationBg: 'navigate',
  accessibility: 'accessibility',
  notificationListener: 'chatbox-ellipses',
  usageStats: 'stats-chart',
  autoStart: 'power',
};

type Oem = 'samsung' | 'xiaomi' | 'other';

function detectOem(): Oem {
  const d = devicePolicy.getDeviceInfo();
  const m = `${d?.manufacturer || ''} ${d?.brand || ''}`.toLowerCase();
  if (m.includes('samsung')) return 'samsung';
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) return 'xiaomi';
  return 'other';
}

function applicableSteps(sdk: number): WizardStepId[] {
  return ORDER.filter(id => {
    if (id === 'fullScreenIntent') return sdk >= 34;
    if (id === 'locationBg') return sdk >= 29; // below Android 10 foreground covers background
    return true;
  });
}

export type WizardStatus = Record<WizardStepId, boolean>;

/** Real permission state for every wizard step. */
export async function checkWizardStatus(): Promise<WizardStatus> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
  const [admin, overlay, battery, notif, fsi, fg, bg, a11y, listener, usage, autostart] = await Promise.all([
    safe(devicePolicy.isAdminActive(), false),
    safe(devicePolicy.canDrawOverlays(), false),
    safe(devicePolicy.isIgnoringBatteryOptimizations(), false),
    safe(Notifications.getPermissionsAsync().then(r => r.status === 'granted'), false),
    safe(devicePolicy.canUseFullScreenIntent(), true),
    safe(Location.getForegroundPermissionsAsync().then(r => r.status === 'granted'), false),
    safe(Location.getBackgroundPermissionsAsync().then(r => r.status === 'granted'), false),
    safe(devicePolicy.isAccessibilityEnabled(), false),
    safe(devicePolicy.hasNotificationListenerPermission(), false),
    safe(devicePolicy.hasUsageStatsPermission(), false),
    safe(AsyncStorage.getItem('autostart_enabled').then(v => v === 'true'), false),
  ]);
  return {
    deviceAdmin: !!admin,
    overlay: !!overlay,
    battery: !!battery,
    notifications: !!notif,
    fullScreenIntent: !!fsi,
    locationFg: !!fg,
    locationBg: !!bg,
    accessibility: !!a11y,
    notificationListener: !!listener,
    usageStats: !!usage,
    autoStart: !!autostart,
  };
}

async function loadLater(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(LATER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function isDeferred(later: Record<string, number>, id: WizardStepId): boolean {
  if (ESSENTIAL.includes(id)) return false;
  const at = later[id];
  return !!at && Date.now() - at < LATER_MS;
}

/** True when the wizard has something to show (missing essential or not-postponed optional step). */
export async function wizardHasPendingSteps(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const sdk = devicePolicy.getDeviceInfo()?.sdkVersion || 0;
  const [status, later] = await Promise.all([checkWizardStatus(), loadLater()]);
  return applicableSteps(sdk).some(id => !status[id] && !isDeferred(later, id));
}

interface Props {
  visible: boolean;
  t: (key: string) => string;
  /** Called when every applicable step is done (or postponed) and the user taps Finish. */
  onClose: () => void;
  /** Request Device Admin (shows the system dialog, waits for the result). */
  onRequestAdmin: () => Promise<void>;
  /** Something changed — let the home screen refresh its own permission states. */
  onChanged?: () => void;
  onNotificationsGranted?: () => void;
  onBackgroundLocationGranted?: () => void;
}

export default function PermissionWizard({
  visible,
  t,
  onClose,
  onRequestAdmin,
  onChanged,
  onNotificationsGranted,
  onBackgroundLocationGranted,
}: Props) {
  const dev = useMemo(() => devicePolicy.getDeviceInfo(), []);
  const sdk = dev?.sdkVersion || 0;
  const oem = useMemo(detectOem, []);
  const steps = useMemo(() => applicableSteps(sdk), [sdk]);
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [later, setLater] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notYet, setNotYet] = useState(false);
  const statusRef = useRef<WizardStatus | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Text helper: OEM-specific variant first (e.g. wizBattery_samsung), then generic.
  const tx = useCallback(
    (key: string) => {
      const specific = `${key}_${oem}`;
      const v = t(specific);
      if (v && v !== specific) return v;
      return t(key);
    },
    [t, oem],
  );

  const refresh = useCallback(async () => {
    const [s, l] = await Promise.all([checkWizardStatus(), loadLater()]);
    const prev = statusRef.current;
    statusRef.current = s;
    setStatus(s);
    setLater(l);
    if (!prev || Object.keys(s).some(k => (prev as any)[k] !== (s as any)[k])) {
      setNotYet(false);
      onChangedRef.current?.();
    }
    return s;
  }, []);

  // Initial load + auto-advance when coming back from Settings.
  useEffect(() => {
    if (!visible) return;
    refresh();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        // Some Settings pages commit their change a moment after we resume.
        setTimeout(refresh, 400);
        setTimeout(refresh, 1500);
      }
    });
    const iv = setInterval(refresh, 4000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [visible, refresh]);

  const pending = useMemo(
    () => (status ? steps.filter(id => !status[id] && !isDeferred(later, id)) : []),
    [status, steps, later],
  );
  const current: WizardStepId | null = pending[0] || null;
  const doneCount = status ? steps.filter(id => status[id]).length : 0;
  const essentialMissing = status ? steps.some(id => ESSENTIAL.includes(id) && !status[id]) : true;

  const postpone = async (id: WizardStepId) => {
    const next = { ...later, [id]: Date.now() };
    setLater(next);
    await AsyncStorage.setItem(LATER_KEY, JSON.stringify(next)).catch(() => {});
  };

  const verifySoon = async () => {
    await new Promise(r => setTimeout(r, 800));
    const s = await refresh();
    if (current && !s[current]) setNotYet(true);
  };

  const primary = async () => {
    if (!current || busy) return;
    setBusy(true);
    setNotYet(false);
    try {
      switch (current) {
        case 'deviceAdmin':
          await onRequestAdmin();
          break;
        case 'overlay':
          await devicePolicy.requestOverlayPermission();
          break;
        case 'battery':
          if (oem === 'samsung') {
            // The system dialog is unreliable on One UI; app info › Battery › Unrestricted.
            const r = await devicePolicy.requestBatteryOptimization();
            if (typeof r === 'string' && r.startsWith('error')) await devicePolicy.openBatterySettings();
          } else {
            await devicePolicy.requestBatteryOptimization();
          }
          break;
        case 'notifications': {
          const r = await Notifications.requestPermissionsAsync();
          if (r.status === 'granted') onNotificationsGranted?.();
          else await devicePolicy.openNotificationSettings();
          break;
        }
        case 'fullScreenIntent':
          await devicePolicy.openFullScreenIntentSettings();
          break;
        case 'locationFg': {
          const r = await Location.requestForegroundPermissionsAsync();
          if (r.status !== 'granted' && r.canAskAgain === false) await Linking.openSettings();
          break;
        }
        case 'locationBg': {
          const r = await Location.requestBackgroundPermissionsAsync();
          if (r.status === 'granted') onBackgroundLocationGranted?.();
          else if (r.canAskAgain === false) await Linking.openSettings();
          break;
        }
        case 'accessibility':
          await devicePolicy.openAccessibilitySettings();
          break;
        case 'notificationListener':
          await devicePolicy.requestNotificationListenerPermission();
          break;
        case 'usageStats':
          await devicePolicy.requestUsageStatsPermission();
          break;
        case 'autoStart':
          await devicePolicy.openAutoStartSettings();
          break;
      }
    } catch (e) {
      console.log('[Wizard] action error:', e);
    } finally {
      setBusy(false);
    }
    // In-app dialogs (runtime permissions, Device Admin) return without an AppState change.
    if (current === 'deviceAdmin' || current === 'notifications' || current === 'locationFg' || current === 'locationBg') {
      verifySoon();
    }
  };

  const secondary = async () => {
    if (!current) return;
    try {
      if (current === 'overlay' && oem === 'xiaomi') await devicePolicy.openOemPermissionEditor();
      else if (current === 'battery') await devicePolicy.openBatterySettings();
      else await devicePolicy.openAppInfo();
    } catch (e) {
      console.log('[Wizard] secondary error:', e);
    }
  };

  const confirmAutoStart = async () => {
    await AsyncStorage.setItem('autostart_enabled', 'true').catch(() => {});
    await refresh();
  };

  if (Platform.OS !== 'android') return null;

  const needsRestricted = sdk >= 33 && (current === 'accessibility' || current === 'notificationListener');
  const hasSecondary =
    needsRestricted || current === 'battery' || (current === 'overlay' && oem === 'xiaomi');
  const secondaryLabel =
    current === 'overlay' ? t('wizOtherPermissions') : current === 'battery' ? t('wizOpenAppInfo') : t('wizOpenAppInfo');
  const primaryLabel =
    current === 'deviceAdmin'
      ? t('wizActivate')
      : current === 'notifications' || current === 'locationFg'
        ? t('wizAllow')
        : t('wizOpenSettings');
  const stepIndex = current ? steps.indexOf(current) + 1 : steps.length;
  const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!essentialMissing) onClose();
      }}
    >
      <View style={styles.container} data-testid="permission-wizard">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('wizTitle')}</Text>
          <Text style={styles.headerSub}>
            {current ? t('wizStepOf').replace('{n}', String(stepIndex)).replace('{total}', String(steps.length)) : ''}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((doneCount / Math.max(1, steps.length)) * 100)}%` }]} />
          </View>
          <View style={styles.dots}>
            {steps.map(id => (
              <View
                key={id}
                style={[
                  styles.dot,
                  status?.[id] ? styles.dotDone : id === current ? styles.dotCurrent : isDeferred(later, id) ? styles.dotLater : null,
                ]}
              />
            ))}
          </View>
        </View>

        {!status ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        ) : !current ? (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle" size={96} color="#10B981" />
            <Text style={styles.doneTitle}>{t('wizDoneTitle')}</Text>
            <Text style={styles.doneBody}>{t('wizDoneBody')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose} data-testid="wizard-finish">
              <Text style={styles.primaryText}>{t('wizFinish')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.iconWrap}>
              <Ionicons name={ICONS[current]} size={56} color="#F97316" />
            </View>
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, ESSENTIAL.includes(current) ? styles.badgeReq : styles.badgeOpt]}>
                {ESSENTIAL.includes(current) ? t('wizRequired') : t('wizRecommended')}
              </Text>
            </View>
            <Text style={styles.title}>{tx(`wiz${cap(current)}Title`)}</Text>
            <Text style={styles.why}>{tx(`wiz${cap(current)}Why`)}</Text>

            {/* "Illustration": where to tap, as a Settings breadcrumb for this phone brand */}
            {(() => {
              const key = `wiz${cap(current)}Path`;
              const path = tx(key);
              if (!path || path === key || path === `${key}_${oem}`) return null;
              return (
                <View style={styles.pathCard}>
                  {path.split('›').map((part, i, arr) => (
                    <View key={i} style={styles.pathRow}>
                      <Text style={styles.pathChip}>{part.trim()}</Text>
                      {i < arr.length - 1 && <Ionicons name="chevron-forward" size={14} color="#64748B" />}
                    </View>
                  ))}
                </View>
              );
            })()}

            <View style={styles.stepsCard}>
              <Text style={styles.stepsText}>{tx(`wiz${cap(current)}Steps`)}</Text>
              {needsRestricted && <Text style={[styles.stepsText, styles.restricted]}>{t('wizRestrictedSteps')}</Text>}
            </View>

            {notYet && <Text style={styles.notYet}>{t('wizNotYet')}</Text>}

            <TouchableOpacity style={styles.primaryBtn} onPress={primary} disabled={busy} data-testid="wizard-primary">
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
            </TouchableOpacity>

            {hasSecondary && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={secondary} data-testid="wizard-secondary">
                <Text style={styles.secondaryText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            )}

            {current === 'autoStart' && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={confirmAutoStart} data-testid="wizard-confirm-autostart">
                <Text style={styles.secondaryText}>{t('wizIDidIt')}</Text>
              </TouchableOpacity>
            )}

            {!ESSENTIAL.includes(current) && (
              <TouchableOpacity style={styles.laterBtn} onPress={() => postpone(current)} data-testid="wizard-later">
                <Text style={styles.laterText}>{t('later')}</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.hint}>{t('wizAutoReturn')}</Text>
            <Text style={styles.hint}>{t('wizHelp')}</Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: { paddingTop: 40, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#111827' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#94A3B8', marginTop: 4, fontSize: 14 },
  progressTrack: { height: 6, backgroundColor: '#1E293B', borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#10B981' },
  dots: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#334155' },
  dotDone: { backgroundColor: '#10B981' },
  dotCurrent: { backgroundColor: '#F97316' },
  dotLater: { backgroundColor: '#64748B' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 20, paddingBottom: 48 },
  iconWrap: {
    alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(249,115,22,0.15)',
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  badgeRow: { alignItems: 'center', marginTop: 12 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  badgeReq: { backgroundColor: '#7F1D1D', color: '#FECACA' },
  badgeOpt: { backgroundColor: '#1E3A8A', color: '#BFDBFE' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  why: { color: '#CBD5E1', fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  pathCard: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: '#1E293B',
    borderRadius: 12, padding: 10, marginTop: 16, gap: 4,
  },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pathChip: {
    color: '#E2E8F0', backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    fontSize: 13, overflow: 'hidden',
  },
  stepsCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, marginTop: 12 },
  stepsText: { color: '#E2E8F0', fontSize: 15, lineHeight: 22 },
  restricted: { marginTop: 10, color: '#FCD34D' },
  notYet: { color: '#FCA5A5', marginTop: 12, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#F97316', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18,
    minWidth: 220, alignSelf: 'stretch',
  },
  primaryText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  secondaryBtn: { borderWidth: 1, borderColor: '#F97316', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: '#F97316', fontSize: 15, fontWeight: '600' },
  laterBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  laterText: { color: '#94A3B8', fontSize: 15 },
  hint: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 10 },
  doneTitle: { color: '#FFF', fontSize: 24, fontWeight: '700', marginTop: 16 },
  doneBody: { color: '#CBD5E1', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 12 },
});
