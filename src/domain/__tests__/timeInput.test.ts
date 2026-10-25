import { maskTime, normalizeTime, parseTimeList } from '../dates';

describe('hora digitada só com números', () => {
  it('1700 vira 17:00', () => {
    expect(maskTime('1700')).toBe('17:00');
    expect(normalizeTime('1700')).toBe('17:00');
  });

  it('formata enquanto digita', () => {
    expect(['1', '17', '170', '1700'].map(maskTime)).toEqual(['1', '17', '17:0', '17:00']);
    expect(['7', '73', '730'].map(maskTime)).toEqual(['7', '7:3', '7:30']);
    expect(maskTime('17:')).toBe('17:');
    expect(maskTime('17000')).toBe('17:00');
  });

  it('aceita hora curta e com separador', () => {
    expect(normalizeTime('730')).toBe('07:30');
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime('17')).toBe('17:00');
    expect(normalizeTime('0645')).toBe('06:45');
    expect(normalizeTime('17:00')).toBe('17:00');
    expect(normalizeTime('17h30')).toBe('17:30');
    expect(normalizeTime('7.15')).toBe('07:15');
    expect(normalizeTime('2359')).toBe('23:59');
  });

  it('rejeita horas impossíveis ou incompletas', () => {
    expect(normalizeTime('2460')).toBeNull();
    expect(normalizeTime('1775')).toBeNull();
    expect(normalizeTime('170')).toBeNull(); // falta um dígito do minuto
    expect(normalizeTime('')).toBeNull();
  });

  it('vários horários separados por espaço', () => {
    expect(parseTimeList('1230 1930')).toEqual(['12:30', '19:30']);
    expect(parseTimeList('8, 1230; 2000')).toEqual(['08:00', '12:30', '20:00']);
    expect(parseTimeList('1230 99')).toBeNull();
  });
});
