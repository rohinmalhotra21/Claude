import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../lib/theme';

// --- Layout ----------------------------------------------------------------

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={typography.heading}>{children}</Text>
      {action}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

// --- Feedback --------------------------------------------------------------

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={[typography.caption, { marginTop: spacing.sm }]}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[typography.subheading, { color: colors.textMuted }]}>{title}</Text>
      {hint ? (
        <Text style={[typography.caption, { textAlign: 'center', marginTop: spacing.xs }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={{ color: colors.danger, fontSize: 13 }}>{message}</Text>
    </View>
  );
}

// --- Controls --------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        (pressed || isDisabled) && { opacity: isDisabled ? 0.45 : 0.7 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? colors.bg : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && { color: colors.bg },
            variant === 'danger' && { color: colors.danger },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  suffix,
  ...props
}: TextInputProps & { label: string; suffix?: string }) {
  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.textFaint}
          {...props}
          style={[styles.input, props.style]}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

/** Horizontally scrolling single-choice chips. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  color = colors.accent,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  color?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              selected && { backgroundColor: color, borderColor: color },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                selected && { color: colors.bg, fontWeight: '700' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A labelled number, used across every dashboard. */
export function Metric({
  label,
  value,
  unit,
  color = colors.text,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={typography.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.metricRow}>
        <Text style={[typography.metric, { color }]}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Horizontal progress bar, clamped so overshoot doesn't overflow the track. */
export function ProgressBar({
  value,
  target,
  color = colors.accent,
}: {
  value: number;
  target: number | null;
  color?: string;
}) {
  if (!target || target <= 0) return null;
  const ratio = Math.min(value / target, 1);
  const over = value > target * 1.05;

  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${ratio * 100}%`, backgroundColor: over ? colors.warning : color },
        ]}
      />
    </View>
  );
}

export function Tag({ label, color = colors.accent }: { label: string; color?: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorBanner: {
    backgroundColor: 'rgba(247,118,142,0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  field: { marginBottom: spacing.md, gap: spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    // Without this a flex child refuses to shrink below its intrinsic width on
    // web, pushing the unit suffix outside the card.
    minWidth: 0,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    minHeight: 46,
  },
  suffix: { color: colors.textMuted, fontSize: 14, minWidth: 28 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  metricUnit: { color: colors.textMuted, fontSize: 13 },
  progressTrack: {
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontWeight: '700' },
});
