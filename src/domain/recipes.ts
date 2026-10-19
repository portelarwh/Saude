/**
 * Receitas: soma dos ingredientes, valores por receita, por 100 g e por porção.
 *
 * O peso final (após cocção) pode diferir da soma dos ingredientes crus por
 * perda ou ganho de água. Se informado, os valores por 100 g usam esse peso.
 */
import { NUTRIENT_KEYS, scalePer100, sumNutrients, type NutrientTotals, type Nutrients } from './nutrients';
import type { Food, Recipe, RecipeIngredient } from './types';

export interface RecipeNutrition {
  rawWeight: number;
  finalWeight: number;
  yieldFactor: number; // peso final / peso cru
  total: NutrientTotals;
  per100: Nutrients;
  perServing: Nutrients;
  servingWeight: number;
}

export function calculateRecipe(recipe: Pick<Recipe, 'ingredients' | 'final_weight_g' | 'servings'>): RecipeNutrition {
  if (!recipe.ingredients.length) throw new Error('A receita precisa de ao menos um ingrediente');
  if (!(recipe.servings > 0)) throw new Error('Número de porções inválido');
  const rawWeight = recipe.ingredients.reduce((s, i) => s + i.amount, 0);
  const finalWeight = recipe.final_weight_g && recipe.final_weight_g > 0 ? recipe.final_weight_g : rawWeight;
  const total = sumNutrients(recipe.ingredients.map((i) => scalePer100(i.per100, i.amount)));
  const per100: Nutrients = {};
  const perServing: Nutrients = {};
  for (const k of NUTRIENT_KEYS) {
    // Nutriente sem dado em algum ingrediente: total por 100 g fica não informado
    // para não sugerir precisão inexistente, exceto água (que varia com o preparo).
    const incomplete = total.missing[k] > 0;
    if (k === 'water_g') continue;
    per100[k] = incomplete ? null : (total.values[k] * 100) / finalWeight;
    perServing[k] = incomplete ? null : total.values[k] / recipe.servings;
  }
  return {
    rawWeight,
    finalWeight,
    yieldFactor: finalWeight / rawWeight,
    total,
    per100,
    perServing,
    servingWeight: finalWeight / recipe.servings,
  };
}

export function ingredientFromFood(food: Food, amount: number): RecipeIngredient {
  return { food_id: food.id, food_name: food.name, amount, unit: food.base_unit, per100: { ...food.per100 } };
}

/** Transforma uma receita em alimento pessoal, permitindo registrá-la no diário. */
export function recipeToFood(recipe: Recipe, userId: string): Food {
  const n = calculateRecipe(recipe);
  return {
    id: `recipe:${recipe.id}`,
    user_id: userId,
    name: recipe.name,
    aliases: [],
    brand: null,
    flavor: null,
    variant: null,
    category: 'Receitas',
    preparation_state: 'preparado',
    base_unit: 'g',
    serving_size: Math.round(n.servingWeight),
    serving_label: `1 porção (${Math.round(n.servingWeight)} g)`,
    household_measures: [{ label: '1 porção', amount: Math.round(n.servingWeight), estimated: false }],
    per100: n.per100,
    trace_nutrients: [],
    source: 'recipe',
    source_ref: recipe.id,
    verification: 'estimated',
    verified_at: null,
    label_basis: null,
    barcode: null,
    ingredients_text: recipe.ingredients.map((i) => `${i.food_name} (${i.amount} ${i.unit})`).join(', '),
    is_supplement: false,
    supplement_category: null,
    compounds_per_serving: null,
  };
}

/** Substitui um ingrediente mantendo a mesma quantidade. */
export function substituteIngredient(recipe: Recipe, index: number, food: Food, amount?: number): Recipe {
  const ingredients = recipe.ingredients.slice();
  ingredients[index] = ingredientFromFood(food, amount ?? ingredients[index].amount);
  return { ...recipe, ingredients };
}

/** Escala uma receita para outro número de porções (ex.: marmitas da semana). */
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  const factor = servings / recipe.servings;
  return {
    ...recipe,
    servings,
    final_weight_g: recipe.final_weight_g ? recipe.final_weight_g * factor : null,
    ingredients: recipe.ingredients.map((i) => ({ ...i, amount: i.amount * factor })),
  };
}

export interface ShoppingItem {
  name: string;
  amount: number;
  unit: string;
}

/** Lista de compras agregada a partir de receitas (soma por ingrediente). */
export function shoppingList(recipes: Pick<Recipe, 'ingredients'>[]): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();
  for (const r of recipes) {
    for (const i of r.ingredients) {
      const key = `${i.food_id}|${i.unit}`;
      const cur = map.get(key);
      if (cur) cur.amount += i.amount;
      else map.set(key, { name: i.food_name, amount: i.amount, unit: i.unit });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
