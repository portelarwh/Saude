/**
 * Motor de metas nutricionais orientativas.
 *
 * Cada meta registra sua origem (sistema, usuário ou profissional) e uma
 * explicação legível. Metas prescritas por profissional têm prioridade e nunca
 * são substituídas por recálculos automáticos.
 */
import { ACTIVITY_FACTORS, bmi, estimateBmr, estimateTdee, suggestActivityLevel, weightAtBmi, type ActivitySuggestion } from './energy';
import { addDays, ageOn, daysBetween, formatDateBR, parseISODate, toISODate } from './dates';
import { round } from './nutrients';
import type { GoalKey, GoalOrigin, GoalTarget, GoalTargets, HealthFlag, ISODate, Objective, Profile, ProteinBasis } from './types';

export const GOAL_KEYS: GoalKey[] = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'water_ml'];

export const GOAL_LABELS: Record<GoalKey, { label: string; unit: string }> = {
  energy_kcal: { label: 'Calorias', unit: 'kcal' },
  protein_g: { label: 'Proteínas', unit: 'g' },
  carbs_g: { label: 'Carboidratos', unit: 'g' },
  fat_g: { label: 'Gorduras', unit: 'g' },
  fiber_g: { label: 'Fibras', unit: 'g' },
  water_ml: { label: 'Água e líquidos', unit: 'ml' },
};

export const ORIGIN_LABELS: Record<GoalOrigin, string> = {
  system: 'Sugerida pelo app',
  user: 'Definida por você',
  professional: 'Prescrita por profissional',
};

const PROFESSIONAL_ONLY_PROTEIN: HealthFlag[] = ['kidney_disease', 'liver_disease'];
const PROFESSIONAL_ONLY_WATER: HealthFlag[] = ['kidney_disease', 'heart_failure'];
const NO_AUTOMATIC_DEFICIT: HealthFlag[] = ['pregnancy', 'breastfeeding', 'eating_disorder_history'];

export const DEFAULT_WATER_ML_PER_KG = 35;

export interface GoalInput {
  profile: Pick<
    Profile,
    | 'birth_date'
    | 'sex'
    | 'height_cm'
    | 'current_weight_kg'
    | 'target_weight_kg'
    | 'activity_level'
    | 'objective'
    | 'does_resistance_training'
    | 'health_flags'
    | 'hot_climate'
    | 'water_ml_per_kg'
    | 'target_date'
  > &
    Partial<Pick<Profile, 'food_restrictions' | 'strength_sessions_per_week' | 'strength_session_min' | 'protein_g_per_kg' | 'protein_basis'>>;
  /** Dados da bioimpedância mais recente, se houver. */
  latestFatFreeMassKg?: number | null;
  today?: Date;
}

export interface GoalCalculation {
  targets: GoalTargets;
  bmr: { kcal: number; method: string; explanation: string } | null;
  tdee: { kcal: number; explanation: string } | null;
  referenceWeight: { kg: number; explanation: string } | null;
  /** Nível de atividade coerente com o treino informado (null sem treinos informados). */
  activity: ActivitySuggestion | null;
  missingData: string[];
}

function target(value: number | null, explanation: string, extra: Partial<GoalTarget> = {}): GoalTarget {
  return { value, origin: 'system', explanation, ...extra };
}

/**
 * Peso de referência para proteína/água. Em obesidade (IMC ≥ 30), usar o peso
 * total superestima as necessidades; usamos o peso equivalente a IMC 25.
 */
export function referenceWeight(weightKg: number, heightCm: number | null): { kg: number; explanation: string } {
  if (!heightCm) return { kg: weightKg, explanation: `Peso atual (${weightKg} kg); altura não informada.` };
  const currentBmi = bmi(weightKg, heightCm);
  if (currentBmi >= 30) {
    const kg = round(weightAtBmi(25, heightCm), 1);
    return {
      kg,
      explanation: `IMC atual ${round(currentBmi, 1)} (≥ 30): usamos o peso de referência equivalente a IMC 25 para sua altura (${kg} kg), evitando superestimar a necessidade pelo peso total.`,
    };
  }
  return { kg: weightKg, explanation: `Peso atual (${weightKg} kg), IMC ${round(currentBmi, 1)}.` };
}

