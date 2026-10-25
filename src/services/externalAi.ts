/**
 * IA externa por "copiar e colar" — alternativa sem chave de API.
 *
 * 1. O app monta a pergunta (com instruções e, quando útil, o resumo dos
 *    seus registros) e a copia; o usuário cola no Claude, ChatGPT ou Gemini.
 * 2. Para tarefas estruturadas, a IA externa é instruída a responder em JSON.
 * 3. O usuário cola a resposta de volta; o app valida com os MESMOS esquemas
 *    da IA integrada e mostra a tela de conferência antes de salvar.
 *
 * As mesmas regras valem aqui: nutrientes de alimentos vêm da base do app
 * (a IA só identifica itens e quantidades) e nada é salvo sem conferência.
 */
import {
  BODY_METRIC_KEYS,
  BioimpedanceExtractionSchema,
  DietImportSchema,
  LabelExtractionSchema,
  MealParseSchema,
  SUPPLEMENT_CATEGORIES,
  type BioimpedanceExtraction,
  type DietImport,
  type LabelExtraction,
  type MealParse,
} from '../../supabase/functions/_shared/schemas';
import { extractJson, PasteParseError as ExternalParseError } from '../domain/pastedJson';

export { extractJson, ExternalParseError };

export type ExternalTask = 'chat' | 'meal' | 'label' | 'bioimpedance' | 'diet';

export interface ExternalProvider {
  id: 'claude' | 'chatgpt' | 'gemini';
  name: string;
  /** URL com a pergunta pré-preenchida, quando o serviço aceita. */
  url: (prompt: string) => string;
}

/** Limite prudente para pré-preencher pela URL; acima disso, só área de transferência. */
const MAX_PREFILL = 1800;

export const EXTERNAL_PROVIDERS: ExternalProvider[] = [
  { id: 'claude', name: 'Claude', url: (p) => (encodeURIComponent(p).length <= MAX_PREFILL ? `https://claude.ai/new?q=${encodeURIComponent(p)}` : 'https://claude.ai/new') },
  { id: 'chatgpt', name: 'ChatGPT', url: (p) => (encodeURIComponent(p).length <= MAX_PREFILL ? `https://chatgpt.com/?q=${encodeURIComponent(p)}` : 'https://chatgpt.com/') },
  { id: 'gemini', name: 'Gemini', url: () => 'https://gemini.google.com/app' },
];

// ---------------------------------------------------------------------------
// Modelos de resposta (servem de exemplo no prompt e de valores padrão)
// ---------------------------------------------------------------------------
const NUTRIENT_TEMPLATE = { energy_kcal: null, energy_kj: null, protein_g: null, carbs_g: null, sugars_g: null, added_sugars_g: null, fat_g: null, saturated_fat_g: null, trans_fat_g: null, fiber_g: null, sodium_mg: null };

const TEMPLATES: Record<Exclude<ExternalTask, 'chat'>, unknown> = {
  meal: {
    items: [{ text: 'dois ovos mexidos', food_query: 'ovo mexido', quantity: 2, unit: 'unidade', preparation: 'mexido', notes: [] }],
    questions: ['Usou óleo ou manteiga nos ovos?'],
    meal: null,
  },
  label: {
    product_name: null, brand: null, flavor: null, variant: null, barcode: null,
    serving_size: null, serving_unit: 'g', household_measure: null, basis: 'unknown',
    per_serving: NUTRIENT_TEMPLATE, per_100: NUTRIENT_TEMPLATE, ingredients_text: null,
    is_supplement: false, supplement_category: null,
    compounds_per_serving: [],
    unreadable_fields: [], confidence: 'medium',
  },
  bioimpedance: {
    measured_at: '2026-10-01T08:00:00', device_manufacturer: null, device_model: null,
    metrics: [{ key: 'weight_kg', value: 80.0, unit: 'kg', printed_label: 'Peso' }],
    segmental: [{ segment: 'left_arm', kind: 'lean_mass', value: 3.1, unit: 'kg' }],
    other_metrics: [{ label: 'Impedância braço direito 20 kHz', value: 250.0, unit: 'Ω' }],
    visceral_fat_scale: null, warnings: [],
  },
  diet: {
    name: 'Plano', professional_name: null,
    meals: [{ name: 'Café da manhã', meal: 'breakfast', time: '07:00', options: [{ label: 'Opção 1', items: [{ food_name: 'pão francês', amount: 1, unit: 'unidade', note: null }] }] }],
    notes: [],
  },
};

