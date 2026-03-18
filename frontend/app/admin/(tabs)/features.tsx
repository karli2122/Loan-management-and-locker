import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../../src/context/LanguageContext';
import { LanguagePicker } from '../../../src/components/LanguagePicker';
import { useEnterpriseAccess } from '../../../src/hooks/useEnterpriseAccess';

type PlanTier = 'starter' | 'professional' | 'enterprise';

interface FeatureItem {
  key: string;
  icon: string;
  color: string;
  titleKey: string;
  descKey: string;
  route: string;
  featureGateKey?: string;
  requiredPlan: PlanTier;
  testId?: string;
}

const PLAN_BADGE: Record<PlanTier, { label: string; color: string; bg: string }> = {
  starter: { label: '', color: '', bg: '' },
  professional: { label: 'Professional', color: '#2563EB', bg: '#2563EB18' },
  enterprise: { label: 'Enterprise', color: '#8B5CF6', bg: '#8B5CF618' },
};

export default function FeaturesTab() {
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const { plan, canAccess, loading } = useEnterpriseAccess();
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    (async () => {
      const firstName = await AsyncStorage.getItem('admin_first_name');
      const lastName = await AsyncStorage.getItem('admin_last_name');
      const storedUsername = await AsyncStorage.getItem('admin_username');
      if (firstName || lastName) {
        setDisplayName([firstName, lastName].filter(Boolean).join(' '));
      } else if (storedUsername) {
        setDisplayName(storedUsername);
      }
    })();
  }, []);

  const handleLogout = async () => {
    Alert.alert(t('logout'), t('areYouSure'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove([
            'admin_token', 'admin_id', 'admin_username',
            'admin_role', 'is_super_admin', 'admin_first_name', 'admin_last_name',
          ]);
          router.replace('/');
        },
      },
    ]);
  };

  const sections: { title: string; items: FeatureItem[] }[] = [
    {
      title: t('analytics'),
      items: [
        { key: 'reports', icon: 'bar-chart', color: '#06B6D4', titleKey: 'reports', descKey: 'financialAnalyticsReports', route: '/admin/reports', featureGateKey: 'reports', requiredPlan: 'professional' },
        { key: 'bank_ocr', icon: 'document-text', color: '#10B981', titleKey: 'bankStatementAnalyzer', descKey: 'aipoweredIncomeexpenseAnalysis', route: '/admin/bank-analyzer', featureGateKey: 'bank_ocr', requiredPlan: 'enterprise', testId: 'bank-analyzer-link' },
        { key: 'audit_log', icon: 'shield-checkmark', color: '#8B5CF6', titleKey: 'auditLog', descKey: 'trackAllAdminActions', route: '/admin/audit-log', featureGateKey: 'audit_log', requiredPlan: 'enterprise', testId: 'audit-log-link' },
        { key: 'revenue_forecast', icon: 'trending-up', color: '#F97316', titleKey: 'revenueForecast', descKey: 'forecastFutureCollections', route: '/admin/revenue-forecast', featureGateKey: 'revenue_forecast', requiredPlan: 'enterprise', testId: 'revenue-forecast-link' },
      ],
    },
    {
      title: t('loanManagement'),
      items: [
        { key: 'loan_plans', icon: 'pricetag', color: '#EC4899', titleKey: 'loanPlans', descKey: 'manageLoanPlans', route: '/admin/loan-plans', featureGateKey: 'loan_plans', requiredPlan: 'professional' },
        { key: 'calculator', icon: 'calculator', color: '#14B8A6', titleKey: 'loanCalculator', descKey: 'calculateLoanPayments', route: '/admin/calculator', requiredPlan: 'starter' },
        { key: 'bulk_import', icon: 'cloud-upload', color: '#3B82F6', titleKey: 'bulkImport', descKey: 'importClientsLoansFromCsv', route: '/admin/bulk-import', featureGateKey: 'bulk_import', requiredPlan: 'professional', testId: 'bulk-import-link' },
        { key: 'document_vault', icon: 'folder-open', color: '#06B6D4', titleKey: 'documentVault', descKey: 'secureClientDocumentStorage', route: '/admin/documents', featureGateKey: 'document_vault', requiredPlan: 'enterprise', testId: 'documents-link' },
      ],
    },
    {
      title: t('deviceManagement'),
      items: [
        { key: 'device_lock', icon: 'people', color: '#F59E0B', titleKey: 'clientManagement', descKey: 'lockunlockDevices', route: '/admin/client-management', featureGateKey: 'device_lock', requiredPlan: 'professional' },
        { key: 'reminders', icon: 'notifications', color: '#EF4444', titleKey: 'paymentReminders', descKey: 'automatedPaymentReminders', route: '/admin/payment-reminders', featureGateKey: 'reminders', requiredPlan: 'professional', testId: 'reminders-link' },
      ],
    },
    {
      title: t('administration'),
      items: [
        { key: 'settings', icon: 'settings', color: '#8B5CF6', titleKey: 'settings', descKey: 'userManagementSettings', route: '/admin/settings', requiredPlan: 'starter' },
        { key: 'role_permissions', icon: 'people', color: '#2563EB', titleKey: 'teamManagement', descKey: 'manageTeamRolesPermissions', route: '/admin/team', featureGateKey: 'role_permissions', requiredPlan: 'enterprise', testId: 'team-link' },
        { key: 'session_management', icon: 'key', color: '#EF4444', titleKey: 'sessionManagement', descKey: 'viewAndRevokeActiveSessions', route: '/admin/session-management', featureGateKey: 'session_management', requiredPlan: 'enterprise', testId: 'sessions-link' },
      ],
    },
  ];

  const handleFeaturePress = (item: FeatureItem) => {
    const gateKey = item.featureGateKey || item.key;
    const hasAccess = canAccess(gateKey);

    if (!hasAccess) {
      const badge = PLAN_BADGE[item.requiredPlan];
      Alert.alert(
        `${badge.label} Feature`,
        `${t(item.titleKey)} requires the ${badge.label} plan or higher. Would you like to upgrade?`,
        [
          { text: t('cancel'), style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/admin/settings') },
        ],
      );
      return;
    }
    router.push(item.route as any);
  };

  const renderFeatureCard = (item: FeatureItem) => {
    const gateKey = item.featureGateKey || item.key;
    const hasAccess = canAccess(gateKey);
    const badge = item.requiredPlan !== 'starter' ? PLAN_BADGE[item.requiredPlan] : null;

    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.featureCard, !hasAccess && styles.featureCardLocked]}
        onPress={() => handleFeaturePress(item)}
        data-testid={item.testId || `feature-${item.key}`}
      >
        <View style={[styles.featureIcon, { backgroundColor: `${item.color}20` }]}>
          <Ionicons name={item.icon as any} size={24} color={hasAccess ? item.color : '#475569'} />
        </View>
        <View style={styles.featureInfo}>
          <View style={styles.featureTitleRow}>
            <Text style={[styles.featureTitle, !hasAccess && styles.featureTitleLocked]}>
              {t(item.titleKey)}
            </Text>
            {badge && (
              <View style={[styles.planBadge, { backgroundColor: badge.bg }]}>
                {!hasAccess && <Ionicons name="lock-closed" size={10} color={badge.color} style={{ marginRight: 3 }} />}
                <Text style={[styles.planBadgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            )}
          </View>
          <Text style={styles.featureDescription}>{t(item.descKey)}</Text>
        </View>
        <Ionicons name={hasAccess ? 'chevron-forward' : 'lock-closed'} size={20} color={hasAccess ? '#64748B' : '#475569'} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('features')}</Text>
        <View style={styles.planIndicator}>
          <Text style={styles.planIndicatorText}>{plan === 'business' ? 'Professional' : plan.charAt(0).toUpperCase() + plan.slice(1)}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.languageToggle}>
              <LanguagePicker compact colors={{
                surface: '#152035', text: '#F8FAFC', textMuted: '#94A3B8',
                border: '#1E3050', primary: '#2563EB', background: '#0B1527',
              }} />
            </View>
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map(renderFeatureCard)}
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} data-testid="logout-btn">
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1527' },
  contentContainer: { paddingBottom: 96 },
  header: {
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#152035',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  planIndicator: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    backgroundColor: '#2563EB20', borderWidth: 1, borderColor: '#2563EB40',
  },
  planIndicatorText: { fontSize: 12, fontWeight: '700', color: '#60A5FA' },
  content: { flex: 1, padding: 16 },
  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#152035', borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#1E3050',
  },
  userAvatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  userAvatarText: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 8 },
  languageToggle: { flexDirection: 'row', gap: 4 },
  sectionTitle: {
    fontSize: 14, fontWeight: '600', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 12,
  },
  featureCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#152035', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#1E3050',
  },
  featureCardLocked: { opacity: 0.65 },
  featureIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  featureInfo: { flex: 1 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  featureTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  featureTitleLocked: { color: '#94A3B8' },
  featureDescription: { fontSize: 13, color: '#64748B' },
  planBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  planBadgeText: { fontSize: 10, fontWeight: '700' },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#152035', borderRadius: 12, padding: 16, marginTop: 24,
    gap: 12, borderWidth: 1, borderColor: '#EF4444',
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#EF4444' },
});
