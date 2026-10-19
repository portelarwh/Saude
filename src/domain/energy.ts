/**
 * Estimativas de gasto energético.
 *
 * - Mifflin–St Jeor (1990): TMB = 10·peso(kg) + 6,25·altura(cm) − 5·idade + s,
 *   com s = +5 (masculino) ou −161 (feminino).
 * - Katch–McArdle: TMB = 370 + 21,6·MLG(kg), quando há massa livre de gordura medida.
 * - GET = TMB × fator de atividade (fatores clássicos de 1,2 a 1,9).
 *
 * Todas as saídas são estimativas populacionais, com erro individual típico
 * de ±10% ou mais.
 */
import type { ActivityLevel, Sex } from './types';

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string; description: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentário', description: 'Pouco ou nenhum exercício, trabalho sentado' },
  light: { factor: 1.375, label: 'Levemente ativo', description: 'Exercício leve 1–3 dias/semana' },
  moderate: { factor: 1.55, label: 'Moderadamente ativo', description: 'Exercício moderado 3–5 dias/semana' },
  active: { factor: 1.725, label: 'Muito ativo', description: 'Exercício intenso 6–7 dias/semana' },
  very_active: { factor: 1.9, label: 'Extremamente ativo', description: 'Treinos intensos diários ou trabalho físico pesado' },
};

export interface BmrInput {
  weight_kg: number | null;
  height_cm: number | null;
  age: number | null;
  sex: Sex | null;
  fat_free_mass_kg?: number | null;
}

export interface BmrResult {
  kcal: number;
  method: 'mifflin_st_jeor' | 'katch_mcardle';
  explanation: string;
}

export function mifflinStJeor(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function katchMcArdle(fatFreeMassKg: number): number {
  return 370 + 21.6 * fatFreeMassKg;
}

/**
 * Escolhe a equação conforme os dados disponíveis. Mifflin–St Jeor é a
 * preferida; Katch–McArdle é usada quando faltam sexo/idade mas há MLG medida.
 * Retorna null quando os dados não permitem uma estimativa responsável.
 */
export function estimateBmr(input: BmrInput): BmrResult | null {
  const { weight_kg, height_cm, age, sex, fat_free_mass_kg } = input;
  if (weight_kg && height_cm && age !== null && age > 0 && sex) {
    const kcal = mifflinStJeor(weight_kg, height_cm, age, sex);
    return {
      kcal,
      method: 'mifflin_st_jeor',
      explanation:
        `Mifflin–St Jeor: 10×${weight_kg} kg + 6,25×${height_cm} cm − 5×${age} anos ` +
        `${sex === 'male' ? '+ 5' : '− 161'} = ${Math.round(kcal)} kcal/dia.`,
    };
  }
  if (fat_free_mass_kg && fat_free_mass_kg > 0) {
    const kcal = katchMcArdle(fat_free_mass_kg);
    return {
      kcal,
      method: 'katch_mcardle',
      explanation: `Katch–McArdle: 370 + 21,6×${fat_free_mass_kg} kg de massa livre de gordura = ${Math.round(kcal)} kcal/dia.`,
    };
  }
  return null;
}

export function estimateTdee(bmrKcal: number, level: ActivityLevel): { kcal: number; explanation: string } {
  const { factor, label } = ACTIVITY_FACTORS[level];
  const kcal = bmrKcal * factor;
  return {
    kcal,
    explanation: `Gasto energético total ≈ TMB ${Math.round(bmrKcal)} × ${factor} (${label}) = ${Math.round(kcal)} kcal/dia.`,
  };
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** Peso correspondente a um IMC de referência para a altura informada. */
export function weightAtBmi(targetBmi: number, heightCm: number): number {
  const m = heightCm / 100;
  return targetBmi * m * m;
}

export function bmiCategory(value: number): string {
  if (value < 18.5) return 'Abaixo do peso';
  if (value < 25) return 'Eutrofia';
  if (value < 30) return 'Sobrepeso';
  if (value < 35) return 'Obesidade grau I';
  if (value < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}
