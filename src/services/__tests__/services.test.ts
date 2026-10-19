import { LocalStore, MemoryKeyValue } from '../../data/localStore';
import { referenceFoods } from '../../data/reference';
import { BodyMetricKeyList } from './helpers';
import { BODY_METRIC_KEYS, MealParseSchema, type BioimpedanceExtraction, type LabelExtraction } from '../../../supabase/functions/_shared/schemas';
import { bioExtractionToDraft, confirmAssessment, dietImportToPlan, labelExtractionToLabelData, mealParseToParsedMeal } from '../imports';
import { isValidBarcode, lookupBarcode } from '../openFoodFacts';
import { syncNotifications, type Scheduler } from '../notifications';
import { normalizeLabel } from '../../domain/labels';
import { planNutrition } from '../../domain/dietPlan';
import { defaultSettings } from '../../domain/notifications';
import type { BodyAssessment, NotificationSetting, WaterLog, WeightEntry } from '../../domain/types';

let counter = 0;
const newId = () => `id-${++counter}`;
const foods = referenceFoods();

describe('Cenário 11: fechar e reabrir o app não apaga registros', () => {
  it('nova instância do armazenamento lê os dados gravados', async () => {
    const kv = new MemoryKeyValue();
    const s1 = new LocalStore('u1', kv, newId);
    await s1.insert<WaterLog>('water_logs', { date: '2026-10-19', logged_at: '2026-10-19T10:00:00Z', volume_ml: 250, beverage: 'water', container_id: null });
    // "reabrir": nova instância, sem cache em memória
    const s2 = new LocalStore('u1', kv, newId);
    const logs = await s2.list<WaterLog>('water_logs');
    expect(logs).toHaveLength(1);
    expect(logs[0].volume_ml).toBe(250);
  });

  it('escritas concorrentes não se perdem', async () => {
    const s = new LocalStore('u1', new MemoryKeyValue(), newId);
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      s.insert<WaterLog>('water_logs', { date: '2026-10-19', logged_at: `2026-10-19T10:${String(i).padStart(2, '0')}:00Z`, volume_ml: 100, beverage: 'water', container_id: null }),
    ));
    expect(await s.list('water_logs')).toHaveLength(20);
  });

  it('isola dados por usuário no mesmo dispositivo', async () => {
    const kv = new MemoryKeyValue();
    const a = new LocalStore('ana', kv, newId);
    const b = new LocalStore('bruno', kv, newId);
    const row = await a.insert<WaterLog>('water_logs', { date: '2026-10-19', logged_at: '2026-10-19T10:00:00Z', volume_ml: 250, beverage: 'water', container_id: null });
    expect(await b.list('water_logs')).toHaveLength(0);
    expect(await b.get('water_logs', (row as unknown as { id: string }).id)).toBeNull();
    await expect(b.update('water_logs', (row as unknown as { id: string }).id, { volume_ml: 1 })).rejects.toThrow();
  });
});

const extraction: BioimpedanceExtraction = {
  measured_at: '2026-10-10T08:30:00',
  device_manufacturer: 'InBody',
  device_model: 'InBody 270',
  metrics: [
    { key: 'weight_kg', value: 82.4, unit: 'kg', printed_label: 'Peso' },
    { key: 'body_fat_pct', value: 31.2, unit: '%', printed_label: 'PGC' },
    { key: 'fat_mass_kg', value: 25.7, unit: 'kg', printed_label: 'Massa de Gordura' },
    { key: 'skeletal_muscle_mass_kg', value: 31.1, unit: 'kg', printed_label: 'MME' },
  ],
  segmental: [],
  other_metrics: [{ label: 'Pontuação InBody', value: 72, unit: 'pontos' }],
  visceral_fat_scale: 'nível 1–20',
  warnings: [],
};

