import React, { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { api } from '../src/api/client';
import { useAuth } from '../src/lib/auth';
import { useApi } from '../src/lib/useApi';
import { daysSince, formatShortDate, num } from '../src/lib/date';
import { colors, radius, spacing, typography } from '../src/lib/theme';
import { Button, EmptyState, ErrorBanner, Loading, Tag } from '../src/components/ui';
import type { ClientSummary } from '../src/types';

export default function ClientsScreen() {
  const { activeClient, setActiveClient } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const { data, loading, refreshing, refresh } = useApi<{ clients: ClientSummary[] }>(
    '/api/clients',
  );

  async function createInvite() {
    setInviting(true);
    setError(null);
    try {
      const { code } = await api<{ code: string; expiresInDays: number }>('/api/auth/invites', {
        method: 'POST',
        body: {},
      });
      await Clipboard.setStringAsync(code);
      Alert.alert(
        'Invite code created',
        `${code}\n\nCopied to your clipboard. Share it with your client — it works once and expires in 14 days.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <View style={styles.container}>
      <ErrorBanner message={error} />

      <FlatList
        data={data?.clients ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No clients yet"
            hint="Create an invite code and share it with your first client."
          />
        }
        ListFooterComponent={
          <Button
            title="Create invite code"
            onPress={createInvite}
            loading={inviting}
            variant="secondary"
            style={{ marginTop: spacing.lg }}
          />
        }
        renderItem={({ item }) => (
          <ClientCard
            client={item}
            selected={activeClient?.id === item.id}
            onPress={() => {
              setActiveClient(item);
              router.back();
            }}
          />
        )}
      />
    </View>
  );
}

function ClientCard({
  client,
  selected,
  onPress,
}: {
  client: ClientSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const sinceCheckin = daysSince(client.last_checkin_on);
  // Nudge the coach toward whoever has gone quiet.
  const stale = sinceCheckin === null || sinceCheckin > 3;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && { borderColor: colors.accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={typography.subheading} numberOfLines={1}>
            {client.full_name}
          </Text>
          {client.goal ? (
            <Text style={typography.caption} numberOfLines={1}>
              {client.goal}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
        ) : stale ? (
          <Tag label="Quiet" color={colors.warning} />
        ) : null}
      </View>

      <View style={styles.statRow}>
        <Stat label="Workouts / 7d" value={num(client.workouts_last_7d)} />
        <Stat label="Avg kcal" value={num(client.avg_kcal_last_7d)} />
        <Stat label="Weight" value={`${num(client.latest_weight_kg, 1)} kg`} />
        <Stat label="Supps" value={`${num(client.supp_adherence_last_7d)}%`} />
      </View>

      <Text style={[typography.caption, { marginTop: spacing.sm }]}>
        Last check-in {formatShortDate(client.last_checkin_on)} · last workout{' '}
        {formatShortDate(client.last_workout_on)}
      </Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={typography.caption} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[typography.body, { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
