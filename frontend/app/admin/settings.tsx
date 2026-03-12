import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Linking,
  Platform,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useLanguage } from '../../src/context/LanguageContext';
import { useCurrency } from '../../src/context/CurrencyContext';
import { useTheme } from '../../src/context/ThemeContext';
import { LanguagePicker } from '../../src/components/LanguagePicker';
import { CurrencyPicker } from '../../src/components/CurrencyPicker';
import API_URL from '../../src/constants/api';
import devicePolicy from '../../src/utils/DevicePolicy';
import { getApiErrors, getDiagnosticLogs } from '../../src/utils/diagnostics';


interface Admin {
  id: string;
  username: string;
  role: string;
  is_super_admin: boolean;
  first_name?: string;
  last_name?: string;
  created_at: string;
}

export default function AdminSettings() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { currency, setCurrency, formatAmount } = useCurrency();
  const { theme, toggleTheme, colors, isDark } = useTheme();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('user');
  
  // Modal states
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('starter');
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<string>('starter');
  
  // Form states
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newUserRole, setNewUserRole] = useState('user'); // 'admin' or 'user'
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Profile edit states
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  
  // Google Drive backup states
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleAccount, setGoogleAccount] = useState<string | null>(null);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [backupInProgress, setBackupInProgress] = useState(false);
  
  // Super admin state
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  // User search state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  
  // Late Fee & Auto-Lock settings states
  const [lateFeePercent, setLateFeePercent] = useState<string>('2.0');
  const [autoLockGraceDays, setAutoLockGraceDays] = useState<string>('3');
  const [autoLockEnabled, setAutoLockEnabled] = useState<boolean>(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [diagnosticExporting, setDiagnosticExporting] = useState(false);

  const handleAuthError = async () => {
    await AsyncStorage.multiRemove(['admin_token', 'admin_stay_signed_in']);
    Alert.alert(
      t('sessionExpired'),
      t('pleaseLogInAgain'),
      [{ text: 'OK', onPress: () => router.replace('/admin/login') }]
    );
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = await AsyncStorage.getItem('admin_token');
      const adminId = await AsyncStorage.getItem('admin_id');
      const username = await AsyncStorage.getItem('admin_username');
      const role = await AsyncStorage.getItem('admin_role');
      const firstName = await AsyncStorage.getItem('admin_first_name');
      const lastName = await AsyncStorage.getItem('admin_last_name');
      
      // Only redirect if no token at all (never logged in)
      if (!token || !adminId) {
        await handleAuthError();
        return;
      }
      
      // Load Google Drive backup info
      const googleConnectedStr = await AsyncStorage.getItem('google_drive_connected');
      const googleAccountStr = await AsyncStorage.getItem('google_drive_account');
      const lastBackup = await AsyncStorage.getItem('last_backup_date');
      
      setGoogleConnected(googleConnectedStr === 'true');
      setGoogleAccount(googleAccountStr);
      setLastBackupDate(lastBackup);
      
      setAdminToken(token);
      setCurrentAdminId(adminId);
      setCurrentUsername(username || '');
      setCurrentUserRole(role || 'user');
      setEditFirstName(firstName || '');
      setEditLastName(lastName || '');
      
      // Fetch admin settings for late fees and auto-lock
      await fetchAdminSettings(token);
      
      // Always check if user is superadmin
      try {
        const creditsResponse = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
        if (creditsResponse.ok) {
          const creditsData = await creditsResponse.json();
          setIsSuperAdmin(creditsData.is_super_admin === true);
          // Also update role if superadmin
          if (creditsData.is_super_admin) {
            setCurrentUserRole('admin');
            await AsyncStorage.setItem('admin_role', 'admin');
          }
        }
      } catch (e) { console.error('Credits check failed', e); }
      
      // Only fetch admin list if user is an admin or superadmin
      if (token && (role === 'admin' || role === 'superadmin')) {
        await fetchAdminList(token);
      }
      
      // Fetch current subscription plan
      await fetchCurrentPlan(token);
      
      // Check if returning from Stripe checkout
      await checkStripeReturn(token);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminList = async (token: string) => {
    try {
      const creditsResponse = await fetch(`${API_URL}/api/admin/credits?admin_token=${token}`);
      if (creditsResponse.ok) {
        const creditsData = await creditsResponse.json();
        setIsSuperAdmin(creditsData.is_super_admin);
      }
      const response = await fetch(`${API_URL}/api/admin/list?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const fetchAdmins = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/list?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setAdmins(data);
      }
    } catch (error) {
      console.error('Error fetching admins:', error);
    }
  };

  const fetchAdminSettings = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/settings?admin_token=${token}`);
      if (response.ok) {
        const data = await response.json();
        setLateFeePercent(String(data.default_late_fee_percent || 2.0));
        setAutoLockGraceDays(String(data.default_auto_lock_grace_days || 3));
        setAutoLockEnabled(data.default_auto_lock_enabled !== false);
      }
    } catch (error) {
      console.error('Error fetching admin settings:', error);
    }
  };

  const fetchCurrentPlan = async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/payments/current-plan?admin_token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentSubscription(data.plan_id || 'starter');
        setSelectedPlan(data.plan_id || 'starter');
      }
    } catch (error) {
      console.error('Error fetching current plan:', error);
    }
  };

  const checkStripeReturn = async (token: string) => {
    try {
      // Check URL params for session_id (returning from Stripe checkout)
      if (Platform.OS === 'web') {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const planId = params.get('plan');
        if (sessionId) {
          // Poll status
          const statusRes = await fetch(`${API_URL}/api/payments/status/${sessionId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.payment_status === 'paid') {
              setCurrentSubscription(statusData.plan_id);
              setSelectedPlan(statusData.plan_id);
              Alert.alert(t('success'), t('planUpgradeSuccess'));
            }
          }
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
    } catch (error) {
      console.error('Error checking stripe return:', error);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!adminToken || planId === currentSubscription) return;
    setSubscribingPlan(planId);
    try {
      const origin = Platform.OS === 'web' ? window.location.origin : API_URL;
      const res = await fetch(`${API_URL}/api/payments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, origin_url: origin, admin_token: adminToken }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create checkout');
      }
      const data = await res.json();
      if (data.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          await Linking.openURL(data.url);
        }
      }
    } catch (error: any) {
      Alert.alert(t('error'), error.message);
    } finally {
      setSubscribingPlan(null);
    }
  };


  const handleSaveSettings = async () => {
    if (!adminToken) return;
    
    const feePercent = parseFloat(lateFeePercent);
    const graceDays = parseInt(autoLockGraceDays);
    
    if (isNaN(feePercent) || feePercent < 0 || feePercent > 100) {
      Alert.alert(
        t('error'),
        t('lateFeePercentMustBe0100')
      );
      return;
    }
    
    if (isNaN(graceDays) || graceDays < 1 || graceDays > 365) {
      Alert.alert(
        t('error'),
        t('gracePeriodMustBe1365Days')
      );
      return;
    }
    
    setSettingsSaving(true);
    try {
      const response = await fetch(
        `${API_URL}/api/admin/settings?admin_token=${adminToken}&default_late_fee_percent=${feePercent}&default_auto_lock_grace_days=${graceDays}&default_auto_lock_enabled=${autoLockEnabled}`,
        { method: 'PUT' }
      );
      
      if (response.ok) {
        Alert.alert(
          t('success'),
          t('settingsSavedSuccessfully')
        );
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      Alert.alert(
        t('error'),
        t('failedToSaveSettings')
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleApplySettingsToAll = async () => {
    if (!adminToken) return;
    
    Alert.alert(
      t('confirm'),
      t('applyTheseSettingsToAllExisting'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('apply'),
          onPress: async () => {
            setSettingsSaving(true);
            try {
              const response = await fetch(
                `${API_URL}/api/admin/settings/apply-to-all?admin_token=${adminToken}`,
                { method: 'POST' }
              );
              
              if (response.ok) {
                const data = await response.json();
                Alert.alert(
                  t('success'),
                  language === 'et' 
                    ? `Seaded rakendatud ${data.clients_updated} kliendile` 
                    : `Settings applied to ${data.clients_updated} clients`
                );
              } else {
                throw new Error('Failed to apply settings');
              }
            } catch (error) {
              console.error('Error applying settings:', error);
              Alert.alert(
                t('error'),
                t('failedToApplySettings')
              );
            } finally {
              setSettingsSaving(false);
            }
          }
        }
      ]
    );
  };

  const generateDiagnosticReport = async () => {
    setDiagnosticExporting(true);
    try {
      const entries = await AsyncStorage.multiGet([
        'client_id',
        'registration_code',
        'admin_id',
      ]);
      const clientId = entries.find((e) => e[0] === 'client_id')?.[1] || null;
      const registrationCode = entries.find((e) => e[0] === 'registration_code')?.[1] || null;
      const adminId = entries.find((e) => e[0] === 'admin_id')?.[1] || null;

      const logs = await getDiagnosticLogs();
      const apiErrors = await getApiErrors();

      const deviceInfo = {
        manufacturer: Device.manufacturer || Device.brand || 'Unknown',
        model: Device.modelName || Device.modelId || 'Unknown',
        osName: Device.osName || 'Unknown',
        osVersion: Device.osVersion || 'Unknown',
        deviceYearClass: Device.deviceYearClass || 'Unknown',
        isDevice: Device.isDevice,
      };

      const appVersion = Application.nativeApplicationVersion || Application.nativeBuildVersion || 'Unknown';

      const [locationPerm, notificationPerm] = await Promise.all([
        Location.getForegroundPermissionsAsync().catch(() => ({ status: 'unknown' } as any)),
        Notifications.getPermissionsAsync().catch(() => ({ status: 'unknown' } as any)),
      ]);

      const overlay = await devicePolicy.canDrawOverlays().catch(() => null);
      const accessibility = await devicePolicy.isAccessibilityEnabled().catch(() => null);
      const batteryOptimization = await devicePolicy.isIgnoringBatteryOptimizations().catch(() => null);
      const adminActive = await devicePolicy.isAdminActive().catch(() => null);
      const autoStart = (await AsyncStorage.getItem('autostart_enabled')) === 'true';

      const escapeHtml = (value: any) =>
        String(value ?? 'N/A')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const logLines = logs
        .map((log: any) => `${log.timestamp || ''} [${log.level || 'log'}] ${log.message || ''}`)
        .join('\n');
      const apiLines = apiErrors
        .map((err: any) => `${err.timestamp || ''} ${err.method || ''} ${err.url || ''} ${err.status || ''} ${err.statusText || err.error || ''}`)
        .join('\n');

      const html = `
        <html>
          <body style="font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a;">
            <h1>Diagnostic Report</h1>
            <p>Generated: ${new Date().toLocaleString()}</p>
            <h2>Registration</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Admin ID</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(adminId)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Client ID</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(clientId)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Registration Code</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(registrationCode)}</td></tr>
            </table>

            <h2>Device Info</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Manufacturer</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(deviceInfo.manufacturer)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Model</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(deviceInfo.model)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">OS</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(deviceInfo.osName)} ${escapeHtml(deviceInfo.osVersion)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">App Version</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(appVersion)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Device Year Class</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(deviceInfo.deviceYearClass)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Is Physical Device</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(deviceInfo.isDevice)}</td></tr>
            </table>

            <h2>Permission Status</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Overlay</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(overlay)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Accessibility</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(accessibility)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Battery Optimization Ignored</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(batteryOptimization)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Location</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(locationPerm.status)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Notifications</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(notificationPerm.status)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Device Admin Active</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(adminActive)}</td></tr>
              <tr><td style="padding: 6px; border: 1px solid #e2e8f0;">Auto Start Flag</td><td style="padding: 6px; border: 1px solid #e2e8f0;">${escapeHtml(autoStart)}</td></tr>
            </table>

            <h2>Last 50 App Logs</h2>
            <pre style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">${escapeHtml(logLines || 'No logs captured yet.')}</pre>

            <h2>Last API Errors</h2>
            <pre style="white-space: pre-wrap; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">${escapeHtml(apiLines || 'No API errors captured yet.')}</pre>
          </body>
        </html>
      `;

      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Diagnostic Report',
        });
      } else {
        Alert.alert(
          t('sharingNotAvailable'),
          t('thisDeviceDoesNotSupportSharing')
        );
      }
    } catch (error: any) {
      Alert.alert(t('error'), error?.message || 'Failed to export report');
    } finally {
      setDiagnosticExporting(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newUsername.trim() || !newPassword.trim() || !newFirstName.trim() || !newLastName.trim()) {
      Alert.alert(
        t('error'),
        t('pleaseFillAllFields')
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        t('error'),
        t('passwordMinLength')
      );
      return;
    }

    setActionLoading(true);
    try {
      // Send admin_token as query parameter, not in the body
      const response = await fetch(`${API_URL}/api/admin/register?admin_token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: newUsername, 
          password: newPassword,
          first_name: newFirstName,
          last_name: newLastName,
          role: newUserRole 
        }),
      });

      if (!response.ok) {
        // Try to parse error as JSON, fallback to text
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          throw new Error(data.detail || 'Failed to create user');
        } else {
          const text = await response.text();
          throw new Error(text || 'Failed to create user');
        }
      }

      const roleText = newUserRole === 'admin' ? (t('admin')) : (t('user'));
      Alert.alert(
        t('success'),
        language === 'et' ? `Uus ${roleText} loodud` : `New ${roleText} created successfully`
      );
      
      setShowAddAdmin(false);
      setNewUsername('');
      setNewPassword('');
      setNewUserRole('user');
      setNewFirstName('');
      setNewLastName('');
      await fetchAdmins(adminToken!);
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert(
        t('error'),
        t('pleaseFillAllFields')
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        t('error'),
        t('passwordsDoNotMatch')
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        t('error'),
        t('newPasswordMustBeAtLeast')
      );
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/change-password?admin_token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          current_password: currentPassword, 
          new_password: newPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to change password');
      }

      Alert.alert(
        t('success'),
        t('passwordChangedSuccessfully')
      );
      
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAdmin = (admin: Admin) => {
    if (admin.id === currentAdminId) {
      Alert.alert(
        t('error'),
        t('cannotDeleteYourOwnAccount')
      );
      return;
    }

    Alert.alert(
      t('deleteAdmin'),
      language === 'et' 
        ? `Kas oled kindel, et soovid kustutada kasutaja "${admin.username}"?`
        : `Are you sure you want to delete "${admin.username}"?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_URL}/api/admin/${admin.id}?admin_token=${adminToken}`,
                { method: 'DELETE' }
              );

              if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to delete admin');
              }

              await fetchAdmins(adminToken!);
            } catch (error: any) {
              Alert.alert(
                t('error'),
                error.message
              );
            }
          },
        },
      ]
    );
  };

  const handleUpdateProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      Alert.alert(
        t('error'),
        t('pleaseEnterYourName')
      );
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/admin/update-profile?admin_token=${adminToken}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
        }),
      });

      if (!response.ok) {
        // Try to parse error as JSON, fallback to text
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          throw new Error(data.detail || 'Failed to update profile');
        } else {
          const text = await response.text();
          throw new Error(text || 'Failed to update profile');
        }
      }

      // Update local storage
      await AsyncStorage.setItem('admin_first_name', editFirstName.trim());
      await AsyncStorage.setItem('admin_last_name', editLastName.trim());

      Alert.alert(
        t('success'),
        t('profileUpdatedSuccessfully')
      );
      
      setShowEditProfile(false);
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error.message
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t('logout'),
      t('areYouSure'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(['admin_token', 'admin_id', 'admin_username']);
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleConnectGoogleDrive = async () => {
    // Use Emergent Google Auth for authentication
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    Alert.alert(
      t('connectGoogleDrive'),
      t('doYouWantToConnectGoogle'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('connect'),
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('admin_token');
              // For React Native, we use backend-stored Google account info
              // The admin's account email is used as the Google Drive account identifier
              const adminEmail = await AsyncStorage.getItem('admin_email') || `${currentUsername}@paylock.pro`;
              
              await AsyncStorage.setItem('google_drive_connected', 'true');
              await AsyncStorage.setItem('google_drive_account', adminEmail);
              setGoogleConnected(true);
              setGoogleAccount(adminEmail);
              
              // Update admin record with google_email
              if (token) {
                await fetch(`${API_URL}/api/admin/update-profile?admin_token=${token}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ google_email: adminEmail }),
                });
              }
              
              Alert.alert(t('success'), t('googleDriveConnectedSuccessfullySimulation'));
            } catch (error: any) {
              Alert.alert(t('error'), error.message);
            }
          },
        },
      ]
    );
  };

  const handleDisconnectGoogleDrive = async () => {
    Alert.alert(
      t('disconnect'),
      t('areYouSureYouWantTo2'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('disconnect'),
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              'google_drive_connected',
              'google_drive_account',
              'last_backup_date',
            ]);
            setGoogleConnected(false);
            setGoogleAccount(null);
            setLastBackupDate(null);
          },
        },
      ]
    );
  };

  const handleBackupNow = async () => {
    if (!googleConnected) {
      Alert.alert(
        t('error'),
        t('pleaseConnectGoogleDriveFirst')
      );
      return;
    }

    setBackupInProgress(true);
    try {
      const token = await AsyncStorage.getItem('admin_token');
      if (!token) { await handleAuthError(); return; }
      
      const response = await fetch(`${API_URL}/api/backup/create?admin_token=${token}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Backup failed');
      }
      
      const data = await response.json();
      const now = new Date().toISOString();
      await AsyncStorage.setItem('last_backup_date', now);
      setLastBackupDate(now);
      
      Alert.alert(
        t('success'),
        language === 'et' 
          ? `Varukoopia loodud!\nKliendid: ${data.stats.clients}\nLaenud: ${data.stats.loans}\nMaksed: ${data.stats.payments}` 
          : `Backup created!\nClients: ${data.stats.clients}\nLoans: ${data.stats.loans}\nPayments: ${data.stats.payments}`
      );
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error.message || t('backupFailed')
      );
    } finally {
      setBackupInProgress(false);
    }
  };

  const formatBackupDate = (dateStr: string | null) => {
    if (!dateStr) return t('never');
    const date = new Date(dateStr);
    return date.toLocaleString(t('enus'), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.surface }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('settings')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={[styles.content, { backgroundColor: colors.background }]}>
        {/* Current User Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('yourAccount')}
          </Text>
          <View style={[styles.userCard, { backgroundColor: colors.surface }]}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{currentUsername.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.userName, { color: colors.text }]}>{editFirstName} {editLastName}</Text>
              <Text style={[styles.userRole, { color: colors.textMuted }]}>
                {currentUserRole === 'admin' 
                  ? (t('administrator')) 
                  : (t('user2'))}
              </Text>
            </View>
          </View>

          {/* Subscription Plan Display */}
          <View style={[styles.creditCard, { backgroundColor: colors.surface }]} data-testid="plan-status-card">
            <View style={styles.creditIconContainer}>
              <Ionicons name="diamond" size={24} color={colors.primary} />
            </View>
            <View style={styles.creditInfo}>
              <Text style={[styles.creditLabel, { color: colors.textMuted }]}>
                {t('currentPlan')}
              </Text>
              <Text style={[styles.creditValue, { color: colors.text }]}>
                {isSuperAdmin ? 'Custom' : (currentSubscription || 'starter').charAt(0).toUpperCase() + (currentSubscription || 'starter').slice(1)}
              </Text>
            </View>
            {isSuperAdmin && (
              <View style={styles.superAdminTag}>
                <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                <Text style={[styles.superAdminText, { color: colors.success }]}>
                  {t('superadmin')}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowEditProfile(true)}
          >
            <Ionicons name="person" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>
              {t('editProfile')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 8, backgroundColor: colors.surface }]}
            onPress={() => setShowChangePassword(true)}
          >
            <Ionicons name="key" size={20} color={colors.primary} />
            <Text style={[styles.actionButtonText, { color: colors.text }]}>
              {t('changePassword')}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Audit Log - Superadmin Only */}
          {isSuperAdmin && (
            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 8, backgroundColor: colors.surface }]}
              onPress={() => router.push('/admin/audit-log')}
              data-testid="audit-log-btn"
            >
              <Ionicons name="document-text" size={20} color={colors.success} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                {t('auditLog')}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Test Push Notification */}
          {isSuperAdmin && (
            <TouchableOpacity
              style={[styles.actionButton, { marginTop: 8, backgroundColor: colors.surface }]}
              onPress={async () => {
                try {
                  const { status } = await Notifications.getPermissionsAsync();
                  if (status !== 'granted') {
                    const { status: newStatus } = await Notifications.requestPermissionsAsync();
                    if (newStatus !== 'granted') {
                      Alert.alert('Error', 'Push notification permission not granted');
                      return;
                    }
                  }
                  const tokenData = await Notifications.getExpoPushTokenAsync();
                  const pushToken = tokenData?.data;
                  if (!pushToken) {
                    Alert.alert('Error', 'Could not get push token. This only works on a physical device.');
                    return;
                  }
                  // Register token first
                  await fetch(`${API_URL}/api/push/register-token?token=${encodeURIComponent(pushToken)}&admin_token=${adminToken}`, { method: 'POST' });
                  // Send test via backend
                  const res = await fetch(`${API_URL}/api/push/send?admin_token=${adminToken}&title=${encodeURIComponent('Test Notification')}&body=${encodeURIComponent('Push notifications are working!')}&token=${encodeURIComponent(pushToken)}`, { method: 'POST' });
                  if (res.ok) {
                    Alert.alert('Success', `Test notification sent!\nYour push token: ${pushToken.slice(0, 30)}...`);
                  } else {
                    const err = await res.json();
                    Alert.alert('Error', err.detail || 'Failed to send test notification');
                  }
                } catch (e: any) {
                  Alert.alert('Error', e.message || 'Push test failed');
                }
              }}
              data-testid="test-push-btn"
            >
              <Ionicons name="notifications" size={20} color="#F59E0B" />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                Test Push Notification
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('language')}
          </Text>
          <LanguagePicker colors={colors} />
        </View>

        {/* Currency Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('currency')}
          </Text>
          <CurrencyPicker colors={colors} />
        </View>

        {/* Theme Section */}
        <View style={[styles.section, { backgroundColor: colors.background }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            {t('theme')}
          </Text>
          <View style={styles.themeContainer} data-testid="theme-toggle-section">
            <TouchableOpacity
              style={[
                styles.themeOption, 
                isDark && styles.themeOptionActive,
                { backgroundColor: colors.surface, borderColor: isDark ? colors.primary : colors.border }
              ]}
              onPress={() => !isDark && toggleTheme()}
              data-testid="theme-dark-btn"
            >
              <Ionicons name="moon" size={22} color={isDark ? colors.primary : colors.textMuted} />
              <Text style={[styles.themeText, { color: isDark ? colors.primary : colors.textMuted }]}>
                {t('dark')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.themeOption, 
                !isDark && styles.themeOptionActive,
                { backgroundColor: colors.surface, borderColor: !isDark ? colors.primary : colors.border }
              ]}
              onPress={() => isDark && toggleTheme()}
              data-testid="theme-light-btn"
            >
              <Ionicons name="sunny" size={22} color={!isDark ? colors.primary : colors.textMuted} />
              <Text style={[styles.themeText, { color: !isDark ? colors.primary : colors.textMuted }]}>
                {t('light')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Google Drive Backup Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('googleDriveBackup')}
          </Text>
          
          <View style={styles.backupCard}>
            <View style={styles.backupStatus}>
              <Ionicons 
                name={googleConnected ? 'cloud-done' : 'cloud-offline'} 
                size={32} 
                color={googleConnected ? '#10B981' : '#64748B'} 
              />
              <View style={styles.backupStatusInfo}>
                <Text style={styles.backupStatusText}>
                  {googleConnected 
                    ? (t('connected')) 
                    : (t('notConnected'))}
                </Text>
                {googleConnected && googleAccount && (
                  <Text style={styles.backupAccountText}>{googleAccount}</Text>
                )}
              </View>
            </View>
            
            {googleConnected && (
              <View style={styles.lastBackupRow}>
                <Ionicons name="time-outline" size={16} color="#64748B" />
                <Text style={styles.lastBackupText}>
                  {t('lastBackup')}
                  {formatBackupDate(lastBackupDate)}
                </Text>
              </View>
            )}
            
            <View style={styles.backupButtons}>
              {googleConnected ? (
                <>
                  <TouchableOpacity
                    style={[styles.backupButton, styles.backupNowButton]}
                    onPress={handleBackupNow}
                    disabled={backupInProgress}
                  >
                    {backupInProgress ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={18} color="#fff" />
                        <Text style={styles.backupButtonText}>
                          {t('backupNow')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.backupButton, styles.disconnectButton]}
                    onPress={handleDisconnectGoogleDrive}
                  >
                    <Ionicons name="unlink" size={18} color="#EF4444" />
                    <Text style={[styles.backupButtonText, { color: '#EF4444' }]}>
                      {t('disconnect')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.backupButton, styles.connectButton]}
                  onPress={handleConnectGoogleDrive}
                >
                  <Ionicons name="logo-google" size={18} color="#fff" />
                  <Text style={styles.backupButtonText}>
                    {t('connectGoogleDrive')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Late Fee & Auto-Lock Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('lateFeeAutolock')}
          </Text>
          
          <View style={styles.settingsCard} data-testid="late-fee-settings-card">
            {/* Late Fee Percent */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Ionicons name="cash-outline" size={20} color="#F59E0B" />
                <View>
                  <Text style={styles.settingLabel}>
                    {t('lateFeePercent')}
                  </Text>
                  <Text style={styles.settingHint}>
                    {t('percentOfMonthlyPayment')}
                  </Text>
                </View>
              </View>
              <View style={styles.settingInputWrapper}>
                <TextInput
                  style={styles.settingInput}
                  value={lateFeePercent}
                  onChangeText={setLateFeePercent}
                  keyboardType="decimal-pad"
                  placeholder="2.0"
                  placeholderTextColor="#64748B"
                  data-testid="late-fee-percent-input"
                />
                <Text style={styles.settingUnit}>%</Text>
              </View>
            </View>

            {/* Auto-Lock Grace Days */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Ionicons name="time-outline" size={20} color="#EF4444" />
                <View>
                  <Text style={styles.settingLabel}>
                    {t('gracePeriodDays')}
                  </Text>
                  <Text style={styles.settingHint}>
                    {t('daysBeforeAutolock')}
                  </Text>
                </View>
              </View>
              <View style={styles.settingInputWrapper}>
                <TextInput
                  style={styles.settingInput}
                  value={autoLockGraceDays}
                  onChangeText={setAutoLockGraceDays}
                  keyboardType="number-pad"
                  placeholder="3"
                  placeholderTextColor="#64748B"
                  data-testid="auto-lock-grace-days-input"
                />
                <Text style={styles.settingUnit}>{t('d')}</Text>
              </View>
            </View>

            {/* Auto-Lock Enabled Toggle */}
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Ionicons name="lock-closed" size={20} color="#2563EB" />
                <View>
                  <Text style={styles.settingLabel}>
                    {t('autolockEnabled')}
                  </Text>
                  <Text style={styles.settingHint}>
                    {t('lockDeviceAutomatically')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.toggle, autoLockEnabled && styles.toggleActive]}
                onPress={() => setAutoLockEnabled(!autoLockEnabled)}
                data-testid="auto-lock-toggle"
              >
                <View style={[styles.toggleKnob, autoLockEnabled && styles.toggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveSettingsButton, settingsSaving && styles.buttonDisabled]}
              onPress={handleSaveSettings}
              disabled={settingsSaving}
              data-testid="save-settings-button"
            >
              {settingsSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveSettingsButtonText}>
                    {t('saveSettings')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Apply to All Clients Button */}
            <TouchableOpacity
              style={[styles.applyToAllButton, settingsSaving && styles.buttonDisabled]}
              onPress={handleApplySettingsToAll}
              disabled={settingsSaving}
              data-testid="apply-to-all-button"
            >
              <Ionicons name="people" size={18} color="#2563EB" />
              <Text style={styles.applyToAllButtonText}>
                {t('applyToAllClients')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {isSuperAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('diagnosticReport')}
            </Text>
            <View style={styles.diagnosticCard} data-testid="diagnostic-card">
              <View style={styles.diagnosticHeader}>
                <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                <Text style={styles.diagnosticTitle}>
                  {t('exportDiagnostics')}
                </Text>
              </View>
              <Text style={styles.diagnosticText}>
                {t('generateAPdfReportWithDevice')}
              </Text>
              <TouchableOpacity
                style={[styles.diagnosticButton, diagnosticExporting && styles.buttonDisabled]}
                onPress={generateDiagnosticReport}
                disabled={diagnosticExporting}
                data-testid="diagnostic-export-button"
              >
                {diagnosticExporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="download" size={18} color="#fff" />
                    <Text style={styles.diagnosticButtonText}>
                      {t('exportPdf')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Admin Management Section - Only for Admins */}
        {(currentUserRole === 'admin' || currentUserRole === 'superadmin' || isSuperAdmin) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('userManagement')}
              </Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddAdmin(true)}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* User Search Field */}
            <View style={styles.userSearchContainer}>
              <Ionicons name="search" size={18} color="#64748B" />
              <TextInput
                style={styles.userSearchInput}
                placeholder={t('searchUsers')}
                placeholderTextColor="#64748B"
                value={userSearchQuery}
                onChangeText={setUserSearchQuery}
                data-testid="user-search-input"
              />
              {userSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setUserSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#64748B" />
                </TouchableOpacity>
              )}
            </View>

            {admins.filter(admin => 
              admin.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
              (admin.first_name && admin.first_name.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
              (admin.last_name && admin.last_name.toLowerCase().includes(userSearchQuery.toLowerCase()))
            ).map((admin) => (
            <View key={admin.id} style={styles.adminCard}>
              <View style={styles.adminAvatarSmall}>
                <Text style={styles.adminAvatarText}>{admin.username.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.adminInfo}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                  <Text style={styles.adminName}>{admin.username}</Text>
                  <View style={[styles.roleBadge, admin.role === 'admin' && styles.roleBadgeAdmin]}>
                    <Text style={styles.roleBadgeText}>
                      {admin.role === 'admin' ? (t('admin2')) : (t('user2'))}
                    </Text>
                  </View>
                  {admin.is_super_admin && (
                    <View style={styles.superAdminBadge}>
                      <Ionicons name="shield-checkmark" size={12} color="#F59E0B" />
                    </View>
                  )}
                </View>
                {admin.id === currentAdminId && (
                  <Text style={styles.youBadge}>{t('you')}</Text>
                )}
              </View>
              <View style={styles.adminActions}>
                {admin.id !== currentAdminId && !admin.is_super_admin && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteAdmin(admin)}
                  >
                    <Ionicons name="trash" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          </View>
        )}

        {/* Plans & Pricing Section */}
        <View style={styles.section} data-testid="plans-section">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0 }]}>
              {t('plansAndPricing')}
            </Text>
            <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>{t('currentPlan')}: {t(currentSubscription)}</Text>
            </View>
          </View>

          {[
            { id: 'starter', icon: 'rocket-outline' as const, price: 29, clients: 20, features: ['basicLoanMgmt', 'oneAdmin', 'paymentTracking'] },
            { id: 'business', icon: 'business-outline' as const, price: 79, clients: 200, features: ['deviceLockUnlock', 'autoLock', 'paymentReminders', 'reportsGps', 'bankOcr', 'businessManagement', 'threeAdmins'], popular: true },
            { id: 'enterprise', icon: 'diamond-outline' as const, price: 199, clients: 1000, features: ['allBusinessFeatures', 'deviceOwnerMode', 'customLauncher', 'creditScoring', 'auditLog', 'unlimitedAdmins', 'prioritySupport'] },
          ].map((plan) => {
            const isActive = selectedPlan === plan.id;
            const isPopular = 'popular' in plan && plan.popular;
            return (
              <TouchableOpacity key={plan.id} data-testid={`plan-card-${plan.id}`}
                style={{ borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? colors.primary : isPopular ? '#06B6D4' : colors.border,
                  backgroundColor: isActive ? colors.primary + '10' : colors.surface }}
                onPress={() => setSelectedPlan(plan.id)} activeOpacity={0.7}>
                {isPopular && (
                  <View style={{ position: 'absolute', top: -10, right: 16, backgroundColor: '#06B6D4', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{t('mostPopular')}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isActive ? colors.primary + '25' : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={plan.icon} size={20} color={isActive ? colors.primary : colors.textMuted} />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{t(plan.id)}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('upTo')} {plan.clients} {t('clients').toLowerCase()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>{formatAmount(plan.price)}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>/{t('month')}</Text>
                  </View>
                </View>
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                  {plan.features.map((feat, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Ionicons name="checkmark-circle" size={15} color={isActive ? colors.primary : '#10B981'} />
                      <Text style={{ color: colors.textSecondary, fontSize: 13, marginLeft: 6 }}>{t(feat)}</Text>
                    </View>
                  ))}
                </View>
                {isActive && currentSubscription === plan.id && (
                  <View style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('currentPlan')}</Text>
                  </View>
                )}
                {currentSubscription !== plan.id && (
                  <TouchableOpacity 
                    style={{ marginTop: 10, backgroundColor: isPopular ? '#06B6D4' : colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: subscribingPlan === plan.id ? 0.6 : 1 }}
                    onPress={() => handleSubscribe(plan.id)}
                    disabled={subscribingPlan !== null}
                    data-testid={`subscribe-${plan.id}-btn`}
                  >
                    {subscribingPlan === plan.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('upgrade')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}

          <View style={{ borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderStyle: 'dashed' }} data-testid="plan-card-custom">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{t('custom')}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('unlimitedClients')}</Text>
              </View>
              <TouchableOpacity style={{ backgroundColor: colors.surfaceAlt, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 }}
                onPress={() => Linking.openURL('mailto:paylockpro@gmail.com?subject=PayLock%20Pro%20-%20Custom%20Plan%20Inquiry')} data-testid="contact-sales-btn">
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>{t('contactSales')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ marginTop: 16, borderRadius: 12, padding: 14, backgroundColor: colors.surfaceAlt }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>{t('addOns')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="add-circle-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>{t('extraDevicePricing')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 6 }}>{t('smsReminderPricing')}</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>
            {t('logout')}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Add Admin Modal */}
      <Modal visible={showAddAdmin} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('addUser')}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('firstName')}
                placeholderTextColor="#64748B"
                value={newFirstName}
                onChangeText={setNewFirstName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('lastName')}
                placeholderTextColor="#64748B"
                value={newLastName}
                onChangeText={setNewLastName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('username')}
                placeholderTextColor="#64748B"
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('password')}
                placeholderTextColor="#64748B"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.roleSelector}>
              <Text style={styles.roleLabel}>
                {t('role')}
              </Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[styles.roleButton, newUserRole === 'user' && styles.roleButtonActive]}
                  onPress={() => setNewUserRole('user')}
                >
                  <Ionicons 
                    name="person" 
                    size={18} 
                    color={newUserRole === 'user' ? '#fff' : '#64748B'} 
                  />
                  <Text style={[styles.roleButtonText, newUserRole === 'user' && styles.roleButtonTextActive]}>
                    {t('user2')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleButton, newUserRole === 'admin' && styles.roleButtonActive]}
                  onPress={() => setNewUserRole('admin')}
                >
                  <Ionicons 
                    name="shield-checkmark" 
                    size={18} 
                    color={newUserRole === 'admin' ? '#fff' : '#64748B'} 
                  />
                  <Text style={[styles.roleButtonText, newUserRole === 'admin' && styles.roleButtonTextActive]}>
                    {t('admin2')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowAddAdmin(false);
                  setNewUsername('');
                  setNewPassword('');
                  setNewFirstName('');
                  setNewLastName('');
                  setNewUserRole('user');
                }}
              >
                <Text style={styles.cancelButtonText}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddAdmin}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {t('add')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={showChangePassword} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('changePassword')}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('currentPassword2')}
                placeholderTextColor="#64748B"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="key" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('newPassword2')}
                placeholderTextColor="#64748B"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="checkmark-circle" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('confirmNewPassword')}
                placeholderTextColor="#64748B"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowChangePassword(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.cancelButtonText}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleChangePassword}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {t('change')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal visible={showEditProfile} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('editProfile')}
            </Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('firstName')}
                placeholderTextColor="#64748B"
                value={editFirstName}
                onChangeText={setEditFirstName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="person" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('lastName')}
                placeholderTextColor="#64748B"
                value={editLastName}
                onChangeText={setEditLastName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="mail" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('emailAddress2')}
                placeholderTextColor="#64748B"
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="call" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('phoneNumber2')}
                placeholderTextColor="#64748B"
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="location" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder={t('address')}
                placeholderTextColor="#64748B"
                value={editAddress}
                onChangeText={setEditAddress}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditProfile(false)}
              >
                <Text style={styles.cancelButtonText}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleUpdateProfile}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {t('save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#152035',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#152035',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  userInfo: {
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  userRole: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  langContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  langOption: {
    flex: 1,
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langOptionActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  langText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  langTextActive: {
    color: '#2563EB',
  },
  // Theme toggle styles
  themeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeOptionActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  themeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  // Google Drive Backup styles
  backupCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 16,
  },
  backupStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  backupStatusInfo: {
    flex: 1,
  },
  backupStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backupAccountText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  lastBackupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1E3050',
  },
  lastBackupText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  backupButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backupButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backupNowButton: {
    backgroundColor: '#2563EB',
  },
  disconnectButton: {
    backgroundColor: '#EF444420',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  connectButton: {
    backgroundColor: '#10B981',
  },
  backupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  adminAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E3050',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  adminInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 8,
  },
  adminName: {
    fontSize: 16,
    color: '#fff',
  },
  youBadge: {
    fontSize: 12,
    color: '#2563EB',
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#152035',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1527',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
    paddingHorizontal: 16,
    marginBottom: 12,
    height: 52,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#1E3050',
  },
  confirmButton: {
    backgroundColor: '#2563EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  roleSelector: {
    marginTop: 16,
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1E3050',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  roleButtonActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  roleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#1E3050',
  },
  roleBadgeAdmin: {
    backgroundColor: '#2563EB20',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  superAdminBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Credit system styles
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  creditIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creditLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 2,
  },
  creditValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F59E0B',
  },
  superAdminTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#10B98120',
  },
  superAdminText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  lowCreditWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F59E0B15',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  lowCreditText: {
    flex: 1,
    fontSize: 12,
    color: '#F59E0B',
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#F59E0B20',
  },
  creditBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
  },
  adminActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creditAssignButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedAdminInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  currentCreditsText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  creditQuickButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  creditQuickButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
  },
  creditQuickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  creditConfirmButton: {
    backgroundColor: '#F59E0B',
  },
  // User search styles
  userSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1527',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E3050',
    gap: 8,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  // Late Fee & Auto-Lock Settings Styles
  settingsCard: {
    backgroundColor: '#152035',
    borderRadius: 16,
    padding: 20,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3050',
  },
  settingLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  settingHint: {
    fontSize: 11,
    color: '#64748B',
  },
  settingInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1527',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#1E3050',
  },
  settingInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
    width: 50,
    textAlign: 'center',
  },
  settingUnit: {
    fontSize: 14,
    color: '#64748B',
    marginLeft: 4,
  },
  toggle: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E3050',
    justifyContent: 'center',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#2563EB',
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleKnobActive: {
    marginLeft: 'auto',
  },
  saveSettingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
  },
  saveSettingsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  applyToAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB20',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2563EB40',
  },
  applyToAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  diagnosticCard: {
    backgroundColor: '#152035',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#10B98140',
    gap: 12,
  },
  diagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  diagnosticTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  diagnosticText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  diagnosticButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
  },
  diagnosticButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