/** Modelos de item para listas cujo exemplo vem vazio. */
const ITEM_TEMPLATES: Record<string, Record<string, unknown>> = {
  compounds_per_serving: { name: null, amount: null, unit: null },
  segmental: { segment: null, kind: null, value: null, unit: null },
  other_metrics: { label: null, value: null, unit: null },
};

const RULES: Record<ExternalTask, string> = {
  chat: `Você é um assistente de nutrição e composição corporal para um adulto no Brasil. Responda em português, de forma prática e acolhedora.
Regras: use os dados abaixo (registrados pelo usuário e calculados pelo app); ausência de registro não significa consumo zero. Ao citar valores nutricionais, indique a fonte (de preferência TACO) e marque estimativas como estimativas. Não faça diagnósticos, não recomende dietas extremas e não proponha alterar metas ou planos prescritos por profissional. Diferencie recomendação geral, estimativa e prescrição.`,
  meal: `Separe a refeição descrita em itens alimentares. Para cada item informe "food_query" (nome genérico em português, como numa tabela brasileira), "quantity" e "unit" apenas se ditos ou implícitos ("dois ovos" = 2 unidade), e "preparation". Em "questions", pergunte o que mudaria muito o valor nutricional (óleo/manteiga, açúcar, tipo de leite). NÃO informe calorias nem macronutrientes: o app busca esses números em base oficial.`,
  label: `Transcreva a tabela nutricional do rótulo na foto/PDF que vou anexar. Somente o que estiver legível; o que faltar = null e liste em "unreadable_fields". "per_100" = coluna 100 g/100 ml; "per_serving" = coluna da porção. Sódio em mg. "basis": "as_sold", "prepared" ou "unknown". Suplementos: "is_supplement": true, categoria em ${SUPPLEMENT_CATEGORIES.join(', ')}; compostos ativos (creatina, vitaminas, minerais, cafeína) em "compounds_per_serving" com unidade g, mg, mcg ou UI. Creatina não é proteína.`,
  bioimpedance: `Transcreva o laudo de bioimpedância que vou anexar. Somente indicadores IMPRESSOS, com valor e unidade como aparecem; não calcule nem estime ausentes; ignore faixas de referência, classificações ("Normal", "Acima") e percentuais do ideal.
Regras do formato (o app rejeita o que fugir delas):
- "metrics": um item por indicador, com "key" EXATAMENTE uma destas: ${BODY_METRIC_KEYS.join(', ')}. "value" é número (ponto decimal), "unit" é texto ("" se não houver unidade), "printed_label" é o rótulo impresso.
- "segmental": SÓ massa magra, gordura ou massa muscular por segmento, um item por segmento e tipo, com exatamente as chaves {"segment", "kind", "value", "unit"}. "segment" = right_arm (braço direito), left_arm (braço esquerdo), trunk (tronco), right_leg (perna direita) ou left_leg (perna esquerda). "kind" = lean_mass (massa magra), fat_mass (gordura) ou muscle_mass (massa muscular).
- Impedância, ângulo de fase por segmento e qualquer outro indicador vão em "other_metrics" como {"label", "value", "unit"}, com o segmento e a frequência no rótulo (ex.: "Impedância braço direito 20 kHz").
- "value" sempre número: "68/100" vira 68 com unit "pontos (de 100)"; texto que não é número não entra.
- Não crie outras chaves. "measured_at": data da avaliação em ISO 8601 (null se não houver). Dúvidas de leitura em "warnings".`,
  diet: `Transcreva o plano alimentar (que vou colar ou anexar). Separe refeições com nome, horário (HH:MM) e tipo (breakfast, morning_snack, lunch, afternoon_snack, dinner, supper, extra). Alternativas ("ou", "opção 1/2", substituições) viram OPÇÕES separadas da mesma refeição; itens comidos juntos ficam na mesma opção. Quantidade e unidade exatamente como escritas; não acrescente alimentos nem calcule calorias.`,
};

export function buildExternalPrompt(task: ExternalTask, input: { question?: string; text?: string; context?: Record<string, unknown> }): string {
  const parts = [RULES[task]];
  if (task === 'chat') {
    if (input.context) parts.push(`<dados_do_usuario>\n${JSON.stringify(input.context)}\n</dados_do_usuario>`);
    parts.push(`Pergunta: ${input.question ?? ''}`);
    return parts.join('\n\n');
  }
  if (input.text) parts.push(task === 'meal' ? `Refeição: "${input.text}"` : `Conteúdo:\n${input.text}`);
  if (task === 'label' || task === 'bioimpedance') parts.push('(Anexe a foto ou o PDF nesta conversa antes de enviar.)');
  parts.push(`Responda SOMENTE com um bloco \`\`\`json no formato abaixo (mesmas chaves, null quando não houver; os valores do modelo são só exemplo de formato, não os copie):\n\`\`\`json\n${JSON.stringify(TEMPLATES[task], null, 1)}\n\`\`\``);
  return parts.join('\n\n');
}

