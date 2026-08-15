/**
 * A single dark palette. Gyms are dark, phones get used at 6am, and one theme
 * keeps every screen visually consistent without a light/dark branch in each
 * component.
 */
export const colors = {
  bg: '#0B0F14',
  surface: '#141A22',
  surfaceAlt: '#1C242E',
  border: '#28323E',

  text: '#F2F5F8',
  textMuted: '#8A97A6',
  textFaint: '#5A6673',

  accent: '#3DDC97',
  accentDim: '#1E6B4C',

  // One hue per module, used for icons, chart series and section accents.
  workouts: '#3DDC97',
  diet: '#FFB454',
  supplements: '#7AA2F7',
  dailyLog: '#F7768E',

  warning: '#FFB454',
  danger: '#F7768E',
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
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  subheading: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted },
  caption: { fontSize: 12, fontWeight: '400' as const, color: colors.textFaint },
  metric: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
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
