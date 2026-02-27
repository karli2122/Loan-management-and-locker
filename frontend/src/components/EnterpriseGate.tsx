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
}

export function EnterpriseGate({ children, featureName }: Props) {
  const { hasEnterprise, loading, plan } = useEnterpriseAccess();
  const { colors } = useTheme();
  const router = useRouter();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!hasEnterprise) {
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
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark" size={48} color="#8B5CF6" />
          </View>
          <Text style={[styles.gateTitle, { color: colors.text }]}>Enterprise Feature</Text>
          <Text style={styles.gateDesc}>
            {featureName} is available on the Enterprise and Custom plans.
          </Text>
          <Text style={styles.currentPlan}>
            Your current plan: <Text style={styles.planName}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</Text>
          </Text>

          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>Team Management & Roles</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>Bulk CSV Import</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>Payment Schedules & Automation</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>Document Management</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>Telegram Bot Integration</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={18} color="#8B5CF6" />
              <Text style={styles.featureText}>QR Device Provisioning</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.upgradeBtn}
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
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#8B5CF620', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  gateTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  gateDesc: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  currentPlan: { fontSize: 13, color: '#64748B', marginBottom: 24 },
  planName: { color: '#F59E0B', fontWeight: '700' },
  featureList: { width: '100%', marginBottom: 28 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingLeft: 8 },
  featureText: { fontSize: 14, color: '#CBD5E1' },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7C3AED', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
