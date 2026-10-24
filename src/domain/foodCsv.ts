/**
 * Importação em massa de alimentos por planilha (CSV do Excel/Google Planilhas).
 * Célula vazia, "-" ou "NA" = não informado (null), nunca zero. "Tr" = traços.
 * Valores podem estar por 100 g/ml ou por porção (convertidos para 100).
 */
import { normalizeText } from './foodSearch';
import { isKnown, perServingToPer100, round, type NutrientKey, type Nutrients } from './nutrients';
import type { Food, FoodSource, Verification } from './types';

export const CSV_NUTRIENT_COLUMNS: Record<string, NutrientKey> = {
  kcal: 'energy_kcal',
  proteina_g: 'protein_g',
  carboidrato_g: 'carbs_g',
  acucares_g: 'sugars_g',
  acucares_adicionados_g: 'added_sugars_g',
  gordura_g: 'fat_g',
  gordura_saturada_g: 'saturated_fat_g',
  gordura_mono_g: 'monounsaturated_fat_g',
  gordura_poli_g: 'polyunsaturated_fat_g',
  gordura_trans_g: 'trans_fat_g',
  colesterol_mg: 'cholesterol_mg',
  fibra_g: 'fiber_g',
  sodio_mg: 'sodium_mg',
  potassio_mg: 'potassium_mg',
  calcio_mg: 'calcium_mg',
  magnesio_mg: 'magnesium_mg',
  ferro_mg: 'iron_mg',
  zinco_mg: 'zinc_mg',
  vitamina_c_mg: 'vitamin_c_mg',
  agua_g: 'water_g',
};

/** Nomes alternativos de colunas aceitos (já normalizados). */
const COLUMN_ALIASES: Record<string, string> = {
  alimento: 'nome',
  produto: 'nome',
  calorias: 'kcal',
  energia_kcal: 'kcal',
  energia: 'kcal',
  proteina: 'proteina_g',
  proteinas_g: 'proteina_g',
  proteinas: 'proteina_g',
  carboidrato: 'carboidrato_g',
  carboidratos_g: 'carboidrato_g',
  carboidratos: 'carboidrato_g',
  gordura: 'gordura_g',
  gorduras_totais_g: 'gordura_g',
  lipidios_g: 'gordura_g',
  fibra: 'fibra_g',
  fibras_g: 'fibra_g',
  fibra_alimentar_g: 'fibra_g',
  sodio: 'sodio_mg',
  ean: 'codigo_barras',
  codigo_de_barras: 'codigo_barras',
  porcao_g: 'porcao',
  porcao_ml: 'porcao',
};

export const CSV_TEMPLATE_HEADER = [
  'nome', 'marca', 'sabor', 'versao', 'categoria', 'unidade', 'valores_por', 'porcao', 'medida_caseira',
  ...Object.keys(CSV_NUTRIENT_COLUMNS),
  'fonte', 'verificacao', 'referencia', 'codigo_barras', 'suplemento', 'apelidos',
];

export function csvTemplate(): string {
  const example: Record<string, string> = {
    nome: 'Iogurte natural integral', marca: 'Marca Exemplo', unidade: 'g', valores_por: 'porcao', porcao: '170', medida_caseira: '1 pote',
    kcal: '102', proteina_g: '6,3', carboidrato_g: '8,5', gordura_g: '4,8', gordura_saturada_g: '3,1', sodio_mg: '85', fibra_g: '',
    fonte: 'rotulo', codigo_barras: '', suplemento: 'nao', apelidos: 'iogurte|iogurte natural',
  };
  return [CSV_TEMPLATE_HEADER.join(';'), CSV_TEMPLATE_HEADER.map((h) => example[h] ?? '').join(';')].join('\r\n') + '\r\n';
}

export interface CsvIssue {
  line: number;
  message: string;
}

export interface CsvImport {
  foods: Food[];
  errors: CsvIssue[];
  warnings: CsvIssue[];
}

/** Divide o CSV respeitando aspas; detecta ";", "," ou tabulação. */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (c: string) => firstLine.split(c).length - 1;
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const columnName = (h: string) => {
  const n = normalizeText(h).replace(/[%.]/g, '').trim().replace(/\s+/g, '_');
  return COLUMN_ALIASES[n] ?? n;
};

type Cell = { kind: 'empty' } | { kind: 'trace' } | { kind: 'number'; value: number } | { kind: 'invalid' };

/** "1,5" "1.5" "1.234,5" → número; vazio/"-"/"NA" → vazio; "Tr" → traços. */
export function parseCell(raw: string | undefined): Cell {
  const t = (raw ?? '').trim();
  if (!t || /^(-|—|na|n\/a|nd)$/i.test(t)) return { kind: 'empty' };
  if (/^(tr|traços|tracos)$/i.test(t)) return { kind: 'trace' };
  let s = t.replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? { kind: 'number', value: n } : { kind: 'invalid' };
}

