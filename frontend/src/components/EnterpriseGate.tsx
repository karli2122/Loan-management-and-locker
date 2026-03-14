import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useEnterpriseAccess } from '../hooks/useEnterpriseAccess';

interface Props {
  children: React.ReactNode;
  featureName: string;
  requiredPlan?: 'professional' | 'business' | 'enterprise';
  featureKey?: string;
}

export function EnterpriseGate({ children, featureName, requiredPlan = 'enterprise', featureKey }: Props) {
  const { hasEnterprise, hasBusiness, loading, plan, canAccess } = useEnterpriseAccess();
  const { colors } = useTheme();
  const router = useRouter();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const hasAccess = featureKey
    ? canAccess(featureKey)
    : (requiredPlan === 'business' || requiredPlan === 'professional')
      ? hasBusiness
      : hasEnterprise;

  if (!hasAccess) {
    const planLabel = (requiredPlan === 'business' || requiredPlan === 'professional') ? 'Professional' : 'Enterprise';
    const planColor = (requiredPlan === 'business' || requiredPlan === 'professional') ? '#2563EB' : '#8B5CF6';

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} data-testid="enterprise-gate-back">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{featureName}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.gateContent}>
          <View style={[styles.iconCircle, { backgroundColor: `${planColor}20` }]}>
            <Ionicons name="shield-checkmark" size={48} color={planColor} />
          </View>
          <Text style={[styles.gateTitle, { color: colors.text }]}>{planLabel} Feature</Text>
          <Text style={styles.gateDesc}>
            {featureName} is available on the {planLabel} plan and above.
          </Text>
          <Text style={styles.currentPlan}>
            Your current plan: <Text style={styles.planName}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</Text>
          </Text>

          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: planColor }]}
            onPress={() => router.push('/admin/settings')}
            data-testid="upgrade-plan-btn"
          >
            <Ionicons name="arrow-up-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.upgradeBtnText}>Upgrade Plan</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#152035' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  gateContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  gateTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  gateDesc: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  currentPlan: { fontSize: 13, color: '#64748B', marginBottom: 24 },
  planName: { color: '#F59E0B', fontWeight: '700' },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