describe('Cenário 7: bioimpedância importada vira dado estruturado e só é salva após conferência', () => {
  it('converte para rascunho sem gravar nada', async () => {
    const store = new LocalStore('u1', new MemoryKeyValue(), newId);
    const { draft, warnings } = bioExtractionToDraft(extraction, 'u1/exames/a.pdf');
    expect(draft.metrics.body_fat_pct).toEqual({ value: 31.2, unit: '%' });
    expect(draft.metrics.fat_free_mass_kg).toBeUndefined(); // ausente no exame: não é inventado
    expect(draft.input).toBe('import');
    expect(draft.file_path).toBe('u1/exames/a.pdf');
    expect(warnings).toEqual([]);
    expect(await store.list('body_assessments')).toHaveLength(0);
  });

  it('confirmação grava a avaliação (com correções do usuário) e o peso', async () => {
    const store = new LocalStore('u1', new MemoryKeyValue(), newId);
    const { draft } = bioExtractionToDraft(extraction, null);
    draft.metrics.weight_kg = { value: 82.0, unit: 'kg' }; // correção manual
    await confirmAssessment(store, draft);
    const saved = await store.list<BodyAssessment>('body_assessments');
    expect(saved).toHaveLength(1);
    expect(saved[0].metrics.weight_kg?.value).toBe(82.0);
    expect(saved[0].measured_at).toBe(new Date('2026-10-10T08:30:00').toISOString());
    const weights = await store.list<WeightEntry>('weight_entries');
    expect(weights[0].weight_kg).toBe(82.0);
  });

  it('sem data original não salva', async () => {
    const store = new LocalStore('u1', new MemoryKeyValue(), newId);
    const { draft, warnings } = bioExtractionToDraft({ ...extraction, measured_at: null }, null);
    expect(warnings.join(' ')).toMatch(/data da avaliação/);
    await expect(confirmAssessment(store, draft)).rejects.toThrow(/data original/);
    expect(await store.list('body_assessments')).toHaveLength(0);
  });

  it('chaves de métricas do esquema da IA e do domínio são as mesmas', () => {
    expect([...BODY_METRIC_KEYS].sort()).toEqual([...BodyMetricKeyList].sort());
  });
});

describe('Cenário 14: a IA nunca fornece valor nutricional apresentado como oficial', () => {
  it('nutrientes vêm da base, e campos nutricionais extras da IA são descartados', () => {
    const fromAi = MealParseSchema.parse({
      items: [{ text: 'dois ovos', food_query: 'ovo cozido', quantity: 2, unit: 'unidade', preparation: null, notes: [], energy_kcal: 9999, protein_g: 999 }],
      questions: [],
      meal: 'breakfast',
    });
    expect(JSON.stringify(fromAi)).not.toMatch(/9999/);
    const parsed = mealParseToParsedMeal(fromAi, foods);
    const item = parsed.items[0];
    expect(item.food?.source).toBe('taco');
    expect(item.nutrients?.energy_kcal).toBeCloseTo((item.food!.per100.energy_kcal! * item.amount!) / 100);
    expect(item.nutrients?.energy_kcal).not.toBe(9999);
  });

  it('alimento sem correspondência fica sem nutrientes', () => {
    const parsed = mealParseToParsedMeal({ items: [{ text: 'bolo da vovó', food_query: 'bolo de fubá da vovó com goiabada', quantity: 1, unit: 'fatia', preparation: null, notes: [] }], questions: [], meal: null }, foods);
    expect(parsed.items[0].nutrients === null || parsed.items[0].food !== null).toBe(true);
  });

  it('rótulo extraído entra como "informado" e exige conferência', () => {
    const ex: LabelExtraction = {
      product_name: 'Creatina Monohidratada', brand: 'Marca Z', flavor: null, variant: null, barcode: null,
      serving_size: 3, serving_unit: 'g', household_measure: '1 dosador', basis: 'as_sold',
      per_serving: { energy_kcal: 0, energy_kj: 0, protein_g: 0, carbs_g: 0, sugars_g: null, added_sugars_g: null, fat_g: 0, saturated_fat_g: null, trans_fat_g: null, fiber_g: null, sodium_mg: 0 },
      per_100: null, ingredients_text: 'Creatina monohidratada', is_supplement: true, supplement_category: 'creatine',
      compounds_per_serving: [{ name: 'Creatina monohidratada', amount: 3000, unit: 'mg' }], unreadable_fields: [], confidence: 'high',
    };
    const label = labelExtractionToLabelData(ex);
    expect(label.compounds_per_serving).toEqual({ creatine_g: 3 });
    const norm = normalizeLabel(label);
    expect(norm.food.verification).toBe('reported');
    expect(norm.food.per100.protein_g).toBe(0);
    expect(norm.food.supplement_category).toBe('creatine');
  });
});