/** Padrões para campos obrigatórios que a IA externa costuma omitir (nunca valores nutricionais). */
function defaultFor(field: string, parent: string): unknown {
  if (parent === '') return ({ confidence: 'medium', basis: 'unknown', is_supplement: false, name: 'Plano importado' } as Record<string, unknown>)[field] ?? null;
  if (parent === 'options' && field === 'label') return 'Opção';
  return null;
}

/** Completa chaves ausentes com os valores padrão do modelo (a IA externa às vezes omite campos). */
export function fillDefaults(value: unknown, template: unknown, key = ''): unknown {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return [];
    const itemTpl = ITEM_TEMPLATES[key] ?? template[0];
    return itemTpl && typeof itemTpl === 'object' ? value.map((v) => fillDefaults(v, itemTpl, key)) : value;
  }
  if (template && typeof template === 'object') {
    if (value === null && Object.values(template).every((v) => v === null)) return null; // objeto de nutrientes ausente
    if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, tv] of Object.entries(template as Record<string, unknown>)) {
      const v = out[k];
      if (v === undefined) out[k] = Array.isArray(tv) ? [] : tv && typeof tv === 'object' ? fillDefaults({}, tv) : defaultFor(k, key);
      else out[k] = fillDefaults(v, tv, k);
    }
    return out;
  }
  return value === undefined ? null : value;
}

const SEGMENT_NAMES: [RegExp, Segment][] = [
  [/^(right[ _]?arm|braco direito|bd|msd|membro superior direito)$/, 'right_arm'],
  [/^(left[ _]?arm|braco esquerdo|be|mse|membro superior esquerdo)$/, 'left_arm'],
  [/^(trunk|tronco|tr|torso)$/, 'trunk'],
  [/^(right[ _]?leg|perna direita|pd|mid|membro inferior direito)$/, 'right_leg'],
  [/^(left[ _]?leg|perna esquerda|pe|mie|membro inferior esquerdo)$/, 'left_leg'],
];
const SEGMENT_PT: Record<Segment, string> = { right_arm: 'braço direito', left_arm: 'braço esquerdo', trunk: 'tronco', right_leg: 'perna direita', left_leg: 'perna esquerda' };
type Segment = 'right_arm' | 'left_arm' | 'trunk' | 'right_leg' | 'left_leg';
type Kind = 'lean_mass' | 'fat_mass' | 'muscle_mass';

const plain = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 _]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function toSegment(v: unknown): Segment | null {
  const t = plain(v);
  return SEGMENT_NAMES.find(([re]) => re.test(t))?.[1] ?? null;
}

function toKind(...hints: unknown[]): Kind | null {
  for (const h of hints) {
    const t = plain(h);
    if (!t) continue;
    if (/^(lean_mass|fat_mass|muscle_mass)$/.test(t)) return t as Kind;
    if (/magra|lean|livre de gordura|fat free/.test(t)) return 'lean_mass';
    if (/gordura|fat/.test(t)) return 'fat_mass';
    if (/muscul|muscle/.test(t)) return 'muscle_mass';
  }
  return null;
}

/** "54,0" → 54; "68/100" → 68 (escala informada na unidade); texto → null. */
function toNumber(v: unknown): { value: number; scale?: string } | null {
  if (typeof v === 'number' && Number.isFinite(v)) return { value: v };
  if (typeof v !== 'string') return null;
  const frac = v.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
  if (frac) return { value: Number(frac[1].replace(',', '.')), scale: `de ${frac[2].replace('.', ',')}` };
  const n = Number(v.trim().replace(/\s/g, '').replace(',', '.'));
  return v.trim() && Number.isFinite(n) ? { value: n } : null;
}

const unitText = (u: unknown) => (u === null || u === undefined ? '' : String(u));

/**
 * Corrige variações comuns da IA externa sem inventar valores: nomes de
 * segmento em português/abreviados, tipo deduzido do título da análise,
 * números como texto, unidades nulas, chaves extras. Impedância e o que não
 * couber nos campos do app vão para "outros indicadores"; o que não é número
 * vira aviso para conferência.
 */
