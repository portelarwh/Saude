/**
 * Creatina — conteúdo educativo para adultos e acompanhamento do uso.
 * Fonte: Kreider RB et al. ISSN position stand: safety and efficacy of creatine
 * supplementation (2017), https://doi.org/10.1186/s12970-017-0173-z
 * Suplemento é opcional: nada aqui vira meta obrigatória.
 */
import { addDays, daysBetween } from './dates';
import type { DiaryEntry, HealthFlag, ISODate } from './types';

export const CREATINE_SOURCE = 'ISSN — Safety and efficacy of creatine supplementation (2017)';

export const CREATINE_GUIDE = {
  dose: 'Creatina monohidratada, 3–5 g por dia, todos os dias — inclusive nos dias sem treino. O horário tanto faz; o que conta é a constância.',
  loading: 'Opcional: saturação de 20 g/dia (4 doses de 5 g) por 5–7 dias e depois 3–5 g/dia. Deixa o efeito mais rápido, mas não é necessária: com 3–5 g/dia o músculo satura em 3–4 semanas.',
  weight: 'Nas primeiras semanas é comum o peso subir 1–2 kg: é água dentro do músculo, não gordura.',
  water: 'Não precisa de meta de água separada: mantenha a sua meta de líquidos em dia.',
  notProtein: 'Creatina não é proteína e não entra nos macronutrientes.',
};

/** Sem recomendação automática: doença renal, gestação, amamentação ou menor de 18 anos. */
export function creatineCaution(flags: readonly HealthFlag[] | null | undefined, age: number | null): string | null {
  const f = new Set(flags ?? []);
  if (f.has('kidney_disease')) return 'Com doença renal, use creatina apenas com orientação do seu médico.';
  if (f.has('pregnancy') || f.has('breastfeeding')) return 'Na gestação ou amamentação, não use creatina sem orientação médica.';
  if (age !== null && age < 18) return 'Para menores de 18 anos, a creatina só deve ser usada com orientação profissional.';
  return null;
}

const creatineOf = (e: DiaryEntry) => e.compounds?.creatine_g ?? 0;

export interface CreatineStatus {
  takenToday: boolean;
  gramsToday: number;
  /** Dias seguidos com creatina, contando hoje (ou ontem, se hoje ainda não tomou). */
  streak: number;
  /** Primeiro dia de uso no período analisado (ou após uma pausa de 14+ dias). */
  startedOn: ISODate | null;
  /** Começou há menos de 4 semanas: o peso pode subir por água no músculo. */
  recentStart: boolean;
}

export function creatineStatus(entries: DiaryEntry[], today: ISODate): CreatineStatus {
  const byDay = new Map<ISODate, number>();
  for (const e of entries) {
    const g = creatineOf(e);
    if (g > 0) byDay.set(e.date, (byDay.get(e.date) ?? 0) + g);
  }
  const gramsToday = byDay.get(today) ?? 0;
  let streak = 0;
  let d = gramsToday > 0 ? today : addDays(today, -1);
  while (byDay.has(d)) {
    streak++;
    d = addDays(d, -1);
  }
  const days = [...byDay.keys()].sort();
  let startedOn: ISODate | null = days[0] ?? null;
  for (let i = 1; i < days.length; i++) if (daysBetween(days[i - 1], days[i]) >= 14) startedOn = days[i];
  const recentStart = startedOn !== null && daysBetween(startedOn, today) < 28;
  return { takenToday: gramsToday > 0, gramsToday, streak, startedOn, recentStart };
}
