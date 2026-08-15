import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { addDays, formatDayLabel, toISODate } from '../lib/date';
import { colors, radius, spacing, typography } from '../lib/theme';

/**
 * Day navigator shared by every date-scoped module. Stepping past today is
 * blocked — you can't log food you haven't eaten.
 */
export function DateStepper({
  date,
  onChange,
  allowFuture = false,
}: {
  date: string;
  onChange: (date: string) => void;
  allowFuture?: boolean;
}) {
  const atToday = date >= toISODate();
  const canGoForward = allowFuture || !atToday;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onChange(addDays(date, -1))}
        style={({ pressed }) => [styles.arrow, pressed && { opacity: 0.5 }]}
        hitSlop={8}
      >
        <Text style={styles.arrowText}>‹</Text>
      </Pressable>

      <Pressable onPress={() => onChange(toISODate())} style={styles.label}>
        <Text style={typography.subheading}>{formatDayLabel(date)}</Text>
        {!atToday ? <Text style={typography.caption}>tap for today</Text> : null}
      </Pressable>

      <Pressable
        onPress={() => canGoForward && onChange(addDays(date, 1))}
        disabled={!canGoForward}
        style={({ pressed }) => [
          styles.arrow,
          (pressed || !canGoForward) && { opacity: canGoForward ? 0.5 : 0.25 },
        ]}
        hitSlop={8}
      >
        <Text style={styles.arrowText}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  arrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { color: colors.text, fontSize: 26, lineHeight: 30 },
  label: { alignItems: 'center', flex: 1 },
});
