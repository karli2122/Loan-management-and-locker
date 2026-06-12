import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NeonButton, Money, Eyebrow } from '../../src/theme/components';
import { palette, space, radius, type } from '../../src/theme/tokens';

/**
 * REFERENCE SCREEN — In-app lock screen, "Midnight" design system.
 *
 * This is the React/JS lock surface shown inside the app (the native overlay in
 * EMIOverlayService.kt is the OS-level enforcement layer and is intentionally
 * separate). Keep the emergency-call affordance prominent and legible; the rest
 * is calm and unambiguous about WHY the device is locked and HOW to resolve it.
 */

type Props = {
  amountDue?: number;
  lockMessage?: string;
  onEmergencyCall?: () => void;
  onPay?: () => void;
};

export default function LockScreenReference({
  amountDue = 215.0,
  lockMessage = 'Your payment is overdue. Clear the balance below to unlock your device.',
  onEmergencyCall = () => {},
  onPay = () => {},
}: Props) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0B1527', '#05090F']}
        style={StyleSheet.absoluteFill}
      />
      {/* ambient glow */}
      <LinearGradient
        colors={['rgba(251,113,133,0.16)', 'rgba(11,21,39,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {/* lock emblem */}
          <View style={styles.emblem}>
            <LinearGradient
              colors={[palette.danger, palette.dangerDim]}
              style={styles.emblemRing}
            >
              <View style={styles.emblemInner}>
                <Text style={styles.emblemGlyph}>🔒</Text>
              </View>
            </LinearGradient>
          </View>

          <Text style={styles.title}>Device locked</Text>
          <Text style={styles.message}>{lockMessage}</Text>

          {/* amount due */}
          <View style={styles.dueBlock}>
            <Eyebrow>Amount to unlock</Eyebrow>
            <Money amount={amountDue} size="lg" style={{ marginTop: space.sm }} />
          </View>
        </View>

        {/* actions pinned to bottom */}
        <View style={styles.actions}>
          <NeonButton label="Pay to unlock" onPress={onPay} />
          <NeonButton
            label="Emergency call 112"
            variant="ghost"
            onPress={onEmergencyCall}
            style={{ marginTop: space.md, borderColor: 'rgba(251,113,133,0.5)' }}
          />
          <Text style={styles.footnote}>
            PayLock protection is active. Contact your lender if you believe this is an error.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05090F' },
  safe: { flex: 1, paddingHorizontal: space.xxl, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emblem: { marginBottom: space.xxl },
  emblemRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: palette.ink700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemGlyph: { fontSize: 44 },

  title: { ...type.display, color: palette.textHi, textAlign: 'center' },
  message: {
    ...type.body,
    color: palette.textMd,
    textAlign: 'center',
    marginTop: space.md,
    maxWidth: 320,
  },

  dueBlock: {
    alignItems: 'center',
    marginTop: space.xxxl,
    paddingVertical: space.xl,
    paddingHorizontal: space.xxxl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
  },

  actions: { paddingBottom: space.xl },
  footnote: {
    ...type.caption,
    color: palette.textLo,
    textAlign: 'center',
    marginTop: space.lg,
  },
});