/**
 * Vários objetivos marcados viram um objetivo para o cálculo das metas:
 * emagrecer + ganhar massa = recomposição; emagrecer prevalece sobre manter;
 * ganhar massa prevalece sobre manter.
 */
export function combineObjectives(list: readonly Objective[] | null | undefined): Objective | null {
  const set = new Set(list ?? []);
  if (!set.size) return null;
  if (set.has('recomposition') || (set.has('fat_loss') && set.has('muscle_gain'))) return 'recomposition';
  if (set.has('fat_loss')) return 'fat_loss';
  if (set.has('muscle_gain')) return 'muscle_gain';
  return 'maintenance';
}

/** Objetivos marcados no perfil (perfis antigos tinham só `objective`). */
export function profileObjectives(p: Pick<Profile, 'objective'> & { objectives?: Objective[] | null }): Objective[] {
  if (p.objectives?.length) return p.objectives;
  return p.objective ? [p.objective] : [];
}

/** Altura sempre em centímetros; "1,75" (metros) vira 175. */
export function normalizeHeightCm(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return value < 3 ? round(value * 100, 1) : value;
}

/** Carboidrato do low carb moderado (g/dia). */
export const LOW_CARB_RANGE: readonly [number, number] = [100, 130];

/** Fatores de proteína oferecidos para escolha (g/kg). */
export const PROTEIN_FACTOR_OPTIONS = [1.2, 1.6, 1.8, 2.0, 2.2] as const;

const ptNum = (n: number) => String(round(n, 1)).replace('.', ',');
/** Fator de proteína sempre com uma casa: 2 → "2,0". */
export const formatFactor = (n: number) => n.toFixed(1).replace('.', ',');

/** Aceita só fatores plausíveis (1,0–2,5 g/kg); fora disso volta ao padrão do app. */
export function validProteinFactor(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 2.5 ? v : null;
}

/** Peso sobre o qual a proteína é calculada. */
export function proteinBase(
  basis: ProteinBasis,
  ref: { kg: number; explanation: string },
  currentKg: number,
  heightCm: number | null,
  fatFreeMassKg: number | null,
): { kg: number; explanation: string; warnings: string[] } {
  if (basis === 'fat_free_mass') {
    if (fatFreeMassKg && fatFreeMassKg > 0) return { kg: fatFreeMassKg, explanation: `Base: massa livre de gordura da bioimpedância (${ptNum(fatFreeMassKg)} kg).`, warnings: [] };
    return { ...ref, warnings: ['Base "massa livre de gordura" escolhida, mas não há bioimpedância com esse valor: usamos o peso de referência.'] };
  }
  if (basis === 'current') {
    if (!heightCm || bmi(currentKg, heightCm) < 30) return { kg: currentKg, explanation: `Base: peso atual (${ptNum(currentKg)} kg).`, warnings: [] };
    return { ...ref, warnings: ['Com IMC ≥ 30 o peso atual superestima a necessidade de proteína: usamos o peso de referência.'] };
  }
  return { ...ref, warnings: [] };
}

export function proteinFactor(objective: Objective, resistanceTraining: boolean): { factor: number; range: [number, number] } {
  switch (objective) {
    case 'fat_loss':
      return resistanceTraining ? { factor: 1.8, range: [1.6, 2.2] } : { factor: 1.6, range: [1.2, 2.0] };
    case 'recomposition':
      return resistanceTraining ? { factor: 2.0, range: [1.6, 2.2] } : { factor: 1.8, range: [1.4, 2.0] };
    case 'muscle_gain':
      return resistanceTraining ? { factor: 1.8, range: [1.6, 2.2] } : { factor: 1.6, range: [1.4, 2.0] };
    case 'maintenance':
    default:
      return resistanceTraining ? { factor: 1.6, range: [1.2, 2.0] } : { factor: 1.2, range: [1.0, 1.6] };
  }
}

