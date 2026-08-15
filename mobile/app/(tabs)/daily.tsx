import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/lib/auth';
import { useApi } from '../../src/lib/useApi';
import { num, toISODate } from '../../src/lib/date';
import { colors, spacing, typography } from '../../src/lib/theme';
import {
  Button,
  Card,
  ChipGroup,
  Divider,
  ErrorBanner,
  Field,
  Loading,
  SectionTitle,
} from '../../src/components/ui';
import { LineChart } from '../../src/components/charts';
import { DateStepper } from '../../src/components/DateStepper';
import { ClientBanner, NoClientSelected } from '../../src/components/ClientBanner';
import type { DailyLog } from '../../src/types';

/** Sites offered by default; the API accepts any label. */
const SITES: { key: string; label: string }[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'chest', label: 'Chest' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'left_bicep', label: 'L Bicep' },
  { key: 'right_bicep', label: 'R Bicep' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'left_thigh', label: 'L Thigh' },
  { key: 'right_thigh', label: 'R Thigh' },
  { key: 'left_calf', label: 'L Calf' },
  { key: 'right_calf', label: 'R Calf' },
];

const RATING_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

type FormState = Record<string, string>;

export default function DailyLogScreen() {
  const { user, clientId } = useAuth();
  const [date, setDate] = useState(toISODate());
  const [form, setForm] = useState<FormState>({});
  const [measurements, setMeasurements] = useState<FormState>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isTrainer = user?.role === 'trainer';
  const ready = !isTrainer || Boolean(clientId);

  const { data, loading, refreshing, refresh, reload } = useApi<{
    log: DailyLog | null;
    measurements: Record<string, number>;
  }>(`/api/daily-log/${date}`, { clientId }, { enabled: ready });

  const history = useApi<{ logs: { logged_on: string; weight_kg: string | null; weight_kg_7d_avg: string | null }[] }>(
    '/api/daily-log',
    { clientId, limit: 60 },
    { enabled: ready },
  );

  // Load the saved values into the form whenever the day changes.
  useEffect(() => {
    if (!data) return;
    const log = data.log;
    setForm({
      weightKg: log?.weight_kg ?? '',
      bodyFatPct: log?.body_fat_pct ?? '',
      sleepHours: log?.sleep_hours ?? '',
      steps: log?.steps == null ? '' : String(log.steps),
      restingHr: log?.resting_hr == null ? '' : String(log.resting_hr),
      waterMl: log?.water_ml == null ? '' : String(log.water_ml),
      mood: log?.mood == null ? '' : String(log.mood),
      energy: log?.energy == null ? '' : String(log.energy),
      soreness: log?.soreness == null ? '' : String(log.soreness),
      notes: log?.notes ?? '',
    });
    setMeasurements(
      Object.fromEntries(Object.entries(data.measurements).map(([k, v]) => [k, String(v)])),
    );
    setSaved(false);
  }, [data]);

  const update = (key: string) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** '' means "not recorded" and must be sent as null, not 0. */
  const toNumber = (value: string | undefined): number | null => {
    if (value === undefined || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const parsedMeasurements: Record<string, number> = {};
      for (const [site, value] of Object.entries(measurements)) {
        const parsed = toNumber(value);
        if (parsed !== null && parsed > 0) parsedMeasurements[site] = parsed;
      }

      await api('/api/daily-log', {
        method: 'PUT',
        body: {
          clientId,
          loggedOn: date,
          weightKg: toNumber(form.weightKg),
          bodyFatPct: toNumber(form.bodyFatPct),
          sleepHours: toNumber(form.sleepHours),
          steps: toNumber(form.steps),
          restingHr: toNumber(form.restingHr),
          waterMl: toNumber(form.waterMl),
          mood: toNumber(form.mood),
          energy: toNumber(form.energy),
          soreness: toNumber(form.soreness),
          notes: form.notes?.trim() || null,
          measurements: parsedMeasurements,
        },
      });
      setSaved(true);
      await Promise.all([reload(), history.reload()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const weightSeries = (history.data?.logs ?? [])
    .filter((row) => row.weight_kg !== null)
    .slice()
    .reverse();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Text style={[typography.title, { marginBottom: spacing.md }]}>Daily Log</Text>

        <ClientBanner />

        {!ready ? (
          <NoClientSelected />
        ) : (
          <>
            <DateStepper date={date} onChange={setDate} />
            <ErrorBanner message={error} />

            {loading ? (
              <Loading />
            ) : (
              <>
                {weightSeries.length > 1 ? (
                  <Card style={{ marginBottom: spacing.lg }}>
                    <SectionTitle>Weight</SectionTitle>
                    <LineChart
                      points={weightSeries.map((row) => ({
                        x: row.logged_on,
                        y: Number(row.weight_kg),
                      }))}
                      trend={weightSeries.map((row) =>
                        row.weight_kg_7d_avg === null ? null : Number(row.weight_kg_7d_avg),
                      )}
                      color={colors.dailyLog}
                      unit="kg"
                    />
                  </Card>
                ) : null}

                <Card style={{ marginBottom: spacing.lg }}>
                  <SectionTitle>Body</SectionTitle>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Weight"
                        value={form.weightKg ?? ''}
                        onChangeText={update('weightKg')}
                        keyboardType="decimal-pad"
                        suffix="kg"
                        placeholder="—"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Body fat"
                        value={form.bodyFatPct ?? ''}
                        onChangeText={update('bodyFatPct')}
                        keyboardType="decimal-pad"
                        suffix="%"
                        placeholder="—"
                      />
                    </View>
                  </View>
                </Card>

                <Card style={{ marginBottom: spacing.lg }}>
                  <SectionTitle>Measurements</SectionTitle>
                  <Text style={[typography.caption, { marginBottom: spacing.md }]}>
                    Leave blank to skip. Most coaches take these weekly.
                  </Text>
                  <View style={styles.measurementGrid}>
                    {SITES.map((site) => (
                      <View key={site.key} style={styles.measurementCell}>
                        <Field
                          label={site.label}
                          value={measurements[site.key] ?? ''}
                          onChangeText={(value) =>
                            setMeasurements((prev) => ({ ...prev, [site.key]: value }))
                          }
                          keyboardType="decimal-pad"
                          placeholder="—"
                          suffix="cm"
                        />
                      </View>
                    ))}
                  </View>
                </Card>

                <Card style={{ marginBottom: spacing.lg }}>
                  <SectionTitle>Lifestyle</SectionTitle>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Sleep"
                        value={form.sleepHours ?? ''}
                        onChangeText={update('sleepHours')}
                        keyboardType="decimal-pad"
                        suffix="h"
                        placeholder="—"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Steps"
                        value={form.steps ?? ''}
                        onChangeText={update('steps')}
                        keyboardType="number-pad"
                        placeholder="—"
                      />
                    </View>
                  </View>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Resting HR"
                        value={form.restingHr ?? ''}
                        onChangeText={update('restingHr')}
                        keyboardType="number-pad"
                        suffix="bpm"
                        placeholder="—"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Water"
                        value={form.waterMl ?? ''}
                        onChangeText={update('waterMl')}
                        keyboardType="number-pad"
                        suffix="ml"
                        placeholder="—"
                      />
                    </View>
                  </View>

                  <Divider />

                  {(['mood', 'energy', 'soreness'] as const).map((key) => (
                    <View key={key} style={{ marginBottom: spacing.md }}>
                      <Text style={[typography.label, { textTransform: 'capitalize' }]}>{key}</Text>
                      <ChipGroup
                        options={RATING_OPTIONS}
                        value={form[key] ?? ''}
                        onChange={update(key)}
                        color={colors.dailyLog}
                      />
                    </View>
                  ))}

                  <Field
                    label="Notes"
                    value={form.notes ?? ''}
                    onChangeText={update('notes')}
                    placeholder="How did the day go?"
                    multiline
                    style={{ minHeight: 80, textAlignVertical: 'top' }}
                  />
                </Card>

                <Button
                  title={saved ? 'Saved ✓' : 'Save daily log'}
                  onPress={save}
                  loading={saving}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md },
  measurementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  measurementCell: { width: '47%' },
});
