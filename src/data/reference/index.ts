/**
 * Base de referência embarcada (funciona offline): TACO + alimentos incorporados
 * a partir de cadastros exportados pelo app (alimentos-base.json, ver
 * docs/BASE_DE_ALIMENTOS.md). Outras fontes entram por importação específica.
 */
import { parseFoodBundle } from '../../domain/foodBundle';
import type { Food } from '../../domain/types';
import type { Nutrients } from '../../domain/nutrients';
import { extrasFor } from './tacoExtras';
import base from './alimentos-base.json';
import taco from './taco.json';

interface TacoRow {
  id: string;
  name: string;
  category: string | null;
  preparation_state: string | null;
  base_unit: 'g' | 'ml';
  per100: Nutrients;
  trace: string[];
}

interface TacoFile {
  meta: { title: string; publisher: string; year: number; license: string; imported_at: string };
  foods: TacoRow[];
}

const file = taco as unknown as TacoFile;

export const TACO_META = file.meta;

export const TACO_CITATION =
  'NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA/UNICAMP). Tabela Brasileira de Composição de Alimentos – TACO. 4. ed. rev. e ampl. Campinas: NEPA/UNICAMP, 2011.';

let cache: Food[] | null = null;
let baseCache: Food[] | null = null;

/** Versão da base embutida neste build (para avisos de atualização). */
export function foodBaseInfo(): { atualizado_em: string; total: number } {
  return { atualizado_em: (base as { atualizado_em: string }).atualizado_em, total: baseFoods().length };
}

/** Alimentos incorporados ao sistema (exportados do app e copiados para o repositório). */
export function baseFoods(): Food[] {
  baseCache ??= parseFoodBundle(JSON.stringify(base)).foods;
  return baseCache;
}

export function referenceFoods(): Food[] {
  if (cache) return cache;
  cache = file.foods.map((row) => {
    const extras = extrasFor(row.name);
    return {
      id: row.id,
      user_id: null,
      name: row.name,
      aliases: extras.aliases,
      brand: null,
      flavor: null,
      variant: null,
      category: row.category,
      preparation_state: row.preparation_state,
      base_unit: row.base_unit,
      serving_size: extras.measures[0]?.amount ?? null,
      serving_label: extras.measures[0]?.label ?? null,
      household_measures: extras.measures,
      per100: row.per100,
      trace_nutrients: row.trace,
      source: 'taco',
      source_ref: row.id.replace('taco:', 'TACO nº '),
      verification: 'reported',
      verified_at: file.meta.imported_at,
      label_basis: null,
      barcode: null,
      ingredients_text: null,
      is_supplement: false,
      supplement_category: null,
      compounds_per_serving: null,
    } satisfies Food;
  });
  cache.push(...baseFoods());
  return cache;
}

export function referenceFoodById(id: string): Food | undefined {
  return referenceFoods().find((f) => f.id === id);
}
