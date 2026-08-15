import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors, radius, spacing, typography } from '../lib/theme';

/**
 * Shown to trainers on every module screen: which client am I logging for?
 * Renders nothing for clients, who only ever see their own data.
 */
export function ClientBanner() {
  const { user, activeClient } = useAuth();
  const router = useRouter();

  if (user?.role !== 'trainer') return null;

  return (
    <Pressable
      onPress={() => router.push('/clients')}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={typography.caption}>
          {activeClient ? 'Logging for' : 'No client selected'}
        </Text>
        <Text style={typography.subheading}>
          {activeClient?.full_name ?? 'Tap to choose a client'}
        </Text>
      </View>
      <Text style={styles.switch}>Switch</Text>
    </Pressable>
  );
}

/** Placeholder for module screens when a trainer hasn't picked a client yet. */
export function NoClientSelected() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/clients')} style={styles.empty}>
      <Text style={[typography.subheading, { color: colors.textMuted }]}>
        Pick a client to get started
      </Text>
      <Text style={[typography.caption, { marginTop: spacing.xs }]}>
        Tap here to open your roster
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  switch: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
});
