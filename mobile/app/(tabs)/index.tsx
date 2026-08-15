import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/lib/auth';
import { useApi } from '../../src/lib/useApi';
import { num } from '../../src/lib/date';
import { colors, radius, spacing, typography, TECHNIQUE_LABELS } from '../../src/lib/theme';
import { Card, ErrorBanner, Loading, Metric, SectionTitle, Tag } from '../../src/components/ui';
import { BarList, ColumnChart, LineChart } from '../../src/components/charts';
import { ClientBanner, NoClientSelected } from '../../src/components/ClientBanner';
import { Monogram } from '../../src/brand/BrandLogo';
import type { Overview } from '../../src/types';

export default function HomeScreen() {
  const { user, clientId, activeClient, logout } = useAuth();
  const router = useRouter();

  const isTrainer = user?.role === 'trainer';
  const ready = !isTrainer || Boolean(clientId);

  const { data, error, loading, refreshing, refresh } = useApi<Overview>(
    '/api/analytics/overview',
    { days: 30, clientId },
    { enabled: ready },
  );

  const headline = data?.headline;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <View style={styles.header}>
          <Monogram size={52} />
          <View style={{ flex: 1 }}>
            <Text style={typography.label}>
              {isTrainer ? 'COACH' : 'WELCOME BACK'}
            </Text>
            <Text style={typography.title} numberOfLines={1}>
              {user?.fullName ?? ''}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {isTrainer ? (
              <Pressable onPress={() => router.push('/clients')} hitSlop={8} style={styles.iconButton}>
                <Ionicons name="people" size={22} color={colors.text} />
              </Pressable>
            ) : null}
            <Pressable onPress={() => void logout()} hitSlop={8} style={styles.iconButton}>
              <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <ClientBanner />

        {!ready ? (
          <NoClientSelected />
        ) : loading ? (
          <Loading />
        ) : (
          <>
            <ErrorBanner message={error} />

            <Text style={[typography.label, { marginBottom: spacing.sm }]}>LAST 30 DAYS</Text>

            <Card style={{ marginBottom: spacing.lg }}>
              <View style={styles.metricRow}>
                <Metric
                  label="Sessions"
                  value={num(headline?.sessions)}
                  color={colors.workouts}
                />
                <Metric
                  label="Volume"
                  value={num(Number(headline?.total_volume_kg ?? 0) / 1000, 1)}
                  unit="t"
                  color={colors.workouts}
                />
              </View>
              <View style={[styles.metricRow, { marginTop: spacing.lg }]}>
                <Metric
                  label="Avg calories"
                  value={num(headline?.avg_kcal)}
                  color={colors.diet}
                />
                <Metric
                  label="Avg protein"
                  value={num(headline?.avg_protein_g)}
                  unit="g"
                  color={colors.diet}
                />
              </View>
              <View style={[styles.metricRow, { marginTop: spacing.lg }]}>
                <Metric
                  label="Supplement adherence"
                  value={num(headline?.supp_adherence_pct, 1)}
                  unit="%"
                  color={colors.supplements}
                />
                <Metric
                  label="Latest weight"
                  value={num(
                    data?.weightTrend[data.weightTrend.length - 1]?.weight_kg,
                    1,
                  )}
                  unit="kg"
                  color={colors.dailyLog}
                />
              </View>
            </Card>

            <Card style={{ marginBottom: spacing.lg }}>
              <SectionTitle>Weight trend</SectionTitle>
              <LineChart
                points={(data?.weightTrend ?? []).map((row) => ({
                  x: row.date_key,
                  y: Number(row.weight_kg),
                }))}
                trend={(data?.weightTrend ?? []).map((row) =>
                  row.weight_kg_7d_avg === null ? null : Number(row.weight_kg_7d_avg),
                )}
                color={colors.dailyLog}
                unit="kg"
              />
              <Text style={[typography.caption, { marginTop: spacing.sm }]}>
                Faint line is daily scale weight; solid line is the 7-day average.
              </Text>
            </Card>

            <Card style={{ marginBottom: spacing.lg }}>
              <SectionTitle>Weekly training volume</SectionTitle>
              <ColumnChart
                items={(data?.volumeByWeek ?? []).map((row) => ({
                  label: row.week_start.slice(5, 10),
                  value: Number(row.volume_kg),
                }))}
                color={colors.workouts}
              />
            </Card>

            <Card style={{ marginBottom: spacing.lg }}>
              <SectionTitle>Volume by muscle group</SectionTitle>
              <BarList
                items={(data?.muscleSplit ?? []).slice(0, 6).map((row) => ({
                  label: row.muscle_group,
                  value: Number(row.volume_kg),
                }))}
                color={colors.workouts}
                unit=" kg"
              />
            </Card>

            <Card style={{ marginBottom: spacing.lg }}>
              <SectionTitle>Calories vs target</SectionTitle>
              <LineChart
                points={(data?.nutritionTrend ?? []).map((row) => ({
                  x: row.date_key,
                  y: Number(row.kcal),
                }))}
                trend={(data?.nutritionTrend ?? []).map((row) =>
                  row.target_kcal === null ? null : Number(row.target_kcal),
                )}
                color={colors.diet}
              />
            </Card>

            {(data?.techniqueMix ?? []).length > 0 ? (
              <Card style={{ marginBottom: spacing.lg }}>
                <SectionTitle>Advanced techniques used</SectionTitle>
                <View style={styles.tagRow}>
                  {data!.techniqueMix.map((row) => (
                    <Tag
                      key={row.technique}
                      label={`${TECHNIQUE_LABELS[row.technique] ?? row.technique} · ${row.instances}`}
                      color={colors.workouts}
                    />
                  ))}
                </View>
              </Card>
            ) : null}

            <Text style={[typography.caption, { textAlign: 'center', marginTop: spacing.sm }]}>
              {activeClient
                ? `Full history and cross-client reporting live in Power BI.`
                : `Deeper breakdowns live in your trainer's Power BI dashboard.`}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  metricRow: { flexDirection: 'row', gap: spacing.lg },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
