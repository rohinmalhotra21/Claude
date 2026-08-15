import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, resolveTargetUserId } from '../middleware/auth.js';
import { pushAsync } from '../services/powerbiPush.js';

export const dietRouter = Router();
dietRouter.use(authenticate);

// --- Food catalog ----------------------------------------------------------

const foodSchema = z.object({
  name: z.string().min(1).max(120),
  brand: z.string().max(80).nullable().optional(),
  baseUnit: z.enum(['g', 'ml']).default('g'),
  kcalPer100: z.number().min(0).max(1000),
  proteinPer100: z.number().min(0).max(100).default(0),
  carbsPer100: z.number().min(0).max(100).default(0),
  fatPer100: z.number().min(0).max(100).default(0),
  fiberPer100: z.number().min(0).max(100).default(0),
  servingLabel: z.string().max(60).nullable().optional(),
  servingGrams: z.number().positive().max(5000).nullable().optional(),
});

dietRouter.get(
  '/foods',
  asyncHandler(async (req, res) => {
    const { search, limit } = z
      .object({
        search: z.string().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      })
      .parse(req.query);

    const foods = await query(
      `SELECT id, name, brand, base_unit, kcal_per_100, protein_per_100,
              carbs_per_100, fat_per_100, fiber_per_100, serving_label, serving_grams
       FROM foods
       WHERE (created_by IS NULL OR created_by = $1)
         AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR brand ILIKE '%' || $2 || '%')
       ORDER BY name
       LIMIT $3`,
      [req.user!.id, search ?? null, limit],
    );

    res.json({ foods });
  }),
);

