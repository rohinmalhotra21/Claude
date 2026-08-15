import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignGroups } from '../src/routes/workouts.js';

type Input = Parameters<typeof assignGroups>[0];

/** Builds a set payload with the defaults the zod schema would have applied. */
function set(overrides: Partial<Input[number]> = {}): Input[number] {
  return {
    exerciseId: '00000000-0000-0000-0000-000000000001',
    technique: 'straight',
    ...overrides,
  } as Input[number];
}

test('straight sets get no group', () => {
  const result = assignGroups([set(), set()]);

  for (const row of result) {
    assert.equal(row.techniqueGroup, null);
    assert.equal(row.groupPosition, null);
  }
});

test('warm-ups get no group', () => {
  const [row] = assignGroups([set({ technique: 'warmup' })]);

  assert.equal(row!.techniqueGroup, null);
});

test('sets sharing a groupKey land in one group and are numbered in order', () => {
  const result = assignGroups([
    set({ technique: 'superset', groupKey: 'A' }),
    set({ technique: 'superset', groupKey: 'A' }),
  ]);

  assert.equal(result[0]!.techniqueGroup, result[1]!.techniqueGroup);
  assert.notEqual(result[0]!.techniqueGroup, null);
  assert.equal(result[0]!.groupPosition, 1);
  assert.equal(result[1]!.groupPosition, 2);
});

test('different groupKeys produce different groups', () => {
  const result = assignGroups([
    set({ technique: 'superset', groupKey: 'A' }),
    set({ technique: 'superset', groupKey: 'B' }),
  ]);

  assert.notEqual(result[0]!.techniqueGroup, result[1]!.techniqueGroup);
  // Each group numbers independently from 1.
  assert.equal(result[0]!.groupPosition, 1);
  assert.equal(result[1]!.groupPosition, 1);
});

test('a drop set numbers each drop in sequence', () => {
  const result = assignGroups([
    set({ technique: 'drop_set', groupKey: 'D' }),
    set({ technique: 'drop_set', groupKey: 'D' }),
    set({ technique: 'drop_set', groupKey: 'D' }),
  ]);

  assert.deepEqual(
    result.map((r) => r.groupPosition),
    [1, 2, 3],
  );
});

test('a grouped set sent without a key still gets its own group', () => {
  // The DB constraint requires a group for these techniques, so the server
  // must not leave it null just because the client omitted a key.
  const result = assignGroups([
    set({ technique: 'rest_pause' }),
    set({ technique: 'rest_pause' }),
  ]);

  assert.notEqual(result[0]!.techniqueGroup, null);
  assert.notEqual(result[1]!.techniqueGroup, null);
  assert.notEqual(result[0]!.techniqueGroup, result[1]!.techniqueGroup);
});

test('position reflects the order sets were sent, across techniques', () => {
  const result = assignGroups([
    set({ technique: 'warmup' }),
    set({ technique: 'superset', groupKey: 'A' }),
    set({ technique: 'straight' }),
    set({ technique: 'superset', groupKey: 'A' }),
  ]);

  assert.deepEqual(
    result.map((r) => r.position),
    [0, 1, 2, 3],
  );
  // The superset legs stay linked even with an unrelated set between them.
  assert.equal(result[1]!.techniqueGroup, result[3]!.techniqueGroup);
  assert.equal(result[3]!.groupPosition, 2);
});
