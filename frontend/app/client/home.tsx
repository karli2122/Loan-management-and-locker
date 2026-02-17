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
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [screenPinned, setScreenPinned] = useState(false);
  const [showProtectionSetup, setShowProtectionSetup] = useState(false);
  const isMounted = useRef(false);
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasLocked = useRef(false);
  const isRequestingAdmin = useRef(false);
  const hasInitialized = useRef(false);
  const initComplete = useRef(false);
  const resolveProjectId = useCallback(
    () => Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId,
    []
  );
  
  const getPushToken = useCallback(async () => {
    if (!Device.isDevice) return null;
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    
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
      wasLocked.current = locked;

      // Manage kiosk mode based on lock state
      if (Platform.OS === 'android') {
        if (locked) {
          const result = await devicePolicy.startKioskMode();
          console.log('Kiosk mode start result:', result);
        } else {
          const result = await devicePolicy.stopKioskMode();
          console.log('Kiosk mode stop result:', result);
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
        // Engage kiosk mode immediately on boot if locked
        if (Platform.OS === 'android') {
          try {
            const result = await devicePolicy.startKioskMode();
            console.log('[Startup] Kiosk mode result:', result);
          } catch (e) {
            console.log('[Startup] Kiosk mode error:', e);
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
      setLoading(false);
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
    } finally {
      setLoading(false);
    }
  };

  const handleUninstallSignal = async () => {
    try {
      // Stop kiosk mode first so device is usable
      if (Platform.OS === 'android') {
        try {
          await devicePolicy.stopKioskMode();
          console.log('Kiosk mode stopped for uninstall');
        } catch (e) {
          console.log('Kiosk stop during uninstall error:', e);
        }
      }

      // Allow app to be uninstalled (removes device admin)
      await devicePolicy.allowUninstall();
      
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
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
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
      }
      
      if (!id) {
        console.log('No client ID found, redirecting to register');
        if (isMounted.current) {
          router.replace('/client/register');
        }
        return;
      }
      
      console.log('Client ID loaded:', id);
      setClientId(id);
      
      // Wait for state to update before making API calls
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // SEQUENTIAL permission requests to avoid race condition
      // Step 1: Fetch status (no permission needed)
      await fetchStatus(id);
      
      // Step 2: Request location permission (wait for user response)
      await updateLocation(id);
      
      // Small delay between permission dialogs
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Request notification permission (wait for user response)
      await registerPushToken(id);
    } catch (error) {
      console.error('loadClientData error:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    
    // Only initialize once to prevent flicker/crash from duplicate admin prompts
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    
    // Wrap initialization in try-catch to prevent crashes
    const initialize = async () => {
      try {
        // Check cached lock state immediately on startup for offline enforcement
        await checkCachedLockStateOnStartup();
        
        // Load client data first - this sets loading to false
        await loadClientData();
        
        // Check if this is a fresh registration
        const isFreshRegistration = await AsyncStorage.getItem('fresh_registration');
        if (isFreshRegistration === 'true') {
          await AsyncStorage.removeItem('fresh_registration');
          console.log('Fresh registration detected');
        }
        
        // Only check admin state silently — no alerts, no system dialogs on init.
        // The UI banner will prompt the user if admin is not active.
        if (Platform.OS === 'android' && isMounted.current) {
          try {
            const admin = await devicePolicy.isAdminActive();
            setIsAdminActive(admin);
            const accessibility = await devicePolicy.isAccessibilityEnabled();
            setAccessibilityEnabled(accessibility);
            const overlay = await devicePolicy.canDrawOverlays();
            setOverlayEnabled(overlay);
            const pinned = await devicePolicy.isInKioskMode();
            setScreenPinned(pinned);
            // Show protection setup if not all protections are enabled
            if (!admin || !accessibility || !overlay) {
              setShowProtectionSetup(true);
            }
            if (admin) {
              console.log('Device admin is active');
            } else {
              console.log('Device admin not active - banner will prompt user');
            }
          } catch (e) {
            console.log('Admin check error (non-fatal):', e);
          }
        }

        // Mark init complete so the protection useEffect can proceed safely
        initComplete.current = true;
      } catch (error) {
        console.error('Initialization error:', error);
        initComplete.current = true;
        setLoading(false);
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
  useEffect(() => {
    if (!clientId) return;

    // Poll status every 30 seconds
    intervalRef.current = setInterval(() => {
      fetchStatus(clientId);
    }, 30000);

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchStatus(clientId);
        updateLocation(clientId);
        // Refresh all protection states on resume (user may have just enabled something)
        if (Platform.OS === 'android') {
          (async () => {
            try {
              const admin = await devicePolicy.isAdminActive();
              setIsAdminActive(admin);
              const accessibility = await devicePolicy.isAccessibilityEnabled();
              setAccessibilityEnabled(accessibility);
              const overlay = await devicePolicy.canDrawOverlays();
              setOverlayEnabled(overlay);
              const pinned = await devicePolicy.isInKioskMode();
              setScreenPinned(pinned);
              // Start overlay blocker if permission was just granted
              if (overlay) {
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

    // Block back button when locked
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status?.is_locked) {
        return true; // Prevent going back when locked
      }
      return false;
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription.remove();
      backHandler.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Functions use clientId from closure; adding them would cause infinite loops
  }, [clientId, status?.is_locked]);

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
  }, [clientId]);
        console.log('Protection setup error:', error);
      }
    };

    initializeProtection();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reportReboot is stable; only re-run when clientId changes
  }, [clientId]);

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
    await fetchStatus(clientId);
    await updateLocation(clientId);
    setRefreshing(false);
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
        {/* Device Protection Setup */}
        {showProtectionSetup && Platform.OS === 'android' && (
          <View style={styles.protectionSetup} data-testid="protection-setup">
            <View style={styles.protectionSetupHeader}>
              <Ionicons name="shield-checkmark" size={22} color="#3B82F6" />
              <Text style={styles.protectionSetupTitle}>
                {language === 'et' ? 'Seadme kaitse seadistamine' : 'Device Protection Setup'}
              </Text>
              <TouchableOpacity onPress={() => setShowProtectionSetup(false)}>
                <Ionicons name="chevron-up" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Step 1: Device Admin */}
            <View style={styles.protectionStep}>
              <View style={[styles.stepIcon, isAdminActive && styles.stepIconDone]}>
                <Ionicons name={isAdminActive ? "checkmark" : "1"} size={16} color={isAdminActive ? "#FFF" : "#64748B"} />
                {!isAdminActive && <Text style={styles.stepNumber}>1</Text>}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {language === 'et' ? 'Administraatori õigused' : 'Device Admin'}
                </Text>
                <Text style={styles.stepDesc}>
                  {language === 'et' ? 'Kaitseb seadet volitamata muudatuste eest' : 'Protects device from unauthorized changes'}
                </Text>
              </View>
              {isAdminActive ? (
                <View style={styles.stepDoneBadge}><Text style={styles.stepDoneText}>OK</Text></View>
              ) : (
                <TouchableOpacity style={styles.stepButton} onPress={async () => {
                  if (isRequestingAdmin.current) return;
                  isRequestingAdmin.current = true;
                  try {
                    await devicePolicy.requestAdmin();
                    await new Promise(r => setTimeout(r, 2000));
                    const granted = await checkAdminStatusWithRetry(20, 1000);
                    isRequestingAdmin.current = false;
                    if (granted) console.log('Admin granted');
                  } catch (e) { isRequestingAdmin.current = false; }
                }}>
                  <Text style={styles.stepButtonText}>{language === 'et' ? 'Luba' : 'Enable'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Step 2: Accessibility Service */}
            <View style={styles.protectionStep}>
              <View style={[styles.stepIcon, accessibilityEnabled && styles.stepIconDone]}>
                {accessibilityEnabled ? <Ionicons name="checkmark" size={16} color="#FFF" /> : <Text style={styles.stepNumber}>2</Text>}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {language === 'et' ? 'Juurdepääsuteenus' : 'Accessibility Service'}
                </Text>
                <Text style={styles.stepDesc}>
                  {language === 'et' ? 'Hoiab rakenduse esiplaanil' : 'Keeps the app in foreground'}
                </Text>
              </View>
              {accessibilityEnabled ? (
                <View style={styles.stepDoneBadge}><Text style={styles.stepDoneText}>OK</Text></View>
              ) : (
                <TouchableOpacity style={styles.stepButton} onPress={async () => {
                  await devicePolicy.openAccessibilitySettings();
                }}>
                  <Text style={styles.stepButtonText}>{language === 'et' ? 'Ava' : 'Open'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Step 3: Display Over Other Apps */}
            <View style={styles.protectionStep}>
              <View style={[styles.stepIcon, overlayEnabled && styles.stepIconDone]}>
                {overlayEnabled ? <Ionicons name="checkmark" size={16} color="#FFF" /> : <Text style={styles.stepNumber}>3</Text>}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {language === 'et' ? 'Kuva teiste rakenduste kohal' : 'Display Over Other Apps'}
                </Text>
                <Text style={styles.stepDesc}>
                  {language === 'et' ? 'Blokeerib olekuriba ligipääsu' : 'Blocks status bar access'}
                </Text>
              </View>
              {overlayEnabled ? (
                <View style={styles.stepDoneBadge}><Text style={styles.stepDoneText}>OK</Text></View>
              ) : (
                <TouchableOpacity style={styles.stepButton} onPress={async () => {
                  await devicePolicy.requestOverlayPermission();
                }}>
                  <Text style={styles.stepButtonText}>{language === 'et' ? 'Luba' : 'Allow'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Step 4: Screen Pinning */}
            <View style={styles.protectionStep}>
              <View style={[styles.stepIcon, screenPinned && styles.stepIconDone]}>
                {screenPinned ? <Ionicons name="checkmark" size={16} color="#FFF" /> : <Text style={styles.stepNumber}>4</Text>}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>
                  {language === 'et' ? 'Ekraani kinnitamine' : 'Screen Pinning'}
                </Text>
                <Text style={styles.stepDesc}>
                  {language === 'et' ? 'Lukustab rakenduse ekraanile' : 'Locks app to the screen'}
                </Text>
              </View>
              {screenPinned ? (
                <View style={styles.stepDoneBadge}><Text style={styles.stepDoneText}>OK</Text></View>
              ) : (
                <TouchableOpacity style={styles.stepButton} onPress={async () => {
                  const result = await devicePolicy.startKioskMode();
                  if (result === 'started' || result === 'already_locked') {
                    setScreenPinned(true);
                  }
                }}>
                  <Text style={styles.stepButtonText}>{language === 'et' ? 'Kinnita' : 'Pin'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Status summary */}
            <View style={styles.protectionSummary}>
              <Text style={styles.protectionSummaryText}>
                {[isAdminActive, accessibilityEnabled, overlayEnabled, screenPinned].filter(Boolean).length}/4 {language === 'et' ? 'kaitse aktiivne' : 'protections active'}
              </Text>
            </View>
          </View>
        )}

        {/* Show collapsed protection banner when setup is hidden but not all enabled */}
        {!showProtectionSetup && Platform.OS === 'android' && (!isAdminActive || !accessibilityEnabled || !overlayEnabled) && (
          <TouchableOpacity 
            style={[styles.protectionBanner, styles.protectionBasic]}
            onPress={() => setShowProtectionSetup(true)}
            data-testid="protection-banner-collapsed"
          >
            <Ionicons name="shield" size={24} color="#F59E0B" />
            <View style={styles.protectionBannerContent}>
              <Text style={styles.protectionBannerTitle}>
                {language === 'et' ? 'Kaitse mittetäielik' : 'Protection Incomplete'}
              </Text>
              <Text style={styles.protectionBannerText}>
                {[isAdminActive, accessibilityEnabled, overlayEnabled, screenPinned].filter(Boolean).length}/4 {language === 'et' ? 'aktiivne — puudutage seadistamiseks' : 'active — tap to setup'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* All protections active banner */}
        {!showProtectionSetup && Platform.OS === 'android' && isAdminActive && accessibilityEnabled && overlayEnabled && (
          <View style={[styles.protectionBanner, styles.protectionFull]} data-testid="protection-banner-full">
            <Ionicons name="shield-checkmark" size={24} color="#10B981" />
            <View style={styles.protectionBannerContent}>
              <Text style={styles.protectionBannerTitle}>
                {language === 'et' ? 'Seadme kaitse aktiivne' : 'Device Protection Active'}
              </Text>
              <Text style={styles.protectionBannerText}>
                {language === 'et' ? 'Kõik kaitsed on lubatud' : 'All protections enabled'}
              </Text>
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
    gap: 10,
    marginBottom: 16,
  },
  protectionSetupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  protectionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2D3D',
    gap: 12,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  stepNumber: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  stepDesc: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  stepButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stepButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  stepDoneBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stepDoneText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '700',
  },
  protectionSummary: {
    alignItems: 'center',
    paddingTop: 12,
  },
  protectionSummaryText: {
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
