/**
 * Sinônimos e medidas caseiras para alimentos da TACO, indexados pelo nome
 * exato do alimento na tabela (um teste garante que todos os nomes existem).
 *
 * A TACO não publica medidas caseiras. Os pesos abaixo são ESTIMATIVAS usuais
 * de porções brasileiras (marcadas como `estimated: true` e exibidas como
 * "estimado" na interface); o usuário pode ajustar a quantidade em gramas.
 */
import type { HouseholdMeasure } from '../../domain/types';

interface Extra {
  aliases?: string[];
  measures?: [label: string, amount: number][];
}

export const TACO_EXTRAS: Record<string, Extra> = {
  'Pão, trigo, francês': { aliases: ['pão francês', 'pão de sal', 'cacetinho', 'pão careca', 'pãozinho', 'pão'], measures: [['1 unidade', 50]] },
  'Pão, trigo, forma, integral': { aliases: ['pão de forma integral', 'pão integral', 'pão de forma'], measures: [['1 fatia', 25]] },
  'Ovo, de galinha, inteiro, cozido/10minutos': { aliases: ['ovo cozido', 'ovo'], measures: [['1 unidade', 50]] },
  'Ovo, de galinha, inteiro, cru': { aliases: ['ovo cru', 'ovo mexido', 'ovos mexidos', 'omelete'], measures: [['1 unidade', 50]] },
  'Ovo, de galinha, inteiro, frito': { aliases: ['ovo frito'], measures: [['1 unidade', 50]] },
  'Ovo, de galinha, clara, cozida/10minutos': { aliases: ['clara de ovo', 'clara cozida', 'clara'], measures: [['1 unidade', 30]] },
  'Frango, peito, sem pele, grelhado': { aliases: ['peito de frango', 'frango grelhado', 'filé de frango', 'peito de frango grelhado', 'frango'], measures: [['1 filé', 100]] },
  'Frango, peito, sem pele, cozido': { aliases: ['frango cozido', 'frango desfiado', 'peito de frango cozido'], measures: [['1 colher de sopa', 25]] },
  'Carne, bovina, acém, moído, cozido': { aliases: ['carne moída', 'carne moida', 'acém moído', 'carne moída cozida'], measures: [['1 colher de sopa', 25]] },
  'Carne, bovina, patinho, sem gordura, grelhado': { aliases: ['patinho', 'carne grelhada', 'bife', 'bife de patinho'], measures: [['1 bife', 100]] },
  'Arroz, tipo 1, cozido': { aliases: ['arroz branco', 'arroz', 'arroz branco cozido'], measures: [['1 colher de sopa', 25], ['1 escumadeira', 90]] },
  'Arroz, integral, cozido': { aliases: ['arroz integral'], measures: [['1 colher de sopa', 25]] },
  'Feijão, carioca, cozido': { aliases: ['feijão', 'feijão carioca', 'feijao'], measures: [['1 concha', 100]] },
  'Feijão, preto, cozido': { aliases: ['feijão preto'], measures: [['1 concha', 100]] },
  'Banana, prata, crua': { aliases: ['banana', 'banana prata'], measures: [['1 unidade', 60]] },
  'Banana, nanica, crua': { aliases: ['banana nanica', 'banana d água'], measures: [['1 unidade', 90]] },
  'Café, infusão 10%': { aliases: ['café', 'cafe', 'café coado', 'cafezinho', 'café preto', 'café sem açúcar'], measures: [['1 xícara', 100], ['1 cafezinho', 50]] },
  'Leite, de vaca, integral': { aliases: ['leite integral', 'leite'], measures: [['1 copo', 200], ['1 xícara', 150]] },
  'Leite, de vaca, desnatado, UHT': { aliases: ['leite desnatado'], measures: [['1 copo', 200]] },
  'Iogurte, natural': { aliases: ['iogurte natural', 'iogurte'], measures: [['1 pote', 170]] },
  'Iogurte, natural, desnatado': { aliases: ['iogurte desnatado', 'iogurte natural desnatado'], measures: [['1 pote', 170]] },
  'Manteiga, com sal': { aliases: ['manteiga'], measures: [['1 colher de chá', 5], ['1 ponta de faca', 5]] },
  'Manteiga, sem sal': { aliases: ['manteiga sem sal'], measures: [['1 colher de chá', 5]] },
  'Óleo, de soja': { aliases: ['óleo', 'óleo de soja', 'oleo'], measures: [['1 colher de sopa', 8], ['1 colher de chá', 3]] },
  'Azeite, de oliva, extra virgem': { aliases: ['azeite', 'azeite de oliva'], measures: [['1 colher de sopa', 8]] },
  'Queijo, minas, frescal': { aliases: ['queijo minas', 'queijo minas frescal', 'queijo branco'], measures: [['1 fatia', 30]] },
  'Queijo, mozarela': { aliases: ['mussarela', 'muçarela', 'queijo mussarela', 'mozarela'], measures: [['1 fatia', 15]] },
  'Queijo, requeijão, cremoso': { aliases: ['requeijão', 'requeijão cremoso'], measures: [['1 colher de sopa', 30]] },
  'Queijo, ricota': { aliases: ['ricota', 'creme de ricota'], measures: [['1 colher de sopa', 25]] },
  'Aveia, flocos, crua': { aliases: ['aveia', 'aveia em flocos'], measures: [['1 colher de sopa', 10]] },
  'Açúcar, refinado': { aliases: ['açúcar', 'açúcar refinado'], measures: [['1 colher de chá', 5]] },
  'Batata, doce, cozida': { aliases: ['batata doce'], measures: [['1 unidade média', 150]] },
  'Batata, inglesa, cozida': { aliases: ['batata', 'batata cozida', 'batata inglesa'], measures: [['1 unidade média', 130]] },
  'Maçã, Fuji, com casca, crua': { aliases: ['maçã', 'maca', 'maçã fuji'], measures: [['1 unidade', 130]] },
  'Mamão, Papaia, cru': { aliases: ['mamão', 'mamão papaia'], measures: [['1 fatia', 100]] },
  'Tomate, com semente, cru': { aliases: ['tomate'], measures: [['1 unidade', 100]] },
  'Alface, crespa, crua': { aliases: ['alface'], measures: [['1 folha', 10]] },
};

export function extrasFor(name: string): { aliases: string[]; measures: HouseholdMeasure[] } {
  const e = TACO_EXTRAS[name];
  return {
    aliases: e?.aliases ?? [],
    measures: (e?.measures ?? []).map(([label, amount]) => ({ label, amount, estimated: true })),
  };
}
