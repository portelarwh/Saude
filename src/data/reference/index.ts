/**
 * Base de referência embarcada (funciona offline). Hoje contém a TACO;
 * outras fontes entram por importação específica (ver docs/FONTES_DE_DADOS.md).
 */
import type { Food } from '../../domain/types';
import type { Nutrients } from '../../domain/nutrients';
import { extrasFor } from './tacoExtras';
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
  return cache;
}

export function referenceFoodById(id: string): Food | undefined {
  return referenceFoods().find((f) => f.id === id);
}
