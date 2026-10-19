/**
 * Consulta ao USDA FoodData Central (dados públicos, domínio público nos EUA).
 * Requer a variável USDA_API_KEY (chave gratuita em https://fdc.nal.usda.gov/api-key-signup).
 * Usado como fonte complementar quando a base brasileira não tem o alimento.
 */
import { z } from 'zod';
import { handler, HttpError, json, readJson } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';

const Body = z.object({ query: z.string().min(2).max(100) });

// número do nutriente no FDC -> chave do app
const NUTRIENTS: Record<string, string> = {
  '208': 'energy_kcal',
  '203': 'protein_g',
  '205': 'carbs_g',
  '204': 'fat_g',
  '291': 'fiber_g',
  '269': 'sugars_g',
  '606': 'saturated_fat_g',
  '605': 'trans_fat_g',
  '601': 'cholesterol_mg',
  '307': 'sodium_mg',
  '306': 'potassium_mg',
  '301': 'calcium_mg',
  '304': 'magnesium_mg',
  '303': 'iron_mg',
  '309': 'zinc_mg',
  '401': 'vitamin_c_mg',
  '255': 'water_g',
};

interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: { nutrientNumber: string; value: number; unitName: string }[];
}

Deno.serve(
  handler('food-search-usda', async (req) => {
    await userClient(req);
    const key = Deno.env.get('USDA_API_KEY');
    if (!key) throw new HttpError(503, 'Integração com USDA não configurada.', 'integration_not_configured');
    const { query } = await readJson(req, (v) => Body.parse(v));
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('query', query);
    url.searchParams.set('dataType', 'Foundation,SR Legacy');
    url.searchParams.set('pageSize', '15');
    url.searchParams.set('api_key', key);
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new HttpError(503, 'USDA FoodData Central indisponível no momento.', 'integration_unavailable');
    }
    if (!res.ok) throw new HttpError(503, 'USDA FoodData Central indisponível no momento.', 'integration_unavailable');
    const data = (await res.json()) as { foods?: FdcFood[] };
    const foods = (data.foods ?? []).map((f) => {
      const per100: Record<string, number | null> = {};
      for (const key of Object.values(NUTRIENTS)) per100[key] = null;
      for (const n of f.foodNutrients ?? []) {
        const k = NUTRIENTS[n.nutrientNumber];
        if (k && typeof n.value === 'number') per100[k] = n.value;
      }
      return {
        id: `usda:${f.fdcId}`,
        name: f.description,
        data_type: f.dataType,
        per100,
        source: 'usda',
        source_ref: `FDC ${f.fdcId}`,
      };
    });
    return json({ foods });
  }),
);
