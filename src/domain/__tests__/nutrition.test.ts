import { buildEntry, buildSupplementEntry, compoundTotals, totalsFor, validateSupplement } from '../entries';
import { scalePer100, sumNutrients } from '../nutrients';
import { calculateRecipe, shoppingList } from '../recipes';
import { normalizeLabel, type LabelData } from '../labels';
import { makeFood } from './fixtures';

const opts = { date: '2026-10-19', meal: 'breakfast' as const, origin: 'search' as const };

describe('Cenário 2: macros proporcionais à quantidade', () => {
  it('escala por 100 g', () => {
    const frango = makeFood({ per100: { energy_kcal: 159, protein_g: 32, carbs_g: 0, fat_g: 2.5 } });
    const e = buildEntry(frango, 150, opts);
    expect(e.nutrients.energy_kcal).toBeCloseTo(238.5);
    expect(e.nutrients.protein_g).toBeCloseTo(48);
    expect(e.nutrients.fat_g).toBeCloseTo(3.75);
    expect(e.per100_snapshot).toEqual(frango.per100);
  });

  it('valor não informado permanece não informado (não zero)', () => {
    const f = makeFood({ per100: { energy_kcal: 100, fiber_g: null } });
    const scaled = scalePer100(f.per100, 50);
    expect(scaled.fiber_g).toBeNull();
    const totals = sumNutrients([scaled, { energy_kcal: 10, fiber_g: 2 }]);
    expect(totals.values.fiber_g).toBe(2);
    expect(totals.missing.fiber_g).toBe(1);
  });

  it('rejeita quantidade inválida', () => {
    expect(() => buildEntry(makeFood(), 0, opts)).toThrow();
  });
});

const whey = makeFood({
  id: 'user:whey',
  name: 'Whey Protein Concentrado',
  brand: 'Marca X',
  flavor: 'Baunilha',
  is_supplement: true,
  supplement_category: 'whey_concentrate',
  serving_size: 30,
  per100: { energy_kcal: 400, protein_g: 70, carbs_g: 10, fat_g: 6.67 }, // 21 g de proteína por dose de 30 g
});