const SOURCES: Record<string, FoodSource> = {
  rotulo: 'label', label: 'label', taco: 'taco', tbca: 'tbca', usda: 'usda', off: 'off', 'open food facts': 'off',
  manual: 'manual', receita: 'recipe', estimativa: 'ai_estimate', ia: 'ai_estimate', agente: 'ai_estimate',
};
const VERIFICATIONS: Record<string, Verification> = { verificado: 'verified', informado: 'reported', estimado: 'estimated' };

export function parseFoodsCsv(text: string): CsvImport {
  const rows = parseCsvRows(text);
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  const foods: Food[] = [];
  if (rows.length < 2) return { foods, errors: [{ line: 1, message: 'A planilha precisa de um cabeçalho e ao menos uma linha de alimento.' }], warnings };
  const header = rows[0].map(columnName);
  if (!header.includes('nome')) return { foods, errors: [{ line: 1, message: 'Coluna "nome" não encontrada no cabeçalho.' }], warnings };
  const unknown = header.filter((h) => h && !CSV_TEMPLATE_HEADER.includes(h));
  if (unknown.length) warnings.push({ line: 1, message: `Colunas ignoradas: ${unknown.join(', ')}.` });

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (col: string) => {
      const idx = header.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const name = get('nome');
    if (!name) return errors.push({ line, message: 'Sem nome.' });
    const unitRaw = normalizeText(get('unidade') || 'g');
    if (unitRaw !== 'g' && unitRaw !== 'ml') return errors.push({ line, message: `${name}: unidade "${get('unidade')}" inválida (use g ou ml).` });
    const unit = unitRaw as 'g' | 'ml';
    const perServing = /porc/.test(normalizeText(get('valores_por')));
    const servingCell = parseCell(get('porcao'));
    const serving = servingCell.kind === 'number' && servingCell.value > 0 ? servingCell.value : null;
    if (servingCell.kind === 'invalid') return errors.push({ line, message: `${name}: porção inválida.` });
    if (perServing && !serving) return errors.push({ line, message: `${name}: valores por porção exigem a coluna "porcao" (em ${unit}).` });

    const values: Nutrients = {};
    const trace: string[] = [];
    let bad: string | null = null;
    for (const [col, key] of Object.entries(CSV_NUTRIENT_COLUMNS)) {
      const c = parseCell(get(col));
      if (c.kind === 'invalid') bad = col;
      else if (c.kind === 'trace') {
        trace.push(key);
        values[key] = null;
      } else values[key] = c.kind === 'number' ? c.value : null;
    }
    if (bad) return errors.push({ line, message: `${name}: valor inválido em "${bad}".` });
    if (!Object.values(values).some(isKnown)) return errors.push({ line, message: `${name}: nenhum valor nutricional informado.` });
    const per100 = perServing ? roundAll(perServingToPer100(values, serving!)) : values;
    if (isKnown(per100.energy_kcal) && per100.energy_kcal > 950) warnings.push({ line, message: `${name}: ${Math.round(per100.energy_kcal)} kcal por 100 ${unit} parece alto; confira a coluna "valores_por".` });

    const fonteRaw = normalizeText(get('fonte'));
    const source: FoodSource = SOURCES[fonteRaw] ?? 'manual';
    if (fonteRaw && !SOURCES[fonteRaw]) warnings.push({ line, message: `${name}: fonte "${get('fonte')}" não reconhecida; registrada como cadastro manual.` });
    const verification: Verification = VERIFICATIONS[normalizeText(get('verificacao'))] ?? (source === 'ai_estimate' ? 'estimated' : 'reported');
    const measure = get('medida_caseira');
    const barcode = get('codigo_barras').replace(/\D/g, '') || null;
    const isSupplement = /^(s|sim|x|1|true)$/i.test(get('suplemento'));
    foods.push({
      id: '',
      user_id: null,
      name,
      aliases: get('apelidos').split('|').map((a) => a.trim()).filter(Boolean),
      brand: get('marca') || null,
      flavor: get('sabor') || null,
      variant: get('versao') || null,
      category: get('categoria') || null,
      preparation_state: null,
      base_unit: unit,
      serving_size: serving,
      serving_label: measure || null,
      household_measures: serving && measure ? [{ label: measure, amount: serving, estimated: false }] : [],
      per100,
      trace_nutrients: trace,
      source,
      source_ref: get('referencia') || null,
      verification,
      verified_at: null,
      label_basis: source === 'label' ? 'as_sold' : null,
      barcode,
      ingredients_text: null,
      is_supplement: isSupplement,
      supplement_category: null,
      compounds_per_serving: null,
    });
  });
  return { foods, errors, warnings };
}

function roundAll(n: Nutrients): Nutrients {
  const out: Nutrients = {};
  for (const [k, v] of Object.entries(n) as [NutrientKey, number | null][]) out[k] = isKnown(v) ? round(v, 2) : null;
  return out;
}
