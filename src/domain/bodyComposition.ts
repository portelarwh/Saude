/**
 * Composição corporal: comparação entre avaliações, interpretação cautelosa e
 * tendências.
 *
 * Princípios:
 *  - Só comparamos indicadores realmente presentes nas duas avaliações e com
 *    a mesma unidade.
 *  - Mudanças menores que a variação típica de medição são tratadas como
 *    "estáveis".
 *  - Uma avaliação isolada nunca é usada para diagnóstico.
 */
import { daysBetween } from './dates';
import { round } from './nutrients';
import type { BodyAssessment, BodyMetricKey, MetricValue } from './types';

export interface MetricInfo {
  label: string;
  unit: string;
  /** Mudança mínima considerada relevante (variação típica de medição). */
  threshold: number;
  /** Direção desejável para objetivos de perda de gordura com preservação de massa magra. */
  better: 'down' | 'up' | 'neutral';
  isPercent?: boolean;
  hydration?: boolean;
}

export const METRICS: Record<BodyMetricKey, MetricInfo> = {
  weight_kg: { label: 'Peso', unit: 'kg', threshold: 0.5, better: 'neutral' },
  bmi: { label: 'IMC', unit: 'kg/m²', threshold: 0.2, better: 'neutral' },
  fat_mass_kg: { label: 'Massa de gordura', unit: 'kg', threshold: 0.5, better: 'down' },
  body_fat_pct: { label: 'Percentual de gordura', unit: '%', threshold: 0.8, better: 'down', isPercent: true },
  fat_free_mass_kg: { label: 'Massa livre de gordura', unit: 'kg', threshold: 0.7, better: 'up' },
  skeletal_muscle_mass_kg: { label: 'Massa muscular esquelética', unit: 'kg', threshold: 0.5, better: 'up' },
  muscle_mass_kg: { label: 'Massa muscular', unit: 'kg', threshold: 0.6, better: 'up' },
  visceral_fat_level: { label: 'Gordura visceral', unit: 'nível', threshold: 1, better: 'down' },
  total_body_water_l: { label: 'Água corporal total', unit: 'L', threshold: 0.7, better: 'neutral', hydration: true },
  intracellular_water_l: { label: 'Água intracelular', unit: 'L', threshold: 0.5, better: 'neutral', hydration: true },
  extracellular_water_l: { label: 'Água extracelular', unit: 'L', threshold: 0.4, better: 'neutral', hydration: true },
  ecw_tbw_ratio: { label: 'Relação AEC/ACT', unit: '', threshold: 0.005, better: 'neutral', hydration: true },
  bmr_kcal: { label: 'TMB (informada no exame)', unit: 'kcal', threshold: 30, better: 'neutral' },
  phase_angle_deg: { label: 'Ângulo de fase', unit: '°', threshold: 0.3, better: 'up' },
  impedance_ohm: { label: 'Impedância', unit: 'Ω', threshold: 15, better: 'neutral' },
  protein_kg: { label: 'Proteína corporal', unit: 'kg', threshold: 0.2, better: 'up' },
  mineral_kg: { label: 'Minerais', unit: 'kg', threshold: 0.1, better: 'neutral' },
  waist_cm: { label: 'Circunferência abdominal', unit: 'cm', threshold: 1, better: 'down' },
  hip_cm: { label: 'Quadril', unit: 'cm', threshold: 1, better: 'neutral' },
};

export const METRIC_ORDER = Object.keys(METRICS) as BodyMetricKey[];

export type Direction = 'improved' | 'worsened' | 'stable' | 'changed';

export interface MetricChange {
  key: BodyMetricKey;
  label: string;
  unit: string;
  from: number;
  to: number;
  abs: number;
  /** Variação percentual relativa (null para métricas em %). */
  pct: number | null;
  /** Para métricas em %, variação em pontos percentuais. */
  pp: number | null;
  direction: Direction;
  significant: boolean;
}

export interface Comparison {
  fromDate: string;
  toDate: string;
  days: number;
  changes: MetricChange[];
  unitMismatches: BodyMetricKey[];
  sameDevice: boolean | null;
}

/** Valor da métrica, derivando apenas relações exatas (nunca estimativas). */
export function metricValue(a: BodyAssessment, key: BodyMetricKey): MetricValue | null {
  return a.metrics[key] ?? null;
}

