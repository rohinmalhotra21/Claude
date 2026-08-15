import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, resolveTargetUserId } from '../middleware/auth.js';
import { pushAsync } from '../services/powerbiPush.js';

export const supplementsRouter = Router();
supplementsRouter.use(authenticate);

const SERVING_UNITS = ['g', 'mg', 'ml', 'capsule', 'tablet', 'scoop', 'iu'] as const;
const FORMS = ['powder', 'capsule', 'tablet', 'liquid', 'gummy', 'other'] as const;
const TIMES = [
  'morning',
  'pre_workout',
  'intra_workout',
  'post_workout',
  'evening',
  'with_meal',
  'anytime',
] as const;

// --- Catalog ---------------------------------------------------------------

supplementsRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const { search } = z.object({ search: z.string().max(80).optional() }).parse(req.query);

    const supplements = await query(
      `SELECT id, name, brand, form, serving_size, serving_unit, notes
       FROM supplements
       WHERE (created_by IS NULL OR created_by = $1)
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%')
       ORDER BY name`,
      [req.user!.id, search ?? null],
    );

    res.json({ supplements });
  }),
);

supplementsRouter.post(
  '/catalog',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(120),
        brand: z.string().max(80).nullable().optional(),
        form: z.enum(FORMS).default('powder'),
        servingSize: z.number().positive().max(100000).nullable().optional(),
        servingUnit: z.enum(SERVING_UNITS).default('g'),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);

    const supplement = await queryOne(
      `INSERT INTO supplements (name, brand, form, serving_size, serving_unit, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        body.name,
        body.brand ?? null,
        body.form,
        body.servingSize ?? null,
        body.servingUnit,
        body.notes ?? null,
        req.user!.id,
      ],
    );

    res.status(201).json({ supplement });
  }),
);

// --- Prescribed protocol ---------------------------------------------------

supplementsRouter.get(
  '/protocol',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);

    const protocol = await query(
      `SELECT p.id, p.supplement_id, s.name, s.brand, s.form,
              s.serving_size, s.serving_unit,
              p.servings_per_day, p.time_of_day, p.starts_on, p.ends_on
       FROM supplement_protocols p
       JOIN supplements s ON s.id = p.supplement_id
       WHERE p.user_id = $1
         AND (p.ends_on IS NULL OR p.ends_on >= CURRENT_DATE)
       ORDER BY s.name`,
      [userId],
    );

    res.json({ protocol });
  }),
);

supplementsRouter.post(
  '/protocol',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    if (req.user!.role !== 'trainer') {
      throw new ApiError(403, 'Only your trainer can change your supplement protocol');
    }

    const body = z
      .object({
        clientId: z.string().uuid().optional(),
        supplementId: z.string().uuid(),
        servingsPerDay: z.number().positive().max(50).default(1),
        timeOfDay: z.enum(TIMES).nullable().optional(),
        startsOn: z.string().date().optional(),
        endsOn: z.string().date().nullable().optional(),
      })
      .parse(req.body);

    const entry = await queryOne(
      `INSERT INTO supplement_protocols
         (user_id, supplement_id, servings_per_day, time_of_day, starts_on, ends_on)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)
       RETURNING *`,
      [
        userId,
        body.supplementId,
        body.servingsPerDay,
        body.timeOfDay ?? null,
        body.startsOn ?? null,
        body.endsOn ?? null,
      ],
    );

    res.status(201).json({ entry });
  }),
);

supplementsRouter.delete(
  '/protocol/:id',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    if (req.user!.role !== 'trainer') {
      throw new ApiError(403, 'Only your trainer can change your supplement protocol');
    }
    const id = z.string().uuid().parse(req.params.id);

    const deleted = await query(
      'DELETE FROM supplement_protocols WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId],
    );
    if (deleted.length === 0) throw new ApiError(404, 'Protocol entry not found');

    res.status(204).send();
  }),
);

// --- Daily log of what was actually taken ----------------------------------

supplementsRouter.get(
  '/log/:date',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const date = z.string().date().parse(req.params.date);

    // Everything prescribed for that date, with whatever was logged against it.
    const rows = await query(
      `SELECT a.supplement_id, a.supplement_name, a.prescribed_servings,
              a.taken_servings, a.was_taken, a.adherence_pct,
              s.serving_size, s.serving_unit, p.time_of_day
       FROM vw_fact_supplement_adherence a
       JOIN supplements s ON s.id = a.supplement_id
       LEFT JOIN supplement_protocols p
              ON p.user_id = a.client_id AND p.supplement_id = a.supplement_id
       WHERE a.client_id = $1 AND a.date_key = $2
       ORDER BY a.supplement_name`,
      [userId, date],
    );

    // Anything taken ad hoc that isn't part of the protocol.
    const extras = await query(
      `SELECT sl.id, sl.supplement_id, s.name AS supplement_name,
              sl.servings, sl.serving_size, sl.serving_unit, sl.time_of_day
       FROM supplement_logs sl
       JOIN supplements s ON s.id = sl.supplement_id
       WHERE sl.user_id = $1 AND sl.taken_on = $2
         AND NOT EXISTS (
           SELECT 1 FROM supplement_protocols p
           WHERE p.user_id = sl.user_id AND p.supplement_id = sl.supplement_id
             AND p.starts_on <= sl.taken_on
             AND (p.ends_on IS NULL OR p.ends_on >= sl.taken_on)
         )
       ORDER BY s.name`,
      [userId, date],
    );

    res.json({ date, protocol: rows, extras });
  }),
);

supplementsRouter.post(
  '/log',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const body = z
      .object({
        clientId: z.string().uuid().optional(),
        supplementId: z.string().uuid(),
        takenOn: z.string().date(),
        servings: z.number().positive().max(50).default(1),
        timeOfDay: z.enum(TIMES).nullable().optional(),
      })
      .parse(req.body);

    const supplement = await queryOne<{ name: string; serving_size: string | null; serving_unit: string }>(
      `SELECT name, serving_size, serving_unit FROM supplements
       WHERE id = $1 AND (created_by IS NULL OR created_by = $2)`,
      [body.supplementId, req.user!.id],
    );
    if (!supplement) throw new ApiError(404, 'Supplement not found');

    // Snapshot the dose so editing the catalog later doesn't rewrite history.
    const entry = await queryOne(
      `INSERT INTO supplement_logs
         (user_id, supplement_id, taken_on, servings, serving_size, serving_unit, time_of_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        body.supplementId,
        body.takenOn,
        body.servings,
        supplement.serving_size,
        supplement.serving_unit,
        body.timeOfDay ?? null,
      ],
    );

    pushAsync('supplements', [
      {
        client_id: userId,
        supplement_name: supplement.name,
        date: body.takenOn,
        servings: body.servings,
        logged_at: new Date().toISOString(),
      },
    ]);

    res.status(201).json({ entry });
  }),
);

supplementsRouter.delete(
  '/log/:id',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const id = z.string().uuid().parse(req.params.id);

    const deleted = await query(
      'DELETE FROM supplement_logs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId],
    );
    if (deleted.length === 0) throw new ApiError(404, 'Log entry not found');

    res.status(204).send();
  }),
);
