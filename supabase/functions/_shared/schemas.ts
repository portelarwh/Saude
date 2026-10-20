/**
 * Esquemas das respostas estruturadas da IA. Compartilhado entre as Edge
 * Functions (Deno) e o app (Metro), por isso importa "zod" pelo nome do pacote.
 *
 * Regra de projeto: a IA EXTRAI o que está escrito (rótulos, exames, planos) ou
 * IDENTIFICA alimentos e porções. Ela nunca fornece valores nutricionais de
 * alimentos genéricos: esses números vêm sempre da base de dados.
 */
import { z } from 'zod';

const num = z.number().nullable();

/** Nutrientes como impressos em um rótulo (null = ausente/ilegível). */
export const LabelNutrientsSchema = z.object({
  energy_kcal: num,
  energy_kj: num,
  protein_g: num,
  carbs_g: num,
  sugars_g: num,
  added_sugars_g: num,
  fat_g: num,
  saturated_fat_g: num,
  trans_fat_g: num,
  fiber_g: num,
  sodium_mg: num,
});

export const SUPPLEMENT_CATEGORIES = [
  'whey_concentrate',
  'whey_isolate',
  'whey_hydrolyzed',
  'plant_protein',
  'creatine',
  'collagen',
  'protein_bar',
  'protein_drink',
  'multivitamin',
  'vitamin_mineral',
  'other',
] as const;

export const LabelExtractionSchema = z.object({
  product_name: z.string().nullable(),
  brand: z.string().nullable(),
  flavor: z.string().nullable(),
  variant: z.string().nullable(),
  barcode: z.string().nullable(),
  serving_size: num,
  serving_unit: z.enum(['g', 'ml']).nullable(),
  household_measure: z.string().nullable(),
  basis: z.enum(['as_sold', 'prepared', 'unknown']),
  per_serving: LabelNutrientsSchema.nullable(),
  per_100: LabelNutrientsSchema.nullable(),
  ingredients_text: z.string().nullable(),
  is_supplement: z.boolean(),
  supplement_category: z.enum(SUPPLEMENT_CATEGORIES).nullable(),
  compounds_per_serving: z.array(z.object({ name: z.string(), amount: z.number(), unit: z.string() })),
  unreadable_fields: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type LabelExtraction = z.infer<typeof LabelExtractionSchema>;

export const BODY_METRIC_KEYS = [
  'weight_kg',
  'bmi',
  'fat_mass_kg',
  'body_fat_pct',
  'fat_free_mass_kg',
  'skeletal_muscle_mass_kg',
  'muscle_mass_kg',
  'visceral_fat_level',
  'total_body_water_l',
  'intracellular_water_l',
  'extracellular_water_l',
  'ecw_tbw_ratio',
  'bmr_kcal',
  'phase_angle_deg',
  'impedance_ohm',
  'protein_kg',
  'mineral_kg',
  'waist_cm',
  'hip_cm',
] as const;

export const BioimpedanceExtractionSchema = z.object({
  measured_at: z.string().nullable().describe('Data (e hora, se houver) da avaliação impressa no exame, em ISO 8601. null se não estiver no documento.'),
  device_manufacturer: z.string().nullable(),
  device_model: z.string().nullable(),
  metrics: z.array(
    z.object({
      key: z.enum(BODY_METRIC_KEYS),
      value: z.number(),
      unit: z.string(),
      printed_label: z.string().describe('Rótulo exatamente como impresso no exame'),
    }),
  ),
  segmental: z.array(
    z.object({
      segment: z.enum(['right_arm', 'left_arm', 'trunk', 'right_leg', 'left_leg']),
      kind: z.enum(['lean_mass', 'fat_mass', 'muscle_mass']),
      value: z.number(),
      unit: z.string(),
    }),
  ),
  other_metrics: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string() })),
  visceral_fat_scale: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type BioimpedanceExtraction = z.infer<typeof BioimpedanceExtractionSchema>;

export const MEAL_TYPES = ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'extra'] as const;

export const MealParseSchema = z.object({
  items: z.array(
    z.object({
      text: z.string().describe('Trecho da frase do usuário'),
      food_query: z.string().describe('Nome genérico do alimento em português para busca na base (ex.: "pão francês", "ovo mexido")'),
      quantity: num,
      unit: z.string().nullable().describe('g, ml, unidade, fatia, colher de sopa, colher de chá, copo, xícara, concha, pote, dose'),
      preparation: z.string().nullable(),
      notes: z.array(z.string()),
    }),
  ),
  questions: z.array(z.string()).describe('Perguntas de esclarecimento, ex.: uso de óleo ou manteiga'),
  meal: z.enum(MEAL_TYPES).nullable(),
});
export type MealParse = z.infer<typeof MealParseSchema>;

export const DietImportSchema = z.object({
  name: z.string(),
  professional_name: z.string().nullable(),
  meals: z.array(
    z.object({
      name: z.string(),
      meal: z.enum(MEAL_TYPES).nullable(),
      time: z.string().nullable().describe('HH:MM'),
      options: z
        .array(
          z.object({
            label: z.string(),
            items: z.array(
              z.object({
                food_name: z.string(),
                amount: num,
                unit: z.string().nullable(),
                note: z.string().nullable(),
              }),
            ),
          }),
        )
        .describe('Alternativas mutuamente exclusivas ("ou"). Uma única opção quando não houver alternativas.'),
    }),
  ),
  notes: z.array(z.string()),
});
export type DietImport = z.infer<typeof DietImportSchema>;

/** Contexto enviado pelo app ao chat (dados do próprio usuário, com consentimento). */
export const ChatRequestSchema = z.object({
  conversation_id: z.string().uuid(),
  message: z.string().min(1).max(4000),
  context: z.record(z.string(), z.unknown()),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
