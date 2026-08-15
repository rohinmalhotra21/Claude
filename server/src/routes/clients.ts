import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, requireTrainer } from '../middleware/auth.js';

export const clientsRouter = Router();
clientsRouter.use(authenticate, requireTrainer);

/** The trainer's roster, with the at-a-glance numbers for each client. */
clientsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const clients = await query(
      `SELECT client_id AS id, client_name AS full_name, goal, active,
              last_workout_on, last_checkin_on, workouts_last_7d,
              avg_kcal_last_7d, avg_protein_last_7d, latest_weight_kg,
              supp_adherence_last_7d
       FROM vw_client_summary
       WHERE trainer_id = $1
       ORDER BY active DESC, client_name`,
      [req.user!.id],
    );

    res.json({ clients });
  }),
);

async function assertOnRoster(clientId: string, trainerId: string): Promise<void> {
  const owned = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE id = $1 AND trainer_id = $2',
    [clientId, trainerId],
  );
  if (!owned) throw new ApiError(404, 'That client is not on your roster');
}

clientsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await assertOnRoster(id, req.user!.id);

    const client = await queryOne(
      `SELECT client_id AS id, client_name AS full_name, client_email AS email,
              sex, height_cm, goal, active, date_of_birth, age_years, joined_on
       FROM vw_dim_client WHERE client_id = $1`,
      [id],
    );

    const summary = await queryOne('SELECT * FROM vw_client_summary WHERE client_id = $1', [id]);

    res.json({ client, summary });
  }),
);

clientsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    await assertOnRoster(id, req.user!.id);

    const body = z
      .object({
        goal: z.string().max(500).nullable().optional(),
        heightCm: z.number().positive().max(300).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);

    // COALESCE keeps any field the caller omitted at its current value.
    const updated = await queryOne(
      `UPDATE users SET
         goal      = COALESCE($2, goal),
         height_cm = COALESCE($3, height_cm),
         active    = COALESCE($4, active)
       WHERE id = $1
       RETURNING id, full_name, goal, height_cm, active`,
      [id, body.goal ?? null, body.heightCm ?? null, body.active ?? null],
    );

    res.json({ client: updated });
  }),
);
