import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, resolveTargetUserId } from '../middleware/auth.js';
import { pushAsync } from '../services/powerbiPush.js';

export const workoutsRouter = Router();
workoutsRouter.use(authenticate);

const TECHNIQUES = [
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
] as const;

/** Techniques whose sets are linked together into one logical unit. */
const GROUPED_TECHNIQUES = new Set([
  'drop_set',
  'superset',
  'giant_set',
  'rest_pause',
  'myo_reps',
  'cluster',
]);

const setSchema = z.object({
  exerciseId: z.string().uuid(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(),
  technique: z.enum(TECHNIQUES).default('straight'),
  /**
   * Client-supplied key that ties the legs of a superset or the drops of a drop
   * set together. Any stable string works; the server maps each distinct key to
   * one generated UUID within the session.
   */
  groupKey: z.string().min(1).max(64).optional(),
  restSec: z.number().int().min(0).max(3600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const sessionSchema = z.object({
  clientId: z.string().uuid().optional(),
  performedOn: z.string().date(),
  title: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  durationMin: z.number().int().min(0).max(1440).nullable().optional(),
  sets: z.array(setSchema).default([]),
});

/**
 * Assigns a technique_group UUID to every set that needs one, and numbers the
 * sets within each group. Sets sharing a groupKey land in the same group; a
 * grouped set sent without a key gets a group of its own so the DB constraint
 * still holds.
 */
export function assignGroups(sets: z.infer<typeof setSchema>[]) {
  const groupIds = new Map<string, string>();
  const groupCounts = new Map<string, number>();

  return sets.map((set, index) => {
    const needsGroup = GROUPED_TECHNIQUES.has(set.technique);
    if (!needsGroup) {
      return { ...set, techniqueGroup: null, groupPosition: null, position: index };
    }

    const key = set.groupKey ?? `__solo_${index}`;
    let groupId = groupIds.get(key);
    if (!groupId) {
      groupId = randomUUID();
      groupIds.set(key, groupId);
    }

    const nextPosition = (groupCounts.get(key) ?? 0) + 1;
    groupCounts.set(key, nextPosition);

    return { ...set, techniqueGroup: groupId, groupPosition: nextPosition, position: index };
  });
}

/** Verifies every referenced exercise exists and is visible to this user. */
async function assertExercisesVisible(exerciseIds: string[], userId: string): Promise<void> {
  if (exerciseIds.length === 0) return;

  const unique = [...new Set(exerciseIds)];
  const found = await query<{ id: string }>(
    `SELECT id FROM exercises
     WHERE id = ANY($1::uuid[]) AND (created_by IS NULL OR created_by = $2)`,
    [unique, userId],
  );

  if (found.length !== unique.length) {
    const visible = new Set(found.map((r) => r.id));
    throw new ApiError(400, 'Unknown exercise in workout', {
      missing: unique.filter((id) => !visible.has(id)),
    });
  }
}

// --- List sessions ---------------------------------------------------------

workoutsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const { from, to, limit } = z
      .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const sessions = await query(
      `SELECT session_id AS id, date_key AS performed_on, session_title AS title,
              duration_min, total_sets, advanced_sets, exercises_performed,
              total_volume_kg, total_reps, avg_rpe
       FROM vw_fact_workout_sessions
       WHERE client_id = $1
         AND ($2::date IS NULL OR date_key >= $2)
         AND ($3::date IS NULL OR date_key <= $3)
       ORDER BY date_key DESC, session_id
       LIMIT $4`,
      [userId, from ?? null, to ?? null, limit],
    );

    res.json({ sessions });
  }),
);

// --- Single session with its sets ------------------------------------------

workoutsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const id = z.string().uuid().parse(req.params.id);

    const session = await queryOne(
      `SELECT id, performed_on, title, notes, duration_min
       FROM workout_sessions WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!session) throw new ApiError(404, 'Workout not found');

    const sets = await query(
      `SELECT ws.id, ws.exercise_id, e.name AS exercise_name, e.muscle_group,
              ws.position, ws.weight_kg, ws.reps, ws.rpe, ws.technique,
              ws.technique_group, ws.group_position, ws.rest_sec, ws.notes
       FROM workout_sets ws
       JOIN exercises e ON e.id = ws.exercise_id
       WHERE ws.session_id = $1
       ORDER BY ws.position`,
      [id],
    );

    res.json({ session: { ...session, sets } });
  }),
);

// --- Create session --------------------------------------------------------

workoutsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const body = sessionSchema.parse(req.body);

    await assertExercisesVisible(
      body.sets.map((s) => s.exerciseId),
      userId,
    );

    const prepared = assignGroups(body.sets);

    const sessionId = await transaction(async (client) => {
      const created = await client.query<{ id: string }>(
        `INSERT INTO workout_sessions (user_id, performed_on, title, notes, duration_min)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, body.performedOn, body.title ?? null, body.notes ?? null, body.durationMin ?? null],
      );
      const id = created.rows[0]!.id;

      for (const set of prepared) {
        await client.query(
          `INSERT INTO workout_sets
             (session_id, exercise_id, position, weight_kg, reps, rpe,
              technique, technique_group, group_position, rest_sec, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            set.exerciseId,
            set.position,
            set.weightKg ?? null,
            set.reps ?? null,
            set.rpe ?? null,
            set.technique,
            set.techniqueGroup,
            set.groupPosition,
            set.restSec ?? null,
            set.notes ?? null,
          ],
        );
      }

      return id;
    });

    const summary = await queryOne(
      `SELECT session_id AS id, date_key AS performed_on, total_sets,
              total_volume_kg, advanced_sets, client_name
       FROM vw_fact_workout_sessions WHERE session_id = $1`,
      [sessionId],
    );

    pushAsync('workouts', [
      {
        client_id: userId,
        client_name: (summary as { client_name?: string } | undefined)?.client_name ?? '',
        date: body.performedOn,
        total_volume_kg: Number((summary as { total_volume_kg?: string })?.total_volume_kg ?? 0),
        total_sets: Number((summary as { total_sets?: string })?.total_sets ?? 0),
        logged_at: new Date().toISOString(),
      },
    ]);

    res.status(201).json({ session: summary });
  }),
);

// --- Replace the sets of a session -----------------------------------------

workoutsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const id = z.string().uuid().parse(req.params.id);
    const body = sessionSchema.parse(req.body);

    const owned = await queryOne<{ id: string }>(
      'SELECT id FROM workout_sessions WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    if (!owned) throw new ApiError(404, 'Workout not found');

    await assertExercisesVisible(
      body.sets.map((s) => s.exerciseId),
      userId,
    );
    const prepared = assignGroups(body.sets);

    await transaction(async (client) => {
      await client.query(
        `UPDATE workout_sessions
         SET performed_on = $2, title = $3, notes = $4, duration_min = $5
         WHERE id = $1`,
        [id, body.performedOn, body.title ?? null, body.notes ?? null, body.durationMin ?? null],
      );

      // Simplest correct approach: the payload is the full set list.
      await client.query('DELETE FROM workout_sets WHERE session_id = $1', [id]);

      for (const set of prepared) {
        await client.query(
          `INSERT INTO workout_sets
             (session_id, exercise_id, position, weight_kg, reps, rpe,
              technique, technique_group, group_position, rest_sec, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            set.exerciseId,
            set.position,
            set.weightKg ?? null,
            set.reps ?? null,
            set.rpe ?? null,
            set.technique,
            set.techniqueGroup,
            set.groupPosition,
            set.restSec ?? null,
            set.notes ?? null,
          ],
        );
      }
    });

    res.json({ ok: true });
  }),
);

workoutsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const id = z.string().uuid().parse(req.params.id);

    const deleted = await query('DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2 RETURNING id', [
      id,
      userId,
    ]);
    if (deleted.length === 0) throw new ApiError(404, 'Workout not found');

    res.status(204).send();
  }),
);

// --- Progress on one exercise over time ------------------------------------

workoutsRouter.get(
  '/exercises/:exerciseId/history',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const exerciseId = z.string().uuid().parse(req.params.exerciseId);

    const history = await query(
      `SELECT date_key, exercise_name,
              MAX(weight_kg)  AS top_weight_kg,
              SUM(volume_kg)  AS volume_kg,
              MAX(est_1rm_kg) AS best_est_1rm_kg,
              COUNT(*)        AS sets
       FROM vw_fact_workout_sets
       WHERE client_id = $1 AND exercise_id = $2 AND NOT is_warmup
       GROUP BY date_key, exercise_name
       ORDER BY date_key DESC
       LIMIT 60`,
      [userId, exerciseId],
    );

    res.json({ history });
  }),
);
