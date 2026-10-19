import { ACTIVITY_FACTORS } from '../domain/energy';
import type { ActivityLevel, HealthFlag, Objective, SupplementCategory } from '../domain/types';

export const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: 'fat_loss', label: 'Emagrecimento' },
  { value: 'maintenance', label: 'Manutenção' },
  { value: 'recomposition', label: 'Recomposição corporal' },
  { value: 'muscle_gain', label: 'Ganho de massa muscular' },
];

export const HEALTH_FLAGS: { value: HealthFlag; label: string }[] = [
  { value: 'kidney_disease', label: 'Doença renal' },
  { value: 'heart_failure', label: 'Insuficiência cardíaca' },
  { value: 'liver_disease', label: 'Doença hepática' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hypertension', label: 'Hipertensão' },
  { value: 'pregnancy', label: 'Gestação' },
  { value: 'breastfeeding', label: 'Amamentação' },
  { value: 'eating_disorder_history', label: 'Histórico de transtorno alimentar' },
  { value: 'other', label: 'Outra condição' },
];

export const RESTRICTIONS = ['Vegetariano', 'Vegano', 'Sem lactose', 'Sem glúten', 'Pouco açúcar', 'Pouco sódio', 'Low carb', 'Sem carne vermelha', 'Sem frutos do mar'];

export const ACTIVITY_OPTIONS = (Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => ({ value: k, label: ACTIVITY_FACTORS[k].label }));

export const SUPPLEMENT_LABELS: Record<SupplementCategory, string> = {
  whey_concentrate: 'Whey concentrado',
  whey_isolate: 'Whey isolado',
  whey_hydrolyzed: 'Whey hidrolisado',
  plant_protein: 'Proteína vegetal',
  creatine: 'Creatina',
  collagen: 'Colágeno',
  protein_bar: 'Barra proteica',
  protein_drink: 'Bebida proteica',
  multivitamin: 'Multivitamínico',
  other: 'Outro suplemento',
};
