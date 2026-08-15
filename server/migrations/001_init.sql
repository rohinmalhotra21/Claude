-- Train With Rohin schema
-- Postgres 14+. Designed so Power BI can DirectQuery the vw_* views directly.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('trainer', 'client');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'client',
  -- Every client belongs to exactly one trainer. Trainers have a NULL trainer_id.
  trainer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  date_of_birth DATE,
  height_cm     NUMERIC(5,1),
  sex           TEXT CHECK (sex IN ('male', 'female', 'other')),
  goal          TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT trainer_has_no_trainer CHECK (role <> 'trainer' OR trainer_id IS NULL)
);

CREATE INDEX idx_users_trainer ON users(trainer_id) WHERE trainer_id IS NOT NULL;

-- Single-use codes a trainer generates to onboard a client.
CREATE TABLE invites (
  code        TEXT PRIMARY KEY,
  trainer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT,
  redeemed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Module 1: Workouts
-- ---------------------------------------------------------------------------

CREATE TABLE exercises (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  equipment    TEXT,
  -- NULL owner = global catalog entry visible to everyone.
  created_by   UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_exercises_global_name
  ON exercises(lower(name)) WHERE created_by IS NULL;
CREATE UNIQUE INDEX idx_exercises_owned_name
  ON exercises(created_by, lower(name)) WHERE created_by IS NOT NULL;

CREATE TABLE workout_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  performed_on DATE NOT NULL,
  title        TEXT,
  notes        TEXT,
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user_date ON workout_sessions(user_id, performed_on DESC);

-- Advanced techniques. 'straight' is a normal working set.
CREATE TYPE set_technique AS ENUM (
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
  'partial'
);

CREATE TABLE workout_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  -- Ordering of the set within the session.
  position    INTEGER NOT NULL,
  weight_kg   NUMERIC(6,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  reps        INTEGER CHECK (reps IS NULL OR reps >= 0),
  rpe         NUMERIC(3,1) CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  technique   set_technique NOT NULL DEFAULT 'straight',
  -- Ties rows together for multi-set techniques: the legs of a superset, or the
  -- successive drops of a drop set, all share one technique_group.
  technique_group UUID,
  -- Order within the technique group (drop 1, drop 2 ... / A1, A2 ...).
  group_position  INTEGER,
  rest_sec    INTEGER CHECK (rest_sec IS NULL OR rest_sec >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Grouped techniques must carry a group id; straight sets must not.
  CONSTRAINT grouped_techniques_need_group CHECK (
    (technique IN ('drop_set', 'superset', 'giant_set', 'rest_pause', 'myo_reps', 'cluster'))
      = (technique_group IS NOT NULL)
  )
);

CREATE INDEX idx_sets_session ON workout_sets(session_id, position);
CREATE INDEX idx_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX idx_sets_group ON workout_sets(technique_group) WHERE technique_group IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Module 2: Diet
-- ---------------------------------------------------------------------------

-- Macros are stored per 100 g (or per 100 ml for liquids) so that any portion
-- size can be derived by simple scaling.
CREATE TABLE foods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  brand          TEXT,
  base_unit      TEXT NOT NULL DEFAULT 'g' CHECK (base_unit IN ('g', 'ml')),
  kcal_per_100     NUMERIC(7,2) NOT NULL CHECK (kcal_per_100 >= 0),
  protein_per_100  NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (protein_per_100 >= 0),
  carbs_per_100    NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (carbs_per_100 >= 0),
  fat_per_100      NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fat_per_100 >= 0),
  fiber_per_100    NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (fiber_per_100 >= 0),
  -- Optional convenience portion, e.g. "1 scoop" = 30 g.
  serving_label  TEXT,
  serving_grams  NUMERIC(7,2) CHECK (serving_grams IS NULL OR serving_grams > 0),
  created_by     UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foods_name ON foods(lower(name));

CREATE TABLE meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  eaten_on    DATE NOT NULL,
  -- "Meal 1", "Meal 2" ... ordering within the day.
  meal_index  INTEGER NOT NULL CHECK (meal_index >= 1),
  name        TEXT,
  eaten_at    TIME,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, eaten_on, meal_index)
);