export function compareAssessments(previous: BodyAssessment, current: BodyAssessment): Comparison {
  if (new Date(previous.measured_at) > new Date(current.measured_at)) {
    [previous, current] = [current, previous];
  }
  const changes: MetricChange[] = [];
  const unitMismatches: BodyMetricKey[] = [];
  for (const key of METRIC_ORDER) {
    const a = metricValue(previous, key);
    const b = metricValue(current, key);
    if (!a || !b) continue;
    if (normalizeUnit(a.unit) !== normalizeUnit(b.unit)) {
      unitMismatches.push(key);
      continue;
    }
    const info = METRICS[key];
    const abs = b.value - a.value;
    const significant = Math.abs(abs) >= info.threshold;
    let direction: Direction = 'stable';
    if (significant) {
      if (info.better === 'neutral') direction = 'changed';
      else direction = (abs < 0) === (info.better === 'down') ? 'improved' : 'worsened';
    }
    changes.push({
      key,
      label: info.label,
      unit: a.unit,
      from: a.value,
      to: b.value,
      abs: round(abs, 2),
      pct: info.isPercent || a.value === 0 ? null : round((abs / a.value) * 100, 1),
      pp: info.isPercent ? round(abs, 1) : null,
      direction,
      significant,
    });
  }
  const sameDevice =
    previous.device_model && current.device_model
      ? previous.device_model.trim().toLowerCase() === current.device_model.trim().toLowerCase()
      : null;
  return {
    fromDate: previous.measured_at,
    toDate: current.measured_at,
    days: daysBetween(new Date(previous.measured_at), new Date(current.measured_at)),
    changes,
    unitMismatches,
    sameDevice,
  };
}

function normalizeUnit(u: string): string {
  const s = u.trim().toLowerCase();
  if (s === 'l' || s === 'litros' || s === 'litro') return 'l';
  if (s === 'kg' || s === 'quilos') return 'kg';
  if (s === '°' || s === 'graus' || s === 'deg') return 'deg';
  return s;
}

export interface Interpretation {
  fatLoss: 'likely' | 'unlikely' | 'unclear';
  leanPreserved: 'likely' | 'possible_loss' | 'unclear';
  attention: string[];
  improved: string[];
  worsened: string[];
  stable: string[];
  caveats: string[];
  summary: string;
}

const STANDARD_CAVEATS = [
  'Bioimpedância é sensível a hidratação, horário, alimentação, exercício recente, ciclo menstrual e equipamento. Compare exames feitos em condições semelhantes.',
  'Uma avaliação isolada não permite diagnosticar perda muscular, desidratação, doenças ou alterações metabólicas.',
];

