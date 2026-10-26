/**
 * "Como você está hoje?" — registro de inchaço e o que pode ter contribuído,
 * a partir dos registros das últimas 48 h. Não diagnostica: aponta hábitos
 * possíveis, dá dicas gerais e sempre mostra os sinais de alerta.
 * Sódio: OMS recomenda menos de 2.000 mg/dia (≈ 5 g de sal).
 */
import type { CreatineStatus } from './creatine';
import { addDays } from './dates';
import { normalizeText } from './foodSearch';
import { sumNutrients } from './nutrients';
import type { DiaryEntry, ISODate, WaterLog } from './types';

export type WellbeingKind = 'ok' | 'bloating' | 'fluid_retention';
export type Intensity = 1 | 2 | 3;

export const WELLBEING_LABELS: Record<WellbeingKind, string> = {
  ok: 'Bem',
  bloating: 'Barriga estufada',
  fluid_retention: 'Retenção de líquido',
};
export const INTENSITY_LABELS: Record<Intensity, string> = { 1: 'leve', 2: 'moderada', 3: 'forte' };

export const SODIUM_LIMIT_MG = 2000;

export const RED_FLAGS: Record<Exclude<WellbeingKind, 'ok'>, string[]> = {
  fluid_retention: [
    'Inchaço em uma perna só, com dor, calor ou vermelhidão.',
    'Falta de ar, dor no peito ou cansaço fora do comum.',
    'Inchaço no rosto, lábios ou língua, ou dificuldade para engolir ou respirar.',
    'Urinar muito pouco, ou inchaço que piora rápido.',
    'Gestação com inchaço súbito, dor de cabeça forte ou visão embaçada.',
  ],
  bloating: [
    'Dor forte na barriga, febre ou vômitos.',
    'Sangue nas fezes, ou ficar sem evacuar e sem eliminar gases.',
    'Barriga inchada que não melhora por semanas, ou perda de peso sem explicação.',
  ],
};

export interface Contributor {
  id: 'sodium' | 'low_water' | 'carb_rebound' | 'creatine' | 'alcohol' | 'processed' | 'carbonated' | 'fiber_jump' | 'gassy_foods' | 'lactose';
  title: string;
  detail: string;
}

export interface SwellingInput {
  kind: Exclude<WellbeingKind, 'ok'>;
  date: ISODate;
  /** Registros do diário dos últimos dias (pelo menos 5, para comparar). */
  entries: DiaryEntry[];
  waterLogs: WaterLog[];
  /** Total contado de líquidos por dia e a meta (null = sem meta). */
  water: { date: ISODate; counted_ml: number; goal_ml: number | null }[];
  creatine: CreatineStatus | null;
  sex: 'female' | 'male' | null;
  intolerances: string[];
}

export interface SwellingAnalysis {
  contributors: Contributor[];
  tips: string[];
  notes: string[];
  redFlags: string[];
}

const ALCOHOL = /\b(cerveja|chope|vinho|cachaca|aguardente|vodka|whisky|caipirinha|espumante|drink)\b/;
const PROCESSED = /\b(presunto|salsicha|mortadela|salame|bacon|linguica|peito de peru|nuggets?|instantaneo|miojo|salgadinho|batata frita|pizza|hamburguer|empanado|tempero pronto|caldo|shoyu|embutido)\b/;
const GASSY = /\b(feijao|grao de bico|lentilha|ervilha|repolho|brocolis|couve flor|cebola|batata doce)\b/;
const DAIRY = /\b(leite|queijo|iogurte|requeijao|creme de leite|sorvete)\b/;
const fmtDate = (d: ISODate) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');

