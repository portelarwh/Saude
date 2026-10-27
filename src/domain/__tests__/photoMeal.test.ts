import { referenceFoods } from '../../data/reference';
import { parseAgentPaste, reviewAgentMeal } from '../agentFormat';
import { estimatedItemsToFoods, parsePlainMealText, photoMealPrompt, plateFromReview } from '../photoMeal';
import { makeFood } from './fixtures';

const RESPOSTA = `Aqui está uma estimativa das quantidades e do valor calórico dos alimentos visíveis no prato:
 * Frango desfiado com puré/mandioca (ou fricassé/escondidinho): ~150g a 180g — 250 a 300 kcal
 * Arroz (temperado/cenoura): ~100g (aprox. 3 a 4 colheres de sopa) — 130 a 150 kcal
 * Feijão (misturado ao arroz): ~60g (aprox. 1 concha pequena) — 45 a 60 kcal
 * Salada (tomate fatiado e repolho/alface): ~40g — 10 a 15 kcal
Total estimado: 435 a 525 kcal
(Nota: O valor pode variar caso tenham sido utilizados molhos, óleo ou queijo adicional na preparação do frango e do puré.)`;

describe('roteiro da foto', () => {
  it('pede JSON no formato do app com a refeição escolhida e todos os nutrientes', () => {
    const p = photoMealPrompt('lunch');
    expect(p).toContain('"refeicao": "almoco"');
    expect(p).toContain('meu-equilibrio/v1');
    for (const k of ['kcal', 'proteina_g', 'carboidrato_g', 'gordura_g', 'fibra_g', 'sodio_mg']) expect(p).toContain(k);
    // o próprio exemplo do roteiro é lido pelo app
    const start = p.indexOf('```json\n');
    const json = p.slice(start, p.indexOf('```', start + 7) + 3).replace('"nome curto do prato, ex.: Frango com purê, arroz e feijão"', '"Almoço"');
    expect(parseAgentPaste(json)[0].kind).toBe('meal');
  });
});

describe('resposta em texto livre (exemplo real)', () => {
  const meal = parsePlainMealText(RESPOSTA, 'lunch')!;

  it('lê os 4 itens com gramas e kcal pelo meio da faixa, ignorando o total', () => {
    expect(meal.itens.map((i) => [i.alimento, i.quantidade_g, i.nutrientes_estimados?.kcal])).toEqual([
      ['Frango desfiado com puré/mandioca', 165, 275],
      ['Arroz', 100, 140],
      ['Feijão', 60, 53],
      ['Salada tomate fatiado e repolho/alface', 40, 13],
    ]);
    expect(meal.itens[1].medida).toBe('3 a 4 colheres de sopa');
    expect(meal.refeicao).toBe('almoco');
    expect(meal.observacoes).toMatch(/molhos, óleo ou queijo/);
  });

  it('o que o texto não traz fica não informado (não vira zero)', () => {
    expect(meal.itens[0].nutrientes_estimados?.proteina_g).toBeNull();
  });

  it('arroz e feijão vêm da TACO; frango com purê e salada ficam como estimativa', () => {
    const review = reviewAgentMeal(meal, referenceFoods());
    const kinds = review.items.map((i) => i.choice?.kind);
    expect(kinds).toEqual(['estimate', 'food', 'food', 'estimate']);
    expect(review.items[1].choice?.kind === 'food' && review.items[1].choice.food.name).toMatch(/^Arroz/);
    expect(review.items[2].choice?.kind === 'food' && review.items[2].choice.food.name).toMatch(/^Feijão/);
  });

  it('itens sem cadastro viram alimentos estimados, sem duplicar', () => {
    const review = reviewAgentMeal(meal, referenceFoods());
    const created = estimatedItemsToFoods(review, referenceFoods());
    expect(created.map((c) => c.index)).toEqual([0, 3]);
    const frango = created[0].food;
    expect(frango).toMatchObject({ name: 'Frango desfiado com puré/mandioca', source: 'ai_estimate', verification: 'estimated', serving_size: 165 });
    expect(frango.per100.energy_kcal).toBeCloseTo((275 * 100) / 165, 5);
    expect(frango.per100.protein_g).toBeNull();
    expect(frango.tags).toContain('estimativa');
    // já cadastrado: não cria de novo
    const again = estimatedItemsToFoods(review, [...referenceFoods(), makeFood({ name: 'Frango desfiado com puré/mandioca' })]);
    expect(again.map((c) => c.index)).toEqual([3]);
  });

  it('texto sem itens não é lido', () => {
    expect(parsePlainMealText('Que prato bonito!', null)).toBeNull();
  });
});

describe('lançar como prato', () => {
  it('um alimento com o peso total e calorias somadas; nutriente incompleto fica não informado', () => {
    const review = reviewAgentMeal(parsePlainMealText(RESPOSTA, 'lunch')!, referenceFoods());
    const plate = plateFromReview(review)!;
    expect(plate.amount).toBe(165 + 100 + 60 + 40);
    const kcal = review.items.reduce((s, i) => {
      const per100 = i.choice!.kind === 'food' ? i.choice!.food.per100 : i.choice!.per100;
      return s + (per100.energy_kcal! * i.amount!) / 100;
    }, 0);
    expect((plate.food.per100.energy_kcal! * plate.amount) / 100).toBeCloseTo(kcal, 5);
    expect(plate.food.per100.protein_g).toBeNull(); // frango e salada sem proteína no texto
    expect(plate.food).toMatchObject({ source: 'ai_estimate', verification: 'estimated', serving_label: '1 prato' });
    expect(plate.food.ingredients_text).toMatch(/Arroz \(100 g\)/);
  });
  it('sem itens válidos não há prato', () => {
    expect(plateFromReview({ name: 'x', meal: null, notes: null, items: [] })).toBeNull();
  });
});