export function interpret(c: Comparison): Interpretation {
  const get = (k: BodyMetricKey) => c.changes.find((x) => x.key === k);
  const fat = get('fat_mass_kg');
  const fatPct = get('body_fat_pct');
  const ffm = get('fat_free_mass_kg');
  const smm = get('skeletal_muscle_mass_kg') ?? get('muscle_mass_kg');
  const tbw = get('total_body_water_l');

  let fatLoss: Interpretation['fatLoss'] = 'unclear';
  if (fat?.significant || fatPct?.significant) {
    const down = (fat ? fat.abs < 0 : true) && (fatPct ? fatPct.abs <= 0 : true);
    fatLoss = down ? 'likely' : 'unlikely';
  } else if (fat || fatPct) fatLoss = 'unlikely';

  let leanPreserved: Interpretation['leanPreserved'] = 'unclear';
  const lean = smm ?? ffm;
  if (lean) leanPreserved = lean.abs < 0 && lean.significant ? 'possible_loss' : 'likely';

  const attention: string[] = [];
  const caveats = [...STANDARD_CAVEATS];
  if (lean && leanPreserved === 'possible_loss') {
    attention.push(`${lean.label} caiu ${Math.abs(lean.abs)} ${lean.unit}. Pode refletir variação de hidratação; acompanhe nas próximas avaliações e revise ingestão proteica e treino de força.`);
  }
  if (tbw?.significant) {
    caveats.unshift(`A água corporal variou ${tbw.abs > 0 ? '+' : ''}${tbw.abs} L: parte da mudança na massa magra/peso pode ser água, não tecido.`);
  }
  if (c.sameDevice === false) caveats.unshift('As avaliações foram feitas em equipamentos diferentes: comparações diretas são menos confiáveis.');
  if (c.days > 0 && c.days < 14) caveats.unshift(`Intervalo curto (${c.days} dias): mudanças pequenas tendem a ser oscilação de medição.`);
  const visceral = get('visceral_fat_level');
  if (visceral?.direction === 'worsened') attention.push('O nível de gordura visceral aumentou. Vale acompanhar a tendência e discutir com um profissional.');
  const ratio = get('ecw_tbw_ratio');
  if (ratio?.significant && ratio.abs > 0) attention.push('A relação água extracelular/total aumentou. Isoladamente não indica problema, mas merece acompanhamento.');

  const improved = c.changes.filter((x) => x.direction === 'improved').map((x) => x.label);
  const worsened = c.changes.filter((x) => x.direction === 'worsened').map((x) => x.label);
  const stable = c.changes.filter((x) => x.direction === 'stable').map((x) => x.label);

  const parts: string[] = [];
  if (fatLoss === 'likely') parts.push('A tendência sugere perda de gordura');
  else if (fatLoss === 'unlikely') parts.push('Não houve redução relevante de gordura neste intervalo');
  if (leanPreserved === 'likely') parts.push('a massa magra parece preservada');
  else if (leanPreserved === 'possible_loss') parts.push('houve redução da massa magra que merece acompanhamento');
  const summary = parts.length ? `${parts.join(' e ')}.` : 'Dados insuficientes para uma interpretação: as avaliações não têm indicadores em comum.';

  return { fatLoss, leanPreserved, attention, improved, worsened, stable, caveats, summary };
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface Trend {
  key: BodyMetricKey;
  windowDays: number;
  points: TrendPoint[];
  slopePerWeek: number | null;
  change: number | null;
  /** Consistente: ≥ 3 pontos, todos os passos na mesma direção ou regressão clara. */
  consistent: boolean;
  direction: 'down' | 'up' | 'flat' | 'insufficient';
}

export function series(assessments: BodyAssessment[], key: BodyMetricKey): TrendPoint[] {
  return assessments
    .filter((a) => a.metrics[key])
    .map((a) => ({ date: a.measured_at, value: a.metrics[key]!.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Regressão linear simples (valor × dias). */
export function linearSlopePerDay(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  const t0 = new Date(points[0].date).getTime();
  const xs = points.map((p) => (new Date(p.date).getTime() - t0) / 86_400_000);
  const ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function trend(assessments: BodyAssessment[], key: BodyMetricKey, windowDays: number, now = new Date()): Trend {
  const since = now.getTime() - windowDays * 86_400_000;
  const points = series(assessments, key).filter((p) => new Date(p.date).getTime() >= since);
  const slope = linearSlopePerDay(points);
  const threshold = METRICS[key].threshold;
  let direction: Trend['direction'] = 'insufficient';
  let consistent = false;
  let change: number | null = null;
  if (points.length >= 2 && slope !== null) {
    change = round(points[points.length - 1].value - points[0].value, 2);
    direction = Math.abs(change) < threshold ? 'flat' : change < 0 ? 'down' : 'up';
    if (points.length >= 3 && direction !== 'flat') {
      const steps = points.slice(1).map((p, i) => p.value - points[i].value);
      const sameSign = steps.filter((s) => Math.sign(s) === Math.sign(change!)).length;
      consistent = sameSign >= steps.length - 1 && Math.sign(slope) === Math.sign(change);
    }
  }
  return { key, windowDays, points, slopePerWeek: slope === null ? null : round(slope * 7, 3), change, consistent, direction };
}

/** Média móvel simples (ex.: peso em 7 dias) para reduzir oscilações diárias. */
export function movingAverage(points: TrendPoint[], windowDays = 7): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const t = new Date(p.date).getTime();
    const win = sorted.filter((q) => {
      const tq = new Date(q.date).getTime();
      return tq <= t && tq > t - windowDays * 86_400_000;
    });
    return { date: p.date, value: round(win.reduce((s, q) => s + q.value, 0) / win.length, 2) };
  });
}

/** Valida um rascunho importado antes de confirmar. */
export function validateAssessmentDraft(a: Pick<BodyAssessment, 'measured_at' | 'metrics'>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!a.measured_at || Number.isNaN(new Date(a.measured_at).getTime())) errors.push('Informe a data original da avaliação.');
  if (new Date(a.measured_at).getTime() > Date.now() + 86_400_000) errors.push('A data da avaliação está no futuro.');
  const keys = Object.keys(a.metrics) as BodyMetricKey[];
  if (!keys.length) errors.push('Nenhum indicador informado.');
  const m = a.metrics;
  if (m.body_fat_pct && (m.body_fat_pct.value <= 0 || m.body_fat_pct.value >= 75)) warnings.push('Percentual de gordura fora de faixa plausível.');
  if (m.weight_kg && (m.weight_kg.value < 20 || m.weight_kg.value > 400)) errors.push('Peso fora de faixa plausível.');
  if (m.weight_kg && m.fat_mass_kg && m.fat_mass_kg.value > m.weight_kg.value) errors.push('Massa de gordura maior que o peso: confira os valores.');
  if (m.weight_kg && m.fat_mass_kg && m.fat_free_mass_kg) {
    const sum = m.fat_mass_kg.value + m.fat_free_mass_kg.value;
    if (Math.abs(sum - m.weight_kg.value) > 1.5) warnings.push('Massa de gordura + massa livre de gordura difere do peso em mais de 1,5 kg: confira a leitura.');
  }
  return { errors, warnings };
}
