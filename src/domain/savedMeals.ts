/**
 * Refeições salvas: registro no diário, totais e criação a partir do diário.
 */
import { buildEntry, buildSupplementEntry, type EntryOptions, type NewDiaryEntry } from './entries';
import { scalePer100, sumNutrients, type NutrientTotals } from './nutrients';
import type { DiaryEntry, Food, SavedMeal, SavedMealItem } from './types';

function itemFood(item: SavedMealItem): Food {
  return {
    id: item.food_id ?? `estimate:${item.food_name}`,
    user_id: null,
    name: item.food_name,
    aliases: [],
    brand: null,
    flavor: null,
    variant: null,
    category: null,
    preparation_state: null,
    base_unit: item.unit,
    serving_size: item.serving_size,
    serving_label: item.measure,
    household_measures: [],
    per100: item.per100,
    trace_nutrients: [],
    source: item.source,
    source_ref: null,
    verification: item.verification,
    verified_at: null,
    label_basis: null,
    barcode: null,
    ingredients_text: null,
    is_supplement: item.is_supplement,
    supplement_category: null,
    compounds_per_serving: item.compounds_per_serving,
  };
}

/** Itens do diário para registrar uma refeição salva (mesmo grupo). */
export function savedMealToEntries(meal: Pick<SavedMeal, 'items' | 'name'>, opts: Omit<EntryOptions, 'origin'> & { groupId: string }): NewDiaryEntry[] {
  return meal.items.map((item) => {
    const food = itemFood(item);
    const o: EntryOptions = { ...opts, origin: 'copy', group_id: opts.groupId, note: `Refeição salva: ${meal.name}` };
    const e = item.is_supplement && item.serving_size ? buildSupplementEntry(food, item.amount / item.serving_size, o) : buildEntry(food, item.amount, o);
    // buildSupplementEntry marca origem "supplement"; mantemos a origem da refeição salva
    return { ...e, origin: 'copy' };
  });
}

export function savedMealTotals(meal: Pick<SavedMeal, 'items'>): NutrientTotals {
  return sumNutrients(meal.items.map((i) => scalePer100(i.per100, i.amount)));
}

export function hasEstimates(meal: Pick<SavedMeal, 'items'>): boolean {
  return meal.items.some((i) => i.verification === 'estimated' && i.source === 'ai_estimate');
}

/** Salvar uma refeição do diário para reutilizar depois. */
export function savedMealFromEntries(name: string, entries: DiaryEntry[]): Omit<SavedMeal, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  if (!entries.length) throw new Error('Refeição sem itens.');
  return {
    name,
    meal: entries[0].meal,
    origin: 'diary',
    favorite: false,
    notes: null,
    items: entries.map((e) => ({
      food_name: e.food_name,
      amount: e.amount,
      unit: e.unit,
      measure: e.servings ? `${e.servings} dose(s)` : null,
      food_id: e.food_id,
      per100: e.per100_snapshot,
      source: e.source,
      verification: e.verification,
      is_supplement: e.origin === 'supplement',
      serving_size: e.servings ? e.amount / e.servings : null,
      compounds_per_serving: e.compounds && e.servings ? Object.fromEntries(Object.entries(e.compounds).map(([k, v]) => [k, v / e.servings!])) : null,
    })),
  };
}
