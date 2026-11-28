import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  AppState,
  Platform,
  BackHandler,
  StatusBar,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import { useVersionCheck } from '../../src/hooks/useVersionCheck';
import { devicePolicy } from '../../src/utils/DevicePolicy';
import { getAutoStartInstructions, getOverlayInstructions, getAccessibilityInstructions } from '../../src/utils/deviceInstructions';
import OfflineSyncManager from '../../src/services/OfflineSyncManager';
import { deviceAuthHeaders, getDeviceToken } from '../../src/utils/deviceAuth';
import { startBackgroundLocationTracking, isBackgroundLocationActive } from '../../src/services/BackgroundLocationService';
import { initializeNotifications } from '../../src/services/BackgroundNotificationService';
import { sendDeviceInfoUpdateThrottled } from '../../src/services/DeviceInfoService';
import { registerHeartbeatTask, sendHeartbeat, getHeartbeatStatus } from '../../src/services/BackgroundHeartbeatService';
import API_URL from '../../src/constants/api';
import { LoanCountdown } from '../../src/components/LoanCountdown';
import { deriveLoanFigures } from '../../src/utils/lockCompat';
import { clearLocalRegistration, startNativeSync } from '../../src/utils/clientSession';
import PermissionWizard, { wizardHasPendingSteps } from '../../src/components/PermissionWizard';
import {
  mergeBaseline,
  requiredGranted,
  revokedTamperPerms,
  TAMPER_FIX_WINDOW_MS,
  TAMPER_GRACE_MS,
  PermState,
} from '../../src/utils/tamperGuard';

