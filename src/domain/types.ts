/**
 * Entidades persistidas. Os nomes de campos seguem o esquema do banco
 * (snake_case) para evitar camadas de mapeamento entre app e Supabase.
 */
import type { Nutrients } from './nutrients';

export type ISODate = string; // AAAA-MM-DD
export type ISODateTime = string; // ISO 8601

export interface BaseRow {
  id: string;
  user_id: string;
  created_at: ISODateTime;
  updated_at?: ISODateTime;
}

export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Objective = 'fat_loss' | 'maintenance' | 'recomposition' | 'muscle_gain';

/** Sinalizadores de saúde que exigem cautela automática nas metas. */
export type HealthFlag =
  | 'kidney_disease'
  | 'heart_failure'
  | 'liver_disease'
  | 'diabetes'
  | 'hypertension'
  | 'pregnancy'
  | 'breastfeeding'
  | 'eating_disorder_history'
  | 'other';

export interface Profile extends BaseRow {
  name: string;
  birth_date: ISODate | null;
  sex: Sex | null; // sexo biológico, usado apenas nas equações
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  other_measures: Record<string, number> | null;
  activity_level: ActivityLevel | null;
  work_routine: string | null;
  does_resistance_training: boolean | null;
  /** Objetivo usado no cálculo das metas (derivado de `objectives`). */
  objective: Objective | null;
  /** Objetivos marcados pelo usuário (pode haver mais de um). */
  objectives: Objective[];
  target_date: ISODate | null;
  wake_time: string | null; // HH:MM
  sleep_time: string | null;
  meal_times: Partial<Record<MealType, string>> | null;
  food_preferences: string | null;
  food_restrictions: string[] | null;
  allergies: string[] | null;
  intolerances: string[] | null;
  health_flags: HealthFlag[] | null;
  health_notes: string | null; // sensível
  supplements_notes: string | null;
  professional_guidance: string | null;
  hot_climate: boolean | null;
  water_ml_per_kg: number | null;
  onboarding_completed: boolean;
  consent_health_data_at: ISODateTime | null;
  consent_ai_at: ISODateTime | null;
  settings: AppSettings | null;
}

export interface AppSettings {
  theme?: 'system' | 'light' | 'dark';
  /** Bebidas que contam para a meta de líquidos. */
  counted_beverages?: Partial<Record<Beverage, boolean>>;
  /** Percentual das calorias de exercício devolvido à meta do dia (padrão 0). */
  exercise_credit_pct?: number;
  /** Incluir observações de saúde no contexto enviado à IA. */
  ai_include_health_notes?: boolean;
  /** Última versão da base de alimentos vista neste perfil (aviso "base atualizada"). */
  seen_food_base?: { atualizado_em: string; total: number };
}

export type GoalOrigin = 'system' | 'user' | 'professional';
export type GoalKey = 'energy_kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'water_ml';

export interface GoalTarget {
  value: number | null;
  origin: GoalOrigin;
  /** Como o valor foi obtido (texto para o usuário). */
  explanation: string;
  /** Faixa de referência, quando aplicável. */
  range?: [number, number];
  /** Avisos de segurança, por exemplo "requer avaliação profissional". */
  warnings?: string[];
  professional_name?: string | null;
}

export type GoalTargets = Record<GoalKey, GoalTarget>;

/** Cada alteração cria uma nova versão (rastreabilidade). */
export interface GoalSet extends BaseRow {
  valid_from: ISODateTime;
  targets: GoalTargets;
  /** Snapshot dos cálculos de energia que originaram as metas. */
  calc: Record<string, unknown> | null;
  note: string | null;
}

export type FoodSource = 'taco' | 'tbca' | 'usda' | 'off' | 'label' | 'manual' | 'recipe' | 'ai_estimate';
/** verified = conferido em fonte oficial/rótulo; reported = informado por fonte, não conferido; estimated = estimativa. */
export type Verification = 'verified' | 'reported' | 'estimated';
export type BaseUnit = 'g' | 'ml';

export interface HouseholdMeasure {
  label: string; // "1 unidade", "1 colher de sopa"
  amount: number; // em g ou ml
  estimated: boolean;
}

