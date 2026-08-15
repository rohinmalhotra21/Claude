import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth';
import { useApi } from '../../src/lib/useApi';
import { formatShortDate, num } from '../../src/lib/date';
import { colors, radius, spacing, typography } from '../../src/lib/theme';
import { EmptyState, ErrorBanner, Loading, Tag } from '../../src/components/ui';
import { ClientBanner, NoClientSelected } from '../../src/components/ClientBanner';
import type { WorkoutSessionSummary } from '../../src/types';

export default function WorkoutsScreen() {
  const { user, clientId } = useAuth();
  const router = useRouter();

  const isTrainer = user?.role === 'trainer';
  const ready = !isTrainer || Boolean(clientId);

  const { data, error, loading, refreshing, refresh } = useApi<{
    sessions: WorkoutSessionSummary[];
  }>('/api/workouts', { clientId, limit: 60 }, { enabled: ready });

  const sessions = data?.sessions ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={typography.title}>Workouts</Text>
        <Pressable
          onPress={() => router.push('/workout-editor')}
          disabled={!ready}
          style={({ pressed }) => [
            styles.addButton,
            (pressed || !ready) && { opacity: ready ? 0.7 : 0.4 },
          ]}
        >
          <Ionicons name="add" size={24} color={colors.bg} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <ClientBanner />

        {!ready ? (
          <NoClientSelected />
        ) : loading ? (
          <Loading />
        ) : (
          <>
            <ErrorBanner message={error} />
            <FlatList
              data={sessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: spacing.xxl, gap: spacing.md }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={refresh}
                  tintColor={colors.accent}
                />
              }
              ListEmptyComponent={
                <EmptyState
                  title="No workouts logged yet"
                  hint="Tap + to record the first session."
                />
              }
              renderItem={({ item }) => <SessionRow session={item} />}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function SessionRow({ session }: { session: WorkoutSessionSummary }) {
  const advanced = Number(session.advanced_sets);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={typography.subheading} numberOfLines={1}>
            {session.title ?? 'Workout'}
          </Text>
          <Text style={typography.caption}>
            {formatShortDate(session.performed_on)}
            {session.duration_min ? ` · ${session.duration_min} min` : ''}
          </Text>
        </View>
        {advanced > 0 ? <Tag label={`${advanced} advanced`} color={colors.workouts} /> : null}
      </View>

      <View style={styles.statRow}>
        <Stat label="Sets" value={num(session.total_sets)} />
        <Stat label="Exercises" value={num(session.exercises_performed)} />
        <Stat label="Volume" value={`${num(session.total_volume_kg)} kg`} />
        <Stat label="Avg RPE" value={num(session.avg_rpe, 1)} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, { fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
});
