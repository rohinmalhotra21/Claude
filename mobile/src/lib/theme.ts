/**
 * Train With Rohin — visual identity.
 *
 * Taken from the logo: pure black ground, a gold gradient, and white. The app
 * commits to a single dark theme rather than offering light mode; the brand is
 * black-grounded, and a light variant would be a different identity.
 *
 * The four module hues were validated as a categorical set against the app's
 * surface for lightness, chroma, colour-blind separation and contrast. Brand
 * gold deliberately sits brighter than a strict chart-series band would allow —
 * it is the identity colour and every chart here is single-series, so nothing
 * relies on it being weight-matched to another hue.
 */

export const colors = {
  // Grounds. Warm-biased near-blacks, so they sit under gold without going blue.
  bg: '#000000',
  surface: '#0E0D0B',
  surfaceAlt: '#1A1815',
  border: '#2B2723',

  text: '#FFFFFF',
  textMuted: '#A79E92',
  textFaint: '#6E6659',

  // Gold ramp, sampled from the logo's gradient.
  goldBright: '#F0D68A',
  accent: '#D9A93C',
  goldDeep: '#95690F',

  // One hue per module, used one at a time and always beside a text label.
  workouts: '#D9A93C',
  diet: '#38A77E',
  supplements: '#6288DD',
  dailyLog: '#DA5A72',

  warning: '#E0A33A',
  danger: '#DA5A72',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textFaint },
  metric: { fontSize: 26, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.6 },
} as const;

/** Human labels for the advanced-technique enum used across the workout UI. */
export const TECHNIQUE_LABELS: Record<string, string> = {
  straight: 'Straight set',
  warmup: 'Warm-up',
  drop_set: 'Drop set',
  superset: 'Superset',
  giant_set: 'Giant set',
  rest_pause: 'Rest-pause',
  myo_reps: 'Myo-reps',
  cluster: 'Cluster set',
  amrap: 'AMRAP',
  negative: 'Negatives',
  partial: 'Partials',
};

/** Techniques whose sets link together and therefore need a group. */
export const GROUPED_TECHNIQUES = [
  'drop_set',
  'superset',
  'giant_set',
  'rest_pause',
  'myo_reps',
  'cluster',
];
