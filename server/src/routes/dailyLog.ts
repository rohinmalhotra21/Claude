import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, resolveTargetUserId } from '../middleware/auth.js';
import { pushAsync } from '../services/powerbiPush.js';

export const dailyLogRouter = Router();
dailyLogRouter.use(authenticate);

/** The sites the app offers by default; any other label is accepted too. */
export const MEASUREMENT_SITES = [
  'neck',
  'chest',
  'shoulders',
  'left_bicep',
  'right_bicep',
  'waist',
  'hips',
  'left_thigh',
  'right_thigh',
  'left_calf',
  'right_calf',
] as const;

const logSchema = z.object({
  clientId: z.string().uuid().optional(),
  loggedOn: z.string().date(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  bodyFatPct: z.number().min(0).max(100).nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  restingHr: z.number().int().positive().max(250).nullable().optional(),
  waterMl: z.number().int().min(0).max(20000).nullable().optional(),
  mood: z.number().int().min(1).max(5).nullable().optional(),
  energy: z.number().int().min(1).max(5).nullable().optional(),
  soreness: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Body dimensions in cm, keyed by site. Replaces the day's measurements. */
  measurements: z.record(z.string().min(1).max(40), z.number().positive().max(300)).optional(),
});

dailyLogRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const { from, to, limit } = z
      .object({
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        limit: z.coerce.number().int().min(1).max(365).default(90),
      })
      .parse(req.query);

    const logs = await query(
      `SELECT date_key AS logged_on, weight_kg, weight_kg_7d_avg, body_fat_pct,
              lean_mass_kg, bmi, sleep_hours, steps, resting_hr, water_ml,
              mood, energy, soreness, notes
       FROM vw_fact_daily_log
       WHERE client_id = $1
         AND ($2::date IS NULL OR date_key >= $2)
         AND ($3::date IS NULL OR date_key <= $3)
       ORDER BY date_key DESC
       LIMIT $4`,
      [userId, from ?? null, to ?? null, limit],
    );

    res.json({ logs });
  }),
);

dailyLogRouter.get(
  '/:date',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const date = z.string().date().parse(req.params.date);

    const log = await queryOne(
      `SELECT id, logged_on, weight_kg, body_fat_pct, sleep_hours, steps,
              resting_hr, water_ml, mood, energy, soreness, notes
       FROM daily_logs WHERE user_id = $1 AND logged_on = $2`,
      [userId, date],
    );

    if (!log) {
      res.json({ log: null, measurements: {} });
      return;
    }

    const rows = await query<{ site: string; value_cm: string }>(
      'SELECT site, value_cm FROM body_measurements WHERE daily_log_id = $1',
      [(log as { id: string }).id],
    );

    const measurements = Object.fromEntries(rows.map((r) => [r.site, Number(r.value_cm)]));
    res.json({ log, measurements });
  }),
);

/**
 * Upserts the day's entry. One log per client per day, so re-submitting the
 * same date edits it rather than creating a duplicate.
 */
dailyLogRouter.put(
  '/',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const body = logSchema.parse(req.body);

    const log = await transaction(async (client) => {
      const upserted = await client.query<{ id: string }>(
        `INSERT INTO daily_logs
           (user_id, logged_on, weight_kg, body_fat_pct, sleep_hours, steps,
            resting_hr, water_ml, mood, energy, soreness, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (user_id, logged_on) DO UPDATE SET
           weight_kg    = EXCLUDED.weight_kg,
           body_fat_pct = EXCLUDED.body_fat_pct,
           sleep_hours  = EXCLUDED.sleep_hours,
           steps        = EXCLUDED.steps,
           resting_hr   = EXCLUDED.resting_hr,
           water_ml     = EXCLUDED.water_ml,
           mood         = EXCLUDED.mood,
           energy       = EXCLUDED.energy,
           soreness     = EXCLUDED.soreness,
           notes        = EXCLUDED.notes,
           updated_at   = now()
         RETURNING id`,
        [
          userId,
          body.loggedOn,
          body.weightKg ?? null,
          body.bodyFatPct ?? null,
          body.sleepHours ?? null,
          body.steps ?? null,
          body.restingHr ?? null,
          body.waterMl ?? null,
          body.mood ?? null,
          body.energy ?? null,
          body.soreness ?? null,
          body.notes ?? null,
        ],
      );
      const logId = upserted.rows[0]!.id;

      // Measurements are sent whole; omitting the key leaves them untouched.
      if (body.measurements) {
        await client.query('DELETE FROM body_measurements WHERE daily_log_id = $1', [logId]);
        for (const [site, value] of Object.entries(body.measurements)) {
          await client.query(
            'INSERT INTO body_measurements (daily_log_id, site, value_cm) VALUES ($1, $2, $3)',
            [logId, site, value],
          );
        }
      }

      return logId;
    });

    const enriched = await queryOne<{
      client_name: string;
      weight_kg: string | null;
      weight_kg_7d_avg: string | null;
      body_fat_pct: string | null;
    }>(
      `SELECT client_name, weight_kg, weight_kg_7d_avg, body_fat_pct
       FROM vw_fact_daily_log WHERE client_id = $1 AND date_key = $2`,
      [userId, body.loggedOn],
    );

    if (enriched) {
      pushAsync('dailyLog', [
        {
          client_id: userId,
          client_name: enriched.client_name,
          date: body.loggedOn,
          weight_kg: enriched.weight_kg === null ? null : Number(enriched.weight_kg),
          weight_kg_7d_avg:
            enriched.weight_kg_7d_avg === null ? null : Number(enriched.weight_kg_7d_avg),
          body_fat_pct: enriched.body_fat_pct === null ? null : Number(enriched.body_fat_pct),
          logged_at: new Date().toISOString(),
        },
      ]);
    }

    res.json({ id: log, ok: true });
  }),
);

dailyLogRouter.delete(
  '/:date',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const date = z.string().date().parse(req.params.date);

    const deleted = await query(
      'DELETE FROM daily_logs WHERE user_id = $1 AND logged_on = $2 RETURNING id',
      [userId, date],
    );
    if (deleted.length === 0) throw new ApiError(404, 'No log for that date');

    res.status(204).send();
  }),
);

/** Measurement history for one site, for the trend chart. */
dailyLogRouter.get(
  '/measurements/:site',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const site = z.string().min(1).max(40).parse(req.params.site);

    const history = await query(
      `SELECT date_key, value_cm, change_from_start_cm
       FROM vw_fact_body_measurements
       WHERE client_id = $1 AND site = $2
       ORDER BY date_key DESC LIMIT 120`,
      [userId, site],
    );

    res.json({ site, history });
  }),
);
