import { amountToPortions, foodToSavedItem, formatPortions, portionsToAmount, removeSavedItem, savedMealTotals, setSavedItemAmount } from '../savedMeals';
import { makeFood } from './fixtures';

const leite = makeFood({ id: 'user:leite', name: 'Leite Teste', base_unit: 'ml', serving_size: 200, household_measures: [{ label: '1 copo', amount: 200, estimated: false }], per100: { energy_kcal: 60, protein_g: 3 } });
const copo = leite.household_measures[0];

describe('quantidade em porções', () => {
  it('1,5 copo de 200 ml = 300 ml, e volta', () => {
    expect(portionsToAmount(1.5, copo)).toBe(300);
    expect(amountToPortions(300, copo)).toBe(1.5);
    expect(formatPortions(300, copo)).toBe('1,5 × copo');
    expect(amountToPortions(250, { label: '1 fatia', amount: 30, estimated: true })).toBe(8.33);
  });
});

describe('editar refeição salva', () => {
  const items = [foodToSavedItem(leite, 200), foodToSavedItem(makeFood({ id: 'user:pao', name: 'Pão', per100: { energy_kcal: 300 } }), 50)];

  it('muda a quantidade sem alterar a fonte nem os valores por 100', () => {
    const next = setSavedItemAmount(items, 0, 300);
    expect(next[0]).toMatchObject({ amount: 300, per100: leite.per100, source: leite.source, food_id: 'user:leite' });
    expect(savedMealTotals({ items: next }).values.energy_kcal).toBe(180 + 150);
    expect(() => setSavedItemAmount(items, 0, 0)).toThrow(/maior que zero/);
  });

  it('remove item, mas não deixa a refeição vazia', () => {
    expect(removeSavedItem(items, 1)).toHaveLength(1);
    expect(() => removeSavedItem([items[0]], 0)).toThrow(/ao menos um item/);
  });

  it('adiciona item da base com a medida caseira', () => {
    expect(foodToSavedItem(leite, 200)).toMatchObject({ food_name: 'Leite Teste', unit: 'ml', measure: '1 × copo', amount: 200 });
  });
});