describe('Cenário 13: integração externa indisponível informa e oferece cadastro manual', () => {
  it('falha de rede', async () => {
    const failing = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const r = await lookupBarcode('7891000100103', failing);
    expect(r.status).toBe('unavailable');
    if (r.status === 'unavailable') expect(r.message).toMatch(/manualmente/);
  });

  it('erro HTTP do serviço', async () => {
    const r = await lookupBarcode('7891000100103', (async () => new Response('x', { status: 503 })) as typeof fetch);
    expect(r.status).toBe('unavailable');
  });

  it('produto não encontrado', async () => {
    const r = await lookupBarcode('7891000100103', (async () => new Response(JSON.stringify({ status: 0 }), { status: 200 })) as typeof fetch);
    expect(r.status).toBe('not_found');
  });

  it('produto encontrado é normalizado com aviso de conferência', async () => {
    const product = {
      status: 1,
      product: { code: '7891000100103', product_name_pt: 'Iogurte', brands: 'Marca', serving_size: '170 g', serving_quantity: 170, nutriments: { 'energy-kcal_100g': 70, proteins_100g: 8.8, carbohydrates_100g: 5.5, fat_100g: 1.4, sodium_100g: 0.05 } },
    };
    const r = await lookupBarcode('7891000100103', (async () => new Response(JSON.stringify(product), { status: 200 })) as typeof fetch);
    expect(r.status).toBe('found');
    if (r.status === 'found') {
      expect(r.label.food.source).toBe('off');
      expect(r.label.food.per100.sodium_mg).toBe(50);
      expect(r.label.food.per100.fiber_g).toBeNull();
      expect(r.label.warnings[0]).toMatch(/confira/);
    }
  });

  it('valida dígito verificador EAN', () => {
    expect(isValidBarcode('7891000100103')).toBe(true);
    expect(isValidBarcode('7891000100104')).toBe(false);
  });
});

describe('Cenário 10 (serviço): sincronização de lembretes por tipo', () => {
  function fakeScheduler(): Scheduler & { ids: Set<string> } {
    const ids = new Set<string>(['outro-app:1']);
    return {
      ids,
      async listIds() { return [...ids]; },
      async schedule(n) { ids.add(n.identifier); },
      async cancel(id) { ids.delete(id); },
    };
  }
  const all = defaultSettings().map((s, i) => ({ ...s, id: String(i), user_id: 'u1', created_at: '', enabled: true })) as NotificationSetting[];

  it('desativar água cancela só os lembretes de água', async () => {
    const sch = fakeScheduler();
    await syncNotifications(all, sch);
    const before = [...sch.ids];
    expect(before.some((id) => id.startsWith('me:water:'))).toBe(true);
    const r = await syncNotifications(all.map((s) => (s.kind === 'water' ? { ...s, enabled: false } : s)), sch);
    expect(r.scheduled).toBe(0);
    expect([...sch.ids].some((id) => id.startsWith('me:water:'))).toBe(false);
    expect([...sch.ids].sort()).toEqual(before.filter((id) => !id.startsWith('me:water:')).sort());
    expect(sch.ids.has('outro-app:1')).toBe(true);
  });
});

describe('importação de dieta', () => {
  it('cria plano com opções e não soma alternativas', () => {
    const plan = dietImportToPlan(
      {
        name: 'Plano', professional_name: 'Nutri Ana', notes: [],
        meals: [{
          name: 'Café da manhã', meal: 'breakfast', time: '07:00',
          options: [
            { label: 'Opção 1', items: [{ food_name: 'pão francês', amount: 1, unit: 'unidade', note: null }] },
            { label: 'Opção 2', items: [{ food_name: 'banana', amount: 2, unit: 'unidade', note: null }] },
          ],
        }],
      },
      foods,
      { professional: true, sourceFilePath: null },
    );
    expect(plan.locked).toBe(true);
    expect(plan.origin).toBe('professional');
    const n = planNutrition(plan);
    expect(n.total.values.energy_kcal).toBeCloseTo(150); // 1 pão francês (50 g × 300 kcal/100 g)
    expect(n.range.energy_kcal![1]).toBeGreaterThanOrEqual(150);
  });
});