export type SupplementCategory =
  | 'whey_concentrate'
  | 'whey_isolate'
  | 'whey_hydrolyzed'
  | 'plant_protein'
  | 'creatine'
  | 'collagen'
  | 'protein_bar'
  | 'protein_drink'
  | 'multivitamin'
  | 'vitamin_mineral'
  | 'other';

export interface Food {
  id: string; // "taco:53", "user:<uuid>", "off:<barcode>"
  user_id: string | null; // null = base de referência
  name: string;
  aliases: string[];
  brand: string | null;
  flavor: string | null;
  variant: string | null;
  category: string | null;
  preparation_state: string | null;
  base_unit: BaseUnit;
  serving_size: number | null;
  serving_label: string | null;
  household_measures: HouseholdMeasure[];
  per100: Nutrients;
  trace_nutrients: string[];
  source: FoodSource;
  source_ref: string | null;
  verification: Verification;
  verified_at: ISODate | null;
  /** Para rótulos: valores referem-se ao produto como vendido ou preparado. */
  label_basis: 'as_sold' | 'prepared' | null;
  barcode: string | null;
  ingredients_text: string | null;
  is_supplement: boolean;
  supplement_category: SupplementCategory | null;
  /** Compostos ativos por porção (ex.: creatina 3 g), nunca somados como macronutriente. */
  compounds_per_serving: Record<string, number> | null;
  created_at?: ISODateTime;
}

export type MealType =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'supper'
  | 'extra';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Café da manhã',
  morning_snack: 'Lanche da manhã',
  lunch: 'Almoço',
  afternoon_snack: 'Lanche da tarde',
  dinner: 'Jantar',
  supper: 'Ceia',
  extra: 'Extra',
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'extra'];

export type EntryOrigin = 'search' | 'natural_language' | 'label' | 'barcode' | 'recipe' | 'supplement' | 'copy' | 'plan';

/** Item consumido. Guarda um snapshot dos nutrientes para preservar o histórico. */
export interface DiaryEntry extends BaseRow {
  date: ISODate;
  meal: MealType;
  custom_meal_name: string | null;
  consumed_at: ISODateTime | null;
  food_id: string;
  food_name: string;
  amount: number;
  unit: BaseUnit;
  servings: number | null;
  per100_snapshot: Nutrients;
  nutrients: Nutrients; // já escalados para a quantidade
  compounds: Record<string, number> | null;
  source: FoodSource;
  verification: Verification;
  origin: EntryOrigin;
  group_id: string | null; // ex.: suplemento + leite
  note: string | null;
}

export interface RecipeIngredient {
  food_id: string;
  food_name: string;
  amount: number; // g/ml cru, como usado
  unit: BaseUnit;
  per100: Nutrients;
}

export interface Recipe extends BaseRow {
  name: string;
  ingredients: RecipeIngredient[];
  final_weight_g: number | null; // peso após preparo
  servings: number;
  favorite: boolean;
  notes: string | null;
}

export type Beverage = 'water' | 'sparkling_water' | 'coffee' | 'tea' | 'milk' | 'juice' | 'soda' | 'coconut_water' | 'other';

export interface WaterLog extends BaseRow {
  date: ISODate;
  logged_at: ISODateTime;
  volume_ml: number;
  beverage: Beverage;
  container_id: string | null;
}

export interface Container extends BaseRow {
  name: string;
  volume_ml: number;
  icon: string | null;
}

export type ActivityType =
  | 'walking'
  | 'running'
  | 'strength'
  | 'cycling'
  | 'swimming'
  | 'dance'
  | 'stretching'
  | 'housework'
  | 'other';

export type Intensity = 'light' | 'moderate' | 'vigorous';

export interface ActivityLog extends BaseRow {
  date: ISODate;
  started_at: ISODateTime;
  type: ActivityType;
  custom_name: string | null;
  duration_min: number;
  intensity: Intensity;
  rpe: number | null; // 1-10
  distance_km: number | null;
  notes: string | null;
  kcal_estimated: number | null;
  kcal_source: 'met' | 'device' | 'user' | null;
  source: 'manual' | 'health_connect' | 'device';
  external_id: string | null;
}

export interface WeightEntry extends BaseRow {
  measured_at: ISODateTime;
  weight_kg: number;
  source: 'manual' | 'assessment' | 'device';
  note: string | null;
}

export interface MetricValue {
  value: number;
  unit: string;
}