const creatina = makeFood({
  id: 'user:creatina',
  name: 'Creatina monohidratada',
  is_supplement: true,
  supplement_category: 'creatine',
  serving_size: 3,
  per100: { energy_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  compounds_per_serving: { creatine_g: 3 },
});

describe('Cenário 5: dose de whey soma a proteína real do produto', () => {
  it('1 dose = proteína do rótulo escolhido', () => {
    const e = buildSupplementEntry(whey, 1, opts);
    expect(e.nutrients.protein_g).toBeCloseTo(21);
    expect(e.origin).toBe('supplement');
    expect(totalsFor([e]).values.protein_g).toBeCloseTo(21);
  });
  it('1,5 dose escala corretamente', () => {
    expect(buildSupplementEntry(whey, 1.5, opts).nutrients.protein_g).toBeCloseTo(31.5);
  });
  it('sabores diferentes têm valores próprios', () => {
    const chocolate = { ...whey, id: 'user:whey-choc', flavor: 'Chocolate', per100: { ...whey.per100, protein_g: 66.67 } };
    expect(buildSupplementEntry(chocolate, 1, opts).nutrients.protein_g).toBeCloseTo(20);
  });
});

describe('Cenário 6: creatina não soma proteína', () => {
  it('registra creatina como composto, sem proteína', () => {
    const e = buildSupplementEntry(creatina, 1, opts);
    expect(e.nutrients.protein_g).toBe(0);
    expect(e.compounds).toEqual({ creatine_g: 3 });
    expect(compoundTotals([e])).toEqual({ creatine_g: 3 });
  });
  it('mesmo se cadastrada com creatina no campo de proteína, não contabiliza', () => {
    const errada = { ...creatina, per100: { ...creatina.per100, protein_g: 100 } };
    expect(validateSupplement(errada).join(' ')).toMatch(/não é contabilizada como proteína/);
    const e = buildSupplementEntry(errada, 2, opts);
    expect(e.nutrients.protein_g).toBe(0);
    expect(e.compounds).toEqual({ creatine_g: 6 });
  });
});

describe('receitas', () => {
  it('calcula receita inteira, por 100 g e por porção, com rendimento', () => {
    const r = calculateRecipe({
      servings: 4,
      final_weight_g: 500,
      ingredients: [
        { food_id: 'a', food_name: 'Frango cozido', amount: 400, unit: 'g', per100: { energy_kcal: 163, protein_g: 31.5, carbs_g: 0, fat_g: 3.2 } },
        { food_id: 'b', food_name: 'Ricota', amount: 200, unit: 'g', per100: { energy_kcal: 140, protein_g: 12.6, carbs_g: 3.8, fat_g: 8.1 } },
      ],
    });
    expect(r.rawWeight).toBe(600);
    expect(r.yieldFactor).toBeCloseTo(500 / 600);
    expect(r.total.values.protein_g).toBeCloseTo(126 + 25.2);
    expect(r.per100.protein_g).toBeCloseTo((151.2 * 100) / 500);
    expect(r.perServing.protein_g).toBeCloseTo(151.2 / 4);
    expect(r.servingWeight).toBe(125);
  });

  it('lista de compras soma ingredientes repetidos', () => {
    const list = shoppingList([
      { ingredients: [{ food_id: 'a', food_name: 'Arroz', amount: 100, unit: 'g', per100: {} }] },
      { ingredients: [{ food_id: 'a', food_name: 'Arroz', amount: 150, unit: 'g', per100: {} }] },
    ]);
    expect(list).toEqual([{ name: 'Arroz', amount: 250, unit: 'g' }]);
  });
});

describe('Cenário 4: rótulo cria alimento com porção e unidades corretas', () => {
  const label: LabelData = {
    product_name: 'Iogurte proteico',
    brand: 'Marca Y',
    flavor: 'Morango',
    variant: null,
    barcode: '7890000000000',
    serving_size: 170,
    serving_unit: 'g',
    household_measure: '1 pote',
    basis: 'as_sold',
    per_serving: { energy_kcal: 119, protein_g: 15, carbs_g: 9.4, fat_g: 2.4, sodium_mg: 85, sugars_g: 6.8, fiber_g: null },
    per_100: null,
    ingredients_text: 'Leite desnatado, proteína do leite...',
  };

  it('normaliza por 100 g e mantém porção e medida caseira', () => {
    const r = normalizeLabel(label);
    expect(r.errors).toEqual([]);
    expect(r.food.base_unit).toBe('g');
    expect(r.food.serving_size).toBe(170);
    expect(r.food.household_measures).toEqual([{ label: '1 pote', amount: 170, estimated: false }]);
    expect(r.food.per100.protein_g).toBeCloseTo(8.82, 1);
    expect(r.food.per100.energy_kcal).toBeCloseTo(70, 0);
    expect(r.food.per100.fiber_g).toBeNull();
    expect(r.perServing.protein_g).toBe(15);
    expect(r.food.verification).toBe('reported');
  });

  it('bebidas em ml mantêm a unidade', () => {
    const r = normalizeLabel({ ...label, serving_unit: 'ml', serving_size: 250, household_measure: '1 garrafa' });
    expect(r.food.base_unit).toBe('ml');
    expect(r.food.per100.protein_g).toBeCloseTo(6);
  });

  it('exige porção para converter valores por porção', () => {
    expect(normalizeLabel({ ...label, serving_size: null }).errors.length).toBeGreaterThan(0);
  });

  it('avisa quando valores são do produto preparado', () => {
    expect(normalizeLabel({ ...label, basis: 'prepared' }).warnings.join(' ')).toMatch(/preparado/);
  });

  it('detecta leitura incoerente (macros > 100 g)', () => {
    const r = normalizeLabel({ ...label, per_serving: null, per_100: { protein_g: 80, carbs_g: 50, fat_g: 10, energy_kcal: 600 } });
    expect(r.errors.join(' ')).toMatch(/passa de 100 g/);
  });

  it('confere por 100 g contra por porção', () => {
    const r = normalizeLabel({ ...label, per_100: { protein_g: 20, energy_kcal: 70, carbs_g: 5.5, fat_g: 1.4 } });
    expect(r.warnings.join(' ')).toMatch(/não batem/);
  });
});
