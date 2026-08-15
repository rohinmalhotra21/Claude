export type Role = 'trainer' | 'client';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  trainerId: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string | null;
  custom?: boolean;
}

export type Technique =
  | 'straight'
  | 'warmup'
  | 'drop_set'
  | 'superset'
  | 'giant_set'
  | 'rest_pause'
  | 'myo_reps'
  | 'cluster'
  | 'amrap'
  | 'negative'
  | 'partial';

/** A set as the user is building it, before it's sent to the API. */
export interface DraftSet {
  /** Local-only id so the list can key and remove rows. */
  key: string;
  exerciseId: string;
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  technique: Technique;
  groupKey?: string;
  notes?: string | null;
}

export interface WorkoutSessionSummary {
  id: string;
  performed_on: string;
  title: string | null;
  duration_min: number | null;
  total_sets: string;
  advanced_sets: string;
  exercises_performed: string;
  total_volume_kg: string;
  total_reps: string;
  avg_rpe: string | null;
}

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  base_unit: 'g' | 'ml';
  kcal_per_100: string;
  protein_per_100: string;
  carbs_per_100: string;
  fat_per_100: string;
  fiber_per_100: string;
  serving_label: string | null;
  serving_grams: string | null;
}

export interface MealItem {
  id: string;
  foodId: string;
  foodName: string;
  brand: string | null;
  quantity: string;
  unit: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
}

export interface Meal {
  id: string;
  meal_index: number;
  name: string;
  eaten_at: string | null;
  items: MealItem[];
}

export interface DayTotals {
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
  meals_logged: string;
  target_kcal: string | null;
  target_protein_g: string | null;
  target_carbs_g: string | null;
  target_fat_g: string | null;
  kcal_pct_of_target: string | null;
  protein_pct_of_target: string | null;
}

export interface Supplement {
  id: string;
  name: string;
  brand: string | null;
  form: string;
  serving_size: string | null;
  serving_unit: string;
  notes?: string | null;
}

export interface ProtocolRow {
  supplement_id: string;
  supplement_name: string;
  prescribed_servings: string;
  taken_servings: string;
  was_taken: boolean;
  adherence_pct: string;
  serving_size: string | null;
  serving_unit: string;
  time_of_day: string | null;
}

export interface DailyLog {
  id: string;
  logged_on: string;
  weight_kg: string | null;
  body_fat_pct: string | null;
  sleep_hours: string | null;
  steps: number | null;
  resting_hr: number | null;
  water_ml: number | null;
  mood: number | null;
  energy: number | null;
  soreness: number | null;
  notes: string | null;
}

export interface ClientSummary {
  id: string;
  full_name: string;
  goal: string | null;
  active: boolean;
  last_workout_on: string | null;
  last_checkin_on: string | null;
  workouts_last_7d: string;
  avg_kcal_last_7d: string | null;
  avg_protein_last_7d: string | null;
  latest_weight_kg: string | null;
  supp_adherence_last_7d: string | null;
}

export interface Overview {
  days: number;
  headline: {
    sessions: string;
    total_volume_kg: string;
    avg_kcal: string | null;
    avg_protein_g: string | null;
    supp_adherence_pct: string | null;
  } | null;
  volumeByWeek: { week_start: string; volume_kg: string; sessions: string }[];
  muscleSplit: { muscle_group: string; volume_kg: string; sets: string }[];
  nutritionTrend: {
    date_key: string;
    kcal: string;
    protein_g: string;
    target_kcal: string | null;
  }[];
  weightTrend: { date_key: string; weight_kg: string; weight_kg_7d_avg: string | null }[];
  techniqueMix: { technique: string; instances: string; sets: string }[];
}