export function sanitizeBio(v: Record<string, unknown>): Record<string, unknown> {
  const warnings = Array.isArray(v.warnings) ? v.warnings.map(String) : [];
  const other: { label: string; value: number; unit: string }[] = [];
  const pushOther = (label: string, raw: unknown, unit: unknown) => {
    const n = toNumber(raw);
    if (!n) {
      if (raw !== null && raw !== undefined && raw !== '') warnings.push(`"${label}" (${String(raw)}) não é um número e não foi importado.`);
      return;
    }
    other.push({ label, value: n.value, unit: [unitText(unit), n.scale ? `(${n.scale})` : ''].filter(Boolean).join(' ') });
  };

  const metrics: Record<string, unknown>[] = [];
  for (const m of Array.isArray(v.metrics) ? (v.metrics as Record<string, unknown>[]) : []) {
    if (!m || typeof m !== 'object') continue;
    const label = String(m.printed_label || m.key || 'Indicador');
    const n = toNumber(m.value);
    if ((BODY_METRIC_KEYS as readonly string[]).includes(String(m.key)) && n && !n.scale) {
      metrics.push({ key: m.key, value: n.value, unit: unitText(m.unit), printed_label: label });
    } else pushOther(label, m.value, m.unit);
  }

  const segmental: { segment: Segment; kind: Kind; value: number; unit: string }[] = [];
  for (const sg of Array.isArray(v.segmental) ? (v.segmental as Record<string, unknown>[]) : []) {
    if (!sg || typeof sg !== 'object') continue;
    const segment = toSegment(sg.segment);
    const where = segment ? SEGMENT_PT[segment] : String(sg.segment ?? '');
    const title = String(sg.analysis ?? sg.label ?? sg.kind ?? '');
    const freq = sg.frequency !== undefined && sg.frequency !== null ? ` ${sg.frequency} ${sg.frequency_unit ?? 'kHz'}` : '';
    const isImpedance = /imped|reatan|angulo de fase|phase/.test(plain(title)) || /^(ω|ohm)/i.test(unitText(sg.unit));
    const kind = isImpedance ? null : toKind(sg.kind, sg.analysis, sg.label);
    const n = toNumber(sg.value);
    if (segment && kind && n && !n.scale) segmental.push({ segment, kind, value: n.value, unit: unitText(sg.unit) || 'kg' });
    else pushOther(`${title || 'Segmentar'} ${where}${freq}`.replace(/\s+/g, ' ').trim(), sg.value, sg.unit);
  }

  for (const o of Array.isArray(v.other_metrics) ? (v.other_metrics as Record<string, unknown>[]) : []) {
    if (o && typeof o === 'object') pushOther(String(o.label ?? o.printed_label ?? 'Indicador'), o.value, o.unit);
  }

  return {
    measured_at: typeof v.measured_at === 'string' && v.measured_at ? v.measured_at : null,
    device_manufacturer: typeof v.device_manufacturer === 'string' ? v.device_manufacturer : null,
    device_model: typeof v.device_model === 'string' ? v.device_model : null,
    metrics,
    segmental,
    other_metrics: other,
    visceral_fat_scale: v.visceral_fat_scale === null || v.visceral_fat_scale === undefined ? null : String(v.visceral_fat_scale),
    warnings,
  };
}

function validate<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = (r.error?.issues ?? []).slice(0, 6).map((i) => `campo ${i.path.join('.') || 'raiz'}: ${i.message}`);
    const more = (r.error?.issues.length ?? 0) > 6 ? ` (e mais ${(r.error?.issues.length ?? 0) - 6})` : '';
    throw new ExternalParseError(`A resposta não está no formato esperado${issues.length ? ` — ${issues.join('; ')}${more}` : ''}. Peça à IA para seguir exatamente o modelo.`);
  }
  return r.data as T;
}

export function parseExternalMeal(text: string): MealParse {
  return validate(MealParseSchema, fillDefaults(extractJson(text), TEMPLATES.meal));
}

export function parseExternalLabel(text: string): LabelExtraction {
  return validate(LabelExtractionSchema, fillDefaults(extractJson(text), TEMPLATES.label));
}

export function parseExternalBioimpedance(text: string): BioimpedanceExtraction {
  const filled = fillDefaults(extractJson(text), TEMPLATES.bioimpedance) as Record<string, unknown>;
  return validate(BioimpedanceExtractionSchema, sanitizeBio(filled));
}

export function parseExternalDiet(text: string): DietImport {
  return validate(DietImportSchema, fillDefaults(extractJson(text), TEMPLATES.diet));
}

/** Resposta livre do chat: apenas limpeza; é salva marcada como "IA externa, não verificada". */
export function cleanChatAnswer(text: string): string {
  const t = text.trim();
  if (t.length < 2) throw new ExternalParseError('Cole a resposta da IA.');
  return t.slice(0, 8000);
}
