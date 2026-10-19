/**
 * Atividade física: estimativa de gasto por MET e consistência semanal.
 *
 * Valores MET aproximados do Compendium of Physical Activities
 * (Ainsworth et al., 2011; atualização 2024). Estimativas individuais podem
 * variar ±20–30%. Usamos o gasto LÍQUIDO ((MET − 1) × kg × h), que desconta o
 * metabolismo de repouso já incluído no gasto diário, para não contar duas vezes.
 */
import { addDays, parseISODate, toISODate } from './dates';
import type { ActivityLog, ActivityType, ISODate, Intensity } from './types';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walking: 'Caminhada',
  running: 'Corrida',
  strength: 'Musculação',
  cycling: 'Bicicleta',
  swimming: 'Natação',
  dance: 'Dança',
  stretching: 'Alongamento',
  housework: 'Atividades domésticas',
  other: 'Outra atividade',
};

export const INTENSITY_LABELS: Record<Intensity, string> = {
  light: 'Leve',
  moderate: 'Moderada',
  vigorous: 'Intensa',
};

export const MET_TABLE: Record<ActivityType, Record<Intensity, number> | null> = {
  walking: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
  running: { light: 7.0, moderate: 9.0, vigorous: 11.0 },
  strength: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  cycling: { light: 4.0, moderate: 6.8, vigorous: 10.0 },
  swimming: { light: 5.0, moderate: 7.0, vigorous: 9.8 },
  dance: { light: 3.0, moderate: 5.0, vigorous: 7.3 },
  stretching: { light: 2.3, moderate: 2.5, vigorous: 3.0 },
  housework: { light: 2.3, moderate: 3.3, vigorous: 4.0 },
  other: null,
};

export interface KcalEstimate {
  kcal: number;
  low: number;
  high: number;
  met: number;
  explanation: string;
}

export function estimateActivityKcal(type: ActivityType, intensity: Intensity, durationMin: number, weightKg: number | null): KcalEstimate | null {
  const mets = MET_TABLE[type];
  if (!mets || !weightKg || !(durationMin > 0)) return null;
  const met = mets[intensity];
  const kcal = (met - 1) * weightKg * (durationMin / 60);
  return {
    kcal: Math.round(kcal),
    low: Math.round(kcal * 0.75),
    high: Math.round(kcal * 1.25),
    met,
    explanation: `(${met} MET − 1) × ${weightKg} kg × ${(durationMin / 60).toFixed(2)} h ≈ ${Math.round(kcal)} kcal líquidas (faixa ${Math.round(kcal * 0.75)}–${Math.round(kcal * 1.25)}).`,
  };
}

/**
 * Remove duplicidades: atividades do mesmo tipo com sobreposição de horário
 * maior que 50% (ex.: registro manual + importado do relógio). Mantém a de
 * dispositivo quando houver.
 */
export function dedupeActivities(list: ActivityLog[]): { kept: ActivityLog[]; duplicates: ActivityLog[] } {
  const sorted = [...list].sort((a, b) => (a.source === 'manual' ? 1 : 0) - (b.source === 'manual' ? 1 : 0));
  const kept: ActivityLog[] = [];
  const duplicates: ActivityLog[] = [];
  for (const a of sorted) {
    const aStart = new Date(a.started_at).getTime();
    const aEnd = aStart + a.duration_min * 60_000;
    const dup = kept.find((k) => {
      if (k.type !== a.type) return false;
      const kStart = new Date(k.started_at).getTime();
      const kEnd = kStart + k.duration_min * 60_000;
      const overlap = Math.min(aEnd, kEnd) - Math.max(aStart, kStart);
      return overlap > 0.5 * Math.min(aEnd - aStart, kEnd - kStart);
    });
    if (dup) duplicates.push(a);
    else kept.push(a);
  }
  return { kept, duplicates };
}

/**
 * Calorias de exercício que podem ser "devolvidas" à meta do dia. Por padrão 0%:
 * o fator de atividade já considera a rotina, e estimativas de exercício
 * costumam ser superestimadas.
 */
export function exerciseCaloriesCredit(list: ActivityLog[], creditPct = 0): number {
  const { kept } = dedupeActivities(list);
  const total = kept.reduce((s, a) => s + (a.kcal_estimated ?? 0), 0);
  return Math.round(total * Math.min(1, Math.max(0, creditPct / 100)));
}

export interface WeeklyActivity {
  weekStart: ISODate;
  sessions: number;
  activeDays: number;
  totalMinutes: number;
  strengthSessions: number;
  kcal: number;
  /** Referência da OMS: 150–300 min/semana de atividade moderada. */
  meetsWhoMinimum: boolean;
}

export function weekStart(date: ISODate): ISODate {
  const d = parseISODate(date);
  const diff = (d.getDay() + 6) % 7; // segunda-feira
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

export function weeklyActivity(list: ActivityLog[], start: ISODate): WeeklyActivity {
  const end = addDays(start, 6);
  const { kept } = dedupeActivities(list.filter((a) => a.date >= start && a.date <= end));
  const minutes = kept.reduce((s, a) => s + a.duration_min, 0);
  // minutos vigorosos contam em dobro na recomendação da OMS
  const whoMinutes = kept.reduce((s, a) => s + (a.intensity === 'vigorous' ? 2 : a.intensity === 'moderate' ? 1 : 0) * a.duration_min, 0);
  return {
    weekStart: start,
    sessions: kept.length,
    activeDays: new Set(kept.map((a) => a.date)).size,
    totalMinutes: minutes,
    strengthSessions: kept.filter((a) => a.type === 'strength').length,
    kcal: kept.reduce((s, a) => s + (a.kcal_estimated ?? 0), 0),
    meetsWhoMinimum: whoMinutes >= 150,
  };
}
