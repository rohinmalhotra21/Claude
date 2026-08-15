import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/lib/auth';
import { useApi } from '../../src/lib/useApi';
import { num, toISODate } from '../../src/lib/date';
import { colors, radius, spacing, typography } from '../../src/lib/theme';
import {
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorBanner,
  Field,
  Loading,
  Metric,
  Tag,
} from '../../src/components/ui';
import { DateStepper } from '../../src/components/DateStepper';
import { ClientBanner, NoClientSelected } from '../../src/components/ClientBanner';
import type { ProtocolRow, Supplement } from '../../src/types';

const TIME_LABELS: Record<string, string> = {
  morning: 'Morning',
  pre_workout: 'Pre-workout',
  intra_workout: 'Intra-workout',
  post_workout: 'Post-workout',
  evening: 'Evening',
  with_meal: 'With meal',
  anytime: 'Anytime',
};

export default function SupplementsScreen() {
  const { user, clientId } = useAuth();
  const [date, setDate] = useState(toISODate());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTrainer = user?.role === 'trainer';
  const ready = !isTrainer || Boolean(clientId);

  const { data, loading, refreshing, refresh, reload } = useApi<{
    protocol: ProtocolRow[];
    extras: {
      id: string;
      supplement_name: string;
      servings: string;
      serving_size: string | null;
      serving_unit: string | null;
    }[];
  }>(`/api/supplements/log/${date}`, { clientId }, { enabled: ready });

  const protocol = data?.protocol ?? [];
  const extras = data?.extras ?? [];

  const takenCount = protocol.filter((row) => row.was_taken).length;
  const adherence =
    protocol.length > 0
      ? protocol.reduce((sum, row) => sum + Number(row.adherence_pct), 0) / protocol.length
      : null;

  async function log(supplementId: string, servings: number) {
    setError(null);
    try {
      await api('/api/supplements/log', {
        method: 'POST',
        body: { clientId, supplementId, takenOn: date, servings },
      });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Text style={[typography.title, { marginBottom: spacing.md }]}>Supplements</Text>

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
                <Card style={{ marginBottom: spacing.lg }}>
                  <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                    <Metric
                      label="Taken today"
                      value={`${takenCount}/${protocol.length}`}
                      color={colors.supplements}
                    />
                    <Metric
                      label="Adherence"
                      value={adherence === null ? '—' : num(adherence, 0)}
                      unit="%"
                      color={colors.supplements}
                    />
                  </View>
                </Card>

                <Text style={[typography.label, { marginBottom: spacing.sm }]}>
                  PRESCRIBED PROTOCOL
                </Text>

                {protocol.length === 0 ? (
                  <EmptyState
                    title="No protocol assigned"
                    hint={
                      isTrainer
                        ? 'Assign supplements from the catalog below.'
                        : 'Your trainer hasn’t set one up yet.'
                    }
                  />
                ) : (
                  protocol.map((row) => (
                    <ProtocolCard
                      key={row.supplement_id}
                      row={row}
                      onLog={() => void log(row.supplement_id, 1)}
                    />
                  ))
                )}

                {extras.length > 0 ? (
                  <>
                    <Text
                      style={[typography.label, { marginTop: spacing.lg, marginBottom: spacing.sm }]}
                    >
                      ALSO TAKEN
                    </Text>
                    {extras.map((extra) => (
                      <Card key={extra.id} style={{ marginBottom: spacing.sm }}>
                        <Text style={typography.body}>{extra.supplement_name}</Text>
                        <Text style={typography.caption}>
                          {num(extra.servings)} ×{' '}
                          {extra.serving_size ? `${num(extra.serving_size)}${extra.serving_unit}` : 'serving'}
                        </Text>
                      </Card>
                    ))}
                  </>
                ) : null}

                <Button
                  title="Log something else"
                  onPress={() => setPickerOpen(true)}
                  variant="secondary"
                  style={{ marginTop: spacing.lg }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      <SupplementPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(supplement, servings) => {
          setPickerOpen(false);
          void log(supplement.id, servings);
        }}
      />
    </SafeAreaView>
  );
}

function ProtocolCard({ row, onLog }: { row: ProtocolRow; onLog: () => void }) {
  const taken = Number(row.taken_servings);
  const prescribed = Number(row.prescribed_servings);
  const complete = taken >= prescribed;

  return (
    <Card style={{ marginBottom: spacing.sm }}>
      <View style={styles.protocolRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.subheading} numberOfLines={1}>
            {row.supplement_name}
          </Text>
          <Text style={typography.caption}>
            {num(row.taken_servings)} of {num(row.prescribed_servings)} servings
            {row.serving_size ? ` · ${num(row.serving_size)}${row.serving_unit}` : ''}
            {row.time_of_day ? ` · ${TIME_LABELS[row.time_of_day] ?? row.time_of_day}` : ''}
          </Text>
        </View>

        {complete ? (
          <Tag label="Done" color={colors.accent} />
        ) : (
          <Pressable
            onPress={onLog}
            style={({ pressed }) => [styles.logButton, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="checkmark" size={20} color={colors.bg} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function SupplementPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (supplement: Supplement, servings: number) => void;
}) {
  const [search, setSearch] = useState('');
  const { data } = useApi<{ supplements: Supplement[] }>(
    visible ? '/api/supplements/catalog' : null,
    { search: search || undefined },
    { refetchOnFocus: false },
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={typography.heading}>Log a supplement</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <Field label="Search" value={search} onChangeText={setSearch} placeholder="Creatine…" />
        <Divider />

        <FlatList
          data={data?.supplements ?? []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState title="No matches" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item, 1)}
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.body}>{item.name}</Text>
                <Text style={typography.caption}>
                  {item.serving_size ? `${num(item.serving_size)}${item.serving_unit}` : item.form}
                  {item.brand ? ` · ${item.brand}` : ''}
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={colors.supplements} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.supplements,
    alignItems: 'center',
    justifyContent: 'center',
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
