import { referenceFoods } from '../../data/reference';
import { planNutrition } from '../../domain/dietPlan';
import { normalizeLabel } from '../../domain/labels';
import {
  buildExternalPrompt,
  cleanChatAnswer,
  EXTERNAL_PROVIDERS,
  ExternalParseError,
  extractJson,
  parseExternalBioimpedance,
  parseExternalDiet,
  parseExternalLabel,
  parseExternalMeal,
} from '../externalAi';
import { bioExtractionToDraft, dietImportToPlan, labelExtractionToLabelData, mealParseToParsedMeal } from '../imports';

const foods = referenceFoods();

describe('IA externa (copiar e colar)', () => {
  it('prompt estruturado pede JSON e proíbe nutrientes inventados', () => {
    const p = buildExternalPrompt('meal', { text: 'pão com dois ovos' });
    expect(p).toMatch(/```json/);
    expect(p).toMatch(/NÃO informe calorias/);
    expect(p).toContain('pão com dois ovos');
  });

  it('prompt do chat leva os dados do usuário e as regras de segurança', () => {
    const p = buildExternalPrompt('chat', { question: 'Quanto de proteína falta?', context: { metas: { protein_g: 140 } } });
    expect(p).toContain('<dados_do_usuario>');
    expect(p).toMatch(/Não faça diagnósticos/);
    expect(p).toContain('Quanto de proteína falta?');
  });

  it('pré-preenche a URL só quando a pergunta é curta', () => {
    const claude = EXTERNAL_PROVIDERS.find((x) => x.id === 'claude')!;
    expect(claude.url('oi')).toBe('https://claude.ai/new?q=oi');
    expect(claude.url('x'.repeat(5000))).toBe('https://claude.ai/new');
  });

  it('extrai JSON de bloco cercado, texto solto e com vírgula final', () => {
    expect(extractJson('Claro!\n```json\n{"a": 1,}\n```\nAbraço')).toEqual({ a: 1 });
    expect(extractJson('Resposta: {"a": [1, 2]} fim')).toEqual({ a: [1, 2] });
    expect(() => extractJson('sem json aqui')).toThrow(ExternalParseError);
  });

  it('refeição: campos ausentes são completados e nutrientes vêm da base', () => {
    const r = parseExternalMeal('```json\n{"items":[{"text":"dois ovos","food_query":"ovo cozido","quantity":2,"unit":"unidade","energy_kcal":9999}]}\n```');
    expect(r.questions).toEqual([]);
    const parsed = mealParseToParsedMeal(r, foods);
    expect(parsed.items[0].food?.source).toBe('taco');
    expect(parsed.items[0].nutrients?.energy_kcal).not.toBe(9999);
  });

  it('rótulo de vitamina vira alimento com composto em mcg', () => {
    const r = parseExternalLabel(JSON.stringify({
      product_name: 'Vitamina B12', serving_size: 1, serving_unit: 'g', household_measure: '1 cápsula',
      per_serving: null, per_100: null, is_supplement: true, supplement_category: 'vitamin_mineral',
      compounds_per_serving: [{ name: 'Vitamina B12', amount: 2500, unit: 'mcg' }],
    }));
    expect(r.confidence).toBe('medium');
    const label = labelExtractionToLabelData(r);
    expect(label.compounds_per_serving).toEqual({ vitamina_b12_mcg: 2500 });
    expect(normalizeLabel(label).food.verification).toBe('reported');
  });

  it('bioimpedância: indicador desconhecido vai para "outros", nada é inventado', () => {
    const ex = parseExternalBioimpedance(JSON.stringify({
      measured_at: '2026-10-01T08:00:00',
      metrics: [{ key: 'body_fat_pct', value: 31.2, unit: '%' }, { key: 'inbody_score', value: 72, unit: 'pontos', printed_label: 'Pontuação' }],
    }));
    expect(ex.metrics).toHaveLength(1);
    expect(ex.other_metrics).toEqual([{ label: 'Pontuação', value: 72, unit: 'pontos' }]);
    const { draft } = bioExtractionToDraft(ex, null);
    expect(draft.metrics.fat_mass_kg).toBeUndefined();
  });

  it('dieta com alternativas não soma as opções', () => {
    const di = parseExternalDiet(JSON.stringify({
      name: 'Plano', meals: [{ name: 'Café', meal: 'breakfast', time: '07:00', options: [
        { label: 'Opção 1', items: [{ food_name: 'pão francês', amount: 1, unit: 'unidade' }] },
        { label: 'Opção 2', items: [{ food_name: 'banana', amount: 2, unit: 'unidade' }] },
      ] }],
    }));
    const n = planNutrition(dietImportToPlan(di, foods, { professional: false, sourceFilePath: null }));
    expect(n.total.values.energy_kcal).toBeCloseTo(150);
  });

  it('formato errado gera mensagem clara', () => {
    expect(() => parseExternalDiet('{"meals": "não é lista"}')).not.toThrow();
    expect(() => parseExternalMeal('{"items":[{"quantity":"dois"}]}')).toThrow(/formato esperado/);
    expect(() => cleanChatAnswer(' ')).toThrow();
  });
});

describe('padrões da resposta colada', () => {
  it('não preenche nomes de itens com valores inventados', () => {
    expect(() => parseExternalLabel('{"product_name":"X","compounds_per_serving":[{"amount":1,"unit":"mg"}]}')).toThrow(/compounds_per_serving/);
    const d = parseExternalDiet('{"meals":[{"name":"Almoço","options":[{"items":[{"food_name":"arroz"}]}]}]}');
    expect(d.name).toBe('Plano importado');
    expect(d.meals[0].options[0].label).toBe('Opção');
    expect(d.meals[0].options[0].items[0]).toEqual({ food_name: 'arroz', amount: null, unit: null, note: null });
  });
});
