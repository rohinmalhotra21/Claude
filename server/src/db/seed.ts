/**
 * Seeds the catalog plus a demo trainer with two clients and ~8 weeks of
 * history, so the Power BI report has something to render on first open.
 *
 * Safe to re-run: it clears demo users and their cascaded data first.
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './pool.js';

const EXERCISES: [name: string, muscle: string, equipment: string][] = [
  ['Barbell Back Squat', 'Legs', 'Barbell'],
  ['Front Squat', 'Legs', 'Barbell'],
  ['Romanian Deadlift', 'Hamstrings', 'Barbell'],
  ['Conventional Deadlift', 'Back', 'Barbell'],
  ['Leg Press', 'Legs', 'Machine'],
  ['Leg Extension', 'Quads', 'Machine'],
  ['Lying Leg Curl', 'Hamstrings', 'Machine'],
  ['Walking Lunge', 'Legs', 'Dumbbell'],
  ['Standing Calf Raise', 'Calves', 'Machine'],
  ['Barbell Bench Press', 'Chest', 'Barbell'],
  ['Incline Dumbbell Press', 'Chest', 'Dumbbell'],
  ['Cable Fly', 'Chest', 'Cable'],
  ['Overhead Press', 'Shoulders', 'Barbell'],
  ['Lateral Raise', 'Shoulders', 'Dumbbell'],
  ['Rear Delt Fly', 'Shoulders', 'Dumbbell'],
  ['Pull-Up', 'Back', 'Bodyweight'],
  ['Lat Pulldown', 'Back', 'Cable'],
  ['Barbell Row', 'Back', 'Barbell'],
  ['Seated Cable Row', 'Back', 'Cable'],
  ['Face Pull', 'Shoulders', 'Cable'],
  ['Barbell Curl', 'Biceps', 'Barbell'],
  ['Incline Dumbbell Curl', 'Biceps', 'Dumbbell'],
  ['Triceps Pushdown', 'Triceps', 'Cable'],
  ['Skullcrusher', 'Triceps', 'Barbell'],
  ['Cable Crunch', 'Core', 'Cable'],
  ['Plank', 'Core', 'Bodyweight'],
];

// name, brand, kcal, protein, carbs, fat, fiber (per 100 g)
const FOODS: [string, string | null, number, number, number, number, number][] = [
  ['Chicken Breast, raw', null, 165, 31, 0, 3.6, 0],
  ['Lean Beef Mince 5%', null, 137, 21.5, 0, 5, 0],
  ['Salmon Fillet', null, 208, 20, 0, 13, 0],
  ['Whole Egg', null, 143, 12.6, 0.7, 9.5, 0],
  ['Egg White', null, 52, 10.9, 0.7, 0.2, 0],
  ['White Rice, dry', null, 360, 7, 79, 0.7, 1.3],
  ['Basmati Rice, cooked', null, 121, 3.5, 25, 0.4, 0.7],
  ['Rolled Oats', null, 379, 13, 67, 6.5, 10],
  ['Sweet Potato', null, 86, 1.6, 20, 0.1, 3],
  ['Whole Wheat Bread', null, 247, 13, 41, 3.4, 7],
  ['Broccoli', null, 34, 2.8, 7, 0.4, 2.6],
  ['Spinach', null, 23, 2.9, 3.6, 0.4, 2.2],
  ['Banana', null, 89, 1.1, 23, 0.3, 2.6],
  ['Apple', null, 52, 0.3, 14, 0.2, 2.4],
  ['Greek Yogurt 0%', null, 59, 10, 3.6, 0.4, 0],
  ['Cottage Cheese', null, 98, 11, 3.4, 4.3, 0],
  ['Almonds', null, 579, 21, 22, 50, 12.5],
  ['Peanut Butter', null, 588, 25, 20, 50, 6],
  ['Olive Oil', null, 884, 0, 0, 100, 0],
  ['Whey Protein Isolate', 'Generic', 373, 85, 4, 1.5, 0],
];

// name, brand, form, serving size, unit
const SUPPLEMENTS: [string, string | null, string, number, string][] = [
  ['Whey Protein Isolate', 'Generic', 'powder', 30, 'g'],
  ['Creatine Monohydrate', null, 'powder', 5, 'g'],
  ['Vitamin D3', null, 'capsule', 4000, 'iu'],
  ['Omega-3 Fish Oil', null, 'capsule', 1000, 'mg'],
  ['Magnesium Glycinate', null, 'capsule', 400, 'mg'],
  ['Caffeine', null, 'tablet', 200, 'mg'],
  ['Zinc', null, 'capsule', 25, 'mg'],
  ['Electrolytes', null, 'powder', 6, 'g'],
];

const MEASUREMENT_SITES = ['chest', 'waist', 'hips', 'left_bicep', 'right_bicep', 'left_thigh'];

/** Deterministic pseudo-random so re-seeding produces the same demo data. */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const DAYS_OF_HISTORY = 56;

