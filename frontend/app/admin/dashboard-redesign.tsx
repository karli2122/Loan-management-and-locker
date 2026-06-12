import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, GlassCard, Pill, Money, Eyebrow } from '../../src/theme/components';
import { palette, space, radius, type } from '../../src/theme/tokens';

/**
 * REFERENCE SCREEN — Admin dashboard, "Midnight" design system.
 *
 * Data-dense fintech treatment: a portfolio hero, a compact KPI grid, and a
 * live client list with status. Placeholder data; wire to analytics endpoints
 * when adopting.
 */

const CLIENTS = [
  { name: 'Liis Tamm', amount: 1840.5, status: 'On track', tone: 'success' as const },
  { name: 'Marek Saar', amount: 920.0, status: 'Due in 2d', tone: 'warning' as const },
  { name: 'Anna Kask', amount: 2410.75, status: '4d overdue', tone: 'danger' as const },
  { name: 'Jaan Lepp', amount: 540.0, status: 'On track', tone: 'success' as const },
];

export default function AdminDashboardReference() {
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: space.xl, paddingBottom: space.huge }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Eyebrow>Portfolio</Eyebrow>
              <Text style={styles.h1}>Overview</Text>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>PL</Text>
            </View>
          </View>

          {/* Hero — total outstanding across book */}
          <GlassCard glow style={{ marginTop: space.xl }}>
            <View style={styles.rowBetween}>
              <Eyebrow>Total outstanding</Eyebrow>
              <Pill label="↑ 4.2% this week" tone="info" />
            </View>
            <Money amount={284_530.25} size="lg" style={{ marginTop: space.sm }} />
            <View style={styles.heroSplit}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatVal}>128</Text>
                <Text style={styles.metaLo}>active loans</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, { color: palette.success }]}>€12,480</Text>
                <Text style={styles.metaLo}>collected today</Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatVal, { color: palette.danger }]}>9</Text>
                <Text style={styles.metaLo}>overdue</Text>
              </View>
            </View>
          </GlassCard>

          {/* KPI grid */}
          <View style={styles.kpiRow}>
            <GlassCard style={styles.kpi} padded>
              <Eyebrow>Collection rate</Eyebrow>
              <Text style={styles.kpiVal}>94.1%</Text>
            </GlassCard>
            <GlassCard style={styles.kpi} padded>
              <Eyebrow>Avg. days late</Eyebrow>
              <Text style={styles.kpiVal}>2.3</Text>
            </GlassCard>
          </View>

          {/* Client list */}
          <View style={styles.listHead}>
            <Eyebrow>Recent activity</Eyebrow>
            <Text style={styles.viewAll}>View all</Text>
          </View>

          <GlassCard padded={false} style={{ marginTop: space.md }}>
            {CLIENTS.map((c, i) => (
              <Pressable
                key={c.name}
                style={[styles.clientRow, i < CLIENTS.length - 1 && styles.clientDivider]}
              >
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientInitials}>
                    {c.name.split(' ').map((n) => n[0]).join('')}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{c.name}</Text>
                  <Money amount={c.amount} size="sm" style={styles.clientAmount} />
                </View>
                <Pill label={c.status} tone={c.tone} />
              </Pressable>
            ))}
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h1: { ...type.h1, color: palette.textHi, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.ink500,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.bodyStrong, color: palette.cyan },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLo: { ...type.caption, color: palette.textLo, marginTop: 2 },

  heroSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: palette.glassStroke,
  },
  heroStat: { flex: 1 },
  heroStatVal: { ...type.h3, color: palette.textHi, fontVariant: ['tabular-nums'] },
  heroDivider: { width: 1, height: 32, backgroundColor: palette.glassStroke },

  kpiRow: { flexDirection: 'row', gap: space.lg, marginTop: space.lg },
  kpi: { flex: 1 },
  kpiVal: { ...type.h1, color: palette.textHi, marginTop: 6, fontVariant: ['tabular-nums'] },

  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xxl,
  },
  viewAll: { ...type.caption, color: palette.cyan },

  clientRow: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.md },
  clientDivider: { borderBottomWidth: 1, borderBottomColor: palette.glassStroke },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.ink600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientInitials: { ...type.caption, color: palette.textMd, fontWeight: '600' },
  clientName: { ...type.bodyStrong, color: palette.textHi },
  clientAmount: { marginTop: 2, color: palette.textMd, fontSize: 14 },
});
