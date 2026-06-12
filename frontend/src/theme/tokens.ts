/**
 * Design tokens — PayLock "Midnight" system.
 *
 * Direction: premium dark fintech. Deep-navy base, glassy translucent surfaces,
 * a restrained neon accent (electric cyan → indigo). Numbers are the hero of a
 * lending app, so the scale includes tabular/mono treatment for money.
 *
 * These tokens are the single source of truth. Components consume them; screens
 * consume components. Avoid hard-coded hex in screens.
 */

export const palette = {
  // Base — layered navy, darkest at the back
  ink900: '#05090F', // app background, deepest
  ink800: '#070D1B',
  ink700: '#0B1527', // canvas
  ink600: '#101C33', // raised surface
  ink500: '#16243F', // card
  ink400: '#1E3050', // hairline / alt surface
  ink300: '#2A3F66', // strong border

  // Glass — translucent fills for blur surfaces (use over ink700+)
  glassFill: 'rgba(22, 36, 63, 0.55)',
  glassStroke: 'rgba(120, 156, 198, 0.18)',
  glassHighlight: 'rgba(255, 255, 255, 0.04)',

  // Neon accent — used with restraint (one accent per view)
  cyan: '#22D3EE',
  cyanDim: '#0E7490',
  indigo: '#6366F1',
  indigoDim: '#4338CA',
  // Gradient stops for the signature neon edge/CTA
  accentFrom: '#22D3EE',
  accentTo: '#6366F1',

  // Text
  textHi: '#F4F8FF', // headings / primary
  textMd: '#B6C7E2', // body / secondary
  textLo: '#7A93B8', // muted / captions
  textDisabled: '#48597A',

  // Semantic
  success: '#34D399',
  successDim: '#065F46',
  warning: '#FBBF24',
  warningDim: '#92400E',
  danger: '#FB7185',
  dangerDim: '#9F1239',
  info: '#38BDF8',

  // Status tints (translucent for pill backgrounds)
  successFill: 'rgba(52, 211, 153, 0.14)',
  warningFill: 'rgba(251, 191, 36, 0.14)',
  dangerFill: 'rgba(251, 113, 133, 0.14)',
  infoFill: 'rgba(56, 189, 248, 0.14)',

  white: '#FFFFFF',
  black: '#000000',
} as const;

// Spacing — 4pt base scale
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

// Radii — soft, modern
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

// Typography scale. fontFamily left undefined -> platform default; set a custom
// display face here once bundled (e.g. 'Geist', 'Inter'). Money uses tabular.
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.2 },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const, letterSpacing: 0.4 },
  // Money — large balance readout, tabular figures
  money: { fontSize: 40, lineHeight: 46, fontWeight: '700' as const, letterSpacing: -1, fontVariant: ['tabular-nums'] as const },
  moneySm: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, fontVariant: ['tabular-nums'] as const },
} as const;

// Elevation — soft neon-tinted shadows
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  neon: {
    shadowColor: palette.cyan,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
} as const;

export const gradients = {
  accent: [palette.accentFrom, palette.accentTo] as const,
  accentDim: [palette.cyanDim, palette.indigoDim] as const,
  surface: ['rgba(34,211,238,0.06)', 'rgba(99,102,241,0.02)'] as const,
  danger: ['#FB7185', '#9F1239'] as const,
  success: ['#34D399', '#065F46'] as const,
};

export const tokens = { palette, space, radius, type, shadow, gradients };
export default tokens;