export function calorieTarget(
  tdee: number,
  bmr: number,
  objective: Objective,
  sex: Profile['sex'],
): { kcal: number; explanation: string; warnings: string[] } {
  const warnings: string[] = [];
  const floor = Math.max(bmr, sex === 'male' ? 1500 : 1200);
  let kcal: number;
  let explanation: string;
  switch (objective) {
    case 'fat_loss': {
      const deficit = Math.min(tdee * 0.2, 750);
      kcal = tdee - deficit;
      explanation = `Déficit moderado de ${Math.round(deficit)} kcal (até 20% do gasto, máximo 750 kcal) para favorecer perda de gordura preservando massa magra.`;
      if (kcal < floor) {
        kcal = floor;
        warnings.push('A meta foi limitada para não ficar abaixo da taxa metabólica basal estimada nem de um mínimo seguro. Déficits maiores exigem acompanhamento profissional.');
      }
      break;
    }
    case 'recomposition':
      kcal = Math.max(tdee * 0.9, floor);
      explanation = 'Déficit leve (~10%) para recomposição corporal, combinado a treino de força e proteína adequada.';
      break;
    case 'muscle_gain': {
      const surplus = Math.min(tdee * 0.1, 400);
      kcal = tdee + surplus;
      explanation = `Superávit leve de ${Math.round(surplus)} kcal (~10%, máximo 400 kcal) para ganho de massa com menor ganho de gordura.`;
      break;
    }
    case 'maintenance':
    default:
      kcal = tdee;
      explanation = 'Manutenção: meta igual ao gasto energético total estimado.';
  }
  return { kcal: Math.round(kcal / 10) * 10, explanation, warnings };
}

export interface TimelineAssessment {
  status: 'ok' | 'aggressive' | 'unsafe' | 'not_applicable';
  weeks: number | null;
  kgPerWeek: number | null;
  pctPerWeek: number | null;
  suggestedWeeks: number | null;
  /** Prazo recomendado (hoje + semanas em ritmo sustentável). */
  suggestedDate: ISODate | null;
  /** Ritmo do prazo recomendado, em kg/semana. */
  suggestedKgPerWeek: number | null;
  message: string;
}

/**
 * Avalia a viabilidade do prazo desejado. Referências usuais para perda de
 * peso sustentável: ~0,5–1% do peso corporal por semana.
 */
export function assessTimeline(currentKg: number, targetKg: number | null, targetDate: string | null, today = new Date()): TimelineAssessment {
  if (!targetKg || targetKg === currentKg) {
    return { status: 'not_applicable', weeks: null, kgPerWeek: null, pctPerWeek: null, suggestedWeeks: null, suggestedDate: null, suggestedKgPerWeek: null, message: 'Sem meta de peso definida.' };
  }
  const losing = targetKg < currentKg;
  const delta = Math.abs(currentKg - targetKg);
  const sustainablePct = losing ? 0.0075 : 0.0025;
  const suggestedWeeks = Math.ceil(delta / (currentKg * sustainablePct));
  const suggestedDate = addDays(toISODate(today), suggestedWeeks * 7);
  const suggestedKgPerWeek = round(delta / suggestedWeeks, 2);
  const recommendation = `Prazo recomendado: ${formatDateBR(suggestedDate)} (cerca de ${suggestedWeeks} semanas, ~${String(suggestedKgPerWeek).replace('.', ',')} kg/semana).`;
  const suggestion = { suggestedWeeks, suggestedDate, suggestedKgPerWeek };
  if (!targetDate) {
    return { status: 'not_applicable', weeks: null, kgPerWeek: null, pctPerWeek: null, ...suggestion, message: `Sem prazo definido. ${recommendation}` };
  }
  const days = daysBetween(today, parseISODate(targetDate));
  if (days <= 0) {
    return { status: 'unsafe', weeks: 0, kgPerWeek: null, pctPerWeek: null, ...suggestion, message: `O prazo informado já passou. ${recommendation}` };
  }
  const weeks = days / 7;
  const kgPerWeek = delta / weeks;
  const pctPerWeek = (kgPerWeek / currentKg) * 100;
  const limits = losing ? { ok: 1, aggressive: 1.5 } : { ok: 0.5, aggressive: 1 };
  let status: TimelineAssessment['status'] = 'ok';
  let message = `Ritmo de ${round(kgPerWeek, 2)} kg/semana (${round(pctPerWeek, 2)}% do peso) — dentro de uma faixa considerada sustentável.`;
  if (pctPerWeek > limits.aggressive) {
    status = 'unsafe';
    message = `O prazo exigiria ${round(kgPerWeek, 2)} kg/semana (${round(pctPerWeek, 1)}% do peso), acima do recomendado. ${recommendation} Prazos menores, só com acompanhamento profissional.`;
  } else if (pctPerWeek > limits.ok) {
    status = 'aggressive';
    message = `Prazo agressivo: ${round(kgPerWeek, 2)} kg/semana (${round(pctPerWeek, 1)}% do peso). ${recommendation} Esse ritmo tende a preservar melhor a massa muscular.`;
  }
  return { status, weeks: round(weeks, 1), kgPerWeek: round(kgPerWeek, 2), pctPerWeek: round(pctPerWeek, 2), ...suggestion, message };
}

