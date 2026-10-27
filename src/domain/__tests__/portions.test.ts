import { describeAmount, measureName, measureUnit, wholePortions } from '../portions';

const ovo = { label: '1 unidade', amount: 50, estimated: true };

describe('medidas caseiras', () => {
  it('nomes no plural', () => {
    expect(measureUnit(ovo, 1)).toBe('unidade');
    expect(measureUnit(ovo, 3)).toBe('unidades');
    expect(measureUnit({ label: '1 colher de sopa' }, 2)).toBe('colheres de sopa');
    expect(measureUnit({ label: '1 filé' }, 2)).toBe('filés');
    expect(measureUnit({ label: '1 fatia' }, 1.5)).toBe('fatias');
    expect(measureUnit({ label: '1 pão' }, 2)).toBe('pães');
    expect(measureUnit({ label: '1 porção' }, 2)).toBe('porções');
    expect(measureName({ label: '1 copo' })).toBe('copo');
  });
  it('mostra unidades quando a quantidade é um número redondo de medidas', () => {
    expect(describeAmount(100, 'g', ovo)).toBe('2 unidades · 100 g (estimado)');
    expect(describeAmount(75, 'g', ovo)).toBe('1,5 unidades · 75 g (estimado)');
    expect(describeAmount(83, 'g', ovo)).toBe('83 g');
    expect(describeAmount(300, 'ml', { label: '1 copo', amount: 200, estimated: false })).toBe('1,5 copos · 300 ml');
    expect(describeAmount(100, 'g', null)).toBe('100 g');
    expect(wholePortions(50, ovo)).toBe(1);
  });
});
