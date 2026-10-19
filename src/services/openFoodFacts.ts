/**
 * Consulta de produtos por código de barras no Open Food Facts
 * (base colaborativa, licença ODbL — atribuição obrigatória, exibida no app).
 *
 * Os dados do OFF são colaborativos: entram como "informado" (não verificado)
 * e passam pela tela de conferência antes de serem salvos.
 */
import { normalizeLabel, type LabelData, type NormalizedLabel } from '../domain/labels';
import type { Nutrients } from '../domain/nutrients';

export type BarcodeLookup =
  | { status: 'found'; label: NormalizedLabel; productUrl: string }
  | { status: 'not_found' }
  | { status: 'unavailable'; message: string };

const FIELDS = ['code', 'product_name', 'product_name_pt', 'brands', 'quantity', 'serving_size', 'serving_quantity', 'nutriments', 'ingredients_text_pt', 'ingredients_text', 'nutrition_data_per'].join(',');

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
  ingredients_text_pt?: string;
  ingredients_text?: string;
}

export function isValidBarcode(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function n(v: unknown): number | null {
  const x = typeof v === 'string' ? parseFloat(v) : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

export function offToLabel(p: OffProduct): LabelData {
  const m = p.nutriments ?? {};
  const per100: Nutrients = {
    energy_kcal: n(m['energy-kcal_100g']),
    protein_g: n(m.proteins_100g),
    carbs_g: n(m.carbohydrates_100g),
    sugars_g: n(m.sugars_100g),
    fat_g: n(m.fat_100g),
    saturated_fat_g: n(m['saturated-fat_100g']),
    trans_fat_g: n(m['trans-fat_100g']),
    fiber_g: n(m.fiber_100g),
    // OFF armazena sódio em g/100 g
    sodium_mg: n(m.sodium_100g) !== null ? n(m.sodium_100g)! * 1000 : null,
  };
  if (per100.energy_kcal === null && n(m['energy-kj_100g']) !== null) per100.energy_kcal = n(m['energy-kj_100g'])! / 4.184;
  const servingQty = n(p.serving_quantity);
  const isLiquid = /\bml\b/i.test(p.serving_size ?? '');
  return {
    product_name: p.product_name_pt || p.product_name || null,
    brand: p.brands?.split(',')[0]?.trim() || null,
    flavor: null,
    variant: null,
    barcode: p.code ?? null,
    serving_size: servingQty,
    serving_unit: isLiquid ? 'ml' : 'g',
    household_measure: p.serving_size ?? null,
    basis: 'as_sold',
    per_serving: null,
    per_100: per100,
    ingredients_text: p.ingredients_text_pt || p.ingredients_text || null,
  };
}

export async function lookupBarcode(code: string, fetchImpl: typeof fetch = fetch, timeoutMs = 8000): Promise<BarcodeLookup> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok) return { status: 'unavailable', message: `Open Food Facts respondeu com erro (${res.status}). Você pode cadastrar o produto pela foto do rótulo ou manualmente.` };
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    if (body.status !== 1 || !body.product) return { status: 'not_found' };
    const label = normalizeLabel(offToLabel(body.product), 'off');
    label.warnings.unshift('Dados colaborativos do Open Food Facts: confira com o rótulo da embalagem.');
    return { status: 'found', label, productUrl: `https://world.openfoodfacts.org/product/${code}` };
  } catch {
    return {
      status: 'unavailable',
      message: 'Não foi possível consultar o Open Food Facts (sem conexão ou serviço indisponível). Você pode cadastrar o produto pela foto do rótulo ou manualmente.',
    };
  } finally {
    clearTimeout(timer);
  }
}