export type BodyMetricKey =
  | 'weight_kg'
  | 'bmi'
  | 'fat_mass_kg'
  | 'body_fat_pct'
  | 'fat_free_mass_kg'
  | 'skeletal_muscle_mass_kg'
  | 'muscle_mass_kg'
  | 'visceral_fat_level'
  | 'total_body_water_l'
  | 'intracellular_water_l'
  | 'extracellular_water_l'
  | 'ecw_tbw_ratio'
  | 'bmr_kcal'
  | 'phase_angle_deg'
  | 'impedance_ohm'
  | 'protein_kg'
  | 'mineral_kg'
  | 'waist_cm'
  | 'hip_cm';

export interface SegmentalValue {
  segment: 'right_arm' | 'left_arm' | 'trunk' | 'right_leg' | 'left_leg';
  kind: 'lean_mass' | 'fat_mass' | 'muscle_mass';
  value: number;
  unit: string;
}

export interface MeasurementConditions {
  fasting: boolean | null;
  time_of_day: string | null;
  exercised_before: boolean | null;
  hydration_note: string | null;
}

/** Avaliação de composição corporal: apenas valores efetivamente medidos/informados. */
export interface BodyAssessment extends BaseRow {
  measured_at: ISODateTime; // data original do exame
  device_manufacturer: string | null;
  device_model: string | null;
  method: 'bioimpedance' | 'dexa' | 'skinfold' | 'other';
  input: 'manual' | 'import';
  metrics: Partial<Record<BodyMetricKey, MetricValue>>;
  visceral_fat_scale: string | null; // escala do fabricante, ex.: "1-59 (InBody)"
  segmental: SegmentalValue[];
  other_metrics: { label: string; value: number; unit: string }[];
  conditions: MeasurementConditions | null;
  file_path: string | null; // arquivo original no storage privado
  extraction_raw: unknown | null; // resposta bruta da IA, para auditoria
  notes: string | null;
}

export type NotificationKind =
  | 'water'
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'supplements'
  | 'exercise'
  | 'weigh_in'
  | 'body_assessment'
  | 'daily_summary';

export interface NotificationSetting extends BaseRow {
  kind: NotificationKind;
  enabled: boolean;
  times: string[]; // HH:MM
  weekdays: number[]; // 0 = domingo
  interval_min: number | null; // para lembretes recorrentes (água)
  window_start: string | null; // HH:MM
  window_end: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
  message: string | null;
}

export interface PlanItem {
  food_name: string;
  amount: number | null;
  unit: string | null; // g, ml, unidade, colher...
  amount_g: number | null; // resolvido para g/ml
  food_id: string | null;
  per100: Nutrients | null;
  note: string | null;
}

export interface PlanOption {
  label: string; // "Opção 1"
  items: PlanItem[];
}

export interface PlanMeal {
  name: string;
  meal: MealType | null;
  time: string | null;
  options: PlanOption[]; // alternativas mutuamente exclusivas
  selected_option: number;
}

export interface DietPlan extends BaseRow {
  name: string;
  origin: 'professional' | 'imported' | 'generated' | 'manual';
  professional_name: string | null;
  locked: boolean; // prescrita: bloqueada para alterações automáticas
  active: boolean;
  meals: PlanMeal[];
  source_file_path: string | null;
  notes: string | null;
}

export interface ChatMessage extends BaseRow {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  meta: Record<string, unknown> | null;
}

/** Item de uma refeição salva: snapshot dos valores por 100 g/ml e da fonte. */
export interface SavedMealItem {
  food_name: string;
  amount: number; // g ou ml
  unit: BaseUnit;
  measure: string | null; // "1 unidade", "4 colheres de sopa"
  food_id: string | null; // null = estimativa externa sem alimento da base
  per100: Nutrients;
  source: FoodSource;
  verification: Verification;
  is_supplement: boolean;
  serving_size: number | null;
  compounds_per_serving: Record<string, number> | null;
}

/** Refeição montada (pelo agente de IA externo ou a partir do diário) guardada para reutilizar. */
export interface SavedMeal extends BaseRow {
  name: string;
  meal: MealType | null;
  items: SavedMealItem[];
  origin: 'agent' | 'diary' | 'manual';
  favorite: boolean;
  notes: string | null;
}

export interface SupplementLog {
  supplement_food_id: string;
  doses: number;
}
