/**
 * Compostos ativos de suplementos (creatina, vitaminas, minerais, cafeína…).
 *
 * São registrados por dose e somados à parte, sem entrar em calorias ou
 * macronutrientes. A chave guarda o nome e a unidade: "vitamina_b12_mcg",
 * "creatine_g". A creatina é sempre normalizada para gramas.
 */
import { normalizeText } from './foodSearch';

export const COMPOUND_UNITS = ['g', 'mg', 'mcg', 'UI'] as const;
export type CompoundUnit = (typeof COMPOUND_UNITS)[number];

export interface Compound {
  name: string;
  amount: number;
  unit: CompoundUnit;
}

export function normalizeCompoundUnit(u: string): CompoundUnit | null {
  const s = u.trim().toLowerCase().replace('µ', 'mc');
  if (s === 'g' || s === 'gramas') return 'g';
  if (s === 'mg') return 'mg';
  if (s === 'mcg' || s === 'ug') return 'mcg';
  if (s === 'ui' || s === 'iu') return 'UI';
  return null;
}

const CREATINE = /creatin/;

/** Converte nome + quantidade em chave/valor. Creatina vira sempre gramas. */
export function compoundEntry(name: string, amount: number, unit: CompoundUnit): [key: string, value: number] {
  const slug = normalizeText(name).replace(/\s+/g, '_') || 'composto';
  if (CREATINE.test(slug)) {
    const grams = unit === 'mg' ? amount / 1000 : unit === 'mcg' ? amount / 1e6 : amount;
    return ['creatine_g', grams];
  }
  return [`${slug}_${unit.toLowerCase()}`, amount];
}

export function compoundsToRecord(list: Compound[]): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const c of list) {
    if (!(c.amount > 0) || !c.name.trim()) continue;
    const [k, v] = compoundEntry(c.name, c.amount, c.unit);
    out[k] = (out[k] ?? 0) + v;
  }
  return Object.keys(out).length ? out : null;
}

const NAME_OVERRIDES: Record<string, string> = { creatine: 'Creatina' };

/** "vitamina_b12_mcg" -> { name: "Vitamina B12", unit: "mcg" }. */
export function parseCompoundKey(key: string): { name: string; unit: CompoundUnit } {
  const m = key.match(/^(.*)_(g|mg|mcg|ui)$/);
  const slug = m ? m[1] : key;
  const unit = (m ? (m[2] === 'ui' ? 'UI' : m[2]) : 'g') as CompoundUnit;
  const name =
    NAME_OVERRIDES[slug] ??
    slug
      .split('_')
      .map((w) => (/^[a-z]\d+$/.test(w) || w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
      .join(' ');
  return { name, unit };
}

export function recordToCompounds(rec: Record<string, number> | null | undefined): Compound[] {
  return Object.entries(rec ?? {}).map(([k, amount]) => ({ ...parseCompoundKey(k), amount }));
}

export function formatCompounds(rec: Record<string, number> | null | undefined): string {
  return recordToCompounds(rec)
    .map((c) => `${c.name} ${c.amount.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${c.unit}`)
    .join(' · ');
}

/** Quantas doses correspondem a "2500 mcg" de um produto cujo composto vem nessa unidade. */
export function dosesFromCompoundAmount(perServing: Record<string, number> | null | undefined, amount: number, unit: string): number | null {
  const u = normalizeCompoundUnit(unit);
  if (!u || !perServing) return null;
  const match = Object.entries(perServing).find(([k]) => parseCompoundKey(k).unit === u);
  if (!match || !(match[1] > 0)) return null;
  return amount / match[1];
}
