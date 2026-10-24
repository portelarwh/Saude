import { csvTemplate, parseCell, parseCsvRows, parseFoodsCsv } from '../foodCsv';

describe('planilha de alimentos (importação em massa)', () => {
  it('lê o modelo do Excel (";" e vírgula decimal), convertendo porção para 100 g', () => {
    const { foods, errors } = parseFoodsCsv(csvTemplate());
    expect(errors).toEqual([]);
    const f = foods[0];
    expect(f.name).toBe('Iogurte natural integral');
    expect(f.per100.energy_kcal).toBe(60); // 102 kcal em 170 g
    expect(f.per100.protein_g).toBe(3.71);
    expect(f.per100.fiber_g).toBeNull(); // vazio = não informado
    expect(f.household_measures).toEqual([{ label: '1 pote', amount: 170, estimated: false }]);
    expect(f.source).toBe('label');
    expect(f.aliases).toEqual(['iogurte', 'iogurte natural']);
  });

  it('aceita vírgula como separador, aspas e nomes de coluna alternativos', () => {
    const csv = 'Alimento,Calorias,Proteínas (g),Carboidratos (g),Lipídios (g),Fonte\n"Pão de queijo, assado",363,5.1,34.2,24.6,taco\nCuscuz,113,"2,2",25.3,0.7,\n';
    const { foods, errors } = parseFoodsCsv(csv);
    expect(errors).toEqual([]);
    expect(foods.map((f) => f.name)).toEqual(['Pão de queijo, assado', 'Cuscuz']);
    expect(foods[0].per100).toMatchObject({ energy_kcal: 363, protein_g: 5.1, carbs_g: 34.2, fat_g: 24.6 });
    expect(foods[1].per100.protein_g).toBe(2.2);
    expect(foods[0].source).toBe('taco');
  });

  it('traços e células vazias não viram zero', () => {
    expect(parseCell('Tr')).toEqual({ kind: 'trace' });
    expect(parseCell('')).toEqual({ kind: 'empty' });
    expect(parseCell('NA')).toEqual({ kind: 'empty' });
    expect(parseCell('1.234,5')).toEqual({ kind: 'number', value: 1234.5 });
    const { foods } = parseFoodsCsv('nome;kcal;fibra_g;sodio_mg\nAlface;11;Tr;\n');
    expect(foods[0].per100.fiber_g).toBeNull();
    expect(foods[0].trace_nutrients).toEqual(['fiber_g']);
    expect(foods[0].per100.sodium_mg).toBeNull();
  });

  it('aponta linhas com problema sem travar o resto', () => {
    const csv = 'nome;unidade;valores_por;porcao;kcal\n;g;;;100\nSuco;litro;;;40\nBarra;g;porcao;;200\nSem dados;g;;;\nArroz;g;;;abc\nBolacha;g;;;430\n';
    const { foods, errors } = parseFoodsCsv(csv);
    expect(foods.map((f) => f.name)).toEqual(['Bolacha']);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });

  it('estimativas ficam marcadas como estimadas', () => {
    const { foods } = parseFoodsCsv('nome;kcal;fonte\nBolo da vó;350;estimativa\n');
    expect(foods[0]).toMatchObject({ source: 'ai_estimate', verification: 'estimated' });
  });

  it('exige a coluna nome', () => {
    expect(parseFoodsCsv('kcal\n100\n').errors[0].message).toMatch(/nome/);
    expect(parseCsvRows('a;b\r\n1;2\r\n\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

it('dados/alimentos/_modelo.csv segue o modelo do app', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  expect(fs.readFileSync(require.resolve('../../../dados/alimentos/_modelo.csv'), 'utf8')).toBe(csvTemplate());
});
