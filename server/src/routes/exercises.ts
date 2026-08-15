import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { asyncHandler } from '../middleware/error.js';
import { authenticate } from '../middleware/auth.js';

export const exercisesRouter = Router();
exercisesRouter.use(authenticate);

exercisesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search, muscleGroup } = z
      .object({
        search: z.string().max(80).optional(),
        muscleGroup: z.string().max(40).optional(),
      })
      .parse(req.query);

    const exercises = await query(
      `SELECT id, name, muscle_group, equipment, (created_by IS NOT NULL) AS custom
       FROM exercises
       WHERE (created_by IS NULL OR created_by = $1)
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR muscle_group = $3)
       ORDER BY muscle_group, name`,
      [req.user!.id, search ?? null, muscleGroup ?? null],
    );

    res.json({ exercises });
  }),
);

exercisesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).max(120),
        muscleGroup: z.string().min(1).max(40),
        equipment: z.string().max(40).nullable().optional(),
      })
      .parse(req.body);

    const exercise = await queryOne(
      `INSERT INTO exercises (name, muscle_group, equipment, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, name, muscle_group, equipment`,
      [body.name, body.muscleGroup, body.equipment ?? null, req.user!.id],
    );

    res.status(201).json({ exercise });
  }),
);
