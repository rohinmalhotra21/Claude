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
  ProgressBar,
} from '../../src/components/ui';
import { DateStepper } from '../../src/components/DateStepper';
import { ClientBanner, NoClientSelected } from '../../src/components/ClientBanner';
import type { DayTotals, Food, Meal } from '../../src/types';

export default function DietScreen() {
  const { user, clientId } = useAuth();
  const [date, setDate] = useState(toISODate());
  const [addingToMeal, setAddingToMeal] = useState<string | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTrainer = user?.role === 'trainer';
  const ready = !isTrainer || Boolean(clientId);

  const { data, loading, refreshing, refresh, reload } = useApi<{
    meals: Meal[];
    totals: DayTotals | null;
  }>(`/api/diet/day/${date}`, { clientId }, { enabled: ready });

  const meals = data?.meals ?? [];
  const totals = data?.totals;

  async function addFood(food: Food, quantity: number) {
    setError(null);
    try {
      if (addingToMeal === 'new') {
        await api('/api/diet/meals', {
          method: 'POST',
          body: { clientId, eatenOn: date, items: [{ foodId: food.id, quantity }] },
        });
      } else if (addingToMeal) {
        await api(`/api/diet/meals/${addingToMeal}/items`, {
          method: 'POST',
          body: { clientId, foodId: food.id, quantity },
        });
      }
      setAddingToMeal(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
      setAddingToMeal(null);
    }
  }

  async function removeItem(mealId: string, itemId: string) {
    setError(null);
    try {
      await api(`/api/diet/meals/${mealId}/items/${itemId}`, {
        method: 'DELETE',
        query: { clientId },
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
        <Text style={[typography.title, { marginBottom: spacing.md }]}>Diet</Text>

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
                  <View style={styles.metricRow}>
                    <Metric
                      label="Calories"
                      value={num(totals?.kcal)}
                      unit={totals?.target_kcal ? `/ ${num(totals.target_kcal)}` : ''}
                      color={colors.diet}
                    />
                    <Metric label="Protein" value={num(totals?.protein_g)} unit="g" />
                  </View>
                  <ProgressBar
                    value={Number(totals?.kcal ?? 0)}
                    target={totals?.target_kcal ? Number(totals.target_kcal) : null}
                    color={colors.diet}
                  />

                  <Divider />

                  <View style={styles.metricRow}>
                    <MacroPill
                      label="Protein"
                      value={totals?.protein_g}
                      target={totals?.target_protein_g}
                    />
                    <MacroPill label="Carbs" value={totals?.carbs_g} target={totals?.target_carbs_g} />
                    <MacroPill label="Fat" value={totals?.fat_g} target={totals?.target_fat_g} />
                    <MacroPill label="Fibre" value={totals?.fiber_g} target={null} />
                  </View>
                </Card>

                {meals.length === 0 ? (
                  <EmptyState
                    title="Nothing logged for this day"
                    hint="Add your first meal below."
                  />
                ) : (
                  meals.map((meal) => (
                    <Card key={meal.id} style={{ marginBottom: spacing.md }}>
                      <View style={styles.mealHeader}>
                        <Text style={typography.subheading}>{meal.name}</Text>
                        <Text style={typography.label}>
                          {num(
                            meal.items.reduce((sum, item) => sum + Number(item.kcal), 0),
                          )}{' '}
                          kcal
                        </Text>
                      </View>

                      {meal.items.length === 0 ? (
                        <Text style={typography.caption}>No items yet</Text>
                      ) : (
                        meal.items.map((item) => (
                          <View key={item.id} style={styles.itemRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={typography.body} numberOfLines={1}>
                                {item.foodName}
                              </Text>
                              <Text style={typography.caption}>
                                {num(item.quantity)}
                                {item.unit} · {num(item.kcal)} kcal · P{num(item.proteinG)} C
                                {num(item.carbsG)} F{num(item.fatG)}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => void removeItem(meal.id, item.id)}
                              hitSlop={8}
                            >
                              <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                            </Pressable>
                          </View>
                        ))
                      )}

                      <Pressable
                        onPress={() => setAddingToMeal(meal.id)}
                        style={styles.addFoodRow}
                      >
                        <Ionicons name="add" size={18} color={colors.diet} />
                        <Text style={{ color: colors.diet, fontWeight: '600', fontSize: 14 }}>
                          Add food
                        </Text>
                      </Pressable>
                    </Card>
                  ))
                )}

                <Button
                  title={`Add Meal ${meals.length + 1}`}
                  onPress={() => setAddingToMeal('new')}
                  variant="secondary"
                  style={{ marginTop: spacing.sm }}
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      <FoodPicker
        visible={addingToMeal !== null}
        onClose={() => setAddingToMeal(null)}
        onSelect={addFood}
      />
    </SafeAreaView>
  );
}

function MacroPill({
  label,
  value,
  target,
}: {
  label: string;
  value: string | undefined;
  target: string | null | undefined;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.body, { fontWeight: '700' }]}>
        {num(value)}
        <Text style={typography.caption}>{target ? ` / ${num(target)}` : ''} g</Text>
      </Text>
    </View>
  );
}

/** Search the food catalog, then enter a portion. */
function FoodPicker({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (food: Food, quantity: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('100');

  const { data } = useApi<{ foods: Food[] }>(
    visible ? '/api/diet/foods' : null,
    { search: search || undefined, limit: 40 },
    { refetchOnFocus: false },
  );

  function close() {
    setSelected(null);
    setSearch('');
    setQuantity('100');
    onClose();
  }

  const grams = Number(quantity) || 0;
  const scale = grams / 100;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={typography.heading}>{selected ? 'Portion' : 'Add food'}</Text>
          <Pressable onPress={close} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {selected ? (
          <View>
            <Text style={[typography.subheading, { marginBottom: spacing.xs }]}>
              {selected.name}
            </Text>
            <Text style={[typography.caption, { marginBottom: spacing.lg }]}>
              per 100{selected.base_unit}: {num(selected.kcal_per_100)} kcal · P
              {num(selected.protein_per_100)} C{num(selected.carbs_per_100)} F
              {num(selected.fat_per_100)}
            </Text>

            <Field
              label="Amount"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              suffix={selected.base_unit}
              autoFocus
            />

            <Card style={{ marginVertical: spacing.lg }}>
              <View style={styles.metricRow}>
                <Metric
                  label="Calories"
                  value={num(Number(selected.kcal_per_100) * scale)}
                  color={colors.diet}
                />
                <Metric label="Protein" value={num(Number(selected.protein_per_100) * scale)} unit="g" />
                <Metric label="Carbs" value={num(Number(selected.carbs_per_100) * scale)} unit="g" />
                <Metric label="Fat" value={num(Number(selected.fat_per_100) * scale)} unit="g" />
              </View>
            </Card>

            <Button
              title="Add to meal"
              onPress={() => {
                if (grams > 0) {
                  onSelect(selected, grams);
                  setSelected(null);
                  setQuantity('100');
                  setSearch('');
                }
              }}
              disabled={grams <= 0}
            />
            <Button title="Back to search" onPress={() => setSelected(null)} variant="ghost" />
          </View>
        ) : (
          <>
            <Field
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Chicken, rice, oats…"
            />
            <Divider />
            <FlatList
              data={data?.foods ?? []}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<EmptyState title="No matches" />}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>{item.name}</Text>
                    <Text style={typography.caption}>
                      {num(item.kcal_per_100)} kcal · P{num(item.protein_per_100)} C
                      {num(item.carbs_per_100)} F{num(item.fat_per_100)} per 100{item.base_unit}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.diet} />
                </Pressable>
              )}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  metricRow: { flexDirection: 'row', gap: spacing.md },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addFoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
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
