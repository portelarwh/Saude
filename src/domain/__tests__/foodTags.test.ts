import { referenceFoods } from '../../data/reference';
import { parseFoodBundle, buildFoodBundle } from '../foodBundle';
import { parseFoodsCsv } from '../foodCsv';
import { closeEnough, searchFoods } from '../foodSearch';
import { foodTags, inferredTags, normalizeTags, suggestTags } from '../foodTags';
import { makeFood } from './fixtures';

const taco = referenceFoods();
const names = (q: string, foods = taco, n = 10) => searchFoods(foods, q, n).map((h) => h.food.name);

describe('tags de alimentos', () => {
  it('toda a base TACO ganha ao menos um grupo', () => {
    expect(taco.filter((f) => f.source === 'taco' && !foodTags(f).length)).toEqual([]);
  });

  it('deduz grupos pela categoria e pelo nome, sem confundir', () => {
    const t = (name: string, category: string | null = null) => inferredTags({ name, category, aliases: [], is_supplement: false });
    expect(t('Banana, prata, crua', 'Frutas e derivados')).toContain('fruta');
    expect(t('Fruta-pão, crua', 'Frutas e derivados')).not.toContain('pão');
    expect(t('Misto quente')).toEqual(expect.arrayContaining(['sanduíche', 'lanche']));
    expect(t('Hambúrguer, bovino, grelhado', 'Carnes e derivados')).not.toContain('sanduíche'); // na TACO é a carne
    expect(t('Batata, doce, cozida')).not.toContain('doce');
    expect(t('Leite, de coco', 'Outros alimentos industrializados')).not.toContain('laticínio');
    expect(t('Peru, congelado, assado', 'Carnes e derivados')).not.toContain('frango');
    expect(t('Coxinha de frango, frita')).toEqual(expect.arrayContaining(['salgado', 'frango']));
  });

  it('tags do usuário são limpas e sem repetição', () => {
    expect(normalizeTags(['#Sanduíche', 'sanduiche', ' Lanche  da tarde ', ''])).toEqual(['sanduíche', 'lanche da tarde']);
  });

  it('sugere tags sem repetir as que o alimento já tem', () => {
    const s = suggestTags({ name: 'Misto quente', category: null, aliases: [], is_supplement: false, tags: ['sanduíche'] }, [makeFood({ tags: ['pré-treino'] })]);
    expect(s).toContain('pré-treino');
    expect(s).not.toContain('sanduíche');
  });
});

describe('busca entende grupos, partes do nome e erros de digitação', () => {
  const misto = makeFood({ id: 'user:misto', name: 'Misto quente caseiro', tags: ['lanche da tarde'], per100: { energy_kcal: 260 } });
  const wrap = makeFood({ id: 'user:wrap', name: 'Rap10 de frango', tags: ['sanduíche'] });
  const foods = [misto, wrap, ...taco];

  it('"sanduíche" encontra o misto quente e o que foi marcado como sanduíche', () => {
    expect(names('sanduíche', foods, 5)).toEqual(expect.arrayContaining(['Misto quente caseiro', 'Rap10 de frango']));
    expect(names('sanduiche', foods, 5)).toEqual(expect.arrayContaining(['Misto quente caseiro']));
    expect(names('lanche da tarde', foods, 3)[0]).toBe('Misto quente caseiro');
  });

  it('"fruta" e "frutas" trazem frutas', () => {
    for (const q of ['fruta', 'frutas']) {
      const hits = searchFoods(taco, q, 15);
      expect(hits.length).toBe(15);
      expect(hits.every((h) => h.food.category === 'Frutas e derivados')).toBe(true);
    }
  });

  it('palavra incompleta e erro de digitação', () => {
    expect(names('banan')[0]).toMatch(/^Banana/);
    expect(names('frang').some((n) => n.startsWith('Frango'))).toBe(true);
    expect(names('frnago').some((n) => /frango/i.test(n))).toBe(true);
    expect(names('baanna').some((n) => n.startsWith('Banana'))).toBe(true);
    expect(closeEnough('frnago', 'frango')).toBe(true);
    expect(closeEnough('banana', 'batata')).toBe(false);
  });

  it('o nome continua na frente do grupo', () => {
    expect(names('queijo', taco, 3).every((n) => n.startsWith('Queijo'))).toBe(true);
    expect(names('pão', taco, 3)[0]).toBe('Pão, trigo, francês');
  });

  it('tags viajam na planilha e no arquivo exportado', () => {
    const { foods: csv } = parseFoodsCsv('nome;kcal;tags\nMisto quente;260;sanduíche|lanche\n');
    expect(csv[0].tags).toEqual(['sanduíche', 'lanche']);
    const back = parseFoodBundle(JSON.stringify(buildFoodBundle([], [misto]))).foods[0];
    expect(back.tags).toEqual(['lanche da tarde']);
  });
});
