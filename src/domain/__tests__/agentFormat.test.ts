import { referenceFoods } from '../../data/reference';
import { AGENT_FORMAT, AGENT_INSTRUCTIONS, agentLabelToLabelData, parseAgentPaste, reviewAgentMeal, reviewToSavedMeal } from '../agentFormat';
import { normalizeLabel } from '../labels';
import { PasteParseError } from '../pastedJson';
import { hasEstimates, savedMealFromEntries, savedMealToEntries, savedMealTotals } from '../savedMeals';
import type { DiaryEntry, Food } from '../types';
import { makeFood } from './fixtures';

const foods = referenceFoods();

const mealJson = {
  formato: AGENT_FORMAT,
  tipo: 'refeicao',
  nome: 'Café da manhã proteico',
  refeicao: 'cafe_da_manha',
  itens: [
    { alimento: 'pão francês', quantidade_g: 50, medida: '1 unidade', nutrientes_estimados: { kcal: 999, proteina_g: 99 } },
    { alimento: 'ovo cozido', quantidade_g: 100, medida: '2 unidades' },
    { alimento: 'pasta de amendoim integral', quantidade_g: 15, nutrientes_estimados: { kcal: 90, proteina_g: 4, carboidrato_g: 3, gordura_g: 7.5, fibra_g: 1 } },
  ],
  observacoes: null,
};

describe('formato do agente externo — refeição', () => {
  it('lê bloco ```json com texto em volta', () => {
    const docs = parseAgentPaste(`Aqui está:\n\`\`\`json\n${JSON.stringify(mealJson)}\n\`\`\`\nBom apetite!`);
    expect(docs).toHaveLength(1);
    expect(docs[0].kind).toBe('meal');
  });

  it('usa a base do app quando reconhece o alimento e ignora a estimativa do agente', () => {
    const doc = parseAgentPaste(JSON.stringify(mealJson))[0];
    if (doc.kind !== 'meal') throw new Error('esperava refeição');
    const r = reviewAgentMeal(doc.meal, foods);
    expect(r.meal).toBe('breakfast');
    const [pao, ovo, pasta] = r.items;
    expect(pao.choice?.kind).toBe('food');
    expect(pao.choice?.kind === 'food' && pao.choice.food.name).toBe('Pão, trigo, francês');
    expect(ovo.choice?.kind === 'food' && ovo.choice.food.source).toBe('taco');
    // não está na TACO: estimativa do agente, marcada
    expect(pasta.choice?.kind).toBe('estimate');
    expect(pasta.warnings.join(' ')).toMatch(/estimativa do agente/);
    const saved = reviewToSavedMeal(r);
    const totals = savedMealTotals(saved);
    expect(totals.values.energy_kcal).toBeCloseTo(150 + 146 + 90, 0); // 999 do agente não é usado
    expect(saved.items[2]).toMatchObject({ source: 'ai_estimate', verification: 'estimated', food_id: null });
    expect(hasEstimates(saved)).toBe(true);
  });

  it('prefere alimento cadastrado pelo usuário (rótulo) quando o nome bate', () => {
    const whey = makeFood({ id: 'user:whey', name: 'Whey Protein Concentrado', brand: 'Marca X', source: 'label', is_supplement: true, serving_size: 30, per100: { energy_kcal: 400, protein_g: 70, carbs_g: 10, fat_g: 6.7 } });
    const r = reviewAgentMeal({ ...mealJson, itens: [{ alimento: 'whey protein concentrado', quantidade_g: 30 }] } as never, [whey, ...foods]);
    expect(r.items[0].choice?.kind === 'food' && r.items[0].choice.food.id).toBe('user:whey');
    const entries = savedMealToEntries(reviewToSavedMeal(r), { date: '2026-10-24', meal: 'breakfast', groupId: 'g1' });
    expect(entries[0].nutrients.protein_g).toBeCloseTo(21);
    expect(entries[0].servings).toBe(1);
  });

  it('quantidade pela medida caseira quando faltam os gramas', () => {
    const r = reviewAgentMeal({ ...mealJson, itens: [{ alimento: 'pão francês', quantidade: 2, unidade: 'unidade' }] } as never, foods);
    expect(r.items[0].amount).toBe(100);
    expect(r.items[0].warnings.join(' ')).toMatch(/medida caseira/);
  });

  it('item desconhecido sem estimativa não entra na refeição salva', () => {
    const r = reviewAgentMeal({ ...mealJson, itens: [{ alimento: 'xpto quântico', quantidade_g: 10 }, { alimento: 'banana', quantidade_g: 60 }] } as never, foods);
    expect(r.items[0].choice).toBeNull();
    expect(reviewToSavedMeal(r).items).toHaveLength(1);
  });

  it('aceita números como texto com vírgula', () => {
    const doc = parseAgentPaste(JSON.stringify({ ...mealJson, itens: [{ alimento: 'banana', quantidade_g: '60,5 g' }] }))[0];
    expect(doc.kind === 'meal' && doc.meal.itens[0].quantidade_g).toBe(60.5);
  });
});

