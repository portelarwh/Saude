import { isKnown } from '../domain/nutrients';

export function num(v: number | null | undefined, decimals = 0): string {
  if (!isKnown(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function nutrient(v: number | null | undefined, unit: string, decimals = 1): string {
  if (!isKnown(v)) return 'não informado';
  return `${num(v, decimals)} ${unit}`;
}

export function ml(v: number | null | undefined): string {
  if (!isKnown(v)) return '—';
  return v >= 1000 ? `${num(v / 1000, 2)} L` : `${num(v)} ml`;
}

export function signed(v: number | null | undefined, decimals = 1): string {
  if (!isKnown(v)) return '—';
  const s = num(Math.abs(v), decimals);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

export const VERIFICATION_LABEL = {
  verified: 'verificado',
  reported: 'informado pela fonte',
  estimated: 'estimado',
} as const;

export const SOURCE_LABEL: Record<string, string> = {
  taco: 'TACO',
  tbca: 'TBCA',
  usda: 'USDA',
  off: 'Open Food Facts',
  label: 'Rótulo',
  manual: 'Cadastro manual',
  recipe: 'Receita',
  ai_estimate: 'Estimativa da IA',
};
