import { appliedFoodBaseUpdate, availableUpdate } from '../appUpdate';

const running = { atualizado_em: '2026-10-24T00:00:00Z', total: 10 };

describe('aviso de atualização', () => {
  it('nada a avisar quando o build publicado é o mesmo', () => {
    expect(availableUpdate('abc', running, { build: 'abc' })).toBeNull();
    expect(availableUpdate(null, running, { build: 'x' })).toBeNull(); // app nativo / dev
    expect(availableUpdate('abc', running, null)).toBeNull(); // sem internet
  });

  it('avisa a nova base de dados com a quantidade de alimentos novos', () => {
    const n = availableUpdate('abc', running, { build: 'def', base_alimentos: { atualizado_em: '2026-11-01T00:00:00Z', total: 35 } });
    expect(n).toMatchObject({ kind: 'available', title: 'Atualizar base de dados' });
    expect(n!.message).toContain('25 alimentos novos (total 35)');
  });

  it('avisa nova versão do app sem mudança na base', () => {
    expect(availableUpdate('abc', running, { build: 'def', base_alimentos: running })!.title).toBe('Atualização disponível');
  });

  it('depois de atualizar, conta o que entrou desde a última abertura', () => {
    expect(appliedFoodBaseUpdate(null, running)).toBeNull(); // primeira abertura
    expect(appliedFoodBaseUpdate(running, running)).toBeNull();
    expect(appliedFoodBaseUpdate(running, { atualizado_em: '2026-11-01T00:00:00Z', total: 11 })!.message).toBe('1 alimento novo na base (total 11).');
  });
});