describe('formato do agente externo — rótulo', () => {
  const label = {
    formato: AGENT_FORMAT, tipo: 'rotulo', produto: 'Vitamina B12', marca: 'Marca', porcao: 1, unidade: 'g',
    medida_caseira: '1 cápsula', base: 'vendido', por_porcao: { kcal: 0, proteina_g: 0, carboidrato_g: 0, gordura_g: 0 },
    suplemento: true, categoria_suplemento: 'vitamina_mineral', compostos_por_porcao: [{ nome: 'Vitamina B12', quantidade: 2500, unidade: 'mcg' }],
  };

  it('vira LabelData e passa pela normalização de rótulo', () => {
    const doc = parseAgentPaste(JSON.stringify(label))[0];
    if (doc.kind !== 'label') throw new Error('esperava rótulo');
    const data = agentLabelToLabelData(doc.label);
    expect(data.supplement_category).toBe('vitamin_mineral');
    expect(data.compounds_per_serving).toEqual({ vitamina_b12_mcg: 2500 });
    const n = normalizeLabel(data);
    expect(n.errors).toEqual([]);
    expect(n.food.verification).toBe('reported');
  });

  it('whey com valores por porção normaliza por 100 g', () => {
    const doc = parseAgentPaste(JSON.stringify({ ...label, produto: 'Whey', porcao: 30, medida_caseira: '1 dosador', categoria_suplemento: 'whey_concentrado', compostos_por_porcao: [], por_porcao: { kcal: 120, proteina_g: 21, carboidrato_g: 3, gordura_g: 2 } }))[0];
    if (doc.kind !== 'label') throw new Error('esperava rótulo');
    const n = normalizeLabel(agentLabelToLabelData(doc.label));
    expect(n.food.per100.protein_g).toBeCloseTo(70);
    expect(n.food.serving_size).toBe(30);
  });
});

describe('vários documentos e erros', () => {
  it('lista com refeição e rótulo', () => {
    const docs = parseAgentPaste(JSON.stringify([mealJson, { tipo: 'rotulo', produto: 'Iogurte', porcao: 170, unidade: 'g', por_porcao: { kcal: 100 } }]));
    expect(docs.map((d) => d.kind)).toEqual(['meal', 'label']);
  });

  it('vários blocos ```json', () => {
    const t = '```json\n' + JSON.stringify(mealJson) + '\n```\ntexto\n```json\n' + JSON.stringify({ ...mealJson, nome: 'Almoço' }) + '\n```';
    expect(parseAgentPaste(t)).toHaveLength(2);
  });

  it('documento sem tipo ou inválido gera erro explicativo, sem travar os demais', () => {
    const docs = parseAgentPaste(JSON.stringify([{ nome: 'x' }, { tipo: 'refeicao', nome: 'Sem itens', itens: [] }, mealJson]));
    expect(docs[0]).toMatchObject({ kind: 'error' });
    expect(docs[1].kind === 'error' && docs[1].message).toMatch(/itens/);
    expect(docs[2].kind).toBe('meal');
  });

  it('texto sem JSON', () => {
    expect(() => parseAgentPaste('olá')).toThrow(PasteParseError);
  });

  it('as instruções para o agente trazem os dois modelos', () => {
    expect(AGENT_INSTRUCTIONS).toContain('"tipo": "refeicao"');
    expect(AGENT_INSTRUCTIONS).toContain('"tipo": "rotulo"');
    // os exemplos das instruções são lidos pelo próprio app
    const blocks = [...AGENT_INSTRUCTIONS.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[0]).join('\n');
    expect(parseAgentPaste(blocks).map((d) => d.kind)).toEqual(['meal', 'label']);
  });
});

describe('salvar refeição do diário', () => {
  it('mantém valores e doses de suplemento', () => {
    const food: Food = makeFood({ id: 'taco:x', per100: { protein_g: 10 } });
    const entry = { food_id: food.id, food_name: 'Arroz', amount: 100, unit: 'g', per100_snapshot: { protein_g: 2.5 }, source: 'taco', verification: 'reported', servings: null, compounds: null, meal: 'lunch', origin: 'search' } as unknown as DiaryEntry;
    const saved = savedMealFromEntries('Almoço padrão', [entry]);
    expect(saved.meal).toBe('lunch');
    expect(savedMealTotals(saved).values.protein_g).toBeCloseTo(2.5);
  });
});
