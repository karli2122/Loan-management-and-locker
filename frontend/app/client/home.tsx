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
import { devicePolicy } from '../../src/utils/DevicePolicy';
import { getAutoStartInstructions, getOverlayInstructions, getAccessibilityInstructions } from '../../src/utils/deviceInstructions';
import OfflineSyncManager from '../../src/services/OfflineSyncManager';
import { startBackgroundLocationTracking, isBackgroundLocationActive } from '../../src/services/BackgroundLocationService';
import { initializeNotifications } from '../../src/services/BackgroundNotificationService';
import API_URL from '../../src/constants/api';


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
  const autoRequestedRef = useRef(false);
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
  const allowAutoPermissionRequests = false;
  const isMounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLocked = useRef(false);
  const isRequestingAdmin = useRef(false);
  const hasInitialized = useRef(false);
  const initComplete = useRef(false);
  const lastWarningRef = useRef<string>('');
  const uninstallHandledRef = useRef(false); // Prevent repeated uninstall alerts
  const retryCountRef = useRef(0); // Track consecutive API failures for backoff
  const maxRetries = 5;
  const [emergencyCallActive, setEmergencyCallActive] = useState(false);
  const emergencyCallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
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
      
      const stored = await AsyncStorage.getItem('push_token');
      if (stored === token) return;
      
      await AsyncStorage.setItem('push_token', token);
      const response = await fetch(`${API_URL}/api/device/push-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, push_token: token })
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
          
          // Report admin mode active to backend so admin app shows it
          const storedId = await AsyncStorage.getItem('client_id');
          if (storedId) {
            await reportAdminStatus(storedId, true);
          }
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

  // Check and setup Device Admin
  const checkAndSetupDeviceProtection = async () => {
    if (Platform.OS !== 'android') return;

    // Prevent showing multiple prompts if already requesting
    if (isRequestingAdmin.current) {
      console.log('Admin request already in progress, skipping...');
      return;
    }

    // Don't show prompt more than once every 60 seconds (increased from 30)
    const now = Date.now();
    if (now - lastAdminPromptTime < 60000) {
      console.log('Admin prompt shown recently, skipping...');
      return;
    }

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
          // Report tamper attempt to backend
          const storedId = await AsyncStorage.getItem('client_id');
          if (storedId) {
            await reportTamperAttempt('admin_disabled');
            await reportAdminStatus(storedId, false);
          }
          // Clear the flag so we don't report it again
          try {
            await devicePolicy.clearTamperFlags();
          } catch (e) {
            console.log('clearTamperFlags failed:', e);
          }
        }

        console.log('Device Admin not active - prompting user');
        isRequestingAdmin.current = true;
        setLastAdminPromptTime(now);
        
        // Use a non-dismissable alert for re-activation after tamper
        const title = t('deviceProtectionRequired');
        const message = wasDisabled
          ? (t('deviceAdminWasDisabledThisIs'))
          : (t('toSecureYourDevicePleaseEnable'));

        // Show alert with both options - not blocking the main thread
        Alert.alert(
          title,
          message,
          [
            {
              text: t('enableNow'),
              onPress: async () => {
                try {
                  const result = await devicePolicy.requestAdmin();
                  console.log('Device Admin request result:', result);
                  
                  // Only start retry if the request was dispatched successfully
                  if (result !== 'error' && result !== 'error_module_not_available' && result !== 'error_no_activity') {
                    // Give the system dialog time to appear before starting retry checks
                    // User needs time to interact with the system admin permission dialog
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Run retry check in background - don't block
                    // Increased to 20 attempts (20 seconds total) to give user more time
                    checkAdminStatusWithRetry(20, 1000).then(granted => {
                      isRequestingAdmin.current = false;
                      if (granted) {
                        console.log('Admin permission successfully granted!');
                      } else {
                        console.log('Admin not granted after retry period');
                      }
                    }).catch(() => {
                      isRequestingAdmin.current = false;
                    });
                  } else {
                    isRequestingAdmin.current = false;
                  }
                } catch (e) {
                  console.log('Admin request failed:', e);
                  isRequestingAdmin.current = false;
                }
              },
            },
            // Add a "Later" option for non-tamper cases to prevent blocking
            ...(wasDisabled ? [] : [{
              text: t('later'),
              style: 'cancel' as const,
              onPress: () => {
                isRequestingAdmin.current = false;
                console.log('User deferred admin permission');
              },
            }]),
          ],
          { cancelable: !wasDisabled }
        );
      } else {
        // Admin is already active - update state and enable protection
        setIsAdminActive(true);
        isRequestingAdmin.current = false;
        // Ensure uninstall protection is enabled and check result
        try {
          const result = await devicePolicy.preventUninstall(true);
          if (result === 'success') {
            console.log('Device Admin active - uninstall protection enabled');
          } else {
            console.log(`Device Admin active but uninstall protection failed: ${result}`);
          }
          
          // Report admin mode status to backend
          const storedId = await AsyncStorage.getItem('client_id');
          if (storedId) {
            await reportAdminStatus(storedId, true);
          }
        } catch (e) {
          console.log('preventUninstall error:', e);
        }
      }
    } catch (error) {
      console.error('Device protection setup error:', error);
      isRequestingAdmin.current = false;
    }
  };

  const updateLockState = async (locked: boolean, message?: string) => {
    try {
      // Save lock state for offline enforcement and autostart
      await devicePolicy.setLockState(locked, message);
      // Save to native SharedPreferences for BootReceiver + Overlay watchdog
      await devicePolicy.setNativeLockState(locked);
      wasLocked.current = locked;

      // Manage immersive mode, kiosk mode, and overlay based on lock state
      if (Platform.OS === 'android') {
        if (locked) {
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
        } else {
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
          await devicePolicy.stopKioskMode();
          
          // Device Owner mode: Clear custom launcher
          const lockMode = await AsyncStorage.getItem('lock_mode');
          if (lockMode === 'device_owner') {
            await devicePolicy.clearDefaultLauncher();
          }
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
      
      // Create a copy of data for potential modifications (avoid mutating original)
      let statusToSet = { ...data };
      
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
      
      setStatus(statusToSet);
      
      // Show system notification when a NEW warning arrives
      if (statusToSet.warning_message && statusToSet.warning_message !== lastWarningRef.current) {
        lastWarningRef.current = statusToSet.warning_message;
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: t('warningFromAdministrator'),
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
      if (statusToSet.is_locked !== wasLocked.current) {
        updateLockState(statusToSet.is_locked, statusToSet.lock_message);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
      setIsOffline(true);
      
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
        } catch (e) {
          console.log('Protection cleanup error:', e);
        }
      }

      // Allow app to be uninstalled (removes device admin)
      await devicePolicy.allowUninstall();
      await AsyncStorage.removeItem('protection_complete');
      
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
        await fetch(`${API_URL}/api/device/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: id,
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
      
      // If no client_id in AsyncStorage, try restoring from external backup
      // (handles Clear Data/Cache scenario)
      if (!id) {
        try {
          const restoredId = await devicePolicy.restoreClientData();
          if (restoredId) {
            console.log('Restored client_id from external backup:', restoredId);
            await AsyncStorage.setItem('client_id', restoredId);
            await devicePolicy.setRegistered(true);
            id = restoredId;
            // Report tamper attempt (Clear Data detected)
            try {
              await fetch(`${API_URL}/api/clients/${id}/report-tamper?tamper_type=clear_data`, {
                method: 'POST',
              });
            } catch (e) {
              console.log('Failed to report clear data tamper:', e);
            }
          }
        } catch (restoreErr) {
          console.log('External backup restore failed (non-fatal):', restoreErr);
        }
      }
      
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
      
      // Save client info to native SharedPreferences for background lock checking
      try {
        await devicePolicy.setClientInfo(id, API_URL);
      } catch (e) {
        console.log('setClientInfo error (non-fatal):', e);
      }
      
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
      
      // Initialize background services (location tracking + notifications)
      initializeNotifications().catch(e => console.log('Notification init error (non-fatal):', e));
      startBackgroundLocationTracking(API_URL).catch(e => console.log('Background location init error (non-fatal):', e));
    } catch (error) {
      console.error('loadClientData error:', error);
      if (isMounted.current) setLoading(false);
    }
  };

  // Auto-request Location and Notification permissions in sequence
  // These are "requestable" — system shows a popup dialog, user just taps Allow
  // DISABLED for fresh registration — user taps permission cards manually to avoid crashes
  useEffect(() => {
    if (protectionComplete || autoRequestedRef.current || !showProtectionSetup) return;
    if (!allowAutoPermissionRequests) return;
    if (freshRegistration) return; // Don't auto-request on fresh registration
    if (Platform.OS !== 'android') return;
    if (!clientId) return;
    // Only auto-request if at least one of the three is not yet granted
    const { batteryOptimization, location, notification } = permissionStates;
    if (batteryOptimization && location && notification) return;

    autoRequestedRef.current = true;

    const autoRequestPermissions = async () => {
      if (!isMounted.current) return;
      try {
        // Only auto-request permissions that show IN-APP dialogs
        // Battery optimization opens an external system intent which can
        // conflict with overlay apps (like Messenger chat heads) and crash
        // The user can manually request it via the permission card

        // 1. Location permission — require "Always Allow" (foreground + background)
        if (!location && isMounted.current) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              setPermissionStates(prev => ({ ...prev, location: true }));
              // Now request background location ("Always allow")
              await new Promise(r => setTimeout(r, 500));
              try {
                const bgResult = await Location.requestBackgroundPermissionsAsync();
                if (bgResult.status === 'granted') {
                  console.log('Background location permission granted (Always)');
                }
              } catch (bgErr) {
                console.log('Background location permission request failed:', bgErr);
              }
            }
            await new Promise(r => setTimeout(r, 500));
          } catch (e) {
            console.log('Location permission request failed:', e);
          }
        }
        // 2. Notification permission (in-app runtime dialog)
        if (!notification && isMounted.current) {
          try {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') {
              setPermissionStates(prev => ({ ...prev, notification: true }));
            }
          } catch (e) {
            console.log('Notification permission request failed:', e);
          }
        }
      } catch (e) {
        console.log('Auto-request permissions error:', e);
      }
    };

    // Longer delay for fresh registration — let the UI fully stabilize
    const timer = setTimeout(autoRequestPermissions, 3000);
    return () => clearTimeout(timer);
  }, [showProtectionSetup, protectionComplete, clientId, permissionStates.location, permissionStates.notification]);

  // Auto-trigger Device Admin dialog when ALL 6 permissions are granted
  useEffect(() => {
    if (protectionComplete || !isMounted.current || isAdminActive) return;
    const allGranted = Object.values(permissionStates).every(Boolean);
    if (allGranted && !showAdminDialog) {
      setShowAdminDialog(true);
      Alert.alert(
        t('enableDeviceAdmin'),
        t('allPermissionsAreGrantedDoYou'),
        [
          {
            text: t('yesEnable'),
            onPress: async () => {
              if (isRequestingAdmin.current) return;
              isRequestingAdmin.current = true;
              try {
                await devicePolicy.requestAdmin();
                await new Promise(r => setTimeout(r, 2000));
                const granted = await checkAdminStatusWithRetry(20, 1000);
                if (granted && clientId) {
                  // PROTECTED state: only prevent uninstall and mark complete
                  // Overlay, kiosk, immersive are for LOCKED state only
                  await devicePolicy.preventUninstall(true);
                  await devicePolicy.setProtectionComplete(true);
                  await reportAdminStatus(clientId, true);
                  setProtectionComplete(true);
                  setShowProtectionSetup(false);
                  await AsyncStorage.setItem('protection_complete', 'true');
                }
              } catch (e) {
                console.log('Device Admin activation error:', e);
              } finally {
                isRequestingAdmin.current = false;
                setShowAdminDialog(false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    }
  }, [permissionStates, protectionComplete, isAdminActive, showAdminDialog, language, clientId]);

  useEffect(() => {
    isMounted.current = true;
    
    // Only initialize once to prevent flicker/crash from duplicate admin prompts
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    // Wrap initialization in try-catch to prevent crashes
    const initialize = async () => {
      try {
        // Check if this is a fresh registration BEFORE doing anything heavy
        const isFreshRegistration = await AsyncStorage.getItem('fresh_registration');
        
        if (isFreshRegistration === 'true') {
          await AsyncStorage.removeItem('fresh_registration');
          setFreshRegistration(true);
          
          let id = await AsyncStorage.getItem('client_id');
          if (!id) {
            setLoading(false);
            router.replace('/client/register');
            return;
          }
          
          setClientId(id);
          setLoading(false);
          
          // Do NOT run any native module calls here — they crash the app.
          // Native setup (setClientInfo, setRegistered, backupClientData) 
          // will happen on the NEXT app open via loadClientData() and protection setup flow.
          
          // Fetch status so the user sees their data instead of a blank screen
          try {
            await fetchStatus(id);
            // If device is locked, enforce lock state immediately (save to native prefs for watchdog)
            const cachedStatus = await OfflineSyncManager.getCachedStatus(id);
            if (cachedStatus?.is_locked) {
              await devicePolicy.setLockState(true, cachedStatus.lock_message || '');
              // Start ALL protection services after fresh registration lock
              try {
                const canOverlay = await devicePolicy.canDrawOverlays();
                if (canOverlay) {
                  await devicePolicy.startOverlayBlocker();
                  await devicePolicy.enableImmersiveMode();
                }
              } catch (e) { console.log('Fresh reg overlay start error:', e); }
              try { await devicePolicy.startKioskMode(); } catch (e) { console.log('Fresh reg kiosk start error:', e); }
              try { await devicePolicy.startForegroundMonitor(); } catch (e) { console.log('Fresh reg monitor start error:', e); }
              try { await devicePolicy.setStatusBarDisabled(true); } catch (e) { console.log('Fresh reg status bar error:', e); }
            }
          } catch (e) {
            console.log('Fresh registration fetchStatus error (non-fatal):', e);
          }
          
          return;
        }
        
        // Normal init (not fresh registration)
        // Check cached lock state immediately on startup for offline enforcement
        await checkCachedLockStateOnStartup();
        
        // Load client data — this includes fetchStatus, location, push token
        await loadClientData();
        
        // Show UI immediately — don't block on permission checks
        if (isMounted.current) setLoading(false);
        
        // Fetch all permission states AFTER showing UI (updates reactively)
        if (Platform.OS === 'android' && isMounted.current) {
          try {
            // Check if protection was already completed previously
            const protComplete = await AsyncStorage.getItem('protection_complete');
            const autoStartCached = (await AsyncStorage.getItem('autostart_enabled')) === 'true';
            const accessibilityCached = (await AsyncStorage.getItem('accessibility_enabled')) === 'true';
            
            if (protComplete === 'true') {
              setProtectionComplete(true);
              setShowProtectionSetup(false);
            }

            const [admin, accessibility, overlay, batteryOpt, locationPerm, notifPerm] = await Promise.all([
              devicePolicy.isAdminActive(),
              devicePolicy.isAccessibilityEnabled(),
              devicePolicy.canDrawOverlays(),
              devicePolicy.isIgnoringBatteryOptimizations(),
              (async () => { const { status } = await Location.getForegroundPermissionsAsync(); return status === 'granted'; })(),
              (async () => { const { status } = await Notifications.getPermissionsAsync(); return status === 'granted'; })(),
            ]);
            
            // Check new security permissions
            let usageStatsPerm = false;
            let notifListenerPerm = false;
            try {
              usageStatsPerm = await devicePolicy.hasUsageStatsPermission();
            } catch (e) { console.log('Usage stats check error:', e); }
            try {
              notifListenerPerm = await devicePolicy.hasNotificationListenerPermission();
            } catch (e) { console.log('Notification listener check error:', e); }
            
            setIsAdminActive(admin);
            
            const newPermStates = {
              batteryOptimization: batteryOpt,
              overlay: overlay,
              autoStart: autoStartCached || protComplete === 'true',
              accessibility: accessibility || accessibilityCached,
              location: locationPerm,
              notification: notifPerm,
              usageStats: usageStatsPerm,
              notificationListener: notifListenerPerm,
            };
            setPermissionStates(newPermStates);
            
            // Save to cache
            if (accessibility) await AsyncStorage.setItem('accessibility_enabled', 'true');
            await AsyncStorage.setItem('permission_states', JSON.stringify(newPermStates));
            
            // Determine if permission setup should show
            const allGranted = Object.values(newPermStates).every(Boolean);
            if (protComplete === 'true' || (allGranted && admin)) {
              setShowProtectionSetup(false);
              setProtectionComplete(true);
            } else {
              setShowProtectionSetup(true);
            }
          } catch (e) {
            console.log('Permission check error (non-fatal):', e);
            try {
              const cached = await AsyncStorage.getItem('permission_states');
              if (cached) {
                const cachedStates = JSON.parse(cached);
                setPermissionStates(cachedStates);
                const allCached = Object.values(cachedStates).every(Boolean);
                if (!allCached) setShowProtectionSetup(true);
              }
            } catch (cacheErr) {
              console.log('Cache restore error:', cacheErr);
            }
          }
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

    // Dynamic polling: 3s when offline (aggressive reconnect), 5s when online
    const getInterval = () => isOffline ? 3000 : 5000;
    
    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (!isRefreshingRef.current) {
          fetchStatus(clientId).catch(() => {});
        }
      }, getInterval());
    };
    
    startPolling();

    // Listen for push notifications — immediately refresh status on lock/unlock/warning
    const notifReceivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.action === 'lock' || data?.action === 'unlock' || data?.action === 'warning') {
        console.log(`[Push] Received ${data.action} notification — refreshing status immediately`);
        fetchStatus(clientId).catch(() => {});
      }
    });
    const notifResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.action === 'lock' || data?.action === 'unlock' || data?.action === 'warning') {
        console.log(`[Push] User tapped ${data.action} notification — refreshing status`);
        fetchStatus(clientId).catch(() => {});
      }
    });

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchStatus(clientId).catch(() => {});
        updateLocation(clientId).catch(() => {});
        // Refresh all protection states on resume (user may have just enabled something)
        if (Platform.OS === 'android') {
          (async () => {
            try {
              const [admin, accessibility, overlay, batteryOpt, locationPerm, notifPerm] = await Promise.all([
                devicePolicy.isAdminActive(),
                devicePolicy.isAccessibilityEnabled(),
                devicePolicy.canDrawOverlays(),
                devicePolicy.isIgnoringBatteryOptimizations(),
                (async () => { const { status } = await Location.getForegroundPermissionsAsync(); return status === 'granted'; })(),
                (async () => { const { status } = await Notifications.getPermissionsAsync(); return status === 'granted'; })(),
              ]);
              const autoStartCached = (await AsyncStorage.getItem('autostart_enabled')) === 'true';
              const accessibilityCached = (await AsyncStorage.getItem('accessibility_enabled')) === 'true';
              
              // Check new security permissions
              let usageStatsPerm = false;
              let notifListenerPerm = false;
              try {
                usageStatsPerm = await devicePolicy.hasUsageStatsPermission();
              } catch (e) { console.log('Usage stats check error:', e); }
              try {
                notifListenerPerm = await devicePolicy.hasNotificationListenerPermission();
              } catch (e) { console.log('Notification listener check error:', e); }
              
              setIsAdminActive(admin);
              const newPermStates = {
                batteryOptimization: batteryOpt,
                overlay: overlay,
                autoStart: autoStartCached,
                accessibility: accessibility || accessibilityCached,
                location: locationPerm,
                notification: notifPerm,
                usageStats: usageStatsPerm,
                notificationListener: notifListenerPerm,
              };
              setPermissionStates(newPermStates);
              
              // Save states to cache
              if (accessibility) await AsyncStorage.setItem('accessibility_enabled', 'true');
              await AsyncStorage.setItem('permission_states', JSON.stringify(newPermStates));
              
              // Auto-hide permission tab if all permissions + admin are active
              const allGranted = Object.values(newPermStates).every(Boolean);
              if (allGranted && admin) {
                setProtectionComplete(true);
                setShowProtectionSetup(false);
                await AsyncStorage.setItem('protection_complete', 'true');
              }
              
              // Only start overlay blocker if device is actually LOCKED
              if (overlay && wasLocked.current) {
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
      if (!clientId || Platform.OS !== 'android' || freshRegistration) return;

      // Wait until the main useEffect's initialize() is done
      let waitAttempts = 0;
      while (!initComplete.current && waitAttempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 200));
        waitAttempts++;
      }
      if (!isMounted.current) return;

      try {
        // Check if this is a fresh app start (potential reboot)
        const lastAppStart = await AsyncStorage.getItem('last_app_start');
        const now = Date.now();
        
        if (lastAppStart) {
          const timeDiff = now - parseInt(lastAppStart);
          if (timeDiff > 60000) {
            console.log('Potential reboot detected');
            await reportReboot(clientId);
          }
        }
        
        await AsyncStorage.setItem('last_app_start', now.toString());

        // Setup device protection: checks admin status, prompts user if needed,
        // enables uninstall protection, and reports status to backend
        await checkAndSetupDeviceProtection();
        
      } catch (error) {
        console.log('Protection initialization error:', error);
      }
    };
    
    initializeProtection();
  }, [clientId, freshRegistration]);

  const reportAdminStatus = async (id: string, adminActive: boolean) => {
    if (!id) return;
    try {
      await fetch(`${API_URL}/api/device/report-admin-status?client_id=${id}&admin_active=${adminActive}`, {
        method: 'POST',
      });
      console.log(`Admin mode status reported: ${adminActive}`);
    } catch (error) {
      console.log('Admin status report failed:', error);
    }
  };

  const reportReboot = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/clients/${id}/report-reboot`, {
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

  const reportTamperAttempt = async (tamperType: string) => {
    if (!clientId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/clients/${clientId}/report-tamper?tamper_type=${tamperType}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tamper attempt logged:', data);
        
        // Force immediate lock on tamper attempt
        if (status) {
          await updateLockState(true);
          Alert.alert(
            t('securityAlert'),
            t('tamperingDetectedDeviceHasBeenLocked'),
            [{ text: t('ok') }]
          );
        }
      }
    } catch (error) {
      console.log('Tamper report failed:', error);
    }
  };

  const isRefreshingRef = useRef(false);
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
      await fetch(`${API_URL}/api/device/clear-warning/${clientId}`, {
        method: 'POST',
      });
      await fetchStatus(clientId);
    } catch (error) {
      console.error('Error clearing warning:', error);
    }
  };


  // Engage protection services when device is locked (overlay handles re-fastening)
  useEffect(() => {
    if (!status?.is_locked || Platform.OS !== 'android') return;
    
    // Start all protection services once
    StatusBar.setHidden(true, 'none');
    devicePolicy.enableImmersiveMode().catch(() => {});
    devicePolicy.startKioskMode().catch(() => {});
    devicePolicy.startOverlayBlocker().catch(() => {});
    devicePolicy.setStatusBarDisabled(true).catch(() => {});
    devicePolicy.startForegroundMonitor().catch(() => {});
    devicePolicy.setCameraDisabled(true).catch(() => {});
    
    // Auto-collapse status bar every 50ms (max aggressive) + re-engage immersive mode
    const collapseInterval = setInterval(() => {
      StatusBar.setHidden(true, 'none');
      devicePolicy.collapseStatusBar().catch(() => {});
      devicePolicy.enableImmersiveMode().catch(() => {});
      devicePolicy.cancelAllNotifications().catch(() => {});
    }, 50);
    
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
    if (!status?.is_locked || Platform.OS !== 'android') return;
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

  // Emergency call handler
  const handleEmergencyCall = async () => {
    if (Platform.OS !== 'android') return;
    setEmergencyCallActive(true);
    
    // CRITICAL: Must exit kiosk mode and re-enable status bar BEFORE dialing
    // Kiosk mode blocks all other apps (including the dialer) from launching
    try {
      await devicePolicy.stopKioskMode();
      await devicePolicy.setStatusBarDisabled(false);
      await devicePolicy.disableImmersiveMode();
      // Small delay to let the system process the mode changes
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      console.log('Failed to exit kiosk for emergency call:', e);
    }
    
    await devicePolicy.dialEmergencyNumber('112');
    
    // Monitor: poll every 2s to check if call has ended
    emergencyCallCheckRef.current = setInterval(async () => {
      const stillActive = await devicePolicy.isEmergencyCallActive();
      if (!stillActive) {
        // Call ended — cleanup
        clearInterval(emergencyCallCheckRef.current!);
        emergencyCallCheckRef.current = null;
        setEmergencyCallActive(false);
        // Kill dialer and return to lock screen
        await devicePolicy.killDialerApps();
        // Re-engage all lock protections
        await devicePolicy.startKioskMode();
        await devicePolicy.setStatusBarDisabled(true);
        await devicePolicy.enableImmersiveMode();
        await devicePolicy.collapseStatusBar();
      }
    }, 2000);
  };

  // Cleanup emergency call check on unmount
  useEffect(() => {
    return () => {
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
      const token = await AsyncStorage.getItem('client_device_token');
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
      const token = await AsyncStorage.getItem('client_device_token');
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
  if (status?.is_locked) {
    const isDeviceOwner = status.lock_mode === 'device_owner';
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
              <Text style={styles.emergencyCallText}>Emergency Call (112)</Text>
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
        {/* Device Protection Setup — 2 column grid like screenshot */}
        {showProtectionSetup && Platform.OS === 'android' && (
          <View style={styles.protectionSetup} data-testid="protection-setup">
            <View style={styles.protectionSetupHeader}>
              <Text style={styles.protectionSetupTitle}>
                {t('deviceProtection')}
              </Text>
              <TouchableOpacity onPress={() => setShowProtectionSetup(false)}>
                <Ionicons name="chevron-up" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.permGrid}>
              {/* Row 1: Battery (auto) + Overlay (device-specific instructions) */}
              <TouchableOpacity
                style={styles.permCard}
                onPress={() => {
                  const dev = devicePolicy.getDeviceInfo();
                  const manufacturer = (dev?.manufacturer || '').toLowerCase();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                
                let instructions = '';
                if (manufacturer.includes('samsung')) {
                  instructions = language === 'et'
                    ? `${model} (Android ${ver})\n\nAvaneb rakenduse teave leht.\n\n1. Puudutage "Aku"\n2. Valige "Piiranguteta"\n\nSee tagab, et rakendus töötab taustal.`
                    : `${model} (Android ${ver})\n\nApp info page will open.\n\n1. Tap "Battery"\n2. Select "Unrestricted"\n\nThis ensures the app runs in the background.`;
                } else {
                  instructions = language === 'et'
                    ? `${model} (Android ${ver})\n\nSüsteemi dialoog avaneb.\nLubage rakendusel töötada piiranguteta taustal.`
                    : `${model} (Android ${ver})\n\nA system dialog will appear.\nAllow the app to run unrestricted in the background.`;
                }

                Alert.alert(
                  t('batteryOptimization'),
                  instructions,
                  [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: t('openSettings'),
                      onPress: async () => {
                        try {
                          await devicePolicy.requestBatteryOptimization();
                          await new Promise(r => setTimeout(r, 1000));
                          const granted = await devicePolicy.isIgnoringBatteryOptimizations();
                          if (granted) setPermissionStates(prev => ({ ...prev, batteryOptimization: true }));
                        } catch (e) {
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
                style={styles.permCard}
                onPress={() => {
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
              <TouchableOpacity style={styles.permCard} onPress={() => {
                const dev = devicePolicy.getDeviceInfo();
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
                        await devicePolicy.openAutoStartSettings();
                      } catch (e) {
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
                style={styles.permCard}
                onPress={async () => {
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
                    steps = language === 'et'
                      ? 'Samsung (Android 13+ / One UI):\n1) Ava Seaded > Juurdepääsetavus > Installitud rakendused > PayLock Client (näitab: "Pole lubatud").\n2) Sule see vaade (tagasi).\n3) Ava Seaded > Rakendused > PayLock Client.\n4) Vajuta ⋮ ja vali "Luba piiratud seaded".\n5) Ava uuesti Seaded > Juurdepääsetavus > Installitud rakendused > PayLock Client ja lülita SISSE.'
                      : 'Samsung (Android 13+ / One UI):\n1) Open Settings > Accessibility > Installed apps > PayLock Client (shows "Not allowed").\n2) Close/back out of this screen.\n3) Open Settings > Apps > PayLock Client.\n4) Tap ⋮ and select "Allow restricted settings".\n5) Go back to Settings > Accessibility > Installed apps > PayLock Client and turn ON.';
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
              <TouchableOpacity style={styles.permCard} onPress={async () => {
                if (!permissionStates.location) {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  if (status === 'granted') {
                    setPermissionStates(prev => ({ ...prev, location: true }));
                  }
                }
              }}
              data-testid="perm-location-card"
              >
                <View style={[styles.permCircle, permissionStates.location ? styles.permOk : styles.permBad]}>
                  <Ionicons name={permissionStates.location ? "checkmark" : "close"} size={28} color="#FFF" />
                </View>
                <Text style={styles.permLabel}>{t('location')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.permCard} onPress={async () => {
                if (!permissionStates.notification) {
                  const { status } = await Notifications.requestPermissionsAsync();
                  if (status === 'granted') {
                    setPermissionStates(prev => ({ ...prev, notification: true }));
                  } else {
                    await devicePolicy.openNotificationSettings();
                  }
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
              <TouchableOpacity style={styles.permCard} onPress={async () => {
                if (permissionStates.usageStats) return;
                const dev = devicePolicy.getDeviceInfo();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                const instructions = language === 'et'
                  ? `${model} (Android ${ver})\n\nSee luba on vajalik, et rakendus saaks tuvastada, milline rakendus on esiplaanile.\n\n1. Avaneb seadete leht\n2. Leidke "PayLock Client"\n3. L\u00fclitage SISSE`
                  : `${model} (Android ${ver})\n\nThis permission is needed so the app can detect which app is in the foreground.\n\n1. Settings page will open\n2. Find "PayLock Client"\n3. Toggle ON`;
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

              <TouchableOpacity style={styles.permCard} onPress={async () => {
                if (permissionStates.notificationListener) return;
                const dev = devicePolicy.getDeviceInfo();
                const model = dev?.model || 'Device';
                const ver = dev?.androidVersion || '';
                const isSamsung = (dev?.manufacturer || '').toLowerCase().includes('samsung');
                const needsRestricted = dev.sdkVersion >= 33;
                let instructions = language === 'et'
                  ? `${model} (Android ${ver})\n\nSee luba on vajalik, et rakendus saaks blokeerida t\u00f5kestusteatisi.\n\n1. Avaneb seadete leht\n2. Leidke "PayLock Client"\n3. L\u00fclitage SISSE`
                  : `${model} (Android ${ver})\n\nThis permission is needed so the app can block interruption notifications.\n\n1. Settings page will open\n2. Find "PayLock Client"\n3. Toggle ON`;
                if (needsRestricted) {
                  instructions += language === 'et'
                    ? '\n\nNB: Android 13+ n\u00f5uab "Piiratud seadete" lubamist rakenduse info lehel enne selle loa aktiveerimist.'
                    : '\n\nNote: Android 13+ requires "Allow restricted settings" from App Info page before this permission can be enabled.';
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
        )}

        {/* Collapsed banner when protection setup is hidden */}
        {!showProtectionSetup && !protectionComplete && Platform.OS === 'android' && (
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
                Reconnecting to server...
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

      {/* Chat Floating Button */}
      <TouchableOpacity
        style={{ position: 'absolute', bottom: 24, right: 24, backgroundColor: '#10B981', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
        onPress={() => { setShowChat(true); fetchMessages(); }}
        data-testid="chat-fab"
      >
        <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Chat Modal */}
      {showChat && (
        <Modal visible={showChat} animationType="slide" transparent onRequestClose={() => setShowChat(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#0B1527', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '70%', padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '700' }}>Message Admin</Text>
                <TouchableOpacity onPress={() => setShowChat(false)}>
                  <Ionicons name="close" size={24} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, marginBottom: 12 }}>
                {loadingMessages ? (
                  <ActivityIndicator size="small" color="#10B981" style={{ marginTop: 20 }} />
                ) : messages.length === 0 ? (
                  <Text style={{ color: '#64748B', textAlign: 'center', marginTop: 40 }}>No messages yet. Send a message to your admin.</Text>
                ) : (
                  messages.map((msg, i) => (
                    <View key={msg.id || i} style={{ alignSelf: msg.sender_type === 'client' ? 'flex-end' : 'flex-start', backgroundColor: msg.sender_type === 'client' ? '#10B981' : '#1E3050', padding: 10, borderRadius: 12, marginBottom: 8, maxWidth: '80%' }}>
                      <Text style={{ color: '#F8FAFC', fontSize: 14 }}>{msg.text}</Text>
                      <Text style={{ color: msg.sender_type === 'client' ? '#A7F3D0' : '#64748B', fontSize: 10, marginTop: 4 }}>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}</Text>
                    </View>
                  ))
                )}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8 }}>
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
            </View>
          </View>
        </Modal>
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
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    marginTop: 20,
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  emergencyCallText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
