/**
 * Planejamento de lembretes. Cada tipo é independente: desativar um tipo
 * remove somente os lembretes daquele tipo.
 */
import { minutesToTime, timeToMinutes } from './dates';
import type { NotificationKind, NotificationSetting } from './types';

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  water: 'Consumo de água',
  breakfast: 'Café da manhã',
  morning_snack: 'Lanche da manhã',
  lunch: 'Almoço',
  afternoon_snack: 'Lanche da tarde',
  dinner: 'Jantar',
  supplements: 'Suplementos',
  exercise: 'Exercícios',
  weigh_in: 'Pesagem',
  body_assessment: 'Nova avaliação corporal',
  daily_summary: 'Resumo diário',
};

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_LABELS) as NotificationKind[];

const DEFAULT_MESSAGES: Record<NotificationKind, string> = {
  water: 'Que tal um copo de água? Registre quando beber.',
  breakfast: 'Hora do café da manhã. Registre sua refeição quando puder.',
  morning_snack: 'Lembrete do lanche da manhã.',
  lunch: 'Hora do almoço. Registrar leva poucos segundos.',
  afternoon_snack: 'Lembrete do lanche da tarde.',
  dinner: 'Hora do jantar.',
  supplements: 'Lembrete dos seus suplementos.',
  exercise: 'Hora de se movimentar! Registre sua atividade depois.',
  weigh_in: 'Dia de pesagem: prefira o mesmo horário e condições.',
  body_assessment: 'Que tal agendar uma nova avaliação corporal?',
  daily_summary: 'Seu resumo do dia está disponível.',
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function defaultSettings(): Omit<NotificationSetting, 'id' | 'user_id' | 'created_at'>[] {
  const base = (kind: NotificationKind, times: string[], extra: Partial<NotificationSetting> = {}) => ({
    kind,
    enabled: false,
    times,
    weekdays: ALL_DAYS,
    interval_min: null,
    window_start: null,
    window_end: null,
    quiet_start: '22:00',
    quiet_end: '07:00',
    message: null,
    ...extra,
  });
  return [
    base('water', [], { interval_min: 120, window_start: '08:00', window_end: '20:00' }),
    base('breakfast', ['07:30']),
    base('morning_snack', ['10:00']),
    base('lunch', ['12:30']),
    base('afternoon_snack', ['16:00']),
    base('dinner', ['19:30']),
    base('supplements', ['08:00']),
    base('exercise', ['18:00'], { weekdays: [1, 3, 5] }),
    base('weigh_in', ['07:00'], { weekdays: [1] }),
    base('body_assessment', ['09:00'], { weekdays: [1] }),
    base('daily_summary', ['21:00']),
  ];
}

export interface PlannedNotification {
  /** Identificador estável: "<tipo>:<dia>:<HH:MM>" — permite cancelar por tipo. */
  id: string;
  kind: NotificationKind;
  weekday: number; // 0 = domingo
  time: string; // HH:MM
  title: string;
  body: string;
}

export function isQuiet(time: string, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;
  const t = timeToMinutes(time);
  const s = timeToMinutes(quietStart);
  const e = timeToMinutes(quietEnd);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

export function timesFor(setting: Pick<NotificationSetting, 'times' | 'interval_min' | 'window_start' | 'window_end'>): string[] {
  if (setting.interval_min && setting.window_start && setting.window_end) {
    const out: string[] = [];
    const start = timeToMinutes(setting.window_start);
    const end = timeToMinutes(setting.window_end);
    const step = Math.max(30, setting.interval_min); // nunca mais que 1 lembrete a cada 30 min
    for (let m = start; m <= end; m += step) out.push(minutesToTime(m));
    return out;
  }
  return [...new Set(setting.times)].sort();
}

export function planNotifications(settings: Pick<NotificationSetting, 'kind' | 'enabled' | 'times' | 'weekdays' | 'interval_min' | 'window_start' | 'window_end' | 'quiet_start' | 'quiet_end' | 'message'>[]): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const s of settings) {
    if (!s.enabled) continue;
    const times = timesFor(s).filter((t) => !isQuiet(t, s.quiet_start, s.quiet_end));
    for (const weekday of [...new Set(s.weekdays)].sort()) {
      for (const time of times) {
        out.push({
          id: `${s.kind}:${weekday}:${time}`,
          kind: s.kind,
          weekday,
          time,
          title: NOTIFICATION_LABELS[s.kind],
          body: s.message || DEFAULT_MESSAGES[s.kind],
        });
      }
    }
  }
  return out;
}

/** Limite diário para evitar excesso de mensagens. */
export const MAX_NOTIFICATIONS_PER_DAY = 16;

export function countPerDay(plan: PlannedNotification[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of plan) out[p.weekday] = (out[p.weekday] ?? 0) + 1;
  return out;
}