CREATE INDEX idx_meals_user_date ON meals(user_id, eaten_on DESC);

CREATE TABLE meal_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id    UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  food_id    UUID NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  -- Portion in the food's base unit (g or ml).
  quantity   NUMERIC(7,2) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meal_items_meal ON meal_items(meal_id);

-- Trainer-assigned daily macro goals, effective from a date onward.
CREATE TABLE nutrition_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  kcal           NUMERIC(7,2) NOT NULL CHECK (kcal >= 0),
  protein_g      NUMERIC(6,2) NOT NULL DEFAULT 0,
  carbs_g        NUMERIC(6,2) NOT NULL DEFAULT 0,
  fat_g          NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, effective_from)
);

-- ---------------------------------------------------------------------------
-- Module 3: Supplementation
-- ---------------------------------------------------------------------------

CREATE TABLE supplements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  brand         TEXT,
  form          TEXT NOT NULL DEFAULT 'powder'
                  CHECK (form IN ('powder', 'capsule', 'tablet', 'liquid', 'gummy', 'other')),
  serving_size  NUMERIC(7,2) CHECK (serving_size IS NULL OR serving_size > 0),
  serving_unit  TEXT NOT NULL DEFAULT 'g'
                  CHECK (serving_unit IN ('g', 'mg', 'ml', 'capsule', 'tablet', 'scoop', 'iu')),
  notes         TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplements_name ON supplements(lower(name));

-- What the trainer prescribes.
CREATE TABLE supplement_protocols (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplement_id  UUID NOT NULL REFERENCES supplements(id) ON DELETE CASCADE,
  servings_per_day NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (servings_per_day > 0),
  time_of_day    TEXT CHECK (time_of_day IN ('morning', 'pre_workout', 'intra_workout',
                                             'post_workout', 'evening', 'with_meal', 'anytime')),
  starts_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on        DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT protocol_dates_ordered CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX idx_protocols_user ON supplement_protocols(user_id);

-- What the client actually took.
CREATE TABLE supplement_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplement_id UUID NOT NULL REFERENCES supplements(id) ON DELETE RESTRICT,
  taken_on      DATE NOT NULL,
  servings      NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (servings > 0),
  -- Snapshot of the dose actually taken, so later edits to the catalog entry
  -- don't rewrite history.
  serving_size  NUMERIC(7,2),
  serving_unit  TEXT,
  time_of_day   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supp_logs_user_date ON supplement_logs(user_id, taken_on DESC);

-- ---------------------------------------------------------------------------
-- Module 4: Daily log
-- ---------------------------------------------------------------------------

CREATE TABLE daily_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_on     DATE NOT NULL,
  weight_kg     NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  body_fat_pct  NUMERIC(4,1) CHECK (body_fat_pct IS NULL OR (body_fat_pct >= 0 AND body_fat_pct <= 100)),
  sleep_hours   NUMERIC(4,2) CHECK (sleep_hours IS NULL OR (sleep_hours >= 0 AND sleep_hours <= 24)),
  steps         INTEGER CHECK (steps IS NULL OR steps >= 0),
  resting_hr    INTEGER CHECK (resting_hr IS NULL OR resting_hr > 0),
  water_ml      INTEGER CHECK (water_ml IS NULL OR water_ml >= 0),
  mood          INTEGER CHECK (mood IS NULL OR (mood BETWEEN 1 AND 5)),
  energy        INTEGER CHECK (energy IS NULL OR (energy BETWEEN 1 AND 5)),
  soreness      INTEGER CHECK (soreness IS NULL OR (soreness BETWEEN 1 AND 5)),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, logged_on)
);

CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, logged_on DESC);

-- Body dimensions kept as rows rather than columns so a trainer can track any
-- site without a schema change.
CREATE TABLE body_measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  site         TEXT NOT NULL,
  value_cm     NUMERIC(5,1) NOT NULL CHECK (value_cm > 0),

  UNIQUE (daily_log_id, site)
);

CREATE INDEX idx_measurements_log ON body_measurements(daily_log_id);
