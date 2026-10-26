/**
 * Dicas de hidratação (educativas). Fonte: EFSA — Dietary Reference Values for
 * water (2010), https://doi.org/10.2903/j.efsa.2010.1459 (ingestão total de água
 * ≈ 2,0 L/dia mulheres e 2,5 L/dia homens, incluindo a água dos alimentos).
 */
import type { HealthFlag } from './types';

export const HYDRATION_SOURCE = 'EFSA — Dietary Reference Values for water (2010)';

export function hydrationTips(flags: readonly HealthFlag[] | null | undefined): { tips: string[]; caution: string | null } {
  const f = new Set(flags ?? []);
  if (f.has('kidney_disease') || f.has('heart_failure')) {
    return { tips: [], caution: 'Com doença renal ou insuficiência cardíaca, a quantidade de líquidos deve seguir a orientação do seu médico — pode ser preciso limitar.' };
  }
  return {
    caution: null,
    tips: [
      'Distribua ao longo do dia: um copo ao acordar, um em cada refeição e nos intervalos. Não precisa compensar tudo de uma vez.',
      'Use a cor da urina como guia: amarelo-claro indica boa hidratação; escura, beba mais.',
      'Em dias de treino, acrescente cerca de 400–800 ml por hora de exercício, conforme o suor.',
      'Café, chá, leite e água de coco contam como líquidos; bebida alcoólica não conta e aumenta a perda de água.',
      'Evite beber mais de cerca de 1 L por hora: mais que isso não hidrata melhor.',
      'Calor, febre, diarreia e vômitos aumentam a necessidade; nesses casos, beba mais e procure atendimento se não melhorar.',
      'Referência total (EFSA): cerca de 2,0 L/dia para mulheres e 2,5 L/dia para homens, já contando a água dos alimentos (~20%).',
    ],
  };
}