/** Countdown for the tamper "fix window" (re-grant permissions before re-lock). */
function FixWindowBanner({ until, t }: { until: number; t: (k: string) => string }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.round((until - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <View style={{ backgroundColor: '#7F1D1D', borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>{t('tamperFixWindowTitle')}</Text>
      <Text style={{ color: '#FECACA', marginTop: 4 }}>
        {t('tamperFixWindowBody')} {mm}:{ss}
      </Text>
    </View>
  );
}


interface ClientStatus {
  id: string;
  name: string;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  loan_amount: number;
  loan_due_date: string | null;
  outstanding_balance?: number;
  monthly_emi?: number;
  uninstall_allowed?: boolean;
  is_deleted?: boolean;
  lock_mode?: string;
  admin_firstname?: string;
  admin_phone?: string;
  admin_email?: string;
  payment_instructions?: string;
  late_fees_accumulated?: number;
  lock_signature?: string;
  lock_issued_at?: number;
  lock_level?: 'none' | 'warning' | 'restricted' | 'full' | string;
  lock_allowlist?: string[];
  _lock_verified?: boolean;
  percent_paid?: number;
  total_paid?: number;
  total_amount?: number;
  days_until_due?: number | null;
  next_payment_amount?: number;
}

export default function ClientHome() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { formatAmount } = useCurrency();
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isAdminActive, setIsAdminActive] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [lastAdminPromptTime, setLastAdminPromptTime] = useState<number>(0);
  const [permissionStates, setPermissionStates] = useState({
    batteryOptimization: false,
    overlay: false,
    autoStart: false,
    accessibility: false,
    location: false,
    notification: false,
    usageStats: false,
    notificationListener: false,
  });
  const [showProtectionSetup, setShowProtectionSetup] = useState(false);
  const [protectionComplete, setProtectionComplete] = useState(false);
  const [freshRegistration, setFreshRegistration] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const isMounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLocked = useRef(false);
  const lastLockLevelRef = useRef<string>('none');
  const lastReapplyRef = useRef<number>(0);
  const isRequestingAdmin = useRef(false);
  const hasInitialized = useRef(false);
  const initComplete = useRef(false);
  const lastWarningRef = useRef<string>('');
  const uninstallHandledRef = useRef(false); // Prevent repeated uninstall alerts
  const retryCountRef = useRef(0); // Track consecutive API failures for backoff
  const maxRetries = 5;
  const [emergencyCallActive, setEmergencyCallActive] = useState(false);
  const emergencyCallActiveRef = useRef(false);
  const finishEmergencyAndRelockRef = useRef<(() => Promise<void>) | null>(null);
  const emergencyCallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [adminPlan, setAdminPlan] = useState<string | null>(null);
  // Tamper lock (replaces the old factory wipe) and registration health
  const [tamper, setTamper] = useState<{ active: boolean; inFixWindow: boolean; fixUntil: number; reasons: string[] }>(
    { active: false, inFixWindow: false, fixUntil: 0, reasons: [] },
  );
  const tamperRef = useRef(tamper);
  const serverLockedRef = useRef(false);
  const [needsRelink, setNeedsRelink] = useState(false);
  const notFoundCountRef = useRef(0);
  const [isOwnerActual, setIsOwnerActual] = useState(false);
  const [lockModeRequested, setLockModeRequested] = useState<string | null>(null);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const showWizardRef = useRef(false);
  useEffect(() => { showWizardRef.current = showWizard; }, [showWizard]);
  const lastTamperEvalRef = useRef(0);
  const statusRef = useRef<ClientStatus | null>(null);
  const clientIdRef = useRef<string | null>(null);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { clientIdRef.current = clientId; }, [clientId]);
  
  // Version check — uses Modal instead of Alert to escape overlay blocker
  const { updateInfo: versionUpdateInfo, currentVersion: appVersion, versionCode: appVersionCode } = useVersionCheck('client');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  
  // Show modal when update info arrives
  useEffect(() => {
    if (versionUpdateInfo?.update_available) {
      setShowUpdateModal(true);
    }
  }, [versionUpdateInfo]);
  
  // In-app messaging state
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatMessage, setChatMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const resolveProjectId = useCallback(
    () => Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId,
    []
  );
  
  const getPushToken = useCallback(async () => {
    if (!Device.isDevice) return null;
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus !== 'granted') return null;
    
    const projectId = resolveProjectId();
    if (!projectId) {
      console.log('Expo project ID missing; requesting push token without project ID');
    }
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenResponse.data;
  }, [resolveProjectId]);
  
  const registerPushToken = useCallback(async (id: string) => {
    if (!id) return;
    
    try {
      const token = await getPushToken();
      if (!token) return;
      
      await AsyncStorage.setItem('push_token', token);
      const devTok = await getDeviceToken();
      const response = await fetch(`${API_URL}/api/device/push-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, device_token: devTok || '', push_token: token })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Push token registration request failed', response.status, errorText);
      }
    } catch (error) {
      console.log('Push token registration failed', error);
    }
  }, [getPushToken]);

  // Retry mechanism for checking admin status after request
  // Gives user up to 15 seconds to complete the admin permission flow (non-blocking)
  const checkAdminStatusWithRetry = async (maxAttempts = 15, delayMs = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check if component is still mounted before continuing
      if (!isMounted.current) {
        console.log('Component unmounted, stopping admin check');
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      try {
        const isActive = await devicePolicy.isAdminActive();
        if (isActive) {
          setIsAdminActive(true);
          
          try {
            const result = await devicePolicy.preventUninstall(true);
            if (result === 'success') {
              console.log(`Device Admin confirmed active on attempt ${attempt}, uninstall protection enabled`);
            } else {
              console.log(`Device Admin active but uninstall protection failed: ${result}`);
            }
          } catch (uninstallError) {
            console.log('Uninstall protection error:', uninstallError);
          }
          
          // NOTE: Do NOT report admin status here — let the caller handle it
          // after explicit user confirmation (prevents premature reporting)
          return true;
        }
        console.log(`Admin check attempt ${attempt}/${maxAttempts} - not active yet`);
      } catch (checkError) {
        console.log(`Admin check attempt ${attempt} error:`, checkError);
      }
    }
    console.log('Admin status check timed out - user may not have granted permission');
    return false;
  };

  // Check and prompt for Accessibility Service
  const checkAndPromptAccessibility = async () => {
    if (Platform.OS !== 'android') return;
    
    try {
      const enabled = await devicePolicy.isAccessibilityEnabled();
      
      if (!enabled) {
        console.log('Accessibility service not enabled — prompting user');
        
        const title = t('deviceProtection');
        const message = t('toFullyProtectYourDevicePlease');
        
        Alert.alert(
          title,
          message,
          [
            {
              text: t('ok'),
              onPress: async () => {
                await devicePolicy.openAccessibilitySettings();
              },
            },
            {
              text: t('later'),
              style: 'cancel',
            },
          ]
        );
      } else {
        console.log('Accessibility service already enabled');
      }
    } catch (error) {
      console.log('Accessibility check error:', error);
    }
  };

  // Check and setup Device Admin — only checks status, does NOT show prompts.
  // The auto-trigger useEffect (line ~787) is the single place that shows the admin prompt.
  const checkAndSetupDeviceProtection = async () => {
    if (Platform.OS !== 'android') return;

    try {
      const admin = await devicePolicy.isAdminActive();
      setIsAdminActive(admin);

      if (!admin) {
        // Check if admin was forcefully disabled (tamper attempt)
        let wasDisabled = false;
        try {
          wasDisabled = await devicePolicy.wasAdminDisabled();
        } catch (e) {
          console.log('wasAdminDisabled check failed:', e);
        }
        
        if (wasDisabled) {
          console.log('TAMPER DETECTED: Admin was forcefully disabled!');
          const storedId = await AsyncStorage.getItem('client_id');
          const reported = await reportTamperAttempt('admin_disabled', storedId || undefined);
          if (storedId) {
            await reportAdminStatus(storedId, false);
          }
          // Only clear native flags after a successful report so a failed
          // upload can be retried on the next launch.
          if (reported !== false) {
            try {
              await devicePolicy.clearTamperFlags();
            } catch (e) {
              console.log('clearTamperFlags failed:', e);
            }
          }
          // Re-enabling is prompted by the Device Admin effect (with "Later" + cooldown);
          // evaluateTamper() applies the warning -> grace -> local tamper lock policy.
          await AsyncStorage.removeItem('admin_prompt_declined_at');
        }

        console.log('Device Admin not active — will be prompted by the Device Admin effect');
      } else {
        // Admin is already active - enable uninstall protection silently
        setIsAdminActive(true);
        try {
          const result = await devicePolicy.preventUninstall(true);
          if (result === 'success') {
            console.log('Device Admin active - uninstall protection enabled');
          } else {
            console.log(`Device Admin active but uninstall protection failed: ${result}`);
          }
        } catch (e) {
          console.log('preventUninstall error:', e);
        }
      }
    } catch (error) {
      console.error('Device protection setup error:', error);
    }
  };

  const updateLockState = async (locked: boolean, message?: string, lockLevel?: string, allowlist?: string[]) => {
    try {
      let level = (lockLevel || (locked ? 'full' : 'none')).toLowerCase();
      let applied = 'cleared';
      if (Platform.OS === 'android') {
        applied = await devicePolicy.applyLockLevel(level, allowlist || []);
      }
      // Device Admin cannot suspend packages — treat restricted as a full overlay lock.
      const downgraded = level === 'restricted' && applied === 'downgraded_to_full';
      if (downgraded) {
        level = 'full';
      }
      const restricted = level === 'restricted';
      // "warning" keeps the phone usable (message only); only "full" pins the lock screen.
      const fullLock = locked && !restricted && level !== 'warning';
      lastLockLevelRef.current = locked ? (downgraded ? 'full_fallback' : level) : 'none';
      lastReapplyRef.current = Date.now();
      // Save lock state for offline enforcement and autostart
      // Restricted mode is "locked" for HMAC but must not start kiosk.
      await devicePolicy.setLockState(fullLock, message);
      await devicePolicy.setNativeLockState(fullLock);
      wasLocked.current = locked;
      if (Platform.OS === 'android') {
        if (fullLock) {
          StatusBar.setHidden(true, 'none');
          await devicePolicy.enableImmersiveMode();
          await devicePolicy.collapseStatusBar();
          await devicePolicy.startOverlayBlocker();
          await devicePolicy.startKioskMode();
          // Disable camera and bluetooth while locked
          await devicePolicy.setCameraDisabled(true);
          await devicePolicy.setBluetoothDisabled(true);
          
          // Device Owner mode: Set as default launcher and lock task packages
          const lockMode = await AsyncStorage.getItem('lock_mode');
          if (lockMode === 'device_owner') {
            await devicePolicy.setAsDefaultLauncher();
            await devicePolicy.setLockTaskPackages(['com.paylock.client']);
          }
        } else if (restricted || (locked && level === 'warning')) {
          // Keep the phone usable for allowlisted apps; no kiosk overlay.
          StatusBar.setHidden(false, 'none');
          await devicePolicy.stopKioskMode().catch(() => {});
          await devicePolicy.setCameraDisabled(false);
          await devicePolicy.setBluetoothDisabled(false);
        } else {
          // UNLOCK: Stop kiosk FIRST to unpin the app immediately
          await devicePolicy.stopKioskMode();
          
          // Device Owner mode: Clear lock task packages so unpin actually works
          const lockMode = await AsyncStorage.getItem('lock_mode');
          if (lockMode === 'device_owner') {
            await devicePolicy.setLockTaskPackages([]);
            await devicePolicy.clearDefaultLauncher();
          }
          
          // Re-enable camera and bluetooth
          await devicePolicy.setCameraDisabled(false);
          await devicePolicy.setBluetoothDisabled(false);
          // Stop foreground monitor
          await devicePolicy.stopForegroundMonitor();
          // Re-enable status bar before restoring UI
          await devicePolicy.setStatusBarDisabled(false);
          StatusBar.setHidden(false, 'fade');
          await devicePolicy.disableImmersiveMode();
          await devicePolicy.stopOverlayBlocker();
        }
      }
    } catch (error) {
      console.error('Lock state error:', error);
    }
  };

  // Check cached lock state on startup for offline enforcement
  const checkCachedLockStateOnStartup = async () => {
    try {
      const cachedState = await devicePolicy.getCachedLockState();
      if (cachedState.isLocked) {
        console.log('[Startup] Device was locked - enforcing cached lock state');
        setStatus(prev => prev ? {
          ...prev,
          is_locked: true,
          lock_message: cachedState.lockMessage,
        } : {
          id: '',
          name: '',
          is_locked: true,
          lock_message: cachedState.lockMessage,
          warning_message: '',
          loan_amount: 0,
          loan_due_date: null,
        });
        wasLocked.current = true;
        // Engage immersive mode + overlay + kiosk on boot if locked
        if (Platform.OS === 'android') {
          try {
            StatusBar.setHidden(true, 'none');
            await devicePolicy.enableImmersiveMode();
            await devicePolicy.collapseStatusBar();
            console.log('[Startup] Immersive mode enabled');
            await devicePolicy.startOverlayBlocker();
            console.log('[Startup] Overlay blocker started');
            await devicePolicy.startKioskMode();
            console.log('[Startup] Kiosk mode started');
            await devicePolicy.setStatusBarDisabled(true);
            console.log('[Startup] Status bar disabled via DPM');
            // Start all security services on boot while locked
            await devicePolicy.startForegroundMonitor();
            console.log('[Startup] Foreground monitor started');
            await devicePolicy.setCameraDisabled(true);
            await devicePolicy.setBluetoothDisabled(true);
            console.log('[Startup] Camera & BT disabled');
          } catch (e) {
            console.log('[Startup] Lock enforcement error:', e);
          }
        }
      }
    } catch (error) {
      console.log('Failed to check cached lock state:', error);
    }
  };

  // ---------------------------------------------------------------------------
  // Tamper lock + registration health helpers
  // ---------------------------------------------------------------------------
  const syncTamperState = async () => {
    const st = await devicePolicy.getTamperState();
    const next = {
      active: st.active,
      inFixWindow: st.inFixWindow,
      fixUntil: st.fixUntil,
      reasons: st.reason ? st.reason.split(',').filter(Boolean) : [],
    };
    const prev = tamperRef.current;
    if (prev.active && !next.active) {
      // Released (re-granted, or by the lender with lock -> unlock / uninstall):
      // take the current permissions as the new baseline so it does not re-trigger.
      await AsyncStorage.setItem('tamper_baseline_reset', 'true').catch(() => {});
    }
    if (
      prev.active !== next.active ||
      prev.inFixWindow !== next.inFixWindow ||
      prev.fixUntil !== next.fixUntil ||
      prev.reasons.join(',') !== next.reasons.join(',')
    ) {
      tamperRef.current = next;
      setTamper(next);
    }
    return next;
  };

  /** Server no longer knows this device: confirm 3 times, then reset to registration. */
  const handleNotFound = async () => {
    notFoundCountRef.current += 1;
    if (notFoundCountRef.current < 3) return;
    console.log('[Status] Client not found on server — clearing local registration');
    try { await updateLockState(false); } catch (_) {}
    await clearLocalRegistration();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isMounted.current) {
      setStatus(null);
      setClientId(null);
      router.replace('/client/register');
    }
  };

  const showTamperWarning = async () => {
    const title = t('securityAlert') || 'Security Alert';
    const body = t('disablingPermissionsWillEraseData');
    Alert.alert(title, body, [{ text: t('ok') || 'OK' }]);
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, priority: Notifications.AndroidNotificationPriority.MAX },
        trigger: null,
      });
    } catch (_) {}
  };

  /** Report + local full lock. NEVER wipes the phone. */
  const engageTamperLock = async (revoked: string[]) => {
    console.log('[Tamper] Engaging local tamper lock:', revoked.join(','));
    await devicePolicy.setTamperLock(true, revoked.join(','));
    await AsyncStorage.removeItem('pending_tamper_check').catch(() => {});
    reportTamperAttempt(`permission_revoked:${revoked.join(',')}`).catch(() => {});
    await syncTamperState();
    const msg = t('tamperLockMessage');
    await updateLockState(true, msg, 'full');
    setStatus(prev => (prev ? { ...prev, is_locked: true, lock_level: 'full', lock_message: msg } : prev));
    await showTamperWarning();
  };

  const releaseTamperLock = async () => {
    console.log('[Tamper] Permissions restored — releasing tamper lock');
    await devicePolicy.setTamperLock(false, 'regranted');
    await AsyncStorage.removeItem('pending_tamper_check').catch(() => {});
    await syncTamperState();
    const id = clientIdRef.current;
    if (id) {
      await fetchStatus(id).catch(() => {});
    }
  };

  /** Let the borrower leave the lock screen for a few minutes to re-grant permissions. */
  const startTamperFix = async () => {
    const until = Date.now() + TAMPER_FIX_WINDOW_MS;
    await devicePolicy.setTamperFixWindow(until);
    await devicePolicy.setProtectionComplete(false);
    await syncTamperState();
    await updateLockState(false);
    setStatus(prev => (prev ? { ...prev, is_locked: false, lock_level: 'none' } : prev));
    setProtectionComplete(false);
    setShowProtectionSetup(true);
    showWizardRef.current = true;
    setShowWizard(true);
  };

  /**
   * Read the REAL permission state from Android (no cached OR-ing) and derive whether
   * the protection is complete (Device Admin + must-have permissions).
   */
  const refreshPermissions = async (): Promise<{ real: PermState; admin: boolean } | null> => {
    if (Platform.OS !== 'android') return null;
    try {
      const [admin, accessibility, overlay, batteryOpt, locationBg, notifPerm, usage, listener, owner] =
        await Promise.all([
          devicePolicy.isAdminActive(),
          devicePolicy.isAccessibilityEnabled(),
          devicePolicy.canDrawOverlays(),
          devicePolicy.isIgnoringBatteryOptimizations(),
          Location.getBackgroundPermissionsAsync().then(r => r.status === 'granted').catch(() => false),
          Notifications.getPermissionsAsync().then(r => r.status === 'granted').catch(() => false),
          devicePolicy.hasUsageStatsPermission().catch(() => false),
          devicePolicy.hasNotificationListenerPermission().catch(() => false),
          devicePolicy.isDeviceOwner().catch(() => false),
        ]);
      const autoStart = (await AsyncStorage.getItem('autostart_enabled')) === 'true';
      const real: PermState = {
        batteryOptimization: !!batteryOpt,
        overlay: !!overlay,
        autoStart,
        accessibility: !!accessibility,
        location: !!locationBg,
        notification: !!notifPerm,
        usageStats: !!usage,
        notificationListener: !!listener,
      };
      setIsAdminActive(!!admin);
      setIsOwnerActual(!!owner);
      setPermissionStates(prev => {
        const same = Object.keys(real).every(k => (prev as any)[k] === real[k]);
        return same ? prev : (real as typeof prev);
      });
      if (admin) await AsyncStorage.setItem('admin_was_active', 'true');
      const complete = !!admin && requiredGranted(real);
      setProtectionComplete(complete);
      if (complete) {
        await AsyncStorage.setItem('protection_complete', 'true');
      } else {
        await AsyncStorage.removeItem('protection_complete');
        setShowProtectionSetup(true);
      }
      if (!tamperRef.current.active) {
        await devicePolicy.setProtectionComplete(complete).catch(() => 'error');
      }
      setPermsLoaded(true);
      return { real, admin: !!admin };
    } catch (e) {
      console.log('Permission refresh error (non-fatal):', e);
      setPermsLoaded(true);
      return null;
    }
  };

  /**
   * Tamper policy: a granted protection permission that disappears gets a warning
   * (the "data will be erased" deterrent text) and, if not restored within the grace
   * period, a local full lock. Battery optimisation and autostart are excluded.
   */
  const evaluateTamper = async (
    snap: { real: PermState; admin: boolean } | null,
    opts: { fromResume?: boolean } = {},
  ) => {
    if (Platform.OS !== 'android' || !snap || !clientIdRef.current) return;
    const { real, admin } = snap;
    try {
      if (statusRef.current?.uninstall_allowed === true) {
        await AsyncStorage.multiRemove(['pending_tamper_check', 'pending_admin_tamper', 'admin_was_active']);
        await AsyncStorage.setItem('permission_states', JSON.stringify(real));
        return;
      }
      if ((await AsyncStorage.getItem('tamper_baseline_reset')) === 'true') {
        await AsyncStorage.multiRemove(['tamper_baseline_reset', 'pending_tamper_check']);
        await AsyncStorage.setItem('permission_states', JSON.stringify(real));
        if (!admin) await AsyncStorage.removeItem('admin_was_active');
        return;
      }
      const baselineRaw = await AsyncStorage.getItem('permission_states');
      const baseline: PermState | null = baselineRaw ? JSON.parse(baselineRaw) : null;
      const revoked = revokedTamperPerms(baseline, real);
      const wasAdmin = (await AsyncStorage.getItem('admin_was_active')) === 'true';
      if (wasAdmin && !admin) revoked.push('deviceAdmin');
      // Sticky baseline: a revocation keeps being detected until it is fixed.
      await AsyncStorage.setItem('permission_states', JSON.stringify(mergeBaseline(baseline, real)));

      const ts = await syncTamperState();
      if (revoked.length === 0) {
        await AsyncStorage.multiRemove(['pending_tamper_check', 'pending_admin_tamper']);
        if (ts.active) await releaseTamperLock();
        return;
      }

      // Something was revoked: reopen the permission grid + setup wizard so it can be
      // re-granted, and let Settings be reachable (no "protected" toast).
      setProtectionComplete(false);
      setShowProtectionSetup(true);
      showWizardRef.current = true;
      setShowWizard(true);
      await AsyncStorage.removeItem('protection_complete');
      await devicePolicy.setProtectionComplete(false).catch(() => 'error');

      if (ts.active) return; // already tamper-locked; the poll re-locks after the fix window

      const pendingRaw = await AsyncStorage.getItem('pending_tamper_check');
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      const now = Date.now();
      if (!pending || !pending.at) {
        await AsyncStorage.setItem('pending_tamper_check', JSON.stringify({ perms: revoked, at: now }));
        console.log('[Tamper] Revoked, warning first:', revoked.join(','));
        await showTamperWarning();
        return;
      }
      if (now - Number(pending.at) >= TAMPER_GRACE_MS) {
        await engageTamperLock(revoked);
      } else if (opts.fromResume) {
        await showTamperWarning();
      }
    } catch (e) {
      console.log('Tamper evaluation error (non-fatal):', e);
    }
  };

  /** Open the setup wizard when a step is missing (never over the lock screen). */
  const maybeOpenWizard = async () => {
    if (Platform.OS !== 'android' || !clientIdRef.current || showWizardRef.current) return;
    try {
      if (await wizardHasPendingSteps()) {
        showWizardRef.current = true;
        setShowWizard(true);
      }
    } catch (e) {
      console.log('Wizard check error (non-fatal):', e);
    }
  };

  const refreshAndEvaluate = async (fromResume: boolean) => {
    lastTamperEvalRef.current = Date.now();
    const snap = await refreshPermissions();
    await evaluateTamper(snap, { fromResume });
    return snap;
  };

  const activateDeviceAdmin = async () => {
    if (isRequestingAdmin.current) return;
    isRequestingAdmin.current = true;
    try {
      const r = await devicePolicy.requestAdmin();
      let granted = r === 'already_active';
      if (!granted) {
        await new Promise(res => setTimeout(res, 1500));
        granted = await checkAdminStatusWithRetry(20, 1000);
      }
      if (granted) {
        setIsAdminActive(true);
        await devicePolicy.preventUninstall(true);
        await AsyncStorage.setItem('admin_was_active', 'true');
        await AsyncStorage.removeItem('admin_prompt_declined_at');
        const id = clientIdRef.current;
        if (id) await reportAdminStatus(id, true);
        await refreshPermissions();
      } else {
        // Cancelled / timed out: cooldown instead of an endless re-prompt loop.
        await AsyncStorage.setItem('admin_prompt_declined_at', String(Date.now()));
      }
    } catch (e) {
      console.log('Device Admin activation error:', e);
      await AsyncStorage.setItem('admin_prompt_declined_at', String(Date.now())).catch(() => {});
    } finally {
      isRequestingAdmin.current = false;
      setShowAdminDialog(false);
    }
  };

  const fetchStatus = async (id: string) => {
    // Add null check
    if (!id || id.trim() === '') {
      console.log('fetchStatus: No valid client ID');
      return;
    }
    try {
      // Use offline sync manager for smart caching
      const data = await OfflineSyncManager.syncStatus(id, API_URL);
      
      // Update offline indicator
      setIsOffline(data.offline || false);
      
      // Send device info update (throttled to every 5 minutes)
      if (!data.offline) {
        sendDeviceInfoUpdateThrottled(id).catch(() => {});
      }
      
      // Create a copy of data for potential modifications (avoid mutating original)
      let statusToSet = { ...data };

      // SECURITY: only honor an UNLOCK when the server's signed lock decision
      // verifies. If the response says unlocked but the signature is missing or
      // invalid (e.g. a MITM/forged response), keep the device locked.
      if (!data.offline && data.is_locked === false && data._lock_verified !== true) {
        const cachedState = await devicePolicy.getCachedLockState();
        if (cachedState.isLocked) {
          console.warn('[Security] Unverified unlock ignored — staying locked');
          statusToSet = {
            ...data,
            is_locked: true,
            lock_message: cachedState.lockMessage,
          };
        }
      }

      // If offline, also check cached lock state to ensure enforcement
      if (data.offline) {
        const cachedState = await devicePolicy.getCachedLockState();
        if (cachedState.isLocked && !data.is_locked) {
          // Enforce cached lock state when offline - create new object to avoid mutation
          statusToSet = {
            ...data,
            is_locked: true,
            lock_message: cachedState.lockMessage,
          };
          console.log('[Offline] Enforcing cached lock state');
        }
      }
      
      // Registration health: auth errors (newer backend + device registered before
      // device tokens existed) must not strand the device; 404 = deleted on server.
      const httpStatus = (data as any).http_status;
      if (httpStatus === 401 || httpStatus === 403) {
        setNeedsRelink(true);
      } else if (!data.offline) {
        setNeedsRelink(false);
      }
      if (httpStatus === 404) {
        await handleNotFound();
        return;
      } else if (!data.offline) {
        notFoundCountRef.current = 0;
      }

      // Tamper lock: held locally even when the server says "unlocked".
      if (Platform.OS === 'android') {
        const rawLevel = String(data.lock_level || 'full').toLowerCase();
        const serverHolds = !!data.is_locked && rawLevel !== 'warning';
        if (!data.offline) {
          serverLockedRef.current = serverHolds;
          const released = !!(statusToSet.uninstall_allowed || statusToSet.is_deleted);
          await devicePolicy.tamperServerState(serverHolds, released);
        }
        const ts = await syncTamperState();
        const alreadyFull = statusToSet.is_locked &&
          String(statusToSet.lock_level || 'full').toLowerCase() === 'full';
        if (ts.active && !ts.inFixWindow && !alreadyFull) {
          statusToSet = { ...statusToSet, is_locked: true, lock_level: 'full', lock_message: t('tamperLockMessage') };
        }
      }

      // Restricted needs Device Owner (package suspension). On Device Admin show and
      // enforce the full lock screen instead of only a banner.
      if (Platform.OS === 'android' && statusToSet.is_locked &&
          String(statusToSet.lock_level || '').toLowerCase() === 'restricted') {
        const owner = await devicePolicy.isDeviceOwner().catch(() => false);
        if (!owner) statusToSet = { ...statusToSet, lock_level: 'full' };
      }

      setStatus(statusToSet);
      
      // Store admin plan for feature gating
      if (data.admin_plan) {
        setAdminPlan(data.admin_plan);
      }
      
      // Show system notification when a NEW warning arrives
      if (statusToSet.warning_message && statusToSet.warning_message !== lastWarningRef.current) {
        lastWarningRef.current = statusToSet.warning_message;
        try {
          const adminName = statusToSet.admin_firstname || '';
          const title = adminName
            ? `${t('warningFrom') || 'Warning from'} ${adminName}`
            : t('warningFromAdministrator');
          await Notifications.scheduleNotificationAsync({
            content: {
              title,
              body: statusToSet.warning_message,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null, // Show immediately
          });
        } catch (notifErr) {
          console.log('Warning notification error:', notifErr);
        }
      } else if (!statusToSet.warning_message) {
        lastWarningRef.current = '';
      }
      
      // Check if admin has allowed uninstall or deleted this client — guard against repeated calls
      if ((statusToSet.uninstall_allowed || statusToSet.is_deleted) && Platform.OS === 'android' && !uninstallHandledRef.current) {
        uninstallHandledRef.current = true;
        handleUninstallSignal();
      }
      
      // Update lock state if changed - save message for offline use
      const incomingLevel = statusToSet.is_locked
        ? String(statusToSet.lock_level || 'full').toLowerCase()
        : 'none';
      if (
        statusToSet.is_locked !== wasLocked.current ||
        (statusToSet.is_locked && incomingLevel !== lastLockLevelRef.current &&
          !(incomingLevel === 'restricted' && lastLockLevelRef.current === 'full_fallback'))
      ) {
        updateLockState(statusToSet.is_locked, statusToSet.lock_message, statusToSet.lock_level, statusToSet.lock_allowlist);
      } else if (statusToSet.is_locked && Platform.OS === 'android' && incomingLevel === 'full') {
        // Android may kill the overlay / monitor (Doze, OOM). Re-check at most every
        // 10s and only restart what is actually down. Re-applying kiosk, immersive mode
        // and status-bar collapse on every 2s poll made the lock screen flash.
        const now = Date.now();
        if (now - lastReapplyRef.current >= 10000) {
          lastReapplyRef.current = now;
          (async () => {
            try {
              if (!(await devicePolicy.isOverlayBlockerRunning())) {
                await devicePolicy.startOverlayBlocker();
              }
              await devicePolicy.startForegroundMonitor();
              if (!(await devicePolicy.isInKioskMode())) {
                await devicePolicy.startKioskMode();
              }
            } catch (_) {}
          })();
        }
      }
    } catch (error: any) {
      console.error('Error fetching status:', error);
      setIsOffline(true);
      if (error?.status === 401 || error?.status === 403) setNeedsRelink(true);
      if (error?.status === 404) {
        await handleNotFound();
        return;
      }
      
      // On error, check and enforce cached lock state (includes native SharedPreferences fallback)
      const cachedState = await devicePolicy.getCachedLockState();
      if (cachedState.isLocked) {
        setStatus(prev => {
          // Create a locked status even if prev is null (device reboot + API fail scenario)
          const base = prev || {
            id: '',
            name: '',
            is_locked: false,
            lock_message: '',
            warning_message: '',
            loan_amount: 0,
            loan_due_date: null,
          };
          return {
            ...base,
            is_locked: true,
            lock_message: cachedState.lockMessage,
          };
        });
        wasLocked.current = true;
        console.log('[Error] Enforcing cached lock state (native fallback)');
      }
    }
  };

  const handleUninstallSignal = async () => {
    try {
      // Stop kiosk mode first so device is usable
      if (Platform.OS === 'android') {
        try {
          await devicePolicy.stopOverlayBlocker();
          await devicePolicy.disableImmersiveMode();
          await devicePolicy.setProtectionComplete(false);
          await devicePolicy.setNativeLockState(false);
          await devicePolicy.stopLockSync();
          await devicePolicy.setTamperLock(false, 'uninstall_allowed');
        } catch (e) {
          console.log('Protection cleanup error:', e);
        }
      }

      // Allow app to be uninstalled (removes device admin)
      await devicePolicy.allowUninstall();
      await AsyncStorage.multiRemove([
        'protection_complete', 'pending_tamper_check', 'pending_admin_tamper', 'admin_was_active',
      ]);
      
      console.log('App uninstall protection disabled by admin');
      setIsAdminActive(false);
      
      // Show alert to user
      Alert.alert(
        t('accountRemoved'),
        t('yourAccountHasBeenRemovedBy'),
        [{ text: t('ok') }]
      );
    } catch (error) {
      console.log('Error handling uninstall signal:', error);
    }
  };

  const updateLocation = async (id: string) => {
    // Add null check
    if (!id || id.trim() === '') {
      console.log('updateLocation: No valid client ID');
      return;
    }
    try {
      const { status: permStatus } = await Location.getForegroundPermissionsAsync();
      if (permStatus !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Check if online
      if (OfflineSyncManager.isDeviceOnline()) {
        const devTok = await getDeviceToken();
        await fetch(`${API_URL}/api/device/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: id,
            device_token: devTok || '',
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }),
        });
      } else {
        // Queue for later sync when online
        await OfflineSyncManager.reportLocationOffline(
          id,
          location.coords.latitude,
          location.coords.longitude
        );
        console.log('[Offline] Location queued for sync');
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const loadClientData = async () => {
    if (!isMounted.current) return;
    
    try {
      let id = await AsyncStorage.getItem('client_id');
      
      if (!id) {
        // CRITICAL: Before redirecting to register, check native lock state.
        // If device is locked in native SharedPreferences, show lock screen instead.
        const nativeLocked = await devicePolicy.getNativeLockState();
        if (nativeLocked) {
          console.log('[Security] No client_id but device is natively locked — enforcing lock screen');
          setStatus({
            id: '',
            name: '',
            is_locked: true,
            lock_message: 'Device locked due to pending payment. Contact your lender.',
            warning_message: '',
            loan_amount: 0,
            loan_due_date: null,
          });
          wasLocked.current = true;
          if (isMounted.current) setLoading(false);
          return;
        }
        console.log('No client ID found, redirecting to register');
        if (isMounted.current) {
          setLoading(false);
          router.replace('/client/register');
        }
        return;
      }
      
      console.log('Client ID loaded:', id);
      setClientId(id);
      
      // Hand the registration to the native side (client id, backend, device token)
      // and start the persistent lock sync, so a lock applies while the app is closed.
      // This used to be skipped right after registration (only ran on the next launch).
      await startNativeSync(id, API_URL);

      devicePolicy.isDeviceOwner().then(o => setIsOwnerActual(!!o)).catch(() => {});
      AsyncStorage.getItem('lock_mode_requested').then(v => setLockModeRequested(v)).catch(() => {});
      
      // Wait for state to update before making API calls
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Fetch status first — this is critical and must not crash
      try {
        await fetchStatus(id);
      } catch (fetchErr) {
        console.log('fetchStatus error (non-fatal):', fetchErr);
      }
      
      // Show UI NOW — don't block on location/push token
      if (isMounted.current) setLoading(false);
      
      // Fire-and-forget background tasks — don't await
      updateLocation(id).catch(e => console.log('Location update error (non-fatal):', e));
      registerPushToken(id).catch(e => console.log('Push token error (non-fatal):', e));
      
      // Initialize background services (location tracking + notifications + heartbeat)
      initializeNotifications().catch(e => console.log('Notification init error (non-fatal):', e));
      // Only starts when "Allow all the time" is already granted — never prompts here.
      startBackgroundLocationTracking(API_URL, { requestPermissions: false }).catch(e => console.log('Background location init error (non-fatal):', e));
      
      // Register background heartbeat task (sends device info every 5 mins even when app closed)
      registerHeartbeatTask().then(registered => {
        if (registered) {
          console.log('[Heartbeat] Background task registered successfully');
          // Send an immediate heartbeat on app open
          sendHeartbeat().catch(e => console.log('Initial heartbeat error (non-fatal):', e));
        }
      }).catch(e => console.log('Heartbeat registration error (non-fatal):', e));
    } catch (error) {
      console.error('loadClientData error:', error);
      if (isMounted.current) setLoading(false);
    }
  };

  // Device Admin is the first step of the setup wizard (PermissionWizard), which also
  // replaces the old auto-prompt loop.

  useEffect(() => {
    isMounted.current = true;
    
    // Only initialize once to prevent flicker/crash from duplicate admin prompts
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    // Wrap initialization in try-catch to prevent crashes
    const initialize = async () => {
      try {
        // Prevent screenshots and screen recording on client app
        if (Platform.OS === 'android') {
          try {
            // loaded lazily: importing it at startup must never be able to take the whole app down
            const ScreenCapture = require('expo-screen-capture');
            await ScreenCapture.preventScreenCaptureAsync();
          } catch (scErr) {
            console.log('Screen capture prevention not available:', scErr);
          }
        }
        
        // Check if this is a fresh registration BEFORE doing anything heavy
        const isFreshRegistration = await AsyncStorage.getItem('fresh_registration');
        
        if (isFreshRegistration === 'true') {
          // Fresh registration now goes through the SAME init as a normal start
          // (native lock sync, push token, permission states). It used to return
          // early here and defer all of that to the next app launch, so a phone could
          // not be locked while the app was closed until it had been reopened once.
          await AsyncStorage.removeItem('fresh_registration');
          setFreshRegistration(true);
        }
        
        // Normal init (not fresh registration)
        // Check cached lock state immediately on startup for offline enforcement
        await checkCachedLockStateOnStartup();
        
        // Load client data — this includes fetchStatus, location, push token
        await loadClientData();
        
        // Show UI immediately — don't block on permission checks
        if (isMounted.current) setLoading(false);
        
        // Real permission states AFTER showing UI. The grid opens whenever the
        // protection is not complete (always true right after registration).
        if (Platform.OS === 'android' && isMounted.current) {
          const snap = await refreshAndEvaluate(false);
          if (snap) {
            const complete = snap.admin && requiredGranted(snap.real);
            setShowProtectionSetup(!complete);
          }
          await maybeOpenWizard();
        }

        // Mark init complete so the protection useEffect can proceed safely
        initComplete.current = true;
      } catch (error) {
        console.error('Initialization error:', error);
        initComplete.current = true;
        if (isMounted.current) setLoading(false);
      }
    };
    
    initialize();

    return () => {
      isMounted.current = false;
      initComplete.current = false;
      hasInitialized.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Run once on mount only; functions are stable refs
  }, []);

  // Separate effect for polling and app state - depends on clientId
    // Block back button when locked — uses ref for instant, crash-proof check
    // This must be a separate, always-active effect so rapid presses can't crash the app
    useEffect(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Use wasLocked ref (instant) instead of status state (async, can lag)
        if (wasLocked.current) {
          return true; // Swallow back press entirely when locked
        }
        return false;
      });
      return () => backHandler.remove();
    }, []);

  useEffect(() => {
    if (!clientId) return;

    // Poll faster when locked (2s) so an unlock lands quickly if push is missed.
    // Offline: 3s to reconnect. Otherwise 5s.
    const getInterval = () => {
      if (wasLocked.current) return 2000;
      return isOffline ? 3000 : 5000;
    };
    
    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (!isRefreshingRef.current) {
          fetchStatus(clientId).catch(() => {});
        }
        // Re-check permissions every 30 s while the app is open (quick-settings
        // toggles, re-grants during the tamper fix window).
        if (Platform.OS === 'android' && Date.now() - lastTamperEvalRef.current > 30000) {
          refreshAndEvaluate(false).catch(() => {});
        }
      }, getInterval());
    };
    
    startPolling();

    // Listen for push notifications — immediately refresh status on lock/unlock/warning
    const applyPush = async (data: any, source: string) => {
      if (!data) return;
      if (data.action === 'lock' || data.action === 'unlock') {
        console.log(`[Push] Received ${data.action} from ${source} — applying signed payload`);
        try {
          const applied = await OfflineSyncManager.applySignedPushPayload(clientId, data);
          if (applied) {
            let statusToSet = { ...applied };
            if (applied.is_locked === false && applied._lock_verified !== true) {
              return;
            }
            setStatus(prev => ({ ...(prev || {}), ...statusToSet }));
            if (statusToSet.is_locked !== wasLocked.current) {
              updateLockState(!!statusToSet.is_locked, statusToSet.lock_message, statusToSet.lock_level, statusToSet.lock_allowlist);
            }
            return;
          }
        } catch (e) {
          console.log('[Push] signed payload apply failed', e);
        }
        // Fallback: poll the signed status endpoint
        fetchStatus(clientId).catch(() => {});
        return;
      }
      if (data.action === 'warning') {
        fetchStatus(clientId).catch(() => {});
      }
    };
    const notifReceivedSub = Notifications.addNotificationReceivedListener((notification) => {
      applyPush(notification.request.content.data, 'foreground');
    });
    const notifResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      applyPush(response.notification.request.content.data, 'tap');
    });

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchStatus(clientId).catch(() => {});
        updateLocation(clientId).catch(() => {});
        
        // CRITICAL: Immediately re-engage kiosk protection if device is locked
        // This prevents the home button bypass (5-second gap)
        if (Platform.OS === 'android' && emergencyCallActiveRef.current) {
          devicePolicy.shouldRelockEmergencyCall().then((should) => {
            if (should) finishEmergencyAndRelockRef.current?.();
          }).catch(() => {});
        } else if (Platform.OS === 'android' && wasLocked.current) {
          devicePolicy.startKioskMode().catch(() => {});
          devicePolicy.enableImmersiveMode().catch(() => {});
          devicePolicy.collapseStatusBar().catch(() => {});
          devicePolicy.startOverlayBlocker().catch(() => {});
          devicePolicy.startForegroundMonitor().catch(() => {});
          StatusBar.setHidden(true, 'none');
        }
        
        // Refresh REAL protection states on resume and apply the tamper policy
        // (warning -> grace period -> local lock; never a wipe).
        if (Platform.OS === 'android') {
          (async () => {
            try {
              const snap = await refreshAndEvaluate(true);
              if (!wasLocked.current) await maybeOpenWizard();
              // Only start overlay blocker if device is actually LOCKED
              if (snap?.real.overlay && wasLocked.current) {
                await devicePolicy.startOverlayBlocker();
              }
            } catch (e) {
              console.log('Protection refresh error:', e);
            }
          })();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription.remove();
      notifReceivedSub.remove();
      notifResponseSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Initialize protection and check for reboot (tamper detection disabled to prevent crashes)
  // Waits for main initialization to complete before accessing native modules
  useEffect(() => {
    const initializeProtection = async () => {
      if (!clientId || Platform.OS !== 'android') return;

      // Wait until the main useEffect's initialize() is done
      let waitAttempts = 0;
      while (!initComplete.current && waitAttempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 200));
        waitAttempts++;
      }
      if (!isMounted.current) return;

      try {
        // Real reboot detection: compare the Android boot count / boot time with the
        // last values seen (it used to report a "reboot" on every app open after 1 min).
        const boot = await devicePolicy.getBootInfo();
        if (boot) {
          const prevCount = await AsyncStorage.getItem('last_boot_count');
          const prevTime = Number((await AsyncStorage.getItem('last_boot_time')) || 0);
          let rebooted = false;
          if (prevCount != null) {
            if (boot.bootCount >= 0 && Number(prevCount) >= 0) {
              rebooted = String(boot.bootCount) !== prevCount;
            } else if (prevTime > 0) {
              rebooted = Math.abs(boot.bootTimeMs - prevTime) > 120000;
            }
          }
          await AsyncStorage.multiSet([
            ['last_boot_count', String(boot.bootCount)],
            ['last_boot_time', String(Math.round(boot.bootTimeMs))],
          ]);
          if (rebooted) {
            console.log('Reboot detected');
            await reportReboot(clientId);
          }
        }

        // Setup device protection: checks admin status, prompts user if needed,
        // enables uninstall protection, and reports status to backend
        await checkAndSetupDeviceProtection();
        
      } catch (error) {
        console.log('Protection initialization error:', error);
      }
    };
    
    initializeProtection();
  }, [clientId]);

  const reportAdminStatus = async (id: string, adminActive: boolean) => {
    if (!id) return;
    try {
      const devTok = await getDeviceToken();
      await fetch(`${API_URL}/api/device/report-admin-status?client_id=${id}&admin_active=${adminActive}`, {
        method: 'POST',
        headers: { ...deviceAuthHeaders(devTok || '') },
      });
      console.log(`Admin mode status reported: ${adminActive}`);
    } catch (error) {
      console.log('Admin status report failed:', error);
    }
  };

  const reportReboot = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/report-reboot`, {
        headers: deviceAuthHeaders(await getDeviceToken()),
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Reboot reported:', data);
        
        // If device should be locked, update lock state
        if (data.should_lock && status) {
          await updateLockState(true);
        }
      }
    } catch (error) {
      console.log('Reboot report failed:', error);
    }
  };

  const reportTamperAttempt = async (tamperType: string, overrideClientId?: string) => {
    const id = overrideClientId || clientId || (await AsyncStorage.getItem('client_id'));
    if (!id) {
      await AsyncStorage.setItem('pending_tamper_report', JSON.stringify({ type: tamperType, at: Date.now() }));
      return false;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/report-tamper?tamper_type=${encodeURIComponent(tamperType)}`, {
        headers: deviceAuthHeaders(await getDeviceToken()),
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tamper attempt logged:', data);
        await AsyncStorage.removeItem('pending_tamper_report');
        
        // Report only. The local tamper lock is applied by engageTamperLock(); the
        // live server records the event but does not lock by itself.
        return true;
      }
      await AsyncStorage.setItem('pending_tamper_report', JSON.stringify({ type: tamperType, at: Date.now() }));
      return false;
    } catch (error) {
      console.log('Tamper report failed:', error);
      await AsyncStorage.setItem('pending_tamper_report', JSON.stringify({ type: tamperType, at: Date.now() }));
      return false;
    }
  };

  const isRefreshingRef = useRef(false);

  // Retry a tamper report that failed because the app launched before client_id was ready.
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('pending_tamper_report');
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (pending?.type) {
          await reportTamperAttempt(pending.type, clientId);
        }
      } catch (e) {
        console.log('Pending tamper report flush failed:', e);
      }
    })();
  }, [clientId]);


  const onRefresh = useCallback(async () => {
    if (!clientId || isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);
    
    // Safety timeout — force stop refresh after 10 seconds to prevent infinite spinner
    const safetyTimer = setTimeout(() => {
      console.log('[Refresh] Safety timeout — forcing refresh complete');
      isRefreshingRef.current = false;
      setRefreshing(false);
    }, 10000);
    
    try {
      await fetchStatus(clientId);
      await updateLocation(clientId).catch(() => {});
    } catch (e) {
      console.log('Refresh error:', e);
    } finally {
      clearTimeout(safetyTimer);
      isRefreshingRef.current = false;
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchStatus/updateLocation are stable; only depend on clientId
  }, [clientId]);

  const handleClearWarning = async () => {
    if (!clientId) return;
    try {
      const devTok = await getDeviceToken();
      await fetch(`${API_URL}/api/device/clear-warning/${clientId}`, {
        method: 'POST',
        headers: { ...deviceAuthHeaders(devTok || '') },
      });
      await fetchStatus(clientId);
    } catch (error) {
      console.error('Error clearing warning:', error);
    }
  };

  // Auto-dismiss warning messages 10 seconds after app opens
  useEffect(() => {
    if (!status?.warning_message || !clientId) return;
    const timer = setTimeout(() => {
      handleClearWarning();
    }, 10000);
    return () => clearTimeout(timer);
  }, [status?.warning_message, clientId]);


  // Engage protection services when device is locked (overlay handles re-fastening)
  useEffect(() => {
    if (!status?.is_locked || status.lock_level === 'restricted' || status.lock_level === 'warning' || Platform.OS !== 'android') return;
    
    // Start all protection services once
    StatusBar.setHidden(true, 'none');
    devicePolicy.enableImmersiveMode().catch(() => {});
    devicePolicy.startKioskMode().catch(() => {});
    devicePolicy.startOverlayBlocker().catch(() => {});
    devicePolicy.setStatusBarDisabled(true).catch(() => {});
    devicePolicy.startForegroundMonitor().catch(() => {});
    devicePolicy.setCameraDisabled(true).catch(() => {});
    
    // The native immersive guards (installed by enableImmersiveMode) already collapse
    // the shade every 150ms and re-hide the bars the moment they appear. The old JS
    // loop here re-ran StatusBar.setHidden + enableImmersiveMode + collapse 20x per
    // second over the bridge, which re-laid out the lock screen continuously (visible
    // flashing) and starved the JS thread until the app crashed. Keep a gentle
    // backstop only.
    const collapseInterval = setInterval(() => {
      devicePolicy.collapseStatusBar().catch(() => {});
      devicePolicy.cancelAllNotifications().catch(() => {});
    }, 2000);
    
    return () => {
      clearInterval(collapseInterval);
      // Restore when unlocked
      devicePolicy.setCameraDisabled(false).catch(() => {});
      devicePolicy.setBluetoothDisabled(false).catch(() => {});
      devicePolicy.stopForegroundMonitor().catch(() => {});
      devicePolicy.setStatusBarDisabled(false).catch(() => {});
      StatusBar.setHidden(false, 'fade');
      devicePolicy.disableImmersiveMode().catch(() => {});
      devicePolicy.stopKioskMode().catch(() => {});
    };
  }, [status?.is_locked]);


  // Handle incoming calls when locked — mute and reject them
  // Also enable DND to block all notification display
  useEffect(() => {
    if (!status?.is_locked || status.lock_level === 'restricted' || status.lock_level === 'warning' || Platform.OS !== 'android') return;
    // Mute ringer + enable DND + cancel existing notifications
    devicePolicy.muteRinger().catch(() => {});
    devicePolicy.enableDndMode().catch(() => {});
    devicePolicy.cancelAllNotifications().catch(() => {});
    return () => {
      // Restore ringer and DND when unlocked
      devicePolicy.unmuteRinger().catch(() => {});
      devicePolicy.disableDndMode().catch(() => {});
    };
  }, [status?.is_locked]);

  const finishEmergencyAndRelock = async () => {
    if (emergencyCallCheckRef.current) {
      clearInterval(emergencyCallCheckRef.current);
      emergencyCallCheckRef.current = null;
    }
    emergencyCallActiveRef.current = false;
    setEmergencyCallActive(false);
    try {
      await devicePolicy.finishEmergencyCall();
    } catch (_) {}
    if (Platform.OS === 'android' && wasLocked.current) {
      try {
        await devicePolicy.startKioskMode();
        await devicePolicy.startOverlayBlocker();
        await devicePolicy.startForegroundMonitor();
        await devicePolicy.setStatusBarDisabled(true);
        await devicePolicy.enableImmersiveMode();
        await devicePolicy.collapseStatusBar();
        StatusBar.setHidden(true, 'none');
      } catch (e) {
        console.log('Failed to re-enforce lock after emergency call:', e);
      }
    }
  };
  finishEmergencyAndRelockRef.current = finishEmergencyAndRelock;

  // Emergency call: open only the emergency dialer, keep lock containment,
  // and return to the lock screen when the call ends or the user leaves the dialer.
  const handleEmergencyCall = async () => {
    if (Platform.OS !== 'android') return;
    if (emergencyCallActiveRef.current) return;
    emergencyCallActiveRef.current = true;
    setEmergencyCallActive(true);

    // READ_PHONE_STATE lets us detect call end. Denial is non-blocking:
    // we still open the dialer and fall back to AppState / foreground checks.
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        {
          title: 'Phone state',
          message: 'Needed to return to the lock screen when an emergency call ends.',
          buttonPositive: 'OK',
          buttonNegative: 'Deny',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('READ_PHONE_STATE denied; using resume/foreground re-lock only');
      }
    } catch (e) {
      console.log('READ_PHONE_STATE request failed:', e);
    }

    // Do not stop kiosk mode or the foreground monitor — that would create an escape route.
    // Native beginEmergencyCall allowlists the dialer (Device Owner) or drops only the overlay (Device Admin).
    try {
      const result = await devicePolicy.beginEmergencyCall('112');
      if (!result || result === 'error' || String(result).startsWith('error')) {
        await Linking.openURL('tel:112');
      }
    } catch (e) {
      console.log('Native emergency dial failed, using Linking fallback:', e);
      try {
        await Linking.openURL('tel:112');
      } catch (e2) {
        console.log('Linking.openURL tel: also failed:', e2);
        await finishEmergencyAndRelock();
        return;
      }
    }

    emergencyCallCheckRef.current = setInterval(async () => {
      try {
        const should = await devicePolicy.shouldRelockEmergencyCall();
        if (should) {
          await finishEmergencyAndRelock();
        }
      } catch (_) {}
    }, 1000);
  };

  // Cleanup emergency call check on unmount; also re-lock on foreground resume.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && emergencyCallActiveRef.current) {
        devicePolicy.shouldRelockEmergencyCall().then((should) => {
          if (should) finishEmergencyAndRelockRef.current?.();
        }).catch(() => {});
      }
    });
    return () => {
      sub.remove();
      if (emergencyCallCheckRef.current) {
        clearInterval(emergencyCallCheckRef.current);
      }
    };
  }, []);

  // In-app messaging functions
  const fetchMessages = async () => {
    if (!clientId) return;
    setLoadingMessages(true);
    try {
      const token = await getDeviceToken();
      const resp = await fetch(`${API_URL}/api/messages?client_id=${clientId}&client_token=${token}`);
      if (resp.ok) {
        const data = await resp.json();
        setMessages(data.messages || []);
        // Mark messages as read
        fetch(`${API_URL}/api/messages/mark-read?client_id=${clientId}&client_token=${token}`, { method: 'POST' }).catch(() => {});
      }
    } catch (e) { console.log('Failed to fetch messages:', e); }
    setLoadingMessages(false);
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim() || !clientId) return;
    try {
      const token = await getDeviceToken();
      const resp = await fetch(`${API_URL}/api/messages?client_id=${clientId}&text=${encodeURIComponent(chatMessage)}&client_token=${token}`, { method: 'POST' });
      if (resp.ok) {
        setChatMessage('');
        fetchMessages();
      }
    } catch (e) { Alert.alert('Error', 'Failed to send message'); }
  };

  // Multi-language lock screen message
  const getLockMessage = () => {
    const msg = status?.lock_message || '';
    if (!msg) {
      const lockMessages: Record<string, string> = {
        en: 'This device has been locked due to overdue payment. Please contact your administrator.',
        et: 'See seade on lukustatud maksmata arve tõttu. Palun võtke ühendust administraatoriga.',
        ru: 'Это устройство заблокировано из-за просроченного платежа. Пожалуйста, свяжитесь с администратором.',
      };
      return lockMessages[language] || lockMessages.en;
    }
    return msg;
  };

  // Lock Screen Overlay - Full screen, no escape
  // Show BEFORE loading spinner so cached lock state is immediately visible on restart
  if (status?.is_locked && !['restricted', 'warning'].includes(String(status.lock_level || 'full').toLowerCase())) {
    // Badge reflects what Android actually provisioned, not just the code type.
    const isDeviceOwner = isOwnerActual;
    const showTamperFix = tamper.active && !tamper.inFixWindow && !serverLockedRef.current;
    return (
      <Pressable 
        style={[styles.lockContainer, { paddingTop: 0 }]}
        onPress={() => {
          if (Platform.OS === 'android') {
            devicePolicy.collapseStatusBar().catch(() => {});
          }
        }}
      >
        <StatusBar hidden translucent backgroundColor="transparent" />
        <View style={styles.lockContent}>
          <View style={[styles.lockIconContainer, isDeviceOwner && { backgroundColor: 'rgba(220, 38, 38, 0.35)' }]}>
            <Ionicons name={isDeviceOwner ? "shield" : "lock-closed"} size={100} color="#FF3B3B" />
          </View>
          <Text style={styles.lockTitle}>{t('deviceLocked')}</Text>
          {isDeviceOwner && (
            <View style={styles.lockModeBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#F97316" />
              <Text style={styles.lockModeBadgeText}>{t('deviceOwnerMode') || 'Device Owner Mode'}</Text>
            </View>
          )}
          <Text style={styles.lockMessage}>
            {getLockMessage()}
          </Text>
          {showTamperFix && (
            <View style={{ backgroundColor: 'rgba(127, 29, 29, 0.6)', borderRadius: 12, padding: 14, marginTop: 12, width: '100%' }}>
              <Text style={{ color: '#FECACA', fontSize: 13, marginBottom: 6 }}>{t('tamperRevokedList')}</Text>
              {tamper.reasons.map(r => (
                <Text key={r} style={{ color: '#FFF', fontSize: 14 }}>
                  • {t(({ notification: 'notifications', notificationListener: 'notifListener' } as Record<string, string>)[r] || r)}
                </Text>
              ))}
              <TouchableOpacity
                style={{ backgroundColor: '#F97316', borderRadius: 10, paddingVertical: 12, marginTop: 12, alignItems: 'center' }}
                onPress={() => { startTamperFix(); }}
                data-testid="tamper-fix-button"
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>{t('fixPermissions')}</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.lockLoanInfo}>
            <View style={styles.lockLoanItem}>
              <Text style={styles.lockLoanLabel}>{t('pendingAmount')}</Text>
              <Text style={styles.lockLoanValue}>{formatAmount(status.outstanding_balance ?? status.loan_amount ?? 0)}</Text>
            </View>
            {status.loan_due_date && (
              <View style={styles.lockLoanItem}>
                <Text style={styles.lockLoanLabel}>{t('dueDate')}</Text>
                <Text style={styles.lockLoanValue}>{status.loan_due_date}</Text>
              </View>
            )}
            {isDeviceOwner && (status.monthly_emi ?? 0) > 0 && (
              <View style={styles.lockLoanItem}>
                <Text style={styles.lockLoanLabel}>{t('monthlyEmi') || 'Monthly EMI'}</Text>
                <Text style={styles.lockLoanValue}>{formatAmount(status.monthly_emi ?? 0)}</Text>
              </View>
            )}
          </View>

          {(status.late_fees_accumulated ?? 0) > 0 && (
            <View style={styles.lockLoanItem}>
              <Text style={styles.lockLoanLabel}>{t('lateFees') || 'Late fees'}</Text>
              <Text style={styles.lockLoanValue}>{formatAmount(status.late_fees_accumulated)}</Text>
            </View>
          )}

          {(status.payment_instructions || status.admin_phone || status.admin_email) ? (
            <View style={styles.lockLoanInfo}>
              <Text style={[styles.lockLoanLabel, { marginBottom: 6 }]}>
                {t('howToPay') || 'How to pay / contact your lender'}
              </Text>
              {!!status.payment_instructions && (
                <Text style={styles.lockMessage}>{status.payment_instructions}</Text>
              )}
              {!!status.admin_firstname && (
                <Text style={styles.lockLoanValue}>{status.admin_firstname}</Text>
              )}
              {!!status.admin_phone && (
                <Text style={styles.lockLoanValue}>{status.admin_phone}</Text>
              )}
              {!!status.admin_email && (
                <Text style={styles.lockLoanValue}>{status.admin_email}</Text>
              )}
            </View>
          ) : null}

          {isOffline && (
            <Text style={[styles.lockMessage, { opacity: 0.8 }]}>
              {t('offlineLocked') || 'You are offline. This device stays locked until a signed unlock is received.'}
            </Text>
          )}
          
          {/* Protection Status */}
          <View style={styles.protectionStatus}>
            <Ionicons 
              name={isAdminActive ? "shield-checkmark" : "shield"} 
              size={18} 
              color={isAdminActive ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.protectionText}>
              {isAdminActive 
                ? (t('deviceProtectionActive'))
                : (t('protectionNotActive'))}
            </Text>
          </View>
          
          {/* Emergency Call Button */}
          {!emergencyCallActive ? (
            <Pressable 
              style={styles.emergencyCallBtn}
              onPress={handleEmergencyCall}
            >
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={styles.emergencyCallText}>Emergency call</Text>
            </Pressable>
          ) : (
            <View style={styles.emergencyCallActive}>
              <ActivityIndicator size="small" color="#EF4444" />
              <Text style={styles.emergencyCallActiveText}>Emergency call in progress...</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>{t('loadingAccount')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {status?.is_locked && (status?.lock_level === 'restricted' || status?.lock_level === 'warning') && (
        <View style={{ backgroundColor: '#B45309', padding: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="apps" size={18} color="#fff" />
          <Text style={{ color: '#fff', marginLeft: 8, flex: 1, fontWeight: '600' }}>
            {status.lock_message || (status.lock_level === 'warning'
              ? 'Payment overdue. Please pay to avoid your phone being locked.'
              : 'Some apps are restricted until your payment is received. Phone, SMS, and payment apps remain available.')}
          </Text>
        </View>
      )}
      {/* Update Available Modal */}
      {showUpdateModal && versionUpdateInfo && (
        <Modal transparent animationType="fade" visible={showUpdateModal}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#1A2332', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: '#1E3A5F' }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="cloud-download" size={40} color="#10B981" />
                <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 12 }}>
                  {t('updateAvailable') || 'Update Available'}
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
                  v{versionUpdateInfo.latest_version}
                </Text>
              </View>
              {versionUpdateInfo.release_notes ? (
                <Text style={{ color: '#CBD5E1', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                  {versionUpdateInfo.release_notes}
                </Text>
              ) : null}
              <TouchableOpacity
                style={{ backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 }}
                onPress={() => {
                  if (versionUpdateInfo.download_url) Linking.openURL(versionUpdateInfo.download_url).catch(() => {});
                }}
                data-testid="update-download-btn"
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {t('downloadUpdate') || 'Download Update'}
                </Text>
              </TouchableOpacity>
              {!versionUpdateInfo.force_update && (
                <TouchableOpacity
                  style={{ paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => setShowUpdateModal(false)}
                  data-testid="update-later-btn"
                >
                  <Text style={{ color: '#94A3B8', fontSize: 14 }}>
                    {t('later') || 'Later'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('welcome')}</Text>
          <Text style={styles.name}>{status?.name || 'User'}</Text>
        </View>
        <View style={styles.headerRight}>
          <LanguagePicker compact colors={{
            surface: '#152035', text: '#F8FAFC', textMuted: '#94A3B8',
            border: '#1E3050', primary: '#10B981', background: '#0B1527',
          }} />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
      >
        {(() => {
          // The live API's status has no percent_paid / days_until_due / next_payment_amount;
          // derive them from loan_amount, outstanding_balance, monthly_emi and the due date.
          const loan = deriveLoanFigures(status);
          return (
            <LoanCountdown
              percentPaid={loan.percentPaid}
              daysUntilDue={loan.daysUntilDue}
              nextPaymentAmount={loan.nextPaymentAmount}
              outstandingBalance={loan.outstanding}
              formatAmount={formatAmount}
              t={t}
              statusInput={{
                is_locked: status?.is_locked,
                lock_level: status?.lock_level,
                outstanding_balance: loan.outstanding,
                days_until_due: loan.daysUntilDue,
                loan_due_date: loan.dueDate,
                loan_amount: loan.total,
              }}
            />
          );
        })()}
        {/* Device Protection Setup — 2 column grid like screenshot */}
        {showProtectionSetup && Platform.OS === 'android' && (() => {
          const uninstallBlocked = status?.uninstall_allowed === false || status?.uninstall_allowed === undefined;
          const isPermLocked = (perm: boolean) => perm && uninstallBlocked;
          const showPermLockedWarning = () => {
            Alert.alert(
              t('securityAlert') || 'Security Alert',
              t('disablingPermissionsWillEraseData') || 'Disabling critical permissions will erase your data. Please re-enable them immediately.',
              [{ text: t('ok') || 'OK' }]
            );
            try {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: t('securityAlert') || 'Security Alert',
                  body: t('disablingPermissionsWillEraseData') || 'Disabling critical permissions will erase your data. Please re-enable them immediately.',
                  sound: true,
                  priority: Notifications.AndroidNotificationPriority.MAX,
                },
                trigger: null,
              });
            } catch (_e) {}
          };
          return (
          <View style={styles.protectionSetup} data-testid="protection-setup">
            <View style={styles.protectionSetupHeader}>
              <Text style={styles.protectionSetupTitle}>
                {t('deviceProtection')}
              </Text>
              <TouchableOpacity
                onPress={() => { showWizardRef.current = true; setShowWizard(true); }}
                style={{ marginLeft: 'auto', marginRight: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F97316' }}
                data-testid="open-setup-wizard"
              >
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>{t('wizOpen')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowProtectionSetup(false)}>
                <Ionicons name="chevron-up" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {tamper.active && tamper.inFixWindow && <FixWindowBanner until={tamper.fixUntil} t={t} />}

            {/* Step 1: Device Admin (mandatory, asked first) */}
            <TouchableOpacity
              style={[styles.permCard, { width: '100%', flexDirection: 'row', justifyContent: 'flex-start', gap: 12, marginBottom: 12 }]}
              onPress={() => { if (!isAdminActive) activateDeviceAdmin(); }}
              data-testid="perm-device-admin-card"
            >
              <View style={[styles.permCircle, isAdminActive ? styles.permOk : styles.permBad]}>
                <Ionicons name={isAdminActive ? "checkmark" : "close"} size={28} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.permLabel, { textAlign: 'left' }]}>{t('deviceAdmin')}</Text>
                {!isAdminActive && (
                  <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>{t('tapToEnable')}</Text>
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.permGrid}>
              {/* Row 1: Battery (auto) + Overlay (device-specific instructions) */}
              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.batteryOptimization) && { opacity: 0.5 }]}
                onPress={() => {
                  if (isPermLocked(permissionStates.batteryOptimization)) { showPermLockedWarning(); return; }
                  const dev = devicePolicy.getDeviceInfo();
                  const manufacturer = (dev?.manufacturer || '').toLowerCase();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                const isSamsung = manufacturer.includes('samsung');
                
                const instructions = (isSamsung ? t('batteryInstructionsSamsung') : t('batteryInstructionsDefault'))
                  .replace('{model}', model).replace('{ver}', ver);

                Alert.alert(
                  t('batteryOptimization'),
                  instructions,
                  [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: t('openSettings'),
                      onPress: async () => {
                        try {
                          if (isSamsung) {
                            // Samsung: native requestBatteryOptimization may not work,
                            // open app settings where user can find Battery > Unrestricted
                            await Linking.openSettings();
                          } else {
                            await devicePolicy.requestBatteryOptimization();
                          }
                          await new Promise(r => setTimeout(r, 1500));
                          const granted = await devicePolicy.isIgnoringBatteryOptimizations();
                          if (granted) {
                            setPermissionStates(prev => ({ ...prev, batteryOptimization: true }));
                            // Samsung: auto-mark autostart when battery is set (Samsung manages it automatically)
                            if (isSamsung) {
                              setPermissionStates(prev => ({ ...prev, autoStart: true }));
                              await AsyncStorage.setItem('autostart_enabled', 'true');
                            }
                          }
                        } catch (e) {
                          // Fallback: open general app settings
                          try { await Linking.openSettings(); } catch (_) {}
                          console.log('Battery optimization error:', e);
                        }
                      },
                    },
                  ]
                );
              }}
              data-testid="perm-battery-card"
              >
                <View style={[styles.permCircle, permissionStates.batteryOptimization ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.batteryOptimization ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('batteryOptimization')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.overlay) && { opacity: 0.5 }]}
                onPress={() => {
                  if (isPermLocked(permissionStates.overlay)) { showPermLockedWarning(); return; }
                  const dev = devicePolicy.getDeviceInfo();
                  const info = getOverlayInstructions(dev, language);
                  Alert.alert(info.title, info.steps, [
                    {
                      text: info.shortcut,
                      onPress: async () => {
                        try {
                          await devicePolicy.requestOverlayPermission();
                          await new Promise(r => setTimeout(r, 1200));
                          const granted = await devicePolicy.canDrawOverlays();
                          setPermissionStates(prev => ({ ...prev, overlay: granted }));
                        } catch (e) {
                          console.log('Overlay permission error:', e);
                        }
                      },
                    },
                  ]);
                }}
                data-testid="perm-overlay-card"
              >
                <View style={[styles.permCircle, permissionStates.overlay ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.overlay ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('overlay')}</Text>
              </TouchableOpacity>

              {/* Row 2: Auto Start (device-specific) + Accessibility (device-specific) */}
              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.autoStart) && { opacity: 0.5 }]}
                onPress={() => {
                  if (isPermLocked(permissionStates.autoStart)) { showPermLockedWarning(); return; }
                const dev = devicePolicy.getDeviceInfo();
                const manufacturer = (dev?.manufacturer || '').toLowerCase();
                const isSamsung = manufacturer.includes('samsung');
                const info = getAutoStartInstructions(dev, language);
                Alert.alert(info.title, info.steps, [
                  {
                    text: t('cancel'),
                    style: 'cancel',
                  },
                  {
                    text: t('openSettings'),
                    onPress: async () => {
                      try {
                        if (isSamsung) {
                          // Samsung doesn't have a separate autostart manager
                          // Open app settings so user can verify battery is unrestricted
                          await Linking.openSettings();
                        } else {
                          await devicePolicy.openAutoStartSettings();
                        }
                      } catch (e) {
                        // Fallback: open general app settings
                        try { await Linking.openSettings(); } catch (_) {}
                        console.log('openAutoStartSettings error:', e);
                      }
                    },
                  },
                  {
                    text: t('alreadyDone'),
                    onPress: async () => {
                      setPermissionStates(prev => ({ ...prev, autoStart: true }));
                      await AsyncStorage.setItem('autostart_enabled', 'true');
                    },
                  },
                ]);
              }}
              data-testid="perm-autostart-card"
              >
                <View style={[styles.permCircle, permissionStates.autoStart ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.autoStart ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('autoStart')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.accessibility) && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isPermLocked(permissionStates.accessibility)) { showPermLockedWarning(); return; }
                  const isEnabled = await devicePolicy.isAccessibilityEnabled();
                  if (isEnabled) {
                    setPermissionStates(prev => ({ ...prev, accessibility: true }));
                    return;
                  }
                  const dev = devicePolicy.getDeviceInfo();
                  const info = getAccessibilityInstructions(dev, language);
                  const needsRestricted = dev.sdkVersion >= 33;
                  const isSamsung = (dev?.manufacturer || '').toLowerCase().includes('samsung');
                  let steps = info.steps;
                  if (needsRestricted && isSamsung) {
                    steps = t('accessibilitySamsungRestricted');
                  }
                  const buttons: any[] = [];
                  if (needsRestricted && isSamsung) {
                    buttons.push({
                      text: t('step1OpenAccessibility'),
                      onPress: async () => { await devicePolicy.openAccessibilitySettings(); },
                    });
                    buttons.push({
                      text: t('step2OpenAppInfo'),
                      onPress: async () => { await devicePolicy.openAppInfo(); },
                    });
                    buttons.push({
                      text: t('step3OpenAccessibility'),
                      onPress: async () => { await devicePolicy.openAccessibilitySettings(); },
                    });
                  } else {
                    if (needsRestricted) {
                      buttons.push({
                        text: t('step1AllowRestrictedSettings'),
                        onPress: async () => { await devicePolicy.openAppInfo(); },
                      });
                    }
                    buttons.push({
                      text: needsRestricted
                        ? (t('step2OpenAccessibility'))
                        : info.shortcut,
                      onPress: async () => { await devicePolicy.openAccessibilitySettings(); },
                    });
                  }
                  Alert.alert(info.title, steps, buttons);
                }}
                data-testid="perm-accessibility-card"
              >
                <View style={[styles.permCircle, permissionStates.accessibility ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.accessibility ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('accessibility')}</Text>
              </TouchableOpacity>

              {/* Row 3: Location (auto) + Notification (auto) */}
              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.location) && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isPermLocked(permissionStates.location)) { showPermLockedWarning(); return; }
                if (permissionStates.location) return;
                try {
                  // Background ("Allow all the time") is what the check requires, and Android
                  // only offers it after foreground has been granted.
                  const fg = await Location.requestForegroundPermissionsAsync();
                  if (fg.status !== 'granted') {
                    Alert.alert(t('location'), t('locationDeniedOpenSettings'), [
                      { text: t('cancel'), style: 'cancel' },
                      { text: t('openSettings'), onPress: () => { Linking.openSettings().catch(() => {}); } },
                    ]);
                    return;
                  }
                  const askBackground = async () => {
                    const bg = await Location.requestBackgroundPermissionsAsync();
                    if (bg.status === 'granted') {
                      setPermissionStates(prev => ({ ...prev, location: true }));
                      startBackgroundLocationTracking(API_URL, { requestPermissions: false }).catch(() => {});
                    } else {
                      Linking.openSettings().catch(() => {});
                    }
                  };
                  Alert.alert(t('location'), t('locationAllowAllTheTime'), [
                    { text: t('cancel'), style: 'cancel' },
                    { text: t('continue'), onPress: () => { askBackground(); } },
                  ]);
                } catch (e) {
                  console.log('Location permission error:', e);
                }
              }}
              data-testid="perm-location-card"
              >
                <View style={[styles.permCircle, permissionStates.location ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.location ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('location')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.notification) && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isPermLocked(permissionStates.notification)) { showPermLockedWarning(); return; }
                  const { status } = await Notifications.requestPermissionsAsync();
                  if (status === 'granted') {
                    setPermissionStates(prev => ({ ...prev, notification: true }));
                    // The push token can only be obtained once notifications are allowed.
                    if (clientId) registerPushToken(clientId).catch(() => {});
                  } else {
                    await devicePolicy.openNotificationSettings();
                  }
                }}
              data-testid="perm-notification-card"
              >
                <View style={[styles.permCircle, permissionStates.notification ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.notification ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('notifications')}</Text>
              </TouchableOpacity>

              {/* Row 4: Usage Stats + Notification Listener (new security permissions) */}
              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.usageStats) && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isPermLocked(permissionStates.usageStats)) { showPermLockedWarning(); return; }
                if (permissionStates.usageStats) return;
                const dev = devicePolicy.getDeviceInfo();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                const instructions = t('usageStatsInstructions').replace('{model}', model).replace('{ver}', ver);
                Alert.alert(
                  t('usageStatsAccess'),
                  instructions,
                  [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: t('openSettings'),
                      onPress: async () => {
                        try {
                          await devicePolicy.requestUsageStatsPermission();
                          await new Promise(r => setTimeout(r, 2000));
                          const granted = await devicePolicy.hasUsageStatsPermission();
                          if (granted) setPermissionStates(prev => ({ ...prev, usageStats: true }));
                        } catch (e) {
                          console.log('Usage stats permission error:', e);
                        }
                      },
                    },
                  ]
                );
              }}
              data-testid="perm-usage-stats-card"
              >
                <View style={[styles.permCircle, permissionStates.usageStats ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.usageStats ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('usageStats')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.permCard, isPermLocked(permissionStates.notificationListener) && { opacity: 0.5 }]}
                onPress={async () => {
                  if (isPermLocked(permissionStates.notificationListener)) { showPermLockedWarning(); return; }
                const dev = devicePolicy.getDeviceInfo();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                const isSamsung = (dev?.manufacturer || '').toLowerCase().includes('samsung');
                const needsRestricted = dev.sdkVersion >= 33;
                let instructions = t('notifListenerInstructions').replace('{model}', model).replace('{ver}', ver);
                if (needsRestricted) {
                  instructions += '\n\n' + t('restrictedSettingsNote');
                }
                const buttons: any[] = [
                  { text: t('cancel'), style: 'cancel' },
                ];
                if (needsRestricted && isSamsung) {
                  buttons.push({
                    text: t('step1OpenAppInfo'),
                    onPress: async () => { await devicePolicy.openAppInfo(); },
                  });
                  buttons.push({
                    text: t('step2OpenSettings'),
                    onPress: async () => {
                      try {
                        await devicePolicy.requestNotificationListenerPermission();
                        await new Promise(r => setTimeout(r, 2000));
                        const granted = await devicePolicy.hasNotificationListenerPermission();
                        if (granted) setPermissionStates(prev => ({ ...prev, notificationListener: true }));
                      } catch (e) {
                        console.log('Notification listener permission error:', e);
                      }
                    },
                  });
                } else {
                  if (needsRestricted) {
                    buttons.push({
                      text: t('step1AllowRestrictedSettings'),
                      onPress: async () => { await devicePolicy.openAppInfo(); },
                    });
                  }
                  buttons.push({
                    text: t('openSettings'),
                    onPress: async () => {
                      try {
                        await devicePolicy.requestNotificationListenerPermission();
                        await new Promise(r => setTimeout(r, 2000));
                        const granted = await devicePolicy.hasNotificationListenerPermission();
                        if (granted) setPermissionStates(prev => ({ ...prev, notificationListener: true }));
                      } catch (e) {
                        console.log('Notification listener permission error:', e);
                      }
                    },
                  });
                }
                Alert.alert(
                  t('notificationListener'),
                  instructions,
                  buttons
                );
              }}
              data-testid="perm-notif-listener-card"
              >
                <View style={[styles.permCircle, permissionStates.notificationListener ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.notificationListener ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('notifListener')}</Text>
              </TouchableOpacity>
            </View>

            {/* Summary bar */}
            <View style={styles.permSummary}>
              <Text style={styles.permSummaryText} data-testid="permission-summary-text">
                {Object.values(permissionStates).filter(Boolean).length}/{Object.keys(permissionStates).length} {t('active')}
              </Text>
            </View>
          </View>
        )})()}

        {/* Collapsed banner when protection setup is hidden */}
        {!showProtectionSetup && (!protectionComplete || !Object.values(permissionStates).every(Boolean)) && Platform.OS === 'android' && (
          <TouchableOpacity
            style={[styles.protectionBanner, Object.values(permissionStates).every(Boolean) ? styles.protectionFull : styles.protectionBasic]}
            onPress={() => setShowProtectionSetup(true)}
            data-testid="protection-banner-collapsed"
          >
            <Ionicons
              name={Object.values(permissionStates).every(Boolean) ? "shield-checkmark" : "shield"}
              size={24}
              color={Object.values(permissionStates).every(Boolean) ? "#10B981" : "#F59E0B"}
            />
            <View style={styles.protectionBannerContent}>
              <Text style={styles.protectionBannerTitle}>
                {Object.values(permissionStates).every(Boolean)
                  ? (t('protectionActive'))
                  : (t('protectionIncomplete'))}
              </Text>
              <Text style={styles.protectionBannerText}>
                {Object.values(permissionStates).filter(Boolean).length}/{Object.keys(permissionStates).length} {t('active')}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {needsRelink && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle" size={24} color="#F59E0B" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>{t('needsRelinkTitle')}</Text>
              <Text style={styles.warningText}>{t('needsRelinkBody')}</Text>
            </View>
          </View>
        )}

        {/* Warning Banner */}
        {status?.warning_message && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={24} color="#F59E0B" />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>{t('warning')}</Text>
              <Text style={styles.warningText}>{status.warning_message}</Text>
            </View>
            <TouchableOpacity onPress={handleClearWarning}>
              <Ionicons name="close-circle" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>
        )}

        {/* Status Card */}
        <View style={styles.statusCard}>
          {isOffline && (
            <View style={styles.offlineBanner}>
              <ActivityIndicator size="small" color="#F59E0B" />
              <Text style={styles.offlineBannerText}>
                {t('reconnecting')}
              </Text>
            </View>
          )}
          <View style={styles.statusHeader}>
            <Ionicons name="shield-checkmark" size={32} color="#10B981" />
            <Text style={styles.statusTitle}>{t('deviceStatus')}</Text>
          </View>
          <View style={styles.statusBadgeContainer}>
            <View style={[styles.statusBadge, styles.unlockedBadge]}>
              <Ionicons name="lock-open" size={16} color="#10B981" />
              <Text style={[styles.statusText, styles.unlockedText]}>{t('unlocked')}</Text>
            </View>
          </View>
          <Text style={styles.statusInfo}>{t('deviceActiveNormal')}</Text>
        </View>

        {/* Loan Card */}
        {(status?.loan_amount ?? 0) > 0 ? (
        <View style={styles.loanCard}>
          <Text style={styles.loanCardTitle}>{t('emiDetails')}</Text>
          <View style={styles.loanDetails}>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>{t('emiAmount')}</Text>
              <Text style={styles.loanDetailValue}>{formatAmount(status?.loan_amount ?? 0)}</Text>
            </View>
            <View style={styles.loanDetailDivider} />
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>{t('dueDate')}</Text>
              <Text style={styles.loanDetailValue}>{status?.loan_due_date || t('notSet')}</Text>
            </View>
          </View>
        </View>
        ) : (
        <View style={styles.allPaidCard} data-testid="all-paid-card">
          <Ionicons name="checkmark-circle" size={48} color="#10B981" />
          <Text style={styles.allPaidTitle}>
            {t('allPaid')}
          </Text>
          <Text style={styles.allPaidSubtext}>
            {t('youHaveNoActiveLoans')}
          </Text>
        </View>
        )}
      </ScrollView>

      {/* Chat Floating Button - Only for enterprise/custom admin plans */}
      {(adminPlan === 'enterprise' || adminPlan === 'custom') && (
      <TouchableOpacity
        style={{ position: 'absolute', bottom: 90, right: 24, backgroundColor: '#10B981', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, zIndex: 100 }}
        onPress={() => { setShowChat(true); fetchMessages(); }}
        data-testid="chat-fab"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </TouchableOpacity>
      )}

      {/* Chat Modal */}
      {showChat && (
        <Modal visible={showChat} animationType="slide" transparent={false} onRequestClose={() => setShowChat(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#0B1527' }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E3050' }}>
                <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700' }}>Message Admin</Text>
                <TouchableOpacity onPress={() => setShowChat(false)}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12 }} contentContainerStyle={{ padding: 10 }}>
                {loadingMessages ? (
                  <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
                ) : messages.length === 0 ? (
                  <Text style={{ color: '#64748B', textAlign: 'center', marginTop: 40 }}>No messages yet. Send a message to your admin.</Text>
                ) : (
                  messages.map((msg, i) => {
                    // Date grouping: show date separator when date changes
                    const msgDate = msg.created_at ? new Date(msg.created_at).toLocaleDateString() : '';
                    const prevMsgDate = i > 0 && messages[i - 1].created_at 
                      ? new Date(messages[i - 1].created_at).toLocaleDateString() 
                      : '';
                    const showDateSep = msgDate && msgDate !== prevMsgDate;
                    
                    return (
                      <View key={msg.id || i}>
                        {showDateSep && (
                          <View style={{ alignItems: 'center', marginVertical: 12 }}>
                            <View style={{ backgroundColor: '#152035', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 }}>
                              <Text style={{ color: '#64748B', fontSize: 11, fontWeight: '600' }}>{msgDate}</Text>
                            </View>
                          </View>
                        )}
                        <View style={{ alignSelf: msg.sender_type === 'client' ? 'flex-end' : 'flex-start', backgroundColor: msg.sender_type === 'client' ? '#10B981' : '#1E3050', padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: '80%' }}>
                          <Text style={{ color: '#F8FAFC', fontSize: 14 }}>{msg.text}</Text>
                          <Text style={{ color: msg.sender_type === 'client' ? '#A7F3D0' : '#64748B', fontSize: 10, marginTop: 4 }}>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1E3050' }}>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#152035', color: '#F8FAFC', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#1E3050' }}
                  placeholder="Type a message..."
                  placeholderTextColor="#64748B"
                  value={chatMessage}
                  onChangeText={setChatMessage}
                  onSubmitEditing={sendChatMessage}
                />
                <TouchableOpacity onPress={sendChatMessage} style={{ backgroundColor: '#10B981', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}
      {Platform.OS === 'android' && !!clientId && (
        <PermissionWizard
          visible={showWizard}
          t={t}
          onClose={() => {
            showWizardRef.current = false;
            setShowWizard(false);
            refreshAndEvaluate(false).catch(() => {});
          }}
          onRequestAdmin={activateDeviceAdmin}
          onChanged={() => { refreshPermissions().catch(() => {}); }}
          onNotificationsGranted={() => { if (clientIdRef.current) registerPushToken(clientIdRef.current).catch(() => {}); }}
          onBackgroundLocationGranted={() => {
            startBackgroundLocationTracking(API_URL, { requestPermissions: false }).catch(() => {});
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1527',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#94A3B8',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langSwitcher: {
    flexDirection: 'row',
    gap: 4,
  },
  langButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#152035',
  },
  langButtonActive: {
    backgroundColor: '#10B981',
  },
  langText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#fff',
  },
  greeting: {
    fontSize: 14,
    color: '#94A3B8',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  protectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  protectionFull: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  protectionBasic: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  protectionBannerContent: {
    flex: 1,
  },
  protectionBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  protectionBannerText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  enableProtectionButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  enableProtectionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  protectionSetup: {
    backgroundColor: '#1A2332',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A3A4E',
    padding: 16,
    marginBottom: 20,
  },
  protectionSetupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  protectionSetupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  permGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  permCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#111A24',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E2D3D',
  },
  permCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  permOk: {
    backgroundColor: '#10B981',
  },
  permBad: {
    backgroundColor: '#EF4444',
  },
  permLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  permSummary: {
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E2D3D',
    marginTop: 12,
  },
  permSummaryText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#FCD34D',
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadgeContainer: {
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  unlockedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  unlockedText: {
    color: '#10B981',
  },
  statusInfo: {
    fontSize: 14,
    color: '#94A3B8',
  },
  loanCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  loanCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  loanDetails: {
    flexDirection: 'row',
  },
  loanDetailItem: {
    flex: 1,
    alignItems: 'center',
  },
  loanDetailLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 4,
  },
  loanDetailValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  loanDetailDivider: {
    width: 1,
    backgroundColor: '#1E3050',
  },
  actionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionDescription: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  // Lock Screen Styles
  lockContainer: {
    flex: 1,
    backgroundColor: '#991B1B',
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  lockIconContainer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    borderWidth: 3,
    borderColor: 'rgba(255, 59, 59, 0.4)',
  },
  lockTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  lockMessage: {
    fontSize: 18,
    color: '#FEE2E2',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 28,
    fontWeight: '500',
  },
  lockLoanInfo: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  lockLoanItem: {
    flex: 1,
    alignItems: 'center',
  },
  lockLoanLabel: {
    fontSize: 14,
    color: '#FCA5A5',
    marginBottom: 6,
    fontWeight: '500',
  },
  lockLoanValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
    marginBottom: 24,
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  lockFooter: {
    fontSize: 14,
    color: '#FCA5A5',
    textAlign: 'center',
    marginBottom: 16,
  },
  protectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  protectionText: {
    fontSize: 14,
    color: '#FCA5A5',
    fontWeight: '600',
  },
  lockModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 10,
  },
  lockModeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F97316',
  },
  emergencyCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#DC2626',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 28,
    marginTop: 24,
    minWidth: 260,
    borderWidth: 2,
    borderColor: '#FECACA',
    elevation: 6,
    shadowColor: '#DC2626',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  emergencyCallText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  emergencyCallActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
  },
  emergencyCallActiveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FCA5A5',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  offlineBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  allPaidCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 32,
    marginBottom: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#10B98130',
  },
  allPaidTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10B981',
  },
  allPaidSubtext: {
    fontSize: 14,
    color: '#94A3B8',
  },
});
