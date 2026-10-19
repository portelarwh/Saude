/**
 * Leitura local (sem IA) de um plano alimentar digitado/colado.
 * Formato aceito, uma refeição por linha:
 *   Café da manhã (07:00): 2 fatias de pão integral + 1 ovo OU 1 iogurte natural
 *   Almoço: 4 colheres de sopa de arroz, 1 concha de feijão, 120 g de frango
 * "OU" separa alternativas (opções); vírgula, "+" e " e " separam itens.
 */
import type { DietImport } from '../../supabase/functions/_shared/schemas';
import { normalizeText } from './foodSearch';
import { parseQuantity } from './mealParser';
import type { MealType } from './types';

const MEAL_GUESS: [RegExp, MealType][] = [
  [/cafe da manha|desjejum/, 'breakfast'],
  [/lanche da manha|colacao/, 'morning_snack'],
  [/almoco/, 'lunch'],
  [/lanche da tarde|lanche/, 'afternoon_snack'],
  [/jantar|janta/, 'dinner'],
  [/ceia/, 'supper'],
];

export function guessMeal(name: string): MealType | null {
  const n = normalizeText(name);
  for (const [re, m] of MEAL_GUESS) if (re.test(n)) return m;
  return null;
}

export function parseDietText(text: string, name = 'Meu plano'): DietImport {
  const meals: DietImport['meals'] = [];
  const notes: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^:]{2,60}?)\s*(?:\((\d{1,2}[:h]\d{2})\))?\s*:\s*(.+)$/);
    if (!m || /^\d{1,2}$/.test(m[1].trim())) {
      notes.push(line);
      continue;
    }
    const [, mealName, time, rest] = m;
    const options = rest
      .split(/\s+ou\s+|\s*\|\s*/i)
      .map((opt, idx) => ({
        label: `Opção ${idx + 1}`,
        items: opt
          .split(/\s*[,+;]\s*|\s+e\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const { quantity, unit, rest: food } = parseQuantity(normalizeText(s));
            return { food_name: food || s, amount: quantity, unit, note: null };
          }),
      }))
      .filter((o) => o.items.length);
    meals.push({
      name: mealName.trim(),
      meal: guessMeal(mealName),
      time: time ? time.replace('h', ':').padStart(5, '0') : null,
      options,
    });
  }
  return { name, professional_name: null, meals, notes };
}
