import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { asyncHandler } from '../middleware/error.js';
import { authenticate, resolveTargetUserId } from '../middleware/auth.js';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

/**
 * The numbers behind the app's own home screen. Power BI reads the same views
 * directly; this endpoint exists so the phone doesn't need to embed a report
 * just to show a handful of tiles.
 */
analyticsRouter.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const days = z.coerce.number().int().min(7).max(365).default(30).parse(req.query.days ?? 30);

    const [volumeByWeek, muscleSplit, nutritionTrend, weightTrend, techniqueMix, headline] =
      await Promise.all([
        query(
          `SELECT date_trunc('week', date_key)::date AS week_start,
                  SUM(total_volume_kg) AS volume_kg,
                  COUNT(*)             AS sessions
           FROM vw_fact_workout_sessions
           WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int
           GROUP BY 1 ORDER BY 1`,
          [userId, days],
        ),
        query(
          `SELECT muscle_group, SUM(volume_kg) AS volume_kg, COUNT(*) AS sets
           FROM vw_fact_workout_sets
           WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int AND NOT is_warmup
           GROUP BY muscle_group ORDER BY volume_kg DESC`,
          [userId, days],
        ),
        query(
          `SELECT date_key, kcal, protein_g, carbs_g, fat_g,
                  target_kcal, kcal_pct_of_target
           FROM vw_fact_nutrition_daily
           WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int
           ORDER BY date_key`,
          [userId, days],
        ),
        query(
          `SELECT date_key, weight_kg, weight_kg_7d_avg, body_fat_pct
           FROM vw_fact_daily_log
           WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int
             AND weight_kg IS NOT NULL
           ORDER BY date_key`,
          [userId, days],
        ),
        query(
          `SELECT technique, SUM(technique_instances) AS instances, SUM(sets_involved) AS sets
           FROM vw_fact_technique_usage
           WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int
           GROUP BY technique ORDER BY instances DESC`,
          [userId, days],
        ),
        queryOne(
          `SELECT
             (SELECT COUNT(*) FROM workout_sessions
               WHERE user_id = $1 AND performed_on >= CURRENT_DATE - $2::int) AS sessions,
             (SELECT COALESCE(SUM(total_volume_kg), 0) FROM vw_fact_workout_sessions
               WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int)   AS total_volume_kg,
             (SELECT ROUND(AVG(kcal), 0) FROM vw_fact_nutrition_daily
               WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int)   AS avg_kcal,
             (SELECT ROUND(AVG(protein_g), 0) FROM vw_fact_nutrition_daily
               WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int)   AS avg_protein_g,
             (SELECT ROUND(AVG(adherence_pct), 1) FROM vw_fact_supplement_adherence
               WHERE client_id = $1 AND date_key >= CURRENT_DATE - $2::int)   AS supp_adherence_pct`,
          [userId, days],
        ),
      ]);

    res.json({
      days,
      headline,
      volumeByWeek,
      muscleSplit,
      nutritionTrend,
      weightTrend,
      techniqueMix,
    });
  }),
);

/** Personal records per exercise — the "am I getting stronger" view. */
analyticsRouter.get(
  '/personal-records',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);

    const records = await query(
      `SELECT DISTINCT ON (exercise_id)
              exercise_id, exercise_name, muscle_group,
              weight_kg AS best_weight_kg, reps, est_1rm_kg, date_key AS achieved_on
       FROM vw_fact_workout_sets
       WHERE client_id = $1 AND NOT is_warmup AND est_1rm_kg IS NOT NULL
       ORDER BY exercise_id, est_1rm_kg DESC, date_key DESC`,
      [userId],
    );

    res.json({ records });
  }),
);
