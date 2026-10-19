/**
 * Monta o resumo dos dados do usuário enviado ao chat (com autorização).
 * Inclui apenas o necessário e rotula a origem de cada número.
 * Também oferece respostas determinísticas para perguntas frequentes quando a
 * IA não está disponível (modo local ou sem consentimento).
 */
import { compareAssessments, interpret } from '../domain/bodyComposition';
import { addDays, ageOn } from '../domain/dates';
import { summarizeDay } from '../domain/daySummary';
import { planNutrition } from '../domain/dietPlan';
import { GOAL_KEYS, ORIGIN_LABELS } from '../domain/goals';
import { sumNutrients } from '../domain/nutrients';
import { weeklyActivity, weekStart } from '../domain/activities';
import { MEAL_LABELS, MEAL_ORDER, type ActivityLog, type BodyAssessment, type DiaryEntry, type DietPlan, type Food, type GoalSet, type Profile, type WaterLog } from '../domain/types';

export interface ContextInput {
  today: string;
  profile: Profile | null;
  goalSet: GoalSet | null;
  entries: DiaryEntry[]; // últimos 7 dias
  waterLogs: WaterLog[];
  activities: ActivityLog[];
  assessments: BodyAssessment[]; // ordem cronológica
  plan: DietPlan | null;
  supplements: Food[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function buildAiContext(i: ContextInput): Record<string, unknown> {
  const p = i.profile;
  const goals = i.goalSet?.targets ?? null;
  const day = summarizeDay({ date: i.today, entries: i.entries, waterLogs: i.waterLogs, activities: i.activities, goals });
  const last7 = Array.from({ length: 7 }, (_, k) => addDays(i.today, -k)).map((d) => {
    const list = i.entries.filter((e) => e.date === d);
    if (!list.length) return { data: d, registro: 'sem registro (não significa consumo zero)' };
    const t = sumNutrients(list.map((e) => e.nutrients));
    return { data: d, kcal: Math.round(t.values.energy_kcal), proteina_g: r1(t.values.protein_g), refeicoes_registradas: new Set(list.map((e) => e.meal)).size };
  });
  const recent = i.assessments.slice(-3);
  let comparacao: unknown = null;
  if (recent.length >= 2) {
    const c = compareAssessments(recent[recent.length - 2], recent[recent.length - 1]);
    const it = interpret(c);
    comparacao = { de: c.fromDate, para: c.toDate, dias: c.days, mudancas: c.changes.map((x) => ({ indicador: x.label, de: x.from, para: x.to, unidade: x.unit, variacao: x.abs, pontos_percentuais: x.pp, direcao: x.direction })), resumo_do_app: it.summary, ressalvas: it.caveats };
  }
  return {
    observacao: 'Dados registrados pelo usuário e cálculos do app. Ausência de registro não é consumo zero.',
    data_de_hoje: i.today,
    perfil: p
      ? {
          primeiro_nome: p.name.split(' ')[0],
          idade: p.birth_date ? ageOn(p.birth_date) : null,
          sexo_biologico: p.sex,
          altura_cm: p.height_cm,
          peso_atual_kg: p.current_weight_kg,
          peso_desejado_kg: p.target_weight_kg,
          objetivo: p.objective,
          nivel_atividade: p.activity_level,
          treino_de_forca: p.does_resistance_training,
          restricoes: p.food_restrictions,
          alergias: p.allergies,
          intolerancias: p.intolerances,
          preferencias: p.food_preferences,
          condicoes_de_saude: p.health_flags,
          observacoes_de_saude: p.settings?.ai_include_health_notes ? p.health_notes : 'não compartilhadas',
          orientacoes_profissionais: p.professional_guidance,
          horarios: { acorda: p.wake_time, dorme: p.sleep_time, refeicoes: p.meal_times },
        }
      : null,
    metas: goals
      ? Object.fromEntries(GOAL_KEYS.map((k) => [k, { valor: goals[k].value, origem: ORIGIN_LABELS[goals[k].origin], como_foi_calculada: goals[k].explanation }]))
      : 'metas não definidas',
    hoje: {
      tem_registros: day.hasFoodRecords,
      consumido: day.hasFoodRecords ? { kcal: Math.round(day.totals.values.energy_kcal), proteina_g: r1(day.totals.values.protein_g), carboidratos_g: r1(day.totals.values.carbs_g), gorduras_g: r1(day.totals.values.fat_g), fibras_g: r1(day.totals.values.fiber_g) } : null,
      totais_parciais: day.partial,
      por_refeicao: MEAL_ORDER.filter((m) => day.byMeal[m]).map((m) => ({
        refeicao: MEAL_LABELS[m],
        itens: i.entries.filter((e) => e.date === i.today && e.meal === m).map((e) => `${e.food_name} ${Math.round(e.amount)} ${e.unit}`),
        kcal: Math.round(day.byMeal[m]!.values.energy_kcal),
        proteina_g: r1(day.byMeal[m]!.values.protein_g),
      })),
      proteina_restante_g: day.protein.remaining,
      agua: { registrado_ml: day.hydration.counted_ml, meta_ml: day.hydration.goal_ml, restante_ml: day.hydration.remaining_ml, registros: day.hydration.logs },
      compostos: day.compounds,
    },
    ultimos_7_dias: last7,
    atividade_semana: weeklyActivity(i.activities, weekStart(i.today)),
    suplementos_cadastrados: i.supplements.map((s) => ({ nome: [s.name, s.brand, s.flavor].filter(Boolean).join(' '), categoria: s.supplement_category, dose: `${s.serving_size} ${s.base_unit}`, proteina_por_dose_g: s.serving_size && s.per100.protein_g != null ? r1((s.per100.protein_g * s.serving_size) / 100) : null, compostos_por_dose: s.compounds_per_serving })),
    avaliacoes_corporais: recent.map((a) => ({ data: a.measured_at, equipamento: [a.device_manufacturer, a.device_model].filter(Boolean).join(' ') || null, indicadores: a.metrics })),
    comparacao_ultimas_avaliacoes: comparacao,
    plano_alimentar: i.plan
      ? {
          nome: i.plan.name,
          prescrito_por_profissional: i.plan.origin === 'professional',
          bloqueado_para_alteracoes: i.plan.locked,
          refeicoes: i.plan.meals.map((m) => ({ nome: m.name, horario: m.time, opcoes: m.options.map((o) => o.items.map((it) => `${it.food_name}${it.amount ? ` ${it.amount} ${it.unit ?? ''}` : ''}`).join(', ')) })),
          total_estimado_kcal: Math.round(planNutrition(i.plan).total.values.energy_kcal),
        }
      : null,
  };
}

export const SUGGESTED_QUESTIONS = [
  'Quanto de proteína falta hoje?',
  'O que posso jantar para atingir minha meta?',
  'Estou comendo pouco durante a manhã?',
  'Qual foi minha evolução de massa de gordura?',
  'Compare minhas últimas três bioimpedâncias.',
  'Como posso distribuir minha proteína ao longo do dia?',
  'Qual opção tem mais proteína: frango ou carne moída?',
  'Como posso melhorar minha alimentação sem passar fome?',
  'Minha dieta atual está adequada ao objetivo informado?',
  'Monte um cardápio com o que tenho na geladeira.',
];

/** Respostas determinísticas (sem IA) para perguntas frequentes. */
export function localAnswer(question: string, i: ContextInput, foods: Food[]): string | null {
  const q = question.toLowerCase();
  const goals = i.goalSet?.targets ?? null;
  const day = summarizeDay({ date: i.today, entries: i.entries, waterLogs: i.waterLogs, activities: i.activities, goals });
  if (/prote[ií]na/.test(q) && /falta|restante|quanto/.test(q)) {
    if (!day.hasFoodRecords) return 'Você ainda não registrou refeições hoje, então não há como calcular o restante (ausência de registro não é consumo zero).';
    if (!goals?.protein_g.value) return `Hoje você registrou ${r1(day.totals.values.protein_g)} g de proteína. Defina uma meta proteica para ver quanto falta.`;
    const rest = day.protein.remaining ?? 0;
    return rest > 0
      ? `Você registrou ${r1(day.totals.values.protein_g)} g de ${goals.protein_g.value} g (${ORIGIN_LABELS[goals.protein_g.origin].toLowerCase()}). Faltam aproximadamente ${Math.round(rest)} g.`
      : `Meta de proteína atingida: ${r1(day.totals.values.protein_g)} g de ${goals.protein_g.value} g.`;
  }
  if (/[aá]gua|hidrata/.test(q) && /falta|quanto|restante/.test(q)) {
    if (!day.hydration.logs) return 'Nenhum líquido registrado hoje.';
    return `Você registrou ${day.hydration.counted_ml} ml${day.hydration.goal_ml ? ` de ${day.hydration.goal_ml} ml; faltam ${day.hydration.remaining_ml} ml` : ''}.`;
  }
  if (/manh[ãa]/.test(q)) {
    const days = Array.from({ length: 7 }, (_, k) => addDays(i.today, -k)).filter((d) => i.entries.some((e) => e.date === d));
    if (!days.length) return 'Não há registros nos últimos 7 dias para avaliar as manhãs.';
    const morning = days.map((d) => sumNutrients(i.entries.filter((e) => e.date === d && (e.meal === 'breakfast' || e.meal === 'morning_snack')).map((e) => e.nutrients)));
    const avgK = morning.reduce((s, t) => s + t.values.energy_kcal, 0) / days.length;
    const avgP = morning.reduce((s, t) => s + t.values.protein_g, 0) / days.length;
    return `Nos ${days.length} dias com registro, café da manhã + lanche da manhã somaram em média ${Math.round(avgK)} kcal e ${r1(avgP)} g de proteína${goals?.protein_g.value ? ` (${Math.round((avgP / goals.protein_g.value) * 100)}% da meta proteica diária)` : ''}.`;
  }
  if (/gordura/.test(q) && /evolu|massa/.test(q)) {
    const pts = i.assessments.filter((a) => a.metrics.fat_mass_kg);
    if (pts.length < 2) return 'São necessárias ao menos duas avaliações com massa de gordura para mostrar a evolução.';
    const f = pts[0].metrics.fat_mass_kg!;
    const l = pts[pts.length - 1].metrics.fat_mass_kg!;
    return `Massa de gordura: ${f.value} ${f.unit} → ${l.value} ${l.unit} (${r1(l.value - f.value)} ${l.unit}) entre ${pts[0].measured_at.slice(0, 10)} e ${pts[pts.length - 1].measured_at.slice(0, 10)}, em ${pts.length} avaliações. Lembre que hidratação e equipamento influenciam a leitura.`;
  }
  const versus = q.match(/(?:mais prote[ií]na)[:\s]*([\p{L} ]+?)\s+ou\s+([\p{L} ]+)\??$/u);
  if (versus) {
    const pick = (term: string) => foods.find((f) => f.aliases.some((a) => a === term.trim()) || f.name.toLowerCase().startsWith(term.trim()));
    const a = pick(versus[1]);
    const b = pick(versus[2]);
    if (a && b && a.per100.protein_g != null && b.per100.protein_g != null) {
      const winner = a.per100.protein_g >= b.per100.protein_g ? a : b;
      return `Por 100 g (TACO): ${a.name} tem ${a.per100.protein_g} g de proteína e ${a.per100.energy_kcal ?? '—'} kcal; ${b.name} tem ${b.per100.protein_g} g e ${b.per100.energy_kcal ?? '—'} kcal. Mais proteína: ${winner.name}.`;
    }
  }
  return null;
}
