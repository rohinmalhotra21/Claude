-- Analytics layer.
--
-- These views are the contract Power BI binds to. The app writes to the base
-- tables above; Power BI reads only from the vw_* views here, so the physical
-- schema can change without breaking published reports.
--
-- Every fact view exposes client_id / client_name / trainer_id and a date column
-- so the report can filter by client and join to dim_date.

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------

-- A contiguous calendar. Power BI needs a gapless date table to make time
-- intelligence (MTD, rolling averages, period-over-period) behave.
CREATE OR REPLACE VIEW vw_dim_date AS
SELECT
  d::date                                        AS date_key,
  EXTRACT(YEAR    FROM d)::int                   AS year,
  EXTRACT(QUARTER FROM d)::int                   AS quarter,
  EXTRACT(MONTH   FROM d)::int                   AS month_number,
  to_char(d, 'Mon')                              AS month_short,
  to_char(d, 'YYYY-MM')                          AS year_month,
  EXTRACT(WEEK    FROM d)::int                   AS iso_week,
  date_trunc('week', d)::date                    AS week_start,
  EXTRACT(ISODOW  FROM d)::int                   AS day_of_week,
  to_char(d, 'Dy')                               AS day_short,
  (EXTRACT(ISODOW FROM d) >= 6)                  AS is_weekend
FROM generate_series(
  date_trunc('year', CURRENT_DATE) - INTERVAL '3 years',
  date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' - INTERVAL '1 day',
  INTERVAL '1 day'
) AS d;

CREATE OR REPLACE VIEW vw_dim_client AS
SELECT
  c.id                                           AS client_id,
  c.full_name                                    AS client_name,
  c.email                                        AS client_email,
  c.trainer_id,
  t.full_name                                    AS trainer_name,
  c.sex,
  c.height_cm,
  c.goal,
  c.active,
  c.date_of_birth,
  CASE WHEN c.date_of_birth IS NOT NULL
       THEN EXTRACT(YEAR FROM age(c.date_of_birth))::int END AS age_years,
  c.created_at::date                             AS joined_on
FROM users c
LEFT JOIN users t ON t.id = c.trainer_id
WHERE c.role = 'client';

CREATE OR REPLACE VIEW vw_dim_exercise AS
SELECT id AS exercise_id, name AS exercise_name, muscle_group, equipment
FROM exercises;

-- ---------------------------------------------------------------------------
-- Fact: workout sets (grain = one logged set)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_fact_workout_sets AS
SELECT
  ws.id                                          AS set_id,
  s.id                                           AS session_id,
  s.user_id                                      AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  s.performed_on                                 AS date_key,
  s.title                                        AS session_title,
  s.duration_min,
  e.id                                           AS exercise_id,
  e.name                                         AS exercise_name,
  e.muscle_group,
  e.equipment,
  ws.position,
  ws.weight_kg,
  ws.reps,
  ws.rpe,
  ws.technique::text                             AS technique,
  ws.technique_group,
  ws.group_position,
  ws.rest_sec,
  -- Tonnage. The headline volume measure for progressive-overload charts.
  COALESCE(ws.weight_kg, 0) * COALESCE(ws.reps, 0) AS volume_kg,
  -- Epley one-rep-max estimate, the standard strength-progress proxy.
  CASE WHEN ws.weight_kg > 0 AND ws.reps > 0
       THEN ROUND(ws.weight_kg * (1 + ws.reps::numeric / 30), 2) END AS est_1rm_kg,
  (ws.technique NOT IN ('straight', 'warmup'))   AS is_advanced_technique,
  (ws.technique = 'warmup')                      AS is_warmup
FROM workout_sets ws
JOIN workout_sessions s ON s.id = ws.session_id
JOIN users u            ON u.id = s.user_id
JOIN exercises e        ON e.id = ws.exercise_id;

-- Session-level rollup, for "sessions per week" and adherence tiles.
CREATE OR REPLACE VIEW vw_fact_workout_sessions AS
SELECT
  s.id                                           AS session_id,
  s.user_id                                      AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  s.performed_on                                 AS date_key,
  s.title                                        AS session_title,
  s.duration_min,
  COUNT(ws.id)                                                    AS total_sets,
  COUNT(ws.id) FILTER (WHERE ws.technique = 'warmup')             AS warmup_sets,
  COUNT(ws.id) FILTER (
    WHERE ws.technique NOT IN ('straight', 'warmup'))             AS advanced_sets,
  COUNT(DISTINCT ws.exercise_id)                                  AS exercises_performed,
  COALESCE(SUM(COALESCE(ws.weight_kg, 0) * COALESCE(ws.reps, 0)), 0) AS total_volume_kg,
  COALESCE(SUM(ws.reps), 0)                                       AS total_reps,
  ROUND(AVG(ws.rpe), 2)                                           AS avg_rpe
