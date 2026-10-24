import base from '../../data/reference/alimentos-base.json';
import { baseFoods, referenceFoods } from '../../data/reference';
import { buildFoodBundle, foodKey, FOOD_BUNDLE_FORMAT, FoodBundleError, mergeFoods, newFoodsFrom, parseFoodBundle } from '../foodBundle';
import { makeFood } from './fixtures';

const whey = makeFood({
  id: 'user:1',
  name: 'Whey isolado',
  brand: 'Marca X',
  flavor: 'Baunilha',
  source: 'label',
  verification: 'verified',
  per100: { energy_kcal: 380, protein_g: 80, sodium_mg: null },
  is_supplement: true,
  created_at: '2026-10-20T10:00:00Z',
});
const pao = makeFood({ id: 'user:2', name: 'Pão caseiro da padaria', source: 'ai_estimate', verification: 'estimated', per100: { energy_kcal: 290 } });

describe('exportar a base de alimentos', () => {
  it('gera o formato da base do sistema, sem dono e sem TACO', () => {
    const taco = referenceFoods()[0];
    const b = buildFoodBundle([], [whey, pao, taco], new Date('2026-10-24T12:00:00Z'));
    expect(b.formato).toBe(FOOD_BUNDLE_FORMAT);
    expect(b.alimentos).toHaveLength(2);
    expect(b.alimentos.every((f) => f.user_id === null && f.id.startsWith('base:'))).toBe(true);
    expect(b.alimentos.find((f) => f.name === 'Whey isolado')!.id).toBe('base:whey-isolado-marca-x-baunilha');
    expect('created_at' in b.alimentos[0]).toBe(false);
  });

  it('preserva fonte, verificação e nutrientes não informados', () => {
    const b = buildFoodBundle([], [whey, pao]);
    const w = b.alimentos.find((f) => f.name === 'Whey isolado')!;
    expect(w.per100.sodium_mg).toBeNull();
    expect(w.source).toBe('label');
    expect(b.alimentos.find((f) => f.name.startsWith('Pão'))!.verification).toBe('estimated');
  });

  it('junta com a base atual; o cadastro do usuário prevalece', () => {
    const old = { ...whey, id: 'base:whey-isolado-marca-x-baunilha', user_id: null, per100: { energy_kcal: 370 } };
    const b = buildFoodBundle([old], [whey, pao]);
    expect(b.alimentos).toHaveLength(2);
    expect(b.alimentos.find((f) => f.name === 'Whey isolado')!.per100.energy_kcal).toBe(380);
  });

  it('código de barras identifica o mesmo produto', () => {
    const a = makeFood({ name: 'Iogurte', barcode: '789 1234' });
    const b2 = makeFood({ name: 'Iogurte natural', barcode: '7891234' });
    expect(foodKey(a)).toBe(foodKey(b2));
    expect(mergeFoods([a], [b2])).toEqual([b2]);
  });

  it('ids repetidos ganham sufixo', () => {
    const b = buildFoodBundle([], [makeFood({ id: 'user:a', name: 'Bolo X' }), makeFood({ id: 'user:b', name: 'Bolo', brand: 'X' })]);
    expect(new Set(b.alimentos.map((f) => f.id)).size).toBe(2);
  });
});

describe('importar a base de alimentos', () => {
  it('lê o que foi exportado (ida e volta)', () => {
    const b = buildFoodBundle([], [whey, pao]);
    const { foods, skipped } = parseFoodBundle(JSON.stringify(b));
    expect(skipped).toBe(0);
    expect(foods).toEqual(b.alimentos);
  });

  it('ignora itens incompletos e recusa outros arquivos', () => {
    const text = JSON.stringify({ formato: FOOD_BUNDLE_FORMAT, alimentos: [{ name: 'Sem unidade', per100: {} }, buildFoodBundle([], [pao]).alimentos[0]] });
    expect(parseFoodBundle(text)).toMatchObject({ skipped: 1 });
    expect(() => parseFoodBundle('{"app":"outro"}')).toThrow(FoodBundleError);
    expect(() => parseFoodBundle('não é json')).toThrow(FoodBundleError);
  });

  it('não duplica alimentos que já existem', () => {
    const { foods } = parseFoodBundle(JSON.stringify(buildFoodBundle([], [whey, pao])));
    expect(newFoodsFrom(foods, [whey]).map((f) => f.name)).toEqual(['Pão caseiro da padaria']);
  });

  it('o arquivo da base no repositório é válido e entra na referência', () => {
    expect(base.formato).toBe(FOOD_BUNDLE_FORMAT);
    expect(parseFoodBundle(JSON.stringify(base)).skipped).toBe(0);
    const ids = referenceFoods().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of baseFoods()) expect(ids).toContain(f.id);
  });
});
