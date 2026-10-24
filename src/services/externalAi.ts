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
    segmental: [], other_metrics: [], visceral_fat_scale: null, warnings: [],
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
  bioimpedance: `Transcreva o laudo de bioimpedância que vou anexar. Somente indicadores IMPRESSOS, com valor e unidade como aparecem; não calcule nem estime ausentes; ignore faixas de referência. Chaves permitidas em "metrics.key": ${BODY_METRIC_KEYS.join(', ')}. Outros indicadores vão em "other_metrics" ({label, value, unit}). "measured_at": data da avaliação em ISO 8601 (null se não houver). Dúvidas de leitura em "warnings".`,
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

function sanitizeBio(v: Record<string, unknown>): Record<string, unknown> {
  const metrics = Array.isArray(v.metrics) ? (v.metrics as Record<string, unknown>[]) : [];
  const known = metrics.filter((m) => (BODY_METRIC_KEYS as readonly string[]).includes(String(m.key)) && typeof m.value === 'number');
  const unknown = metrics.filter((m) => !known.includes(m) && typeof m.value === 'number').map((m) => ({ label: String(m.printed_label || m.key), value: m.value, unit: String(m.unit ?? '') }));
  return { ...v, metrics: known.map((m) => ({ ...m, unit: String(m.unit ?? ''), printed_label: String(m.printed_label ?? m.key) })), other_metrics: [...((v.other_metrics as unknown[]) ?? []), ...unknown] };
}

function validate<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issue = r.error?.issues[0];
    throw new ExternalParseError(`A resposta não está no formato esperado${issue ? ` (campo ${issue.path.join('.') || 'raiz'}: ${issue.message})` : ''}. Peça à IA para seguir exatamente o modelo.`);
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