export function analyzeSwelling(input: SwellingInput): SwellingAnalysis {
  const { kind, date } = input;
  const recentDays = [addDays(date, -1), date];
  const priorDays = [addDays(date, -4), addDays(date, -3), addDays(date, -2)];
  const dayEntries = (d: ISODate) => input.entries.filter((e) => e.date === d);
  const recent = input.entries.filter((e) => recentDays.includes(e.date));
  const names = recent.map((e) => normalizeText(e.food_name));
  const contributors: Contributor[] = [];

  // sódio (só o que tem valor informado; parcial é avisado)
  for (const d of recentDays) {
    const t = sumNutrients(dayEntries(d).map((e) => e.nutrients));
    if (t.values.sodium_mg > SODIUM_LIMIT_MG) {
      contributors.push({
        id: 'sodium',
        title: 'Sódio alto',
        detail: `${n0(t.values.sodium_mg)} mg de sódio em ${fmtDate(d)} (referência da OMS: menos de ${n0(SODIUM_LIMIT_MG)} mg/dia)${t.missing.sodium_mg ? `; ${t.missing.sodium_mg} item(ns) sem sódio informado, o total real pode ser maior` : ''}.`,
      });
      break;
    }
  }

  if (kind === 'fluid_retention') {
    const low = input.water.filter((w) => recentDays.includes(w.date) && w.goal_ml && w.counted_ml < w.goal_ml * 0.7);
    if (low.length) {
      const w = low[low.length - 1];
      contributors.push({ id: 'low_water', title: 'Pouca água', detail: `${n0(w.counted_ml)} ml de ${n0(w.goal_ml!)} ml em ${fmtDate(w.date)}. Beber pouco pode fazer o corpo segurar mais líquido.` });
    }
    const carbs = (d: ISODate) => (dayEntries(d).length ? sumNutrients(dayEntries(d).map((e) => e.nutrients)).values.carbs_g : null);
    const prior = priorDays.map(carbs).filter((v): v is number => v !== null);
    const priorAvg = prior.length >= 2 ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
    const recentMax = Math.max(...recentDays.map((d) => carbs(d) ?? 0));
    if (priorAvg !== null && priorAvg < 110 && recentMax > 150 && recentMax > priorAvg * 1.5) {
      contributors.push({ id: 'carb_rebound', title: 'Mais carboidrato depois de dias com pouco', detail: `Média de ${n0(priorAvg)} g/dia antes e ${n0(recentMax)} g recentemente: o corpo guarda cerca de 3 g de água para cada grama de carboidrato armazenado. Passa em poucos dias.` });
    }
    if (input.creatine?.recentStart && input.creatine.startedOn) {
      contributors.push({ id: 'creatine', title: 'Início da creatina', detail: `Você começou em ${fmtDate(input.creatine.startedOn)}. Nas primeiras semanas a creatina leva água para dentro do músculo (1–2 kg); não é gordura nem inchaço sob a pele.` });
    }
    const processed = names.filter((n) => PROCESSED.test(n));
    if (processed.length >= 2) {
      contributors.push({ id: 'processed', title: 'Industrializados e embutidos', detail: `${processed.length} itens nas últimas 48 h (ex.: ${recent.find((e) => PROCESSED.test(normalizeText(e.food_name)))!.food_name}). Costumam ter muito sódio.` });
    }
  }

  const alcohol = recent.filter((e) => ALCOHOL.test(normalizeText(e.food_name)));
  if (alcohol.length) contributors.push({ id: 'alcohol', title: 'Bebida alcoólica', detail: `${alcohol[0].food_name} nas últimas 48 h: álcool desidrata e costuma vir com petiscos salgados.` });

  if (kind === 'bloating') {
    const soda = input.waterLogs.filter((l) => recentDays.includes(l.date) && (l.beverage === 'soda' || l.beverage === 'sparkling_water'));
    if (soda.length || names.some((n) => /refrigerante|agua com gas|cerveja/.test(n))) {
      contributors.push({ id: 'carbonated', title: 'Bebidas com gás', detail: 'Refrigerante, água com gás e cerveja aumentam os gases na barriga.' });
    }
    const fiber = (d: ISODate) => (dayEntries(d).length ? sumNutrients(dayEntries(d).map((e) => e.nutrients)).values.fiber_g : null);
    const prior = priorDays.map(fiber).filter((v): v is number => v !== null);
    const priorAvg = prior.length >= 2 ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
    const recentMax = Math.max(...recentDays.map((d) => fiber(d) ?? 0));
    if (priorAvg !== null && recentMax > 25 && recentMax > priorAvg * 1.5) {
      contributors.push({ id: 'fiber_jump', title: 'Fibras aumentaram de repente', detail: `De ~${n0(priorAvg)} g para ${n0(recentMax)} g por dia. Aumentar aos poucos, com água, evita gases.` });
    }
    const gassy = recent.filter((e) => GASSY.test(normalizeText(e.food_name)));
    if (gassy.length >= 2) contributors.push({ id: 'gassy_foods', title: 'Alimentos que fermentam', detail: `Ex.: ${[...new Set(gassy.map((e) => e.food_name))].slice(0, 3).join('; ')}. Feijão de molho (trocando a água) e porções menores ajudam.` });
    if (input.intolerances.some((i) => /lactose/i.test(i)) && names.some((n) => DAIRY.test(n))) {
      contributors.push({ id: 'lactose', title: 'Laticínios com intolerância à lactose', detail: 'Você informou intolerância à lactose e registrou laticínios nas últimas 48 h.' });
    }
  }

  const tips =
    kind === 'fluid_retention'
      ? [
          'Mantenha a água em dia — beber menos não reduz a retenção.',
          'Prefira comida caseira com temperos naturais (alho, cebola, ervas, limão) e confira o sódio nos rótulos.',
          'Inclua potássio: frutas, verduras, legumes e feijão.',
          'Movimente-se: caminhe e mexa as pernas a cada hora se ficar muito tempo sentado ou em pé.',
          'Deixe as pernas elevadas por 15–20 minutos no fim do dia.',
          'Compare com 2–3 dias de registros: oscilações de 1–2 kg na balança costumam ser água.',
        ]
      : [
          'Coma devagar e mastigue bem; evite falar muito comendo e usar canudo ou chiclete.',
          'Reduza refrigerante e bebidas com gás.',
          'Aumente as fibras aos poucos e beba água junto.',
          'Deixe o feijão de molho e troque a água antes de cozinhar.',
          'Uma caminhada leve depois das refeições ajuda a digestão.',
        ];
  const notes = kind === 'fluid_retention' && input.sex === 'female' ? ['Para mulheres, a retenção costuma aumentar nos dias antes da menstruação.'] : [];
  if (!input.entries.some((e) => recentDays.includes(e.date))) notes.push('Sem refeições registradas nas últimas 48 h: registrar ajuda a identificar o que influencia.');
  return { contributors, tips, notes, redFlags: RED_FLAGS[kind] };
}
