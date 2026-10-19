import { referenceFoods } from '../../data/reference';
import { TACO_EXTRAS } from '../../data/reference/tacoExtras';
import { searchFoods, findDuplicate, normalizeText } from '../foodSearch';
import { parseMealLocally, splitItems, parseQuantity, updateParsedItem } from '../mealParser';
import { NUTRIENT_KEYS } from '../nutrients';

const foods = referenceFoods();

describe('base TACO', () => {
  it('contém os 597 alimentos da 4ª edição', () => {
    expect(foods).toHaveLength(597);
  });

  it('todos os sinônimos apontam para alimentos existentes', () => {
    const names = new Set(foods.map((f) => f.name));
    for (const name of Object.keys(TACO_EXTRAS)) expect(names.has(name)).toBe(true);
  });

  it('dados ausentes ficam como null, não zero', () => {
    const leite = foods.find((f) => f.name === 'Leite, de vaca, integral')!;
    // na TACO, a energia do leite integral está como "*" (em análise)
    expect(leite.per100.energy_kcal).toBeNull();
    const frango = foods.find((f) => f.name === 'Frango, peito, sem pele, grelhado')!;
    expect(frango.per100.protein_g).toBe(32);
    expect(frango.per100.fiber_g).toBeNull();
  });

  it('usa apenas chaves de nutrientes conhecidas e marca a fonte', () => {
    for (const f of foods) {
      for (const k of Object.keys(f.per100)) expect(NUTRIENT_KEYS).toContain(k);
      expect(f.source).toBe('taco');
    }
  });
});

describe('Método 1: pesquisa', () => {
  it.each([
    ['pão francês', 'Pão, trigo, francês'],
    ['ovo', 'Ovo, de galinha, inteiro, cozido/10minutos'],
    ['peito de frango', 'Frango, peito, sem pele, grelhado'],
    ['carne moída', 'Carne, bovina, acém, moído, cozido'],
    ['arroz branco', 'Arroz, tipo 1, cozido'],
    ['feijão', 'Feijão, carioca, cozido'],
    ['banana', 'Banana, prata, crua'],
    ['iogurte', 'Iogurte, natural'],
  ])('"%s" encontra %s em primeiro', (q, expected) => {
    expect(searchFoods(foods, q)[0]?.food.name).toBe(expected);
  });

  it('ignora acentos e plural', () => {
    expect(searchFoods(foods, 'FEIJAO')[0].food.name).toMatch(/Feijão/);
    expect(searchFoods(foods, 'ovos')[0].food.name).toMatch(/^Ovo/);
  });

  it('busca por categoria', () => {
    expect(searchFoods(foods, 'pescados').length).toBeGreaterThan(0);
  });

  it('detecta duplicidade por código de barras ou nome+marca+sabor', () => {
    const a = { ...foods[0], barcode: '789' };
    expect(findDuplicate([a], { name: 'outro', brand: null, flavor: null, variant: null, barcode: '789' })).toBe(a);
    expect(findDuplicate([a], { name: a.name, brand: null, flavor: null, variant: null, barcode: null })).toBe(a);
    expect(normalizeText('Pão Francês')).toBe('pao frances');
  });
});

describe('Cenário 3: "pão com dois ovos" gera sugestão para confirmação', () => {
  it('identifica ingredientes e quantidades', () => {
    const r = parseMealLocally('pão com dois ovos', foods);
    expect(r.items).toHaveLength(2);
    const [pao, ovos] = r.items;
    expect(pao.food?.name).toBe('Pão, trigo, francês');
    expect(pao.amount).toBe(50);
    expect(pao.amountEstimated).toBe(true);
    expect(ovos.quantity).toBe(2);
    expect(ovos.food?.name).toMatch(/^Ovo, de galinha, inteiro/);
    expect(ovos.amount).toBe(100);
    // nutrientes calculados a partir da base, não inventados
    expect(ovos.nutrients?.protein_g).toBeCloseTo((ovos.food!.per100.protein_g! * 100) / 100);
  });

  it('frase completa com modificadores e pergunta sobre gordura de preparo', () => {
    const r = parseMealLocally('Comi um pão francês com dois ovos mexidos e café sem açúcar.', foods);
    expect(r.items.map((i) => i.food?.name)).toEqual(['Pão, trigo, francês', 'Ovo, de galinha, inteiro, cru', 'Café, infusão 10%']);
    expect(r.items[2].notes).toContain('sem açúcar');
    expect(r.questions.join(' ')).toMatch(/manteiga, óleo ou azeite/);
  });

  it('quantidades explícitas em gramas', () => {
    expect(parseQuantity('150g de arroz')).toEqual({ quantity: 150, unit: 'g', rest: 'arroz' });
    expect(parseQuantity('duas colheres de sopa de arroz')).toEqual({ quantity: 2, unit: 'colher de sopa', rest: 'arroz' });
    const r = parseMealLocally('2 colheres de sopa de arroz e 1 concha de feijão', foods);
    expect(r.items[0].amount).toBe(50);
    expect(r.items[1].amount).toBe(100);
  });

  it('alimento desconhecido gera pergunta, não valor inventado', () => {
    const r = parseMealLocally('um xpto quântico', foods);
    expect(r.items[0].food).toBeNull();
    expect(r.items[0].nutrients).toBeNull();
    expect(r.questions[0]).toMatch(/Não encontramos/);
  });

  it('usuário ajusta a quantidade e o cálculo é refeito', () => {
    const r = parseMealLocally('pão', foods);
    const u = updateParsedItem(r.items[0], { amount: 75 });
    expect(u.nutrients?.energy_kcal).toBeCloseTo(300 * 0.75);
    expect(u.amountEstimated).toBe(false);
  });

  it('divide corretamente', () => {
    expect(splitItems('arroz, feijão e bife')).toEqual(['arroz', 'feijao', 'bife']);
  });
});