FROM workout_sessions s
JOIN users u              ON u.id = s.user_id
LEFT JOIN workout_sets ws ON ws.session_id = s.id
GROUP BY s.id, s.user_id, u.full_name, u.trainer_id, s.performed_on, s.title, s.duration_min;

-- How often each advanced technique is actually being used.
CREATE OR REPLACE VIEW vw_fact_technique_usage AS
SELECT
  s.user_id                                      AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  s.performed_on                                 AS date_key,
  ws.technique::text                             AS technique,
  COUNT(DISTINCT ws.technique_group)             AS technique_instances,
  COUNT(*)                                       AS sets_involved,
  COALESCE(SUM(COALESCE(ws.weight_kg, 0) * COALESCE(ws.reps, 0)), 0) AS volume_kg
FROM workout_sets ws
JOIN workout_sessions s ON s.id = ws.session_id
JOIN users u            ON u.id = s.user_id
WHERE ws.technique NOT IN ('straight', 'warmup')
GROUP BY s.user_id, u.full_name, u.trainer_id, s.performed_on, ws.technique;

-- ---------------------------------------------------------------------------
-- Fact: nutrition
-- ---------------------------------------------------------------------------

-- Grain = one food item in one meal, with macros already scaled to the portion.
CREATE OR REPLACE VIEW vw_fact_meal_items AS
SELECT
  mi.id                                          AS meal_item_id,
  m.id                                           AS meal_id,
  m.user_id                                      AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  m.eaten_on                                     AS date_key,
  m.meal_index,
  COALESCE(m.name, 'Meal ' || m.meal_index)      AS meal_name,
  m.eaten_at,
  f.id                                           AS food_id,
  f.name                                         AS food_name,
  f.brand,
  mi.quantity,
  f.base_unit,
  ROUND(f.kcal_per_100    * mi.quantity / 100, 2) AS kcal,
  ROUND(f.protein_per_100 * mi.quantity / 100, 2) AS protein_g,
  ROUND(f.carbs_per_100   * mi.quantity / 100, 2) AS carbs_g,
  ROUND(f.fat_per_100     * mi.quantity / 100, 2) AS fat_g,
  ROUND(f.fiber_per_100   * mi.quantity / 100, 2) AS fiber_g
FROM meal_items mi
JOIN meals m ON m.id = mi.meal_id
JOIN users u ON u.id = m.user_id
JOIN foods f ON f.id = mi.food_id;

-- Daily totals against the target that was in force on that date.
CREATE OR REPLACE VIEW vw_fact_nutrition_daily AS
WITH daily AS (
  SELECT
    client_id, client_name, trainer_id, date_key,
    SUM(kcal)      AS kcal,
    SUM(protein_g) AS protein_g,
    SUM(carbs_g)   AS carbs_g,
    SUM(fat_g)     AS fat_g,
    SUM(fiber_g)   AS fiber_g,
    COUNT(DISTINCT meal_id) AS meals_logged
  FROM vw_fact_meal_items
  GROUP BY client_id, client_name, trainer_id, date_key
)
SELECT
  d.*,
  t.kcal      AS target_kcal,
  t.protein_g AS target_protein_g,
  t.carbs_g   AS target_carbs_g,
  t.fat_g     AS target_fat_g,
  CASE WHEN t.kcal > 0      THEN ROUND(d.kcal      / t.kcal      * 100, 1) END AS kcal_pct_of_target,
  CASE WHEN t.protein_g > 0 THEN ROUND(d.protein_g / t.protein_g * 100, 1) END AS protein_pct_of_target,
  d.kcal - t.kcal AS kcal_variance
FROM daily d
-- The most recent target effective on or before that day.
LEFT JOIN LATERAL (
  SELECT nt.kcal, nt.protein_g, nt.carbs_g, nt.fat_g
  FROM nutrition_targets nt
  WHERE nt.user_id = d.client_id
    AND nt.effective_from <= d.date_key
  ORDER BY nt.effective_from DESC
  LIMIT 1
) t ON TRUE;

-- ---------------------------------------------------------------------------
-- Fact: supplementation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_fact_supplement_logs AS
SELECT
  sl.id                                          AS supplement_log_id,
  sl.user_id                                     AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  sl.taken_on                                    AS date_key,
  s.id                                           AS supplement_id,
  s.name                                         AS supplement_name,
  s.brand,
  s.form,
  sl.servings,
  COALESCE(sl.serving_size, s.serving_size)      AS serving_size,
  COALESCE(sl.serving_unit, s.serving_unit)      AS serving_unit,
  sl.servings * COALESCE(sl.serving_size, s.serving_size) AS total_dose,
  sl.time_of_day
FROM supplement_logs sl
JOIN users u       ON u.id = sl.user_id
JOIN supplements s ON s.id = sl.supplement_id;

