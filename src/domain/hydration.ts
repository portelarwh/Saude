/**
 * Hidratação: progresso, distribuição por horário e lembretes proporcionais.
 *
 * Não incentivamos compensar atrasos com grandes volumes de uma vez: a
 * sugestão por lembrete é limitada a um gole confortável.
 */
import { timeToMinutes } from './dates';
import type { Beverage, ISODate, WaterLog } from './types';

export const BEVERAGE_LABELS: Record<Beverage, string> = {
  water: 'Água',
  sparkling_water: 'Água com gás',
  coffee: 'Café',
  tea: 'Chá',
  milk: 'Leite',
  juice: 'Suco',
  soda: 'Refrigerante',
  coconut_water: 'Água de coco',
  other: 'Outra bebida',
};

/** Bebidas que, por padrão, contam para a meta de líquidos (configurável). */
export const DEFAULT_COUNTED: Record<Beverage, boolean> = {
  water: true,
  sparkling_water: true,
  coffee: true,
  tea: true,
  milk: true,
  juice: true,
  soda: false,
  coconut_water: true,
  other: false,
};

export const QUICK_VOLUMES_ML = [100, 150, 200, 250, 300, 500];

/** Volume máximo sugerido por lembrete (evita estímulo a ingestão excessiva). */
export const MAX_SUGGESTED_SIP_ML = 300;

export interface HydrationSummary {
  date: ISODate;
  goal_ml: number | null;
  pure_water_ml: number;
  other_counted_ml: number;
  not_counted_ml: number;
  counted_ml: number;
  remaining_ml: number | null;
  pct: number | null;
  logs: number;
  /** Água estimada vinda dos alimentos (umidade), informativa. */
  food_water_ml: number | null;
}

export function summarizeHydration(
  date: ISODate,
  logs: WaterLog[],
  goalMl: number | null,
  counted: Record<Beverage, boolean> = DEFAULT_COUNTED,
  foodWaterG: number | null = null,
): HydrationSummary {
  const day = logs.filter((l) => l.date === date);
  let pure = 0;
  let other = 0;
  let notCounted = 0;
  for (const l of day) {
    if (l.volume_ml <= 0) continue;
    if (l.beverage === 'water' || l.beverage === 'sparkling_water') pure += l.volume_ml;
    else if (counted[l.beverage]) other += l.volume_ml;
    else notCounted += l.volume_ml;
  }
  const countedMl = pure + other;
  return {
    date,
    goal_ml: goalMl,
    pure_water_ml: pure,
    other_counted_ml: other,
    not_counted_ml: notCounted,
    counted_ml: countedMl,
    remaining_ml: goalMl ? Math.max(0, goalMl - countedMl) : null,
    pct: goalMl ? (countedMl / goalMl) * 100 : null,
    logs: day.length,
    food_water_ml: foodWaterG,
  };
}

/** Consumo por hora do dia (0–23), para o histórico por horário. */
export function hourlyDistribution(logs: WaterLog[], date: ISODate): number[] {
  const hours = new Array(24).fill(0);
  for (const l of logs) {
    if (l.date !== date) continue;
    hours[new Date(l.logged_at).getHours()] += l.volume_ml;
  }
  return hours;
}

/**
 * Quanto seria esperado até agora, distribuindo a meta proporcionalmente
 * entre o horário de acordar e o de dormir (descontando 1 h antes de dormir).
 */
export function expectedByNow(goalMl: number, now: Date, wake = '07:00', sleep = '23:00'): number {
  const start = timeToMinutes(wake);
  let end = timeToMinutes(sleep) - 60;
  if (end <= start) end += 1440;
  let current = now.getHours() * 60 + now.getMinutes();
  // madrugada antes de dormir (quando o horário de dormir passa da meia-noite)
  if (current < start && current + 1440 <= end) current += 1440;
  const frac = Math.min(1, Math.max(0, (current - start) / (end - start)));
  return goalMl * frac;
}

export interface HydrationNudge {
  behind: boolean;
  message: string | null;
  suggested_ml: number | null;
}

/** Mensagem acolhedora, sem culpa, sugerindo um volume confortável. */
export function hydrationNudge(summary: HydrationSummary, now: Date, wake?: string, sleep?: string): HydrationNudge {
  if (!summary.goal_ml) return { behind: false, message: null, suggested_ml: null };
  if (summary.counted_ml >= summary.goal_ml) return { behind: false, message: 'Meta de líquidos atingida hoje. Beba conforme sua sede.', suggested_ml: null };
  const expected = expectedByNow(summary.goal_ml, now, wake, sleep);
  const gap = expected - summary.counted_ml;
  if (summary.logs === 0 && now.getHours() >= 11) {
    return { behind: true, message: 'Ainda não há registros de líquidos hoje. Gostaria de adicionar o que já bebeu?', suggested_ml: null };
  }
  if (gap > summary.goal_ml * 0.2) {
    return {
      behind: true,
      message: 'Você registrou pouca água até agora. Que tal um copo? Não é preciso compensar tudo de uma vez.',
      suggested_ml: Math.min(MAX_SUGGESTED_SIP_ML, Math.round(gap / 50) * 50 || 200),
    };
  }
  return { behind: false, message: null, suggested_ml: null };
}

/** Dias em que a meta foi atingida, considerando apenas dias com registro. */
export function goalAttainment(summaries: HydrationSummary[]): { daysWithLogs: number; daysMet: number; pct: number | null } {
  const logged = summaries.filter((s) => s.logs > 0 && s.goal_ml);
  const met = logged.filter((s) => s.counted_ml >= (s.goal_ml ?? Infinity));
  return { daysWithLogs: logged.length, daysMet: met.length, pct: logged.length ? (met.length / logged.length) * 100 : null };
}
