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

/**
 * Formata a digitação como DD/MM/AAAA: "14071985" → "14/07/1985".
 * Aceita também separadores digitados (".", "-", "/").
 */
export function maskBRDate(text: string): string {
  const parts = ['', '', ''];
  const max = [2, 2, 4];
  let i = 0;
  for (const ch of text) {
    if (/\d/.test(ch)) {
      if (i < 2 && parts[i].length === max[i]) i++;
      if (parts[i].length < max[i]) parts[i] += ch;
    } else if (/[/.\-\s]/.test(ch) && i < 2 && parts[i]) {
      // "1/7/1985": completa dia e mês com zero
      parts[i] = parts[i].padStart(2, '0');
      i++;
    }
  }
  return parts.slice(0, i + 1).join('/');
}

/** "DD/MM/AAAA" (ou "DDMMAAAA") -> "AAAA-MM-DD" (null se inválida). */
export function parseBRDate(text: string): ISODate | null {
  const t = text.trim();
  const m = maskBRDate(t).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return toISODate(date);
}

/**
 * Formata a hora enquanto digita, sem precisar de ":": "1700" → "17:00",
 * "730" → "7:30" (vira 07:30 ao sair do campo). Hora com dois dígitos só se for até 23.
 */
export function maskTime(text: string): string {
  const typedSep = /\d\s*[:h.]\s*\d*$/i.test(text.trim());
  const d = text.replace(/\D/g, '').slice(0, 4);
  if (!d) return '';
  if (typedSep) {
    const [h, m = ''] = text.split(/[:h.]/i);
    const hh = h.replace(/\D/g, '').slice(-2);
    return `${hh}:${m.replace(/\D/g, '').slice(0, 2)}`;
  }
  const twoDigitHour = d.length >= 2 && Number(d.slice(0, 2)) <= 23;
  const hLen = twoDigitHour ? 2 : 1;
  if (d.length <= hLen) return d;
  return `${d.slice(0, hLen)}:${d.slice(hLen, hLen + 2)}`;
}

/** "1700", "17", "7", "730", "17:00", "17h30" → "HH:MM" (null se inválida). */
export function normalizeTime(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const masked = maskTime(t);
  const [h, m = ''] = masked.split(':');
  if (!h || m.length === 1) return null;
  // sobrou dígito que a máscara descartou ("2460" → 2:46 + "0"): inválida
  if (!/[:h.]/i.test(t) && h.length + m.length < t.replace(/\D/g, '').length) return null;
  const hh = Number(h);
  const mm = m ? Number(m) : 0;
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Vários horários separados por espaço, vírgula ou ponto e vírgula: "1230 1930" → ["12:30", "19:30"]; null se algum for inválido. */
export function parseTimeList(text: string): string[] | null {
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  const out = parts.map(normalizeTime);
  return out.every((t): t is string => t !== null) ? out : null;
}

/** Horários do perfil normalizados para salvar ("700" → "07:00"; vazio/ inválido → null). */
export function normalizeTimeFields<T extends { wake_time: string | null; sleep_time: string | null; meal_times: Partial<Record<string, string>> | null }>(p: T): T {
  const meal = p.meal_times ? Object.fromEntries(Object.entries(p.meal_times).map(([k, v]) => [k, normalizeTime(v)]).filter(([, v]) => v)) : null;
  return { ...p, wake_time: normalizeTime(p.wake_time), sleep_time: normalizeTime(p.sleep_time), meal_times: meal && Object.keys(meal).length ? meal : null };
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}
