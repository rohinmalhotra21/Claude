import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/api/client';
import { useAuth } from '../src/lib/auth';
import { useApi } from '../src/lib/useApi';
import { toISODate } from '../src/lib/date';
import {
  colors,
  radius,
  spacing,
  typography,
  GROUPED_TECHNIQUES,
  TECHNIQUE_LABELS,
} from '../src/lib/theme';
import {
  Button,
  Card,
  ChipGroup,
  Divider,
  EmptyState,
  ErrorBanner,
  Field,
  Tag,
} from '../src/components/ui';
import type { DraftSet, Exercise, Technique } from '../src/types';

const TECHNIQUE_OPTIONS = (
  [
    'straight',
    'warmup',
    'drop_set',
    'superset',
    'giant_set',
    'rest_pause',
    'myo_reps',
    'cluster',
    'amrap',
    'negative',
    'partial',
  ] as Technique[]
).map((value) => ({ value, label: TECHNIQUE_LABELS[value]! }));

/** Group labels shown to the user: A, B, C … */
function groupLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

export default function WorkoutEditorScreen() {
  const router = useRouter();
  const { clientId } = useAuth();

  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [sets, setSets] = useState<DraftSet[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Draft row being composed.
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rpe, setRpe] = useState('');
  const [technique, setTechnique] = useState<Technique>('straight');
  const [groupKey, setGroupKey] = useState<string | null>(null);

  const { data: exerciseData } = useApi<{ exercises: Exercise[] }>('/api/exercises');
  const exercises = exerciseData?.exercises ?? [];

  const isGrouped = GROUPED_TECHNIQUES.includes(technique);

  // Existing groups of the same technique, so a new set can join one.
  const openGroups = useMemo(() => {
    const keys: string[] = [];
    for (const set of sets) {
      if (set.groupKey && set.technique === technique && !keys.includes(set.groupKey)) {
        keys.push(set.groupKey);
      }
    }
    return keys;
  }, [sets, technique]);

  const totalVolume = sets.reduce(
    (sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0),
    0,
  );

  function addSet() {
    if (!exercise) {
      setError('Pick an exercise first');
      return;
    }
    setError(null);

    const resolvedGroup = isGrouped
      ? (groupKey ?? `${technique}-${Date.now()}`)
      : undefined;

    setSets((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random()}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        weightKg: weight === '' ? null : Number(weight),
        reps: reps === '' ? null : Number(reps),
        rpe: rpe === '' ? null : Number(rpe),
        technique,
        groupKey: resolvedGroup,
      },
    ]);

    // Keep the exercise and technique so repeated sets are one tap each; the
    // group sticks too, so adding the next leg of a superset is immediate.
    if (isGrouped) setGroupKey(resolvedGroup ?? null);
    setRpe('');
  }

  function removeSet(key: string) {
    setSets((prev) => prev.filter((set) => set.key !== key));
  }

  async function save() {
    if (sets.length === 0) {
      setError('Add at least one set');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api('/api/workouts', {
        method: 'POST',
        body: {
          clientId,
          performedOn: toISODate(),
          title: title.trim() || null,
          durationMin: durationMin === '' ? null : Number(durationMin),
          sets: sets.map((set) => ({
            exerciseId: set.exerciseId,
            weightKg: set.weightKg,
            reps: set.reps,
            rpe: set.rpe,
            technique: set.technique,
            groupKey: set.groupKey,
          })),
        },
      });
      router.back();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Stable A/B/C labels in the order the groups were created.
  const groupOrder = useMemo(() => {
    const order: string[] = [];
    for (const set of sets) {
      if (set.groupKey && !order.includes(set.groupKey)) order.push(set.groupKey);
    }
    return order;
  }, [sets]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />

        <Card style={{ marginBottom: spacing.lg }}>
          <Field
            label="Session name"
            value={title}
            onChangeText={setTitle}
            placeholder="Push Day A"
          />
          <Field
            label="Duration"
            value={durationMin}
            onChangeText={setDurationMin}
            keyboardType="numeric"
            placeholder="60"
            suffix="min"
          />
        </Card>

        {/* --- Set composer --- */}
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.heading, { marginBottom: spacing.md }]}>Add a set</Text>

          <Pressable onPress={() => setPickerOpen(true)} style={styles.exercisePicker}>
            <View style={{ flex: 1 }}>
              <Text style={typography.label}>Exercise</Text>
              <Text style={[typography.body, { marginTop: 2 }]} numberOfLines={1}>
                {exercise?.name ?? 'Tap to choose'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>

          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Field
                label="Weight"
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="0"
                suffix="kg"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Reps"
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="RPE"
                value={rpe}
                onChangeText={setRpe}
                keyboardType="decimal-pad"
                placeholder="—"
              />
            </View>
          </View>

          <Text style={typography.label}>Technique</Text>
          <ChipGroup
            options={TECHNIQUE_OPTIONS}
            value={technique}
            onChange={(value) => {
              setTechnique(value);
              // Switching technique starts a fresh group.
              setGroupKey(null);
            }}
            color={colors.workouts}
          />

          {isGrouped ? (
            <View style={{ marginTop: spacing.md }}>
              <Text style={typography.label}>
                {technique === 'superset' || technique === 'giant_set'
                  ? 'Which superset does this belong to?'
                  : 'Which group does this belong to?'}
              </Text>
              <ChipGroup
                options={[
                  { value: '__new', label: '+ New group' },
                  ...openGroups.map((key) => ({
                    value: key,
                    label: `Group ${groupLabel(groupOrder.indexOf(key))}`,
                  })),
                ]}
                value={groupKey ?? '__new'}
                onChange={(value) => setGroupKey(value === '__new' ? null : value)}
                color={colors.workouts}
              />
              <Text style={[typography.caption, { marginTop: spacing.xs }]}>
                {technique === 'drop_set'
                  ? 'Add each drop as its own set in the same group.'
                  : 'Add each exercise in the round to the same group.'}
              </Text>
            </View>
          ) : null}

          <Button
            title="Add set"
            onPress={addSet}
            variant="secondary"
            style={{ marginTop: spacing.lg }}
          />
        </Card>

        {/* --- Drafted sets --- */}
        <View style={styles.listHeader}>
          <Text style={typography.heading}>
            {sets.length} {sets.length === 1 ? 'set' : 'sets'}
          </Text>
          {totalVolume > 0 ? (
            <Text style={typography.label}>{Math.round(totalVolume).toLocaleString()} kg volume</Text>
          ) : null}
        </View>

        {sets.length === 0 ? (
          <EmptyState title="Nothing added yet" hint="Build the session set by set." />
        ) : (
          sets.map((set, index) => (
            <SetRow
              key={set.key}
              set={set}
              index={index}
              groupLabel={
                set.groupKey ? groupLabel(groupOrder.indexOf(set.groupKey)) : null
              }
              onRemove={() => removeSet(set.key)}
            />
          ))
        )}

        <Button
          title="Save workout"
          onPress={save}
          loading={saving}
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>

      <ExercisePicker
        visible={pickerOpen}
        exercises={exercises}
        onClose={() => setPickerOpen(false)}
        onSelect={(selected) => {
          setExercise(selected);
          setPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function SetRow({
  set,
  index,
  groupLabel: label,
  onRemove,
}: {
  set: DraftSet;
  index: number;
  groupLabel: string | null;
  onRemove: () => void;
}) {
  const parts = [
    set.weightKg !== null ? `${set.weightKg} kg` : null,
    set.reps !== null ? `× ${set.reps}` : null,
    set.rpe !== null ? `@ RPE ${set.rpe}` : null,
  ].filter(Boolean);

  return (
    <View style={styles.setRow}>
      <Text style={styles.setIndex}>{index + 1}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { fontWeight: '600' }]} numberOfLines={1}>
          {set.exerciseName}
        </Text>
        <Text style={typography.caption}>{parts.join('  ') || 'No load recorded'}</Text>
      </View>

      {set.technique !== 'straight' ? (
        <Tag
          label={label ? `${TECHNIQUE_LABELS[set.technique]} ${label}` : TECHNIQUE_LABELS[set.technique]!}
          color={set.technique === 'warmup' ? colors.textMuted : colors.workouts}
        />
      ) : null}

      <Pressable onPress={onRemove} hitSlop={8} style={{ paddingLeft: spacing.sm }}>
        <Ionicons name="close-circle" size={22} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

function ExercisePicker({
  visible,
  exercises,
  onClose,
  onSelect,
}: {
  visible: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = exercises.filter((item) =>
    `${item.name} ${item.muscle_group}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={typography.heading}>Choose exercise</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <Field label="Search" value={search} onChangeText={setSearch} placeholder="Bench, squat…" />
        <Divider />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState title="No matches" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.caption}>
                  {item.muscle_group}
                  {item.equipment ? ` · ${item.equipment}` : ''}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  exercisePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  setIndex: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '700',
    width: 20,
  },
  modal: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
