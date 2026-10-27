/**
 * Quantidade em medidas caseiras ("2 unidades", "3 colheres de sopa") ↔ g/ml.
 * O valor salvo é sempre em g/ml; a medida é só a forma de digitar e exibir.
 */
import type { HouseholdMeasure } from './types';

/** "1 colher de sopa" → nome da medida sem o número: "colher de sopa". */
export function measureName(m: Pick<HouseholdMeasure, 'label'>): string {
  return m.label.replace(/^\s*1\s+/, '').trim();
}

function pluralWord(w: string): string {
  if (w === 'pão') return 'pães';
  if (/ão$/.test(w)) return w.replace(/ão$/, 'ões');
  if (/[rsz]$/.test(w)) return `${w}es`;
  if (/l$/.test(w)) return w.replace(/l$/, 'is');
  if (/m$/.test(w)) return w.replace(/m$/, 'ns');
  return `${w}s`;
}

/** Nome no plural quando n ≠ 1: "colher de sopa" → "colheres de sopa", "unidade" → "unidades". */
export function measureUnit(m: Pick<HouseholdMeasure, 'label'>, n: number): string {
  const name = measureName(m);
  if (Math.abs(n) <= 1) return name;
  const [first, ...rest] = name.split(' ');
  return [pluralWord(first), ...rest].join(' ');
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Quantas medidas cabem na quantidade (null se não for múltiplo "redondo" de ¼). */
export function wholePortions(amount: number, m: Pick<HouseholdMeasure, 'amount'>): number | null {
  if (!(m.amount > 0)) return null;
  const p = amount / m.amount;
  const q = Math.round(p * 4) / 4;
  return q > 0 && Math.abs(p - q) < 0.02 ? q : null;
}

/** "2 unidades · 100 g" quando dá um número redondo de medidas; senão "100 g". */
export function describeAmount(amount: number, unit: string, m: HouseholdMeasure | null | undefined): string {
  const base = `${fmt(amount)} ${unit}`;
  if (!m) return base;
  const p = wholePortions(amount, m);
  return p === null ? base : `${fmt(p)} ${measureUnit(m, p)} · ${base}${m.estimated ? ' (estimado)' : ''}`;
}
