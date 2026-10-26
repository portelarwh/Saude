/**
 * Refeições salvas: registro no diário, totais e criação a partir do diário.
 */
import { buildEntry, buildSupplementEntry, type EntryOptions, type NewDiaryEntry } from './entries';
import { scalePer100, sumNutrients, type NutrientTotals } from './nutrients';
import type { DiaryEntry, Food, HouseholdMeasure, SavedMeal, SavedMealItem } from './types';

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

/** Item de refeição salva a partir de um alimento da base (para editar refeições). */
export function foodToSavedItem(food: Food, amount: number): SavedMealItem {
  const measure = food.household_measures[0];
  return {
    food_name: food.name,
    amount,
    unit: food.base_unit,
    measure: measure ? formatPortions(amount, measure) : null,
    food_id: food.id,
    per100: { ...food.per100 },
    source: food.source,
    verification: food.verification,
    is_supplement: food.is_supplement,
    serving_size: food.serving_size,
    compounds_per_serving: food.compounds_per_serving,
  };
}

/** Edição de itens: quantidade (g/ml) > 0; o resto do item (fonte, valores por 100) não muda. */
export function setSavedItemAmount(items: SavedMealItem[], index: number, amount: number): SavedMealItem[] {
  if (!(amount > 0)) throw new Error('A quantidade precisa ser maior que zero.');
  return items.map((it, i) => (i === index ? { ...it, amount, measure: null } : it));
}

export function removeSavedItem(items: SavedMealItem[], index: number): SavedMealItem[] {
  if (items.length <= 1) throw new Error('A refeição precisa de ao menos um item. Para apagá-la, use Excluir.');
  return items.filter((_, i) => i !== index);
}

/** Porções de uma medida caseira ↔ quantidade: 1,5 × "1 copo (200 ml)" = 300 ml. */
export function portionsToAmount(portions: number, measure: HouseholdMeasure): number {
  return Math.round(portions * measure.amount * 10) / 10;
}

export function amountToPortions(amount: number, measure: HouseholdMeasure): number {
  return Math.round((amount / measure.amount) * 100) / 100;
}

export function formatPortions(amount: number, measure: HouseholdMeasure): string {
  const p = amountToPortions(amount, measure);
  const unit = measure.label.replace(/^1\s+/, '');
  return `${String(p).replace('.', ',')} × ${unit}`;
}
