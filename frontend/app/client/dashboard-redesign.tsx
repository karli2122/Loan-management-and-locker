import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, GlassCard, NeonButton, Pill, Money, Eyebrow } from '../../src/theme/components';
import { palette, space, radius, type } from '../../src/theme/tokens';

/**
 * REFERENCE SCREEN — Client dashboard, "Midnight" design system.
 *
 * Demonstrates the premium-dark / glass / neon language end to end so the rest
 * of the client app can be migrated against it. Pure presentational sample with
 * placeholder data; wire to real status/loan data when adopting.
 */

type Props = {
  name?: string;
  outstanding?: number;
  nextEmi?: number;
  dueInDays?: number;
  paidPct?: number; // 0..100
  isLocked?: boolean;
};

export default function ClientDashboardReference({
  name = 'Karl',
  outstanding = 1840.5,
  nextEmi = 215.0,
  dueInDays = 6,
  paidPct = 62,
  isLocked = false,
}: Props) {
  const dueTone = dueInDays < 0 ? 'danger' : dueInDays <= 3 ? 'warning' : 'success';
  const dueLabel =
    dueInDays < 0
      ? `${Math.abs(dueInDays)} days overdue`
      : dueInDays === 0
      ? 'Due today'
      : `Due in ${dueInDays} days`;

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
              <Eyebrow>Welcome back</Eyebrow>
              <Text style={styles.name}>{name}</Text>
            </View>
            <Pill
              label={isLocked ? 'Device locked' : 'Active'}
              tone={isLocked ? 'danger' : 'success'}
            />
          </View>

          {/* Hero balance card — the signature element */}
          <GlassCard glow style={{ marginTop: space.xl }}>
            <Eyebrow>Outstanding balance</Eyebrow>
            <Money amount={outstanding} size="lg" style={{ marginTop: space.sm }} />

            {/* progress */}
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[palette.cyan, palette.indigo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.min(100, paidPct)}%` }]}
              />
            </View>
            <View style={styles.progressMeta}>
              <Text style={styles.metaLo}>{paidPct}% repaid</Text>
              <Text style={styles.metaLo}>{100 - paidPct}% remaining</Text>
            </View>
          </GlassCard>

          {/* Next payment */}
          <GlassCard style={{ marginTop: space.lg }}>
            <View style={styles.rowBetween}>
              <View>
                <Eyebrow>Next payment</Eyebrow>
                <Money amount={nextEmi} size="sm" style={{ marginTop: 6 }} />
              </View>
              <Pill label={dueLabel} tone={dueTone as any} />
            </View>
            <NeonButton label="Pay now" onPress={() => {}} style={{ marginTop: space.xl }} />
          </GlassCard>

          {/* Quick stats */}
          <View style={styles.statRow}>
            <GlassCard style={styles.statCard} padded>
              <Eyebrow>This month</Eyebrow>
              <Money amount={nextEmi} size="sm" style={{ marginTop: 6 }} />
              <Text style={styles.metaLo}>scheduled</Text>
            </GlassCard>
            <GlassCard style={styles.statCard} padded>
              <Eyebrow>Credit score</Eyebrow>
              <Text style={styles.statBig}>712</Text>
              <Text style={[styles.metaLo, { color: palette.success }]}>+5 on-time</Text>
            </GlassCard>
          </View>

          {/* Support row */}
          <Pressable style={styles.supportRow}>
            <Text style={styles.supportText}>Need help? Contact your lender</Text>
            <Text style={styles.supportArrow}>→</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { ...type.h1, color: palette.textHi, marginTop: 2 },

  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.ink400,
    marginTop: space.xl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  metaLo: { ...type.caption, color: palette.textLo },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  statRow: { flexDirection: 'row', gap: space.lg, marginTop: space.lg },
  statCard: { flex: 1 },
  statBig: { ...type.h1, color: palette.textHi, marginTop: 6, fontVariant: ['tabular-nums'] },

  supportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xxl,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassStroke,
  },
  supportText: { ...type.body, color: palette.textMd },
  supportArrow: { ...type.h3, color: palette.cyan },
});
