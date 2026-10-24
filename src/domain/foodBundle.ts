/**
 * Pacote de alimentos para levar os cadastros do usuário para a base do
 * sistema (src/data/reference/alimentos-base.json) ou para outro aparelho.
 * Os valores são copiados como estão, com fonte e status de verificação:
 * nada é recalculado nem completado, e `null` continua "não informado".
 */
import { z } from 'zod';
import { normalizeText } from './foodSearch';
import { NUTRIENT_KEYS } from './nutrients';
import type { Food } from './types';

export const FOOD_BUNDLE_FORMAT = 'meu-equilibrio/alimentos-v1';

export interface FoodBundle {
  formato: typeof FOOD_BUNDLE_FORMAT;
  atualizado_em: string;
  observacao: string;
  alimentos: Food[];
}

/** Mesmo alimento = mesmo código de barras, ou mesmo nome + marca + sabor + versão. */
export function foodKey(f: Pick<Food, 'name' | 'brand' | 'flavor' | 'variant' | 'barcode'>): string {
  if (f.barcode) return `ean:${f.barcode.replace(/\D/g, '')}`;
  return ['name', 'brand', 'flavor', 'variant'].map((k) => normalizeText(String(f[k as keyof typeof f] ?? ''))).join('|');
}

function slug(s: string): string {
  return normalizeText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'alimento';
}

/** Alimento pronto para a base do sistema: sem dono, id estável "base:...". */
export function toBaseFood(f: Food): Food {
  const id = f.id.startsWith('base:') ? f.id : `base:${f.barcode ? f.barcode.replace(/\D/g, '') : slug([f.name, f.brand, f.flavor, f.variant].filter(Boolean).join(' '))}`;
  // created_at/updated_at e o dono não vão para a base
  const rest: Food & { updated_at?: string } = { ...f };
  delete rest.created_at;
  delete rest.updated_at;
  return { ...rest, id, user_id: null };
}

/** Alimentos que valem exportar: os cadastrados pelo usuário e os já incorporados à base (TACO fica de fora). */
export function exportableFoods(foods: Food[]): Food[] {
  return foods.filter((f) => !f.id.startsWith('taco:'));
}

/**
 * Junta listas por `foodKey`; em caso de repetição vale o item mais à direita
 * (ex.: base atual + cadastros do usuário → o cadastro do usuário prevalece).
 */
export function mergeFoods(...lists: Food[][]): Food[] {
  const byKey = new Map<string, Food>();
  for (const list of lists) for (const f of list) byKey.set(foodKey(f), f);
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function buildFoodBundle(baseFoods: Food[], userFoods: Food[], now = new Date()): FoodBundle {
  return {
    formato: FOOD_BUNDLE_FORMAT,
    atualizado_em: now.toISOString(),
    observacao: 'Base de alimentos do Meu Equilíbrio. Para incluir no sistema, substitua src/data/reference/alimentos-base.json por este arquivo.',
    alimentos: uniqueIds(mergeFoods(baseFoods, exportableFoods(userFoods)).map(toBaseFood)),
  };
}

function uniqueIds(foods: Food[]): Food[] {
  const used = new Set<string>();
  return foods.map((f) => {
    let id = f.id;
    for (let n = 2; used.has(id); n++) id = `${f.id}-${n}`;
    used.add(id);
    return id === f.id ? f : { ...f, id };
  });
}

const nullableNum = z.number().finite().nullable();
const FoodSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  aliases: z.array(z.string()).default([]),
  brand: z.string().nullable().default(null),
  flavor: z.string().nullable().default(null),
  variant: z.string().nullable().default(null),
  category: z.string().nullable().default(null),
  preparation_state: z.string().nullable().default(null),
  base_unit: z.enum(['g', 'ml']),
  serving_size: nullableNum.default(null),
  serving_label: z.string().nullable().default(null),
  household_measures: z.array(z.object({ label: z.string(), amount: z.number().positive(), estimated: z.boolean() })).default([]),
  per100: z.partialRecord(z.enum(NUTRIENT_KEYS), nullableNum),
  trace_nutrients: z.array(z.string()).default([]),
  source: z.enum(['taco', 'tbca', 'usda', 'off', 'label', 'manual', 'recipe', 'ai_estimate']),
  source_ref: z.string().nullable().default(null),
  verification: z.enum(['verified', 'reported', 'estimated']),
  verified_at: z.string().nullable().default(null),
  label_basis: z.enum(['as_sold', 'prepared']).nullable().default(null),
  barcode: z.string().nullable().default(null),
  ingredients_text: z.string().nullable().default(null),
  is_supplement: z.boolean().default(false),
  supplement_category: z.string().nullable().default(null),
  compounds_per_serving: z.record(z.string(), z.number()).nullable().default(null),
});

const BundleSchema = z.object({ formato: z.literal(FOOD_BUNDLE_FORMAT), alimentos: z.array(z.unknown()) });

export class FoodBundleError extends Error {}

/** Lê um pacote exportado; itens inválidos são ignorados e contados. */
export function parseFoodBundle(text: string): { foods: Food[]; skipped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new FoodBundleError('O arquivo não é um JSON válido.');
  }
  const b = BundleSchema.safeParse(raw);
  if (!b.success) throw new FoodBundleError(`Este arquivo não é uma base de alimentos do app (formato esperado: ${FOOD_BUNDLE_FORMAT}).`);
  const foods: Food[] = [];
  let skipped = 0;
  for (const item of b.data.alimentos) {
    const r = FoodSchema.safeParse(item);
    if (!r.success) {
      skipped++;
      continue;
    }
    foods.push(toBaseFood({ ...r.data, id: r.data.id ?? '', user_id: null } as Food));
  }
  return { foods, skipped };
}

/** Itens do pacote que ainda não existem entre os alimentos disponíveis. */
export function newFoodsFrom(bundle: Food[], existing: Food[]): Food[] {
  const known = new Set(existing.map(foodKey));
  return bundle.filter((f) => !known.has(foodKey(f)));
}