export function calculateGoals(input: GoalInput): GoalCalculation {
  const p = input.profile;
  const today = input.today ?? new Date();
  const flags = new Set(p.health_flags ?? []);
  const missingData: string[] = [];
  const age = p.birth_date ? ageOn(p.birth_date, today) : null;
  if (!p.current_weight_kg) missingData.push('peso atual');
  if (!p.height_cm) missingData.push('altura');
  if (!p.birth_date) missingData.push('data de nascimento');
  if (!p.sex) missingData.push('sexo biológico (usado nas equações)');
  if (!p.activity_level) missingData.push('nível de atividade');

  const bmrResult = estimateBmr({
    weight_kg: p.current_weight_kg,
    height_cm: p.height_cm,
    age,
    sex: p.sex,
    fat_free_mass_kg: input.latestFatFreeMassKg ?? null,
  });
  const tdeeResult = bmrResult && p.activity_level ? estimateTdee(bmrResult.kcal, p.activity_level) : null;
  const objective: Objective = p.objective ?? 'maintenance';
  const sessions = p.strength_sessions_per_week ?? null;
  const rt = sessions !== null ? sessions > 0 : Boolean(p.does_resistance_training);
  const activity = suggestActivityLevel(p.activity_level, sessions, p.strength_session_min ?? null);
  const lowCarb = (p.food_restrictions ?? []).some((r) => /low carb/i.test(r));

  // Energia
  let energy: GoalTarget;
  if (!bmrResult || !tdeeResult) {
    energy = target(null, `Não foi possível estimar: faltam ${missingData.join(', ')}.`);
  } else if ([...flags].some((f) => NO_AUTOMATIC_DEFICIT.includes(f))) {
    energy = target(null, `Gasto estimado de referência: ${Math.round(tdeeResult.kcal)} kcal/dia. Não sugerimos meta automática para a condição informada.`, {
      warnings: ['Gestação, amamentação ou histórico de transtorno alimentar exigem meta definida por profissional de saúde.'],
    });
  } else {
    const c = calorieTarget(tdeeResult.kcal, bmrResult.kcal, objective, p.sex);
    const warnings = [...c.warnings, ...(activity?.incoherent ? [`${activity.reason} Ajuste em Perfil › Atividade.`] : [])];
    energy = target(c.kcal, `${bmrResult.explanation} ${tdeeResult.explanation} ${c.explanation}`, { warnings: warnings.length ? warnings : undefined });
  }

  // Peso de referência
  const ref = p.current_weight_kg ? referenceWeight(p.current_weight_kg, p.height_cm) : null;

  // Proteína
  let protein: GoalTarget;
  if (!ref) {
    protein = target(null, 'Informe o peso para estimar a meta proteica.');
  } else if ([...flags].some((f) => PROFESSIONAL_ONLY_PROTEIN.includes(f))) {
    protein = target(null, 'Meta proteica não calculada automaticamente devido à condição de saúde informada.', {
      warnings: ['Condições renais ou hepáticas exigem meta proteica definida por médico ou nutricionista. Não aumente a proteína sem orientação.'],
    });
  } else {
    const pf = proteinFactor(objective, rt);
    const base = proteinBase(p.protein_basis ?? 'reference', ref, p.current_weight_kg!, p.height_cm, input.latestFatFreeMassKg ?? null);
    const custom = validProteinFactor(p.protein_g_per_kg);
    const factor = custom ?? pf.factor;
    const grams = Math.round(base.kg * factor);
    const warnings = [...base.warnings];
    if (custom !== null && (custom < pf.range[0] || custom > pf.range[1])) {
      warnings.push(`${formatFactor(custom)} g/kg está fora da faixa usual para o objetivo (${formatFactor(pf.range[0])}–${formatFactor(pf.range[1])} g/kg${rt ? ', com treino de força' : ''}).`);
    }
    const origin = custom !== null ? `Padrão escolhido por você: ${formatFactor(custom)} g/kg.` : `Padrão do app para o objetivo: ${formatFactor(pf.factor)} g/kg.`;
    protein = target(
      grams,
      `${base.explanation} ${origin} ${formatFactor(factor)} g/kg × ${ptNum(base.kg)} kg = ${grams} g/dia (faixa usual para o objetivo: ${formatFactor(pf.range[0])}–${formatFactor(pf.range[1])} g/kg${rt ? ', com treino de força' : ''}).`,
      { range: [Math.round(base.kg * pf.range[0]), Math.round(base.kg * pf.range[1])], warnings: warnings.length ? warnings : undefined },
    );
  }

  // Gorduras e carboidratos dependem da energia
  let fat: GoalTarget;
  let carbs: GoalTarget;
  if (energy.value && ref && lowCarb) {
    // Low carb moderado: 100–130 g/dia (~25% das calorias); a gordura completa as calorias
    const proteinKcal = (protein.value ?? Math.round(ref.kg * 1.2)) * 4;
    const carbsG = Math.round(Math.min(LOW_CARB_RANGE[1], Math.max(LOW_CARB_RANGE[0], (energy.value * 0.25) / 4)));
    const fatMin = ref.kg * 0.6;
    const fatG = Math.round(Math.max(fatMin, (energy.value - proteinKcal - carbsG * 4) / 9));
    const carbWarnings = flags.has('diabetes') ? ['Com diabetes, reduzir carboidratos pode exigir ajuste de medicação: combine com seu médico.'] : [];
    carbs = target(carbsG, `Low carb moderado (marcado em Alimentação): ~25% das calorias, dentro de ${LOW_CARB_RANGE[0]}–${LOW_CARB_RANGE[1]} g/dia = ${carbsG} g. Abaixo de 50 g/dia (cetogênica) só com acompanhamento.`, {
      range: [...LOW_CARB_RANGE],
      warnings: carbWarnings.length ? carbWarnings : undefined,
    });
    const fatPct = Math.round(((fatG * 9) / energy.value) * 100);
    fat = target(fatG, `Calorias restantes após proteínas e carboidratos: (${energy.value} − ${proteinKcal} − ${carbsG * 4}) ÷ 9 kcal/g = ${fatG} g (~${fatPct}% das calorias), mínimo de 0,6 g/kg de referência. Prefira azeite, castanhas, ovos e peixes.`, {
      range: [Math.round((energy.value * 0.3) / 9), Math.round((energy.value * 0.45) / 9)],
    });
  } else if (energy.value && ref) {
    const fatByPct = (energy.value * 0.28) / 9;
    const fatMin = ref.kg * 0.6;
    const fatG = Math.round(Math.max(fatByPct, fatMin));
    fat = target(fatG, `≈ 28% das calorias (${Math.round(fatByPct)} g), respeitando o mínimo de 0,6 g/kg de referência (${Math.round(fatMin)} g).`, {
      range: [Math.round((energy.value * 0.2) / 9), Math.round((energy.value * 0.35) / 9)],
    });
    const proteinKcal = (protein.value ?? Math.round(ref.kg * 1.2)) * 4;
    const carbsG = Math.max(0, Math.round((energy.value - proteinKcal - fatG * 9) / 4));
    const warnings = carbsG < 100 ? ['Carboidratos abaixo de 100 g/dia: considere revisar a meta com um profissional.'] : undefined;
    carbs = target(carbsG, `Calorias restantes após proteínas e gorduras: (${energy.value} − ${proteinKcal} − ${fatG * 9}) ÷ 4 kcal/g = ${carbsG} g.`, { warnings });
  } else {
    fat = target(null, 'Depende da meta calórica.');
    carbs = target(null, 'Depende da meta calórica.');
  }

  // Fibras: 14 g/1000 kcal (referência IOM), mínimo 25 g
  const fiberG = energy.value ? Math.max(25, Math.round((energy.value / 1000) * 14)) : 25;
  const fiber = target(fiberG, energy.value ? `14 g por 1.000 kcal (${energy.value} kcal), com mínimo de 25 g/dia.` : 'Referência geral mínima de 25 g/dia para adultos.');

  // Água
  let water: GoalTarget;
  const mlPerKg = p.water_ml_per_kg ?? DEFAULT_WATER_ML_PER_KG;
  if ([...flags].some((f) => PROFESSIONAL_ONLY_WATER.includes(f))) {
    water = target(null, 'Meta de líquidos não sugerida automaticamente para a condição informada.', {
      warnings: ['Doença renal ou insuficiência cardíaca podem exigir controle de líquidos: siga a orientação do seu médico.'],
    });
  } else if (!ref) {
    water = target(null, 'Informe o peso para estimar a meta de líquidos.');
  } else {
    const base = ref.kg * mlPerKg;
    const activityExtra = p.activity_level === 'active' || p.activity_level === 'very_active' ? 500 : 0;
    const climateExtra = p.hot_climate ? 500 : 0;
    const ml = Math.round((base + activityExtra + climateExtra) / 50) * 50;
    const parts = [`${mlPerKg} ml/kg × ${ref.kg} kg = ${Math.round(base)} ml`];
    if (activityExtra) parts.push('+500 ml pela atividade física');
    if (climateExtra) parts.push('+500 ml por clima quente');
    water = target(ml, `${parts.join(' ')}. Refere-se a bebidas; a água dos alimentos é contabilizada à parte.`, {
      range: [Math.round(ref.kg * 30), Math.round(ref.kg * 40)],
    });
  }

  return {
    targets: { energy_kcal: energy, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber, water_ml: water },
    bmr: bmrResult,
    tdee: tdeeResult,
    referenceWeight: ref,
    activity,
    missingData,
  };
}

