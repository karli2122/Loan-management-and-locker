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
import { devicePolicy } from '../../src/utils/DevicePolicy';
import { getAutoStartInstructions, getOverlayInstructions, getAccessibilityInstructions } from '../../src/utils/deviceInstructions';
import OfflineSyncManager from '../../src/services/OfflineSyncManager';
import API_URL from '../../src/constants/api';


interface ClientStatus {
  id: string;
  name: string;
  is_locked: boolean;
  lock_message: string;
  warning_message: string;
  loan_amount: number;
  loan_due_date: string | null;
  uninstall_allowed?: boolean;
}

export default function ClientHome() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
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
        
        const title = language === 'et' ? 'Seadme kaitse' : 'Device Protection';
        const message = language === 'et'
          ? 'Seadme turvalisuse tagamiseks lubage juurdepääsetavuse teenus. See kaitseb rakendust eemaldamise eest.'
          : 'To fully protect your device, please enable the accessibility service. This prevents unauthorized app removal.';
        
        Alert.alert(
          title,
          message,
          [
            {
              text: language === 'et' ? 'Luba' : 'OK',
              onPress: async () => {
                await devicePolicy.openAccessibilitySettings();
              },
            },
            {
              text: language === 'et' ? 'Hiljem' : 'Later',
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
        const title = language === 'et' ? 'Seadme kaitse vajalik' : 'Device Protection Required';
        const message = wasDisabled
          ? (language === 'et' 
              ? 'Seadme administraator keelati. See on turvarikkumine. Palun lubage uuesti.'
              : 'Device admin was disabled. This is a security violation. Please re-enable immediately.')
          : (language === 'et' 
              ? 'Seadme turvaliseks kasutamiseks luba administraatori õigused.'
              : 'To secure your device, please enable Device Admin permissions.');

        // Show alert with both options - not blocking the main thread
        Alert.alert(
          title,
          message,
          [
            {
              text: language === 'et' ? 'Luba kohe' : 'Enable Now',
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
              text: language === 'et' ? 'Hiljem' : 'Later',
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

      // Manage immersive mode and overlay based on lock state
      // NO startLockTask — it shows "unpin" instructions to the user
      // Instead we rely on: overlay watchdog (1s relaunch) + AccessibilityService + immersive mode
      if (Platform.OS === 'android') {
        if (locked) {
          await devicePolicy.enableImmersiveMode();
          await devicePolicy.startOverlayBlocker();
        } else {
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
        // Engage immersive mode + overlay on boot if locked
        // NO startLockTask — shows unpin instructions
        if (Platform.OS === 'android') {
          try {
            await devicePolicy.enableImmersiveMode();
            console.log('[Startup] Immersive mode enabled');
            await devicePolicy.startOverlayBlocker();
            console.log('[Startup] Overlay blocker started');
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
              title: language === 'et' ? 'Hoiatus administraatorilt' : 'Warning from Administrator',
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
      
      // Check if admin has allowed uninstall
      if (statusToSet.uninstall_allowed && Platform.OS === 'android') {
        handleUninstallSignal();
      }
      
      // Update lock state if changed - save message for offline use
      if (statusToSet.is_locked !== wasLocked.current) {
        updateLockState(statusToSet.is_locked, statusToSet.lock_message);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
      setIsOffline(true);
      
      // On error, check and enforce cached lock state
      const cachedState = await devicePolicy.getCachedLockState();
      if (cachedState.isLocked) {
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
        console.log('[Error] Enforcing cached lock state');
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
        language === 'et' ? 'Konto eemaldatud' : 'Account Removed',
        language === 'et' 
          ? 'Teie konto on administraatori poolt eemaldatud. Saate nüüd rakenduse desinstallida.'
          : 'Your account has been removed by the administrator. You can now uninstall this app.',
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

        // 1. Location permission (in-app runtime dialog)
        if (!location && isMounted.current) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              setPermissionStates(prev => ({ ...prev, location: true }));
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
        language === 'et' ? 'Luba seadme administraator' : 'Enable Device Admin',
        language === 'et'
          ? 'Kõik õigused on lubatud. Kas soovite aktiveerida seadme administraatori režiimi? See kaitseb seadet ja seda ei saa keelata ilma administraatori loata.'
          : 'All permissions are granted. Do you want to activate Device Admin mode? This will protect the device and cannot be disabled without administrator permission.',
        [
          {
            text: language === 'et' ? 'Jah, luba' : 'Yes, Enable',
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
            setIsAdminActive(admin);
            
            const newPermStates = {
              batteryOptimization: batteryOpt,
              overlay: overlay,
              autoStart: autoStartCached || protComplete === 'true',
              accessibility: accessibility || accessibilityCached,
              location: locationPerm,
              notification: notifPerm,
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
    if (freshRegistration) return; // Don't poll or check state during fresh registration

    // Poll status every 10 seconds
    intervalRef.current = setInterval(() => {
      fetchStatus(clientId).catch(() => {});
    }, 10000);

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
              setIsAdminActive(admin);
              const newPermStates = {
                batteryOptimization: batteryOpt,
                overlay: overlay,
                autoStart: autoStartCached,
                accessibility: accessibility || accessibilityCached,
                location: locationPerm,
                notification: notifPerm,
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, freshRegistration]);

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

        // Enable uninstall protection if admin is active — silently, no alerts
        try {
          const isAdmin = await devicePolicy.isAdminActive();
          if (isAdmin) {
            await devicePolicy.preventUninstall(true);
            await reportAdminStatus(clientId, true);
            console.log('Uninstall protection enabled');
          } else {
            await reportAdminStatus(clientId, false);
          }
        } catch (adminErr) {
          console.log('Protection check error (non-fatal):', adminErr);
        }
        
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
            language === 'et' ? 'Turvahoiatus' : 'Security Alert',
            language === 'et' ? 'Tuvastati manipulatsioon. Seade on lukustatud.' : 'Tampering detected. Device has been locked.',
            [{ text: t('ok') }]
          );
        }
      }
    } catch (error) {
      console.log('Tamper report failed:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!clientId) return;
    setRefreshing(true);
    try {
      await fetchStatus(clientId);
      await updateLocation(clientId).catch(() => {});
    } catch (e) {
      console.log('Refresh error:', e);
    } finally {
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

  // Lock Screen Overlay - Full screen, no escape
  if (status?.is_locked) {
    return (
      <SafeAreaView style={styles.lockContainer}>
        <View style={styles.lockContent}>
          <View style={styles.lockIconContainer}>
            <Ionicons name="lock-closed" size={80} color="#EF4444" />
          </View>
          <Text style={styles.lockTitle}>{t('deviceLocked')}</Text>
          <Text style={styles.lockMessage}>{status.lock_message}</Text>

          <View style={styles.lockLoanInfo}>
            <View style={styles.lockLoanItem}>
              <Text style={styles.lockLoanLabel}>{t('pendingAmount')}</Text>
              <Text style={styles.lockLoanValue}>€{(status.loan_amount ?? 0).toLocaleString()}</Text>
            </View>
            {status.loan_due_date && (
              <View style={styles.lockLoanItem}>
                <Text style={styles.lockLoanLabel}>{t('dueDate')}</Text>
                <Text style={styles.lockLoanValue}>{status.loan_due_date}</Text>
              </View>
            )}
          </View>

          <Text style={styles.lockFooter}>
            {t('clearLoanToUnlock')}
          </Text>
          
          {/* Protection Status */}
          <View style={styles.protectionStatus}>
            <Ionicons 
              name={isAdminActive ? "shield-checkmark" : "shield"} 
              size={16} 
              color={isAdminActive ? "#10B981" : "#F59E0B"} 
            />
            <Text style={styles.protectionText}>
              {isAdminActive 
                ? (language === 'et' ? 'Seadme kaitse aktiivne' : 'Device protection active')
                : (language === 'et' ? 'Kaitse pole aktiivne' : 'Protection not active')}
            </Text>
          </View>
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
          <View style={styles.langSwitcher}>
            <TouchableOpacity
              style={[styles.langButton, language === 'et' && styles.langButtonActive]}
              onPress={() => setLanguage('et')}
            >
              <Text style={[styles.langText, language === 'et' && styles.langTextActive]}>ET</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langButton, language === 'en' && styles.langButtonActive]}
              onPress={() => setLanguage('en')}
            >
              <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>
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
                {language === 'et' ? 'Seadme kaitse' : 'Device Protection'}
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
                  language === 'et' ? 'Aku optimeerimine' : 'Battery Optimization',
                  instructions,
                  [
                    { text: language === 'et' ? 'Tühista' : 'Cancel', style: 'cancel' },
                    {
                      text: language === 'et' ? 'Ava seaded' : 'Open Settings',
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Aku optim.' : 'Battery Optimization'}</Text>
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Ülekate' : 'Overlay'}</Text>
              </TouchableOpacity>

              {/* Row 2: Auto Start (device-specific) + Accessibility (device-specific) */}
              <TouchableOpacity style={styles.permCard} onPress={() => {
                const dev = devicePolicy.getDeviceInfo();
                const info = getAutoStartInstructions(dev, language);
                Alert.alert(info.title, info.steps, [
                  {
                    text: language === 'et' ? 'Tühista' : 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: language === 'et' ? 'Ava seaded' : 'Open Settings',
                    onPress: async () => {
                      try {
                        await devicePolicy.openAutoStartSettings();
                      } catch (e) {
                        console.log('openAutoStartSettings error:', e);
                      }
                    },
                  },
                  {
                    text: language === 'et' ? 'Juba tehtud' : 'Already Done',
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Autostart' : 'Auto Start'}</Text>
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
                      ? 'Samsung (Android 13+ / One UI):\n1) Ava Seaded > Juurdepääsetavus > Installitud rakendused > Loan Client (näitab: "Pole lubatud").\n2) Sule see vaade (tagasi).\n3) Ava Seaded > Rakendused > Loan Client.\n4) Vajuta ⋮ ja vali "Luba piiratud seaded".\n5) Ava uuesti Seaded > Juurdepääsetavus > Installitud rakendused > Loan Client ja lülita SISSE.'
                      : 'Samsung (Android 13+ / One UI):\n1) Open Settings > Accessibility > Installed apps > Loan Client (shows "Not allowed").\n2) Close/back out of this screen.\n3) Open Settings > Apps > Loan Client.\n4) Tap ⋮ and select "Allow restricted settings".\n5) Go back to Settings > Accessibility > Installed apps > Loan Client and turn ON.';
                  }
                  const buttons: any[] = [];
                  if (needsRestricted && isSamsung) {
                    buttons.push({
                      text: language === 'et' ? '1. Ava juurdepääs' : '1. Open Accessibility',
                      onPress: async () => { await devicePolicy.openAccessibilitySettings(); },
                    });
                    buttons.push({
                      text: language === 'et' ? '2. Ava rakenduse info' : '2. Open App Info',
                      onPress: async () => { await devicePolicy.openAppInfo(); },
                    });
                    buttons.push({
                      text: language === 'et' ? '3. Ava juurdepääs' : '3. Open Accessibility',
                      onPress: async () => { await devicePolicy.openAccessibilitySettings(); },
                    });
                  } else {
                    if (needsRestricted) {
                      buttons.push({
                        text: language === 'et' ? '1. Luba piiratud seaded' : '1. Allow Restricted Settings',
                        onPress: async () => { await devicePolicy.openAppInfo(); },
                      });
                    }
                    buttons.push({
                      text: needsRestricted
                        ? (language === 'et' ? '2. Ava juurdepääs' : '2. Open Accessibility')
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Juurdepääs' : 'Accessibility'}</Text>
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Asukoht' : 'Location'}</Text>
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
                <Text style={styles.permLabel}>{language === 'et' ? 'Teavitused' : 'Notifications'}</Text>
              </TouchableOpacity>
            </View>

            {/* Summary bar */}
            <View style={styles.permSummary}>
              <Text style={styles.permSummaryText} data-testid="permission-summary-text">
                {Object.values(permissionStates).filter(Boolean).length}/{Object.keys(permissionStates).length} {language === 'et' ? 'aktiivne' : 'active'}
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
                  ? (language === 'et' ? 'Kaitse aktiivne' : 'Protection Active')
                  : (language === 'et' ? 'Kaitse mittetäielik' : 'Protection Incomplete')}
              </Text>
              <Text style={styles.protectionBannerText}>
                {Object.values(permissionStates).filter(Boolean).length}/{Object.keys(permissionStates).length} {language === 'et' ? 'aktiivne' : 'active'}
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
              <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
              <Text style={styles.offlineBannerText}>
                Offline Mode - Using Cached Data
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
          <Text style={styles.loanCardTitle}>{language === 'et' ? 'Laenu andmed' : 'Loan Details'}</Text>
          <View style={styles.loanDetails}>
            <View style={styles.loanDetailItem}>
              <Text style={styles.loanDetailLabel}>{language === 'et' ? 'Laenusumma' : 'Loan Amount'}</Text>
              <Text style={styles.loanDetailValue}>€{(status?.loan_amount ?? 0).toLocaleString()}</Text>
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
            {language === 'et' ? 'Kõik makstud' : 'All Paid'}
          </Text>
          <Text style={styles.allPaidSubtext}>
            {language === 'et' ? 'Teil pole aktiivseid laene' : 'You have no active loans'}
          </Text>
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
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
    borderBottomColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#334155',
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
    backgroundColor: '#1E293B',
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
    backgroundColor: '#7F1D1D',
  },
  lockContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  lockIconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  lockTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  lockMessage: {
    fontSize: 16,
    color: '#FCA5A5',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  lockLoanInfo: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    width: '100%',
  },
  lockLoanItem: {
    flex: 1,
    alignItems: 'center',
  },
  lockLoanLabel: {
    fontSize: 13,
    color: '#FCA5A5',
    marginBottom: 4,
  },
  lockLoanValue: {
    fontSize: 20,
    fontWeight: 'bold',
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  protectionText: {
    fontSize: 12,
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
    backgroundColor: '#1E293B',
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