-- Prescribed vs. taken, per client per supplement per active day.
CREATE OR REPLACE VIEW vw_fact_supplement_adherence AS
SELECT
  p.user_id                                      AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  d.date_key,
  s.id                                           AS supplement_id,
  s.name                                         AS supplement_name,
  p.servings_per_day                             AS prescribed_servings,
  COALESCE(SUM(sl.servings), 0)                  AS taken_servings,
  (COALESCE(SUM(sl.servings), 0) > 0)            AS was_taken,
  ROUND(
    LEAST(COALESCE(SUM(sl.servings), 0) / NULLIF(p.servings_per_day, 0), 1) * 100, 1
  )                                              AS adherence_pct
FROM supplement_protocols p
JOIN users u       ON u.id = p.user_id
JOIN supplements s ON s.id = p.supplement_id
JOIN vw_dim_date d
  ON d.date_key >= p.starts_on
 AND d.date_key <= LEAST(COALESCE(p.ends_on, CURRENT_DATE), CURRENT_DATE)
LEFT JOIN supplement_logs sl
  ON sl.user_id = p.user_id
 AND sl.supplement_id = p.supplement_id
 AND sl.taken_on = d.date_key
GROUP BY p.user_id, u.full_name, u.trainer_id, d.date_key,
         s.id, s.name, p.servings_per_day;

-- ---------------------------------------------------------------------------
-- Fact: daily log / body metrics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_fact_daily_log AS
SELECT
  dl.id                                          AS daily_log_id,
  dl.user_id                                     AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  dl.logged_on                                   AS date_key,
  dl.weight_kg,
  dl.body_fat_pct,
  CASE WHEN dl.weight_kg IS NOT NULL AND dl.body_fat_pct IS NOT NULL
       THEN ROUND(dl.weight_kg * (1 - dl.body_fat_pct / 100), 2) END AS lean_mass_kg,
  CASE WHEN u.height_cm > 0 AND dl.weight_kg IS NOT NULL
       THEN ROUND(dl.weight_kg / POWER(u.height_cm / 100, 2), 1) END AS bmi,
  dl.sleep_hours,
  dl.steps,
  dl.resting_hr,
  dl.water_ml,
  dl.mood,
  dl.energy,
  dl.soreness,
  -- Scale weight is noisy; the 7-day trailing mean is what a coach reads.
  ROUND(AVG(dl.weight_kg) OVER (
    PARTITION BY dl.user_id ORDER BY dl.logged_on
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ), 2)                                          AS weight_kg_7d_avg,
  dl.weight_kg - FIRST_VALUE(dl.weight_kg) OVER (
    PARTITION BY dl.user_id ORDER BY dl.logged_on
  )                                              AS weight_change_from_start_kg,
  dl.notes
FROM daily_logs dl
JOIN users u ON u.id = dl.user_id;

-- Unpivoted body dimensions: one row per site per day, ready to slice.
CREATE OR REPLACE VIEW vw_fact_body_measurements AS
SELECT
  bm.id                                          AS measurement_id,
  dl.user_id                                     AS client_id,
  u.full_name                                    AS client_name,
  u.trainer_id,
  dl.logged_on                                   AS date_key,
  bm.site,
  bm.value_cm,
  bm.value_cm - FIRST_VALUE(bm.value_cm) OVER (
    PARTITION BY dl.user_id, bm.site ORDER BY dl.logged_on
  )                                              AS change_from_start_cm
FROM body_measurements bm
JOIN daily_logs dl ON dl.id = bm.daily_log_id
JOIN users u       ON u.id = dl.user_id;

-- ---------------------------------------------------------------------------
-- Trainer overview: one row per client, for the roster page of the report
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_client_summary AS
SELECT
  c.client_id,
  c.client_name,
  c.trainer_id,
  c.trainer_name,
  c.goal,
  c.active,
  (SELECT MAX(performed_on) FROM workout_sessions WHERE user_id = c.client_id) AS last_workout_on,
  (SELECT MAX(logged_on)    FROM daily_logs       WHERE user_id = c.client_id) AS last_checkin_on,
  (SELECT COUNT(*) FROM workout_sessions
    WHERE user_id = c.client_id AND performed_on >= CURRENT_DATE - 7)          AS workouts_last_7d,
  (SELECT ROUND(AVG(kcal), 0) FROM vw_fact_nutrition_daily
    WHERE client_id = c.client_id AND date_key >= CURRENT_DATE - 7)            AS avg_kcal_last_7d,
  (SELECT ROUND(AVG(protein_g), 0) FROM vw_fact_nutrition_daily
    WHERE client_id = c.client_id AND date_key >= CURRENT_DATE - 7)            AS avg_protein_last_7d,
  (SELECT weight_kg FROM daily_logs
    WHERE user_id = c.client_id AND weight_kg IS NOT NULL
    ORDER BY logged_on DESC LIMIT 1)                                           AS latest_weight_kg,
  (SELECT ROUND(AVG(adherence_pct), 1) FROM vw_fact_supplement_adherence
    WHERE client_id = c.client_id AND date_key >= CURRENT_DATE - 7)            AS supp_adherence_last_7d
FROM vw_dim_client c;
