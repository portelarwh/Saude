/**
 * Exportação de dados (LGPD art. 18, V — portabilidade) e de relatórios.
 * Android: gera arquivo e abre a folha de compartilhamento.
 * Web: faz download direto pelo navegador.
 */
import { Platform } from 'react-native';
import { ALL_TABLES, type DataStore } from '../data/store';
import { toCSV, type Report } from '../domain/reports';
import { formatDateBR } from '../domain/dates';
import { buildFoodBundle } from '../domain/foodBundle';
import type { Food } from '../domain/types';

async function shareText(filename: string, content: string, mime: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const FS = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const uri = `${FS.cacheDirectory}${filename}`;
  await FS.writeAsStringAsync(uri, content);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mime, dialogTitle: filename });
  else throw new Error('Compartilhamento indisponível neste aparelho.');
}

export async function collectAllData(store: DataStore): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of ALL_TABLES) out[t] = await store.list(t);
  return out;
}

export async function exportAllJSON(store: DataStore): Promise<void> {
  const data = await collectAllData(store);
  const payload = { app: 'Meu Equilíbrio', exported_at: new Date().toISOString(), format_version: 1, data };
  await shareText(`meu-equilibrio-dados-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

/** Base de alimentos (base do sistema + cadastros do usuário) no formato de alimentos-base.json. */
export async function exportFoodBase(baseFoods: Food[], userFoods: Food[]): Promise<number> {
  const bundle = buildFoodBundle(baseFoods, userFoods);
  await shareText('alimentos-base.json', JSON.stringify(bundle, null, 2) + '\n', 'application/json');
  return bundle.alimentos.length;
}

/** CSV de uma tabela (abre no Excel em pt-BR: separador ";" e vírgula decimal). */
export async function exportTableCSV(store: DataStore, table: (typeof ALL_TABLES)[number]): Promise<void> {
  const rows = (await store.list<Record<string, unknown>>(table)).map((r) => flatten(r));
  await shareText(`meu-equilibrio-${table}.csv`, '﻿' + toCSV(rows), 'text/csv');
}

function flatten(r: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && (k === 'nutrients' || k === 'per100_snapshot')) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = v;
  }
  return out;
}

const fmt = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));

export function reportHTML(r: Report, title: string, name: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const li = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p>—</p>');
  const body = r.body
    ? `<table><tr><th>Indicador</th><th>De</th><th>Para</th><th>Variação</th></tr>${r.body.comparison.changes
        .map((c) => `<tr><td>${esc(c.label)}</td><td>${fmt(c.from, 1)} ${c.unit}</td><td>${fmt(c.to, 1)} ${c.unit}</td><td>${c.pp !== null ? `${fmt(c.pp, 1)} p.p.` : `${fmt(c.abs, 2)} ${c.unit}`}</td></tr>`)
        .join('')}</table><p>${esc(r.body.interpretation.summary)}</p>`
    : '<p>Sem avaliações corporais comparáveis no período.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#13201A;margin:32px;font-size:13px}h1{color:#1C5E3F;font-size:22px}h2{font-size:15px;margin-top:22px;border-bottom:1px solid #D9E3DB;padding-bottom:4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #D9E3DB;padding:6px;text-align:left}.muted{color:#6A7B71;font-size:11px}</style></head><body>
<h1>${esc(title)}</h1><p>${esc(name)} · ${formatDateBR(r.from)} a ${formatDateBR(r.to)} · confiabilidade dos registros: <b>${r.confidence}</b></p>
<h2>Alimentação (média dos ${r.food.daysWithRecords} dias com registro)</h2>
<table><tr><th>Calorias</th><th>Proteínas</th><th>Carboidratos</th><th>Gorduras</th><th>Fibras</th></tr>
<tr><td>${fmt(r.food.avgKcal)} kcal</td><td>${fmt(r.food.avgProtein, 1)} g</td><td>${fmt(r.food.avgCarbs, 1)} g</td><td>${fmt(r.food.avgFat, 1)} g</td><td>${fmt(r.food.avgFiber, 1)} g</td></tr></table>
<p>Dias com meta de proteína atingida: ${r.food.proteinGoalDays}</p>
<h2>Hidratação</h2><p>Meta atingida em ${r.hydration.daysMet} de ${r.hydration.daysWithLogs} dias com registro (${r.hydration.pct === null ? '—' : fmt(r.hydration.pct) + '%'}). Média: ${fmt(r.hydration.avgMl)} ml/dia.</p>
<h2>Atividade física</h2><p>${r.activity.sessions} sessões em ${r.activity.activeDays} dias · ${r.activity.minutes} minutos · ${r.activity.strengthSessions} de força.</p>
<h2>Peso (média móvel de 7 dias)</h2><p>${r.weight.points ? `${fmt(r.weight.first, 1)} → ${fmt(r.weight.last, 1)} kg (${fmt(r.weight.change, 1)} kg)` : 'Sem pesagens no período.'}</p>
<h2>Composição corporal</h2>${body}
<h2>Informações faltantes</h2>${li(r.missing)}
<h2>Sugestões para o próximo período</h2>${li(r.suggestions)}
<p class="muted">Relatório gerado pelo app Meu Equilíbrio. Médias consideram apenas dias com registro; ausência de registro não é interpretada como consumo zero. Conteúdo orientativo, não substitui avaliação profissional.</p>
</body></html>`;
}

export async function exportReportPDF(r: Report, title: string, name: string): Promise<void> {
  const html = reportHTML(r, title, name);
  const Print = await import('expo-print');
  if (Platform.OS === 'web') {
    await Print.printAsync({ html }); // navegador: "Salvar como PDF"
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  const Sharing = await import('expo-sharing');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title });
}