/**
 * Aplica um novo cálculo do sistema sobre as metas atuais, preservando metas
 * definidas pelo usuário e, sobretudo, as prescritas por profissional.
 */
export function mergeSystemSuggestions(current: GoalTargets | null, suggested: GoalTargets): GoalTargets {
  if (!current) return suggested;
  const out = { ...current };
  for (const key of GOAL_KEYS) {
    if (current[key]?.origin === 'system' || !current[key]) out[key] = suggested[key];
  }
  return out;
}

/** Define uma meta manualmente. Uma meta profissional só pode ser trocada por outra profissional ou pelo próprio usuário de forma explícita. */
export function setTarget(
  targets: GoalTargets,
  key: GoalKey,
  value: number | null,
  origin: Exclude<GoalOrigin, 'system'>,
  opts: { explanation?: string; professional_name?: string | null; actor: 'user' | 'ai' },
): GoalTargets {
  if (opts.actor === 'ai') {
    throw new Error('A IA não pode alterar metas automaticamente.');
  }
  return {
    ...targets,
    [key]: {
      value,
      origin,
      explanation: opts.explanation ?? (origin === 'professional' ? 'Prescrita por profissional de saúde.' : 'Definida manualmente por você.'),
      professional_name: opts.professional_name ?? null,
    },
  };
}

export interface Progress {
  target: number | null;
  consumed: number | null; // null = sem registros
  pct: number | null;
  remaining: number | null;
  exceeded: boolean;
}

/** Meta × consumido. `consumed = null` representa ausência de registros, não zero. */
export function progress(targetValue: number | null, consumed: number | null): Progress {
  if (consumed === null) {
    return { target: targetValue, consumed: null, pct: null, remaining: targetValue, exceeded: false };
  }
  if (!targetValue) return { target: targetValue, consumed, pct: null, remaining: null, exceeded: false };
  const pct = (consumed / targetValue) * 100;
  return { target: targetValue, consumed, pct, remaining: Math.max(0, targetValue - consumed), exceeded: consumed > targetValue };
}

export function describeActivity(level: Profile['activity_level']): string {
  return level ? ACTIVITY_FACTORS[level].label : 'Não informado';
}
