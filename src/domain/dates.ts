import type { ISODate } from './types';

/** Data local AAAA-MM-DD (o diário é organizado pelo dia local do usuário). */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(a: ISODate | Date, b: ISODate | Date): number {
  const da = typeof a === 'string' ? parseISODate(a) : a;
  const db = typeof b === 'string' ? parseISODate(b) : b;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function ageOn(birthDate: ISODate, on: Date = new Date()): number {
  const b = parseISODate(birthDate);
  let age = on.getFullYear() - b.getFullYear();
  const beforeBirthday = on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** "HH:MM" -> minutos desde 00:00. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error(`Horário inválido: ${t}`);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
}

export function formatDateBR(d: ISODate | Date): string {
  const date = typeof d === 'string' ? (d.length === 10 ? parseISODate(d) : new Date(d)) : d;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export function weekdayLabel(index: number): string {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][index];
}
