import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/context/ThemeContext';
import { useLanguage } from '../../src/context/LanguageContext';

export default function UpgradePlan() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguage();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} data-testid="upgrade-plan-back-btn">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Upgrade Plan</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.iconContainer}>
            <Ionicons name="rocket" size={48} color="#F59E0B" />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Unlock Full Access</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            You are currently on the Demo plan. Upgrade to unlock all features including loan management, client tracking, payment collection, and more.
          </Text>

          <View style={styles.featureList}>
            {[
              'Unlimited clients & loans',
              'Payment link generation',
              'Contract sharing & PDF export',
              'Credit scoring & analytics',
              'Device management & heartbeat',
              'Team management',
            ].map((feature, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.upgradeBtn}
            onPress={() => Linking.openURL('https://paylockpro.com/pricing')}
            data-testid="upgrade-plan-cta-btn"
          >
            <Ionicons name="arrow-up-circle" size={20} color="#fff" />
            <Text style={styles.upgradeBtnText}>View Plans & Pricing</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactBtn, { borderColor: colors.border }]}
            onPress={() => Linking.openURL('https://paylockpro.com/contact')}
            data-testid="upgrade-plan-contact-btn"
          >
            <Ionicons name="mail" size={18} color={colors.primary} />
            <Text style={[styles.contactBtnText, { color: colors.primary }]}>Contact Sales</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  content: { flex: 1, padding: 16, justifyContent: 'center' },
  card: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F59E0B20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  featureList: { width: '100%', gap: 12, marginBottom: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, fontWeight: '500' },
  upgradeBtn: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    marginBottom: 12,
  },
  upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    borderWidth: 1,
  },
  contactBtnText: { fontSize: 14, fontWeight: '600' },
});