async function seed(): Promise<void> {
  await transaction(async (db) => {
    const hash = await bcrypt.hash('password123', 12);

    // --- Reset demo accounts -------------------------------------------------
    await db.query(
      `DELETE FROM users WHERE email IN
       ('coach@fittrack.app', 'alex@fittrack.app', 'priya@fittrack.app')`,
    );

    // --- Catalog (global rows, shared by everyone) --------------------------
    for (const [name, muscle, equipment] of EXERCISES) {
      await db.query(
        `INSERT INTO exercises (name, muscle_group, equipment) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [name, muscle, equipment],
      );
    }

    for (const [name, brand, kcal, protein, carbs, fat, fiber] of FOODS) {
      await db.query(
        `INSERT INTO foods (name, brand, kcal_per_100, protein_per_100,
                            carbs_per_100, fat_per_100, fiber_per_100)
         SELECT $1, $2, $3, $4, $5, $6, $7
         WHERE NOT EXISTS (
           SELECT 1 FROM foods WHERE lower(name) = lower($1) AND created_by IS NULL
         )`,
        [name, brand, kcal, protein, carbs, fat, fiber],
      );
    }

    for (const [name, brand, form, size, unit] of SUPPLEMENTS) {
      await db.query(
        `INSERT INTO supplements (name, brand, form, serving_size, serving_unit)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM supplements WHERE lower(name) = lower($1) AND created_by IS NULL
         )`,
        [name, brand, form, size, unit],
      );
    }

    // --- People -------------------------------------------------------------
    const trainer = await db.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ('coach@fittrack.app', $1, 'Sam Rivera', 'trainer') RETURNING id`,
      [hash],
    );
    const trainerId = trainer.rows[0]!.id;

    const clients: { id: string; name: string; startWeight: number; kcal: number }[] = [];
    for (const [email, name, dob, height, sex, goal, startWeight, kcal] of [
      ['alex@fittrack.app', 'Alex Chen', '1994-03-11', 178, 'male', 'Lean bulk to 82 kg', 76.4, 2900],
      ['priya@fittrack.app', 'Priya Nair', '1991-08-27', 165, 'female', 'Fat loss, keep strength', 68.2, 1950],
    ] as const) {
      const created = await db.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, full_name, role, trainer_id,
                            date_of_birth, height_cm, sex, goal)
         VALUES ($1, $2, $3, 'client', $4, $5, $6, $7, $8) RETURNING id`,
        [email, hash, name, trainerId, dob, height, sex, goal],
      );
      clients.push({ id: created.rows[0]!.id, name, startWeight, kcal });
    }

    // --- Lookups ------------------------------------------------------------
    const exerciseRows = await db.query<{ id: string; name: string; muscle_group: string }>(
      'SELECT id, name, muscle_group FROM exercises WHERE created_by IS NULL',
    );
    const byName = new Map(exerciseRows.rows.map((r) => [r.name, r.id]));

    const foodRows = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM foods WHERE created_by IS NULL',
    );
    const foodByName = new Map(foodRows.rows.map((r) => [r.name, r.id]));

    const suppRows = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM supplements WHERE created_by IS NULL',
    );
    const suppByName = new Map(suppRows.rows.map((r) => [r.name, r.id]));

    // A 4-day upper/lower split.
    const SPLIT: Record<number, { title: string; work: [string, number, number][] }> = {
      1: {
        title: 'Lower A',
        work: [
          ['Barbell Back Squat', 100, 6],
          ['Romanian Deadlift', 90, 8],
          ['Leg Press', 180, 10],
          ['Lying Leg Curl', 45, 12],
          ['Standing Calf Raise', 70, 15],
        ],
      },
      2: {
        title: 'Upper A',
        work: [
          ['Barbell Bench Press', 80, 6],
          ['Barbell Row', 75, 8],
          ['Overhead Press', 45, 8],
          ['Lat Pulldown', 60, 10],
          ['Lateral Raise', 10, 15],
          ['Triceps Pushdown', 30, 12],
        ],
      },
      4: {
        title: 'Lower B',
        work: [
          ['Conventional Deadlift', 120, 5],
          ['Front Squat', 70, 8],
          ['Walking Lunge', 20, 12],
          ['Leg Extension', 50, 15],
        ],
      },
      5: {
        title: 'Upper B',
        work: [
          ['Incline Dumbbell Press', 30, 8],
          ['Pull-Up', 0, 8],
          ['Seated Cable Row', 65, 10],
          ['Face Pull', 25, 15],
          ['Barbell Curl', 30, 10],
          ['Skullcrusher', 30, 12],
        ],
      },
    };

    for (const [clientIndex, client] of clients.entries()) {
      const rng = makeRng(1337 + clientIndex * 977);
      // Alex gains, Priya cuts.
      const weightDrift = clientIndex === 0 ? 0.035 : -0.055;
      const strengthScale = clientIndex === 0 ? 1 : 0.62;

      // Macro targets
      await db.query(
        `INSERT INTO nutrition_targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          client.id,
          isoDate(DAYS_OF_HISTORY),
          client.kcal,
          Math.round(client.startWeight * 2.2),
          Math.round((client.kcal * 0.45) / 4),
          Math.round((client.kcal * 0.25) / 9),
        ],
      );

      // Supplement protocol
      const prescribed =
        clientIndex === 0
          ? [
              ['Whey Protein Isolate', 2, 'post_workout'],
              ['Creatine Monohydrate', 1, 'anytime'],
              ['Vitamin D3', 1, 'morning'],
              ['Omega-3 Fish Oil', 2, 'with_meal'],
            ]
          : [
              ['Whey Protein Isolate', 1, 'post_workout'],
              ['Magnesium Glycinate', 1, 'evening'],
              ['Vitamin D3', 1, 'morning'],
              ['Electrolytes', 1, 'anytime'],
            ];

      for (const [name, servings, time] of prescribed as [string, number, string][]) {
        await db.query(
          `INSERT INTO supplement_protocols
             (user_id, supplement_id, servings_per_day, time_of_day, starts_on)
           VALUES ($1, $2, $3, $4, $5)`,
          [client.id, suppByName.get(name), servings, time, isoDate(DAYS_OF_HISTORY)],
        );
      }

      for (let ago = DAYS_OF_HISTORY; ago >= 0; ago--) {
        const date = isoDate(ago);
        const elapsed = DAYS_OF_HISTORY - ago;
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

        // --- Workout ---------------------------------------------------------
        const plan = SPLIT[weekday];
        // The odd session gets skipped, as in real life.
        if (plan && rng() > 0.12) {
          const session = await db.query<{ id: string }>(
            `INSERT INTO workout_sessions (user_id, performed_on, title, duration_min)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [client.id, date, plan.title, 55 + Math.round(rng() * 25)],
          );
          const sessionId = session.rows[0]!.id;

          let position = 0;
          for (const [exerciseIndex, [exName, baseWeight, baseReps]] of plan.work.entries()) {
            const exerciseId = byName.get(exName);
            if (!exerciseId) continue;

            // ~1.5% linear progression per week, plus noise.
            const progression = 1 + (elapsed / 7) * 0.015;
            const working = Math.round(baseWeight * strengthScale * progression * 2) / 2;

            // One warm-up on the first two compounds.
            if (exerciseIndex < 2 && working > 0) {
              await db.query(
                `INSERT INTO workout_sets
                   (session_id, exercise_id, position, weight_kg, reps, technique)
                 VALUES ($1, $2, $3, $4, $5, 'warmup')`,
                [sessionId, exerciseId, position++, Math.round(working * 0.5), 8],
              );
            }

            const isLastExercise = exerciseIndex === plan.work.length - 1;
            const roll = rng();

            if (isLastExercise && roll < 0.4) {
              // Drop set: three descending drops sharing one group.
              const group = randomUUID();
              for (let drop = 0; drop < 3; drop++) {
                await db.query(
                  `INSERT INTO workout_sets
                     (session_id, exercise_id, position, weight_kg, reps, rpe,
                      technique, technique_group, group_position)
                   VALUES ($1, $2, $3, $4, $5, $6, 'drop_set', $7, $8)`,
                  [
                    sessionId,
                    exerciseId,
                    position++,
                    Math.round(working * (1 - drop * 0.2) * 2) / 2,
                    baseReps + drop * 2,
                    9 + drop * 0.5 > 10 ? 10 : 9 + drop * 0.5,
                    group,
                    drop + 1,
                  ],
                );
              }
            } else if (exerciseIndex >= 3 && roll > 0.75) {
              // Superset with the next movement in the plan.
              const partner = plan.work[(exerciseIndex + 1) % plan.work.length]!;
              const partnerId = byName.get(partner[0]);
              const group = randomUUID();

              await db.query(
                `INSERT INTO workout_sets
                   (session_id, exercise_id, position, weight_kg, reps, rpe,
                    technique, technique_group, group_position)
                 VALUES ($1, $2, $3, $4, $5, 8.5, 'superset', $6, 1)`,
                [sessionId, exerciseId, position++, working, baseReps, group],
              );

              if (partnerId) {
                await db.query(
                  `INSERT INTO workout_sets
                     (session_id, exercise_id, position, weight_kg, reps, rpe,
                      technique, technique_group, group_position)
                   VALUES ($1, $2, $3, $4, $5, 9, 'superset', $6, 2)`,
                  [
                    sessionId,
                    partnerId,
                    position++,
                    Math.round(partner[1] * strengthScale * progression * 2) / 2,
                    partner[2],
                    group,
                  ],
                );
              }
            } else {
              // Three straight working sets.
              for (let set = 0; set < 3; set++) {
                await db.query(
                  `INSERT INTO workout_sets
                     (session_id, exercise_id, position, weight_kg, reps, rpe,
                      technique, rest_sec)
                   VALUES ($1, $2, $3, $4, $5, $6, 'straight', $7)`,
                  [
                    sessionId,
                    exerciseId,
                    position++,
                    working,
                    Math.max(1, baseReps - set + (rng() > 0.6 ? 1 : 0)),
                    Math.round((7.5 + set * 0.5 + rng()) * 2) / 2,
                    exerciseIndex < 2 ? 180 : 90,
                  ],
                );
              }
            }
          }
        }

        // --- Diet: logged on ~85% of days -----------------------------------
        if (rng() > 0.15) {
          const plan: [string, [string, number][]][] = [
            [
              'Breakfast',
              [
                ['Rolled Oats', 80],
                ['Whole Egg', 100],
                ['Banana', 120],
              ],
            ],
            [
              'Lunch',
              [
                ['Chicken Breast, raw', clientIndex === 0 ? 220 : 150],
                ['Basmati Rice, cooked', clientIndex === 0 ? 300 : 180],
                ['Broccoli', 150],
                ['Olive Oil', 10],
              ],
            ],
            [
              'Post-Workout',
              [
                ['Whey Protein Isolate', 35],
                ['Apple', 150],
              ],
            ],
            [
              'Dinner',
              [
                ['Salmon Fillet', clientIndex === 0 ? 200 : 150],
                ['Sweet Potato', clientIndex === 0 ? 300 : 200],
                ['Spinach', 100],
              ],
            ],
            [
              'Evening',
              [
                ['Greek Yogurt 0%', 200],
                ['Almonds', clientIndex === 0 ? 30 : 15],
              ],
            ],
          ];

          for (const [mealIndex, [mealName, items]] of plan.entries()) {
            // Skip the odd meal so adherence isn't a flat 100%.
            if (rng() < 0.08) continue;

            const meal = await db.query<{ id: string }>(
              `INSERT INTO meals (user_id, eaten_on, meal_index, name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, eaten_on, meal_index) DO NOTHING
               RETURNING id`,
              [client.id, date, mealIndex + 1, mealName],
            );
            const mealId = meal.rows[0]?.id;
            if (!mealId) continue;

            for (const [foodName, grams] of items) {
              const foodId = foodByName.get(foodName);
              if (!foodId) continue;
              // ±10% portion variance.
              const quantity = Math.round(grams * (0.9 + rng() * 0.2));
              await db.query(
                'INSERT INTO meal_items (meal_id, food_id, quantity) VALUES ($1, $2, $3)',
                [mealId, foodId, quantity],
              );
            }
          }
        }

        // --- Supplements ----------------------------------------------------
        for (const [name, servings, time] of prescribed as [string, number, string][]) {
          // ~88% adherence.
          if (rng() > 0.12) {
            await db.query(
              `INSERT INTO supplement_logs
                 (user_id, supplement_id, taken_on, servings, serving_size, serving_unit, time_of_day)
               SELECT $1, s.id, $2, $3, s.serving_size, s.serving_unit, $4
               FROM supplements s WHERE s.id = $5`,
              [client.id, date, servings, time, suppByName.get(name)],
            );
          }
        }

        // --- Daily log ------------------------------------------------------
        if (rng() > 0.1) {
          const weight =
            client.startWeight + elapsed * weightDrift + (rng() - 0.5) * 0.7;

          const log = await db.query<{ id: string }>(
            `INSERT INTO daily_logs
               (user_id, logged_on, weight_kg, body_fat_pct, sleep_hours, steps,
                resting_hr, water_ml, mood, energy, soreness)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (user_id, logged_on) DO NOTHING
             RETURNING id`,
            [
              client.id,
              date,
              Math.round(weight * 10) / 10,
              Math.round((clientIndex === 0 ? 14 + elapsed * 0.01 : 26 - elapsed * 0.035) * 10) / 10,
              Math.round((6.5 + rng() * 2) * 10) / 10,
              6000 + Math.round(rng() * 7000),
              52 + Math.round(rng() * 12),
              2000 + Math.round(rng() * 1500),
              3 + Math.round(rng() * 2),
              3 + Math.round(rng() * 2),
              1 + Math.round(rng() * 3),
            ],
          );

          // Tape measurements once a week.
          const logId = log.rows[0]?.id;
          if (logId && elapsed % 7 === 0) {
            const base: Record<string, number> = {
              chest: clientIndex === 0 ? 102 : 91,
              waist: clientIndex === 0 ? 82 : 76,
              hips: clientIndex === 0 ? 98 : 99,
              left_bicep: clientIndex === 0 ? 37 : 29,
              right_bicep: clientIndex === 0 ? 37.5 : 29.2,
              left_thigh: clientIndex === 0 ? 60 : 55,
            };

            for (const site of MEASUREMENT_SITES) {
              // Waist shrinks on a cut, everything else creeps up on a bulk.
              const drift =
                site === 'waist'
                  ? (clientIndex === 0 ? 0.008 : -0.03) * elapsed
                  : (clientIndex === 0 ? 0.012 : -0.004) * elapsed;

              await db.query(
                'INSERT INTO body_measurements (daily_log_id, site, value_cm) VALUES ($1, $2, $3)',
                [logId, site, Math.round((base[site]! + drift) * 10) / 10],
              );
            }
          }
        }
      }
    }

    console.log('Seeded demo data:');
    console.log('  trainer  coach@fittrack.app / password123');
    console.log('  clients  alex@fittrack.app, priya@fittrack.app / password123');
  });
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