dietRouter.post(
  '/foods',
  asyncHandler(async (req, res) => {
    const body = foodSchema.parse(req.body);

    const food = await queryOne(
      `INSERT INTO foods (name, brand, base_unit, kcal_per_100, protein_per_100,
                          carbs_per_100, fat_per_100, fiber_per_100,
                          serving_label, serving_grams, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        body.name,
        body.brand ?? null,
        body.baseUnit,
        body.kcalPer100,
        body.proteinPer100,
        body.carbsPer100,
        body.fatPer100,
        body.fiberPer100,
        body.servingLabel ?? null,
        body.servingGrams ?? null,
        req.user!.id,
      ],
    );

    res.status(201).json({ food });
  }),
);

// --- A day's meals ---------------------------------------------------------

dietRouter.get(
  '/day/:date',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const date = z.string().date().parse(req.params.date);

    const meals = await query(
      `SELECT m.id, m.meal_index, COALESCE(m.name, 'Meal ' || m.meal_index) AS name, m.eaten_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', i.meal_item_id, 'foodId', i.food_id, 'foodName', i.food_name,
                    'brand', i.brand, 'quantity', i.quantity, 'unit', i.base_unit,
                    'kcal', i.kcal, 'proteinG', i.protein_g,
                    'carbsG', i.carbs_g, 'fatG', i.fat_g, 'fiberG', i.fiber_g
                  ) ORDER BY i.food_name
                ) FILTER (WHERE i.meal_item_id IS NOT NULL),
                '[]'
              ) AS items
       FROM meals m
       LEFT JOIN vw_fact_meal_items i ON i.meal_id = m.id
       WHERE m.user_id = $1 AND m.eaten_on = $2
       GROUP BY m.id, m.meal_index, m.name, m.eaten_at
       ORDER BY m.meal_index`,
      [userId, date],
    );

    const totals = await queryOne(
      `SELECT kcal, protein_g, carbs_g, fat_g, fiber_g, meals_logged,
              target_kcal, target_protein_g, target_carbs_g, target_fat_g,
              kcal_pct_of_target, protein_pct_of_target
       FROM vw_fact_nutrition_daily WHERE client_id = $1 AND date_key = $2`,
      [userId, date],
    );

    res.json({ date, meals, totals: totals ?? null });
  }),
);

// --- Create a meal ---------------------------------------------------------

dietRouter.post(
  '/meals',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const body = z
      .object({
        clientId: z.string().uuid().optional(),
        eatenOn: z.string().date(),
        mealIndex: z.number().int().min(1).max(12).optional(),
        name: z.string().max(60).nullable().optional(),
        eatenAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
        items: z
          .array(
            z.object({
              foodId: z.string().uuid(),
              quantity: z.number().positive().max(10000),
            }),
          )
          .default([]),
      })
      .parse(req.body);

    const meal = await transaction(async (client) => {
      // Default to the next slot of the day so the app can just say "add meal".
      let mealIndex = body.mealIndex;
      if (mealIndex === undefined) {
        const next = await client.query<{ next_index: number }>(
          `SELECT COALESCE(MAX(meal_index), 0) + 1 AS next_index
           FROM meals WHERE user_id = $1 AND eaten_on = $2`,
          [userId, body.eatenOn],
        );
        mealIndex = next.rows[0]!.next_index;
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO meals (user_id, eaten_on, meal_index, name, eaten_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, body.eatenOn, mealIndex, body.name ?? null, body.eatenAt ?? null],
      );
      const mealId = created.rows[0]!.id;

      for (const item of body.items) {
        await client.query(
          'INSERT INTO meal_items (meal_id, food_id, quantity) VALUES ($1, $2, $3)',
          [mealId, item.foodId, item.quantity],
        );
      }

      return { id: mealId, mealIndex };
    });

    await pushDailyNutrition(userId, body.eatenOn);
    res.status(201).json({ meal });
  }),
);

// --- Items within a meal ---------------------------------------------------

async function assertMealOwned(mealId: string, userId: string): Promise<string> {
  const meal = await queryOne<{ eaten_on: string }>(
    'SELECT eaten_on FROM meals WHERE id = $1 AND user_id = $2',
    [mealId, userId],
  );
  if (!meal) throw new ApiError(404, 'Meal not found');
  return meal.eaten_on;
}

dietRouter.post(
  '/meals/:mealId/items',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const mealId = z.string().uuid().parse(req.params.mealId);
    const body = z
      .object({ foodId: z.string().uuid(), quantity: z.number().positive().max(10000) })
      .parse(req.body);

    const eatenOn = await assertMealOwned(mealId, userId);

    const item = await queryOne(
      'INSERT INTO meal_items (meal_id, food_id, quantity) VALUES ($1, $2, $3) RETURNING id',
      [mealId, body.foodId, body.quantity],
    );

    await pushDailyNutrition(userId, eatenOn);
    res.status(201).json({ item });
  }),
);

dietRouter.delete(
  '/meals/:mealId/items/:itemId',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const mealId = z.string().uuid().parse(req.params.mealId);
    const itemId = z.string().uuid().parse(req.params.itemId);

    const eatenOn = await assertMealOwned(mealId, userId);
    const deleted = await query('DELETE FROM meal_items WHERE id = $1 AND meal_id = $2 RETURNING id', [
      itemId,
      mealId,
    ]);
    if (deleted.length === 0) throw new ApiError(404, 'Item not found');

    await pushDailyNutrition(userId, eatenOn);
    res.status(204).send();
  }),
);

dietRouter.delete(
  '/meals/:mealId',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const mealId = z.string().uuid().parse(req.params.mealId);

    const eatenOn = await assertMealOwned(mealId, userId);
    await query('DELETE FROM meals WHERE id = $1', [mealId]);

    await pushDailyNutrition(userId, eatenOn);
    res.status(204).send();
  }),
);

// --- Macro targets ---------------------------------------------------------

dietRouter.get(
  '/targets',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    const targets = await query(
      `SELECT id, effective_from, kcal, protein_g, carbs_g, fat_g
       FROM nutrition_targets WHERE user_id = $1
       ORDER BY effective_from DESC`,
      [userId],
    );
    res.json({ targets });
  }),
);

dietRouter.put(
  '/targets',
  asyncHandler(async (req, res) => {
    const userId = await resolveTargetUserId(req);
    // Only the coach sets macro goals.
    if (req.user!.role !== 'trainer') {
      throw new ApiError(403, 'Only your trainer can change macro targets');
    }

    const body = z
      .object({
        clientId: z.string().uuid().optional(),
        effectiveFrom: z.string().date(),
        kcal: z.number().min(0).max(20000),
        proteinG: z.number().min(0).max(2000).default(0),
        carbsG: z.number().min(0).max(2000).default(0),
        fatG: z.number().min(0).max(2000).default(0),
      })
      .parse(req.body);

    const target = await queryOne(
      `INSERT INTO nutrition_targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, effective_from) DO UPDATE
         SET kcal = EXCLUDED.kcal, protein_g = EXCLUDED.protein_g,
             carbs_g = EXCLUDED.carbs_g, fat_g = EXCLUDED.fat_g
       RETURNING *`,
      [userId, body.effectiveFrom, body.kcal, body.proteinG, body.carbsG, body.fatG],
    );

    res.json({ target });
  }),
);

/** Recomputes the day's totals and streams them to Power BI. */
async function pushDailyNutrition(userId: string, date: string): Promise<void> {
  const totals = await queryOne<{
    client_name: string;
    kcal: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
  }>(
    `SELECT client_name, kcal, protein_g, carbs_g, fat_g
     FROM vw_fact_nutrition_daily WHERE client_id = $1 AND date_key = $2`,
    [userId, date],
  );
  if (!totals) return;

  pushAsync('nutrition', [
    {
      client_id: userId,
      client_name: totals.client_name,
      date,
      kcal: Number(totals.kcal),
      protein_g: Number(totals.protein_g),
      carbs_g: Number(totals.carbs_g),
      fat_g: Number(totals.fat_g),
      logged_at: new Date().toISOString(),
    },
  ]);
}
