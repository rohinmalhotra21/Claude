import { Router, type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';

export const powerbiRouter = Router();

/**
 * A read-only JSON feed of the analytics views, for the Power BI Web connector.
 *
 * DirectQuery straight to Postgres is the primary integration and stays the
 * recommendation — it is faster and supports incremental refresh. This feed is
 * the fallback for deployments where the database isn't reachable from the
 * Power BI service (no VNet peering, no on-premises gateway) and only the API
 * is exposed.
 */

/** Only these views are reachable, so the route can never leak a base table. */
const EXPOSED_VIEWS = {
  clients: 'vw_dim_client',
  exercises: 'vw_dim_exercise',
  dates: 'vw_dim_date',
  workout_sets: 'vw_fact_workout_sets',
  workout_sessions: 'vw_fact_workout_sessions',
  technique_usage: 'vw_fact_technique_usage',
  meal_items: 'vw_fact_meal_items',
  nutrition_daily: 'vw_fact_nutrition_daily',
  supplement_logs: 'vw_fact_supplement_logs',
  supplement_adherence: 'vw_fact_supplement_adherence',
  daily_log: 'vw_fact_daily_log',
  body_measurements: 'vw_fact_body_measurements',
  client_summary: 'vw_client_summary',
} as const;

type ViewName = keyof typeof EXPOSED_VIEWS;

/** Views that carry a date_key and therefore support incremental refresh. */
const DATED_VIEWS = new Set<ViewName>([
  'workout_sets',
  'workout_sessions',
  'technique_usage',
  'meal_items',
  'nutrition_daily',
  'supplement_logs',
  'supplement_adherence',
  'daily_log',
  'body_measurements',
]);

/** Shared-secret auth: Power BI can't do OAuth against a custom API easily. */
function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.POWERBI_API_KEY;
  if (!expected) {
    next(new ApiError(503, 'Power BI feed is not configured'));
    return;
  }

  const provided = req.header('x-api-key') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    next(new ApiError(401, 'Invalid API key'));
    return;
  }
  next();
}

powerbiRouter.use(requireApiKey);

/** Lists what a report can bind to. */
powerbiRouter.get('/', (_req, res) => {
  res.json({
    views: Object.keys(EXPOSED_VIEWS).map((name) => ({
      name,
      path: `/api/powerbi/${name}`,
      supportsIncrementalRefresh: DATED_VIEWS.has(name as ViewName),
    })),
  });
});

powerbiRouter.get(
  '/:view',
  asyncHandler(async (req, res) => {
    const view = z
      .enum(Object.keys(EXPOSED_VIEWS) as [ViewName, ...ViewName[]])
      .parse(req.params.view);

    const { trainerId, from, to, limit, offset } = z
      .object({
        trainerId: z.string().uuid().optional(),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
        limit: z.coerce.number().int().min(1).max(50000).default(10000),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);

    const table = EXPOSED_VIEWS[view];
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Scope to one trainer's book of business when asked.
    if (trainerId) {
      params.push(trainerId);
      conditions.push(view === 'dates' || view === 'exercises' ? 'TRUE' : `trainer_id = $${params.length}`);
    }

    // Date bounds drive Power BI's incremental refresh policy (RangeStart /
    // RangeEnd get folded into these two parameters).
    if (DATED_VIEWS.has(view)) {
      if (from) {
        params.push(from);
        conditions.push(`date_key >= $${params.length}`);
      }
      if (to) {
        params.push(to);
        conditions.push(`date_key <= $${params.length}`);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = DATED_VIEWS.has(view) ? 'ORDER BY date_key' : '';

    params.push(limit, offset);
    // `table` is looked up from the fixed allowlist above, never interpolated
    // from user input.
    const rows = await query(
      `SELECT * FROM ${table} ${where} ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      view,
      rowCount: rows.length,
      // Power BI pages by following this until it comes back null.
      nextOffset: rows.length === limit ? offset + limit : null,
      value: rows,
    });
  }),
);
