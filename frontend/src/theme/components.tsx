import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { palette, space, radius, type, shadow, gradients } from './tokens';

/* ------------------------------------------------------------------ Screen */
/**
 * Full-screen container with the layered navy background and an ambient neon
 * wash at the top. Wrap every redesigned screen in this.
 */
export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screen, style]}>
      <LinearGradient
        colors={['rgba(34,211,238,0.10)', 'rgba(11,21,39,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/* --------------------------------------------------------------- GlassCard */
/**
 * The signature element: a translucent, blurred card with a hairline stroke and
 * a faint neon top-edge. `glow` adds a cyan halo for emphasis (use sparingly).
 */
export function GlassCard({
  children,
  style,
  glow = false,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  padded?: boolean;
}) {
  return (
    <View style={[styles.cardWrap, glow && shadow.neon, !glow && shadow.card, style]}>
      <BlurView intensity={24} tint="dark" style={styles.cardBlur}>
        {/* neon top edge */}
        <LinearGradient
          colors={[palette.cyan, palette.indigo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardEdge}
        />
        <View style={[padded && styles.cardInner]}>{children}</View>
      </BlurView>
    </View>
  );
}

/* -------------------------------------------------------------- NeonButton */
type ButtonVariant = 'primary' | 'ghost' | 'danger';

export function NeonButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const content = (
    <View style={styles.btnRow}>
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? palette.cyan : palette.white} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.btnLabel,
              variant === 'ghost' && { color: palette.cyan },
              variant === 'danger' && { color: palette.white },
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.btnBase,
          styles.btnGhost,
          pressed && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {content}
      </Pressable>
    );
  }

  const colors =
    variant === 'danger' ? gradients.danger : ([palette.cyan, palette.indigo] as const);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [pressed && styles.pressed, isDisabled && styles.disabled, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.btnBase, variant === 'primary' && shadow.neon]}
      >
        {content}
      </LinearGradient>
    </Pressable>
  );
}

/* --------------------------------------------------------------------- Pill */
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const toneMap: Record<Tone, { fill: string; text: string }> = {
  success: { fill: palette.successFill, text: palette.success },
  warning: { fill: palette.warningFill, text: palette.warning },
  danger: { fill: palette.dangerFill, text: palette.danger },
  info: { fill: palette.infoFill, text: palette.info },
  neutral: { fill: 'rgba(122,147,184,0.14)', text: palette.textMd },
};

export function Pill({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const c = toneMap[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.fill }, style]}>
      <View style={[styles.pillDot, { backgroundColor: c.text }]} />
      <Text style={[styles.pillText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------- Money */
/**
 * Formatted monetary readout with tabular figures. `size="lg"` is the hero
 * balance; default is inline.
 */
export function Money({
  amount,
  currency = '€',
  size = 'sm',
  style,
}: {
  amount: number;
  currency?: string;
  size?: 'lg' | 'sm';
  style?: StyleProp<TextStyle>;
}) {
  const formatted = (amount ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <Text style={[size === 'lg' ? styles.moneyLg : styles.moneySm, style]}>
      <Text style={styles.moneyCurrency}>{currency}</Text>
      {formatted}
    </Text>
  );
}

/* ------------------------------------------------------------------- Labels */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.eyebrow, style]}>{String(children).toUpperCase()}</Text>;
}

/* ------------------------------------------------------------------- styles */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ink800 },

  cardWrap: { borderRadius: radius.xl, overflow: 'hidden' },
  cardBlur: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.glassStroke,
    backgroundColor: palette.glassFill,
    overflow: 'hidden',
  },
  cardEdge: { height: 2, width: '100%', opacity: 0.9 },
  cardInner: { padding: space.xl },

  btnBase: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.glassStroke,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btnLabel: { ...type.bodyStrong, color: palette.white },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    gap: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...type.micro },

  moneyLg: { ...type.money, color: palette.textHi },
  moneySm: { ...type.moneySm, color: palette.textHi },
  moneyCurrency: { color: palette.textLo, fontWeight: '600' },

  eyebrow: { ...type.micro, color: palette.cyan, letterSpacing: 1.5 },
});

export default { Screen, GlassCard, NeonButton, Pill, Money, Eyebrow };
