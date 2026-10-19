/**
 * Busca de alimentos por nome, marca, categoria, ingrediente e sinônimos.
 * Ordenação: correspondência exata de sinônimo > início do nome > todas as
 * palavras presentes > parcial. Dados brasileiros têm prioridade.
 */
import type { Food, FoodSource } from './types';

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9%.\s]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/(^|\D)\./g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'e', 'a', 'o', 'em', 'tipo', 'sem']);

export function tokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Singular aproximado do português, para "ovos" ≈ "ovo", "pães" ≈ "pao". */
export function stem(t: string): string {
  if (t.length <= 3) return t;
  if (t.endsWith('oes') || t.endsWith('aes')) return t.slice(0, -3) + 'ao';
  if (t.endsWith('ais')) return t.slice(0, -2) + 'l';
  if (t.endsWith('es') && t.length > 4 && /[rsz]es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith('s')) return t.slice(0, -1);
  return t;
}

const SOURCE_PRIORITY: Record<FoodSource, number> = {
  label: 6, // rótulo do próprio produto
  manual: 5,
  recipe: 5,
  taco: 4,
  tbca: 4,
  off: 3,
  usda: 2,
  ai_estimate: 0,
};

export interface SearchHit {
  food: Food;
  score: number;
}

export function scoreFood(food: Food, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const qTokens = tokens(query).map(stem);
  if (!qTokens.length) return 0;
  const name = normalizeText(food.name);
  const aliasNorm = food.aliases.map(normalizeText);
  const haystack = [food.name, ...food.aliases, food.brand ?? '', food.flavor ?? '', food.variant ?? '', food.category ?? '', food.ingredients_text ?? '']
    .join(' ');
  const hayTokens = tokens(haystack).map(stem);

  let score = 0;
  if (aliasNorm.includes(q)) score += 100;
  else if (aliasNorm.some((a) => a.startsWith(q))) score += 60;
  if (name === q) score += 90;
  else if (name.startsWith(q)) score += 50;

  let matched = 0;
  for (const qt of qTokens) {
    if (hayTokens.includes(qt)) matched += 1;
    else if (hayTokens.some((h) => h.startsWith(qt))) matched += 0.6;
  }
  if (matched === 0 && score === 0) return 0;
  score += (matched / qTokens.length) * 40;
  // nomes mais curtos/genéricos primeiro quando a correspondência é igual
  score -= Math.min(10, name.length / 12);
  // preferir alimentos prontos para consumo em empates (cozido/grelhado vs cru)
  if (food.preparation_state === 'cru' && /carne|frango|arroz|feij|peixe|ovo|macarr/.test(name)) score -= 3;
  score += SOURCE_PRIORITY[food.source] ?? 0;
  if (food.verification === 'verified') score += 2;
  return score;
}

export function searchFoods(foods: Food[], query: string, limit = 30): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const food of foods) {
    const score = scoreFood(food, query);
    if (score > 15) hits.push({ food, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Detecta prováveis duplicidades (mesmo código de barras ou mesmo nome/marca/sabor). */
export function findDuplicate(foods: Food[], candidate: Pick<Food, 'name' | 'brand' | 'flavor' | 'variant' | 'barcode'>): Food | null {
  if (candidate.barcode) {
    const byCode = foods.find((f) => f.barcode && f.barcode === candidate.barcode);
    if (byCode) return byCode;
  }
  const key = (f: Pick<Food, 'name' | 'brand' | 'flavor' | 'variant'>) =>
    [f.name, f.brand ?? '', f.flavor ?? '', f.variant ?? ''].map(normalizeText).join('|');
  const k = key(candidate);
  return foods.find((f) => key(f) === k) ?? null;
}
