import { referenceFoods } from '../../data/reference';
import { compoundsToRecord, dosesFromCompoundAmount, formatCompounds, parseCompoundKey } from '../compounds';
import { buildEntry, buildSupplementEntry, compoundTotals } from '../entries';
import { parseMealLocally } from '../mealParser';
import { sumNutrients } from '../nutrients';
import { normalizeLabel } from '../labels';
import { makeFood } from './fixtures';

const opts = { date: '2026-10-20', meal: 'breakfast' as const, origin: 'search' as const };

const b12 = makeFood({
  id: 'user:b12',
  name: 'Vitamina B12',
  is_supplement: true,
  supplement_category: 'vitamin_mineral',
  serving_size: 1,
  serving_label: '1 cápsula',
  per100: { energy_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  compounds_per_serving: compoundsToRecord([{ name: 'Vitamina B12', amount: 2500, unit: 'mcg' }]),
});

describe('vitaminas e minerais (ex.: B12 2500 mcg)', () => {
  it('chave preserva nome e unidade', () => {
    expect(b12.compounds_per_serving).toEqual({ vitamina_b12_mcg: 2500 });
    expect(parseCompoundKey('vitamina_b12_mcg')).toEqual({ name: 'Vitamina B12', unit: 'mcg' });
    expect(parseCompoundKey('vitamina_d3_ui')).toEqual({ name: 'Vitamina D3', unit: 'UI' });
    expect(formatCompounds({ vitamina_b12_mcg: 2500 })).toBe('Vitamina B12 2.500 mcg');
  });

  it('creatina é sempre normalizada para gramas', () => {
    expect(compoundsToRecord([{ name: 'Creatina monohidratada', amount: 3000, unit: 'mg' }])).toEqual({ creatine_g: 3 });
  });

  it('registrar a B12 não altera calorias nem macros do dia', () => {
    const almoco = buildEntry(makeFood({ per100: { energy_kcal: 159, protein_g: 32, carbs_g: 0, fat_g: 2.5 } }), 100, opts);
    const vit = buildSupplementEntry(b12, 1, opts);
    const semVit = sumNutrients([almoco.nutrients]);
    const comVit = sumNutrients([almoco.nutrients, vit.nutrients]);
    expect(comVit.values).toEqual(semVit.values);
    expect(comVit.missing.energy_kcal).toBe(0); // não deixa o total "parcial"
    expect(compoundTotals([almoco, vit])).toEqual({ vitamina_b12_mcg: 2500 });
  });

  it('rótulo de cápsula sem macros normaliza sem erros', () => {
    const r = normalizeLabel({
      product_name: 'Vitamina B12', brand: null, flavor: null, variant: null, barcode: null,
      serving_size: 1, serving_unit: 'g', household_measure: '1 cápsula', basis: 'as_sold',
      per_serving: null, per_100: { energy_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, ingredients_text: null,
      is_supplement: true, supplement_category: 'vitamin_mineral', compounds_per_serving: { vitamina_b12_mcg: 2500 },
    });
    expect(r.errors).toEqual([]);
    expect(r.food.compounds_per_serving).toEqual({ vitamina_b12_mcg: 2500 });
  });

  it('converte quantidade do composto em doses', () => {
    expect(dosesFromCompoundAmount({ vitamina_b12_mcg: 2500 }, 5000, 'mcg')).toBe(2);
    expect(dosesFromCompoundAmount({ vitamina_b12_mcg: 2500 }, 5, 'mg')).toBeNull();
  });

  it('frase "Vit B12 2500mcg" encontra o suplemento cadastrado e vira 1 dose', () => {
    const r = parseMealLocally('Vit B12 2500mcg', [b12, ...referenceFoods()]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].food?.id).toBe('user:b12');
    expect(r.items[0].amount).toBe(1);
    expect(r.items[0].nutrients?.protein_g).toBe(0);
  });

  it('"2 cápsulas de vitamina b12" = 2 doses', () => {
    const r = parseMealLocally('2 cápsulas de vitamina b12', [b12, ...referenceFoods()]);
    expect(r.items[0].amount).toBe(2);
  });

  it('suplemento não cadastrado gera orientação, sem inventar valores', () => {
    const r = parseMealLocally('Vit B12 2500mcg', referenceFoods());
    expect(r.items[0].nutrients).toBeNull();
    expect(r.questions.join(' ')).toMatch(/suplemento|não é um suplemento/);
  });
});
