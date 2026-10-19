/**
 * Meu plano alimentar: importar (foto, PDF, texto colado/digitado), gerar
 * proposta orientativa, conferir, ativar e acompanhar a adesão.
 */
import React, { useMemo, useState } from 'react';
import { addDays } from '../domain/dates';
import { planAdherence, planFindings, planNutrition } from '../domain/dietPlan';
import { parseDietText } from '../domain/dietText';
import { generatePlan, proteinDistribution } from '../domain/planGenerator';
import { MEAL_LABELS, type DiaryEntry, type DietPlan, type MealType } from '../domain/types';
import type { NewRow } from '../data/store';
import { aiImportDiet } from '../services/ai';
import { pickDocument, uploadPrivateFile } from '../services/files';
import { dietImportToPlan } from '../services/imports';
import { useApp, useStore } from '../state/AppProvider';
import { useAllFoods, useCollection, useGoals, useProfile, useToday } from '../state/hooks';
import { Badge, Button, Card, Chip, Divider, Field, Notice, Row, Screen, SectionHeader, T, Toggle } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { num } from '../ui/format';

type Draft = { plan: NewRow<DietPlan>; explanations: string[] };

export default function DietScreen() {
  const store = useStore();
  const { mode } = useApp();
  const today = useToday();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const { foods } = useAllFoods();
  const plans = useCollection<DietPlan>('diet_plans', { order: { field: 'created_at', ascending: false } });
  const week = useCollection<DiaryEntry>('diary_entries', { gte: ['date', addDays(today, -6)] });
  const [text, setText] = useState('');
  const [professional, setProfessional] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, number[]>>({});
  const aiReady = mode === 'cloud' && Boolean(profile?.consent_ai_at);
  const goals = goalSet?.targets ?? null;

  const importText = async () => {
    setError(null);
    setBusy(true);
    try {
      const di = aiReady ? await aiImportDiet({ text }) : parseDietText(text);
      setDraft({ plan: dietImportToPlan(di, foods, { professional, sourceFilePath: null }), explanations: aiReady ? [] : ['Lido pelo leitor local (sem IA). Use uma refeição por linha e "OU" entre alternativas.'] });
    } catch (e) {
      setError(`${(e as Error).message} Tentando leitura local…`);
      setDraft({ plan: dietImportToPlan(parseDietText(text), foods, { professional, sourceFilePath: null }), explanations: ['Lido pelo leitor local (sem IA).'] });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    setError(null);
    try {
      const file = await pickDocument();
      if (!file) return;
      setBusy(true);
      const path = await uploadPrivateFile(store.userId, 'dietas', file);
      const di = await aiImportDiet({ storage_path: path });
      setDraft({ plan: dietImportToPlan(di, foods, { professional, sourceFilePath: path }), explanations: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const generate = () => {
    if (!goals || !profile) return setError('Defina suas metas antes de gerar uma proposta.');
    const g = generatePlan(goals, profile, foods);
    setDraft({ plan: g.plan, explanations: g.explanations });
  };

  const saveDraft = async () => {
    if (!draft) return;
    for (const p of plans.data.filter((x) => x.active)) await store.update<DietPlan>('diet_plans', p.id, { active: false });
    await store.insert<DietPlan>('diet_plans', { ...draft.plan, active: true });
    setDraft(null);
    setText('');
  };

  const active = plans.data.find((p) => p.active) ?? null;

  return (
    <Screen>
      {draft ? (
        <>
          <SectionHeader title="Conferir plano" />
          {draft.explanations.map((e) => <Notice key={e} kind="info">{e}</Notice>)}
          {draft.plan.origin !== 'generated' ? (
            <Toggle
              label="Plano prescrito por profissional (bloquear alterações automáticas)"
              value={draft.plan.locked}
              onChange={(v) => setDraft({ ...draft, plan: { ...draft.plan, locked: v, origin: v ? 'professional' : 'imported' } })}
            />
          ) : null}
          <PlanView plan={draft.plan} goals={goals} selection={selection['draft']} onSelect={(sel) => setSelection((s) => ({ ...s, draft: sel }))} />
          <Row>
            <Button title="Salvar e ativar" icon="checkmark" onPress={saveDraft} style={{ flex: 1 }} />
            <Button variant="secondary" title="Descartar" onPress={() => setDraft(null)} />
          </Row>
        </>
      ) : (
        <>
          {active ? (
            <>
              <SectionHeader title="Plano ativo" />
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="h3" style={{ flex: 1 }}>{active.name}</T>
                  {active.locked ? <Badge label="prescrito · bloqueado" tone="primary" /> : <Badge label={active.origin === 'generated' ? 'proposta orientativa' : 'importado'} />}
                </Row>
                {active.professional_name ? <T variant="small">{`Profissional: ${active.professional_name}`}</T> : null}
                <Adherence plan={active} entries={week.data} today={today} />
              </Card>
              <PlanView plan={active} goals={goals} selection={selection[active.id]} onSelect={(sel) => setSelection((s) => ({ ...s, [active.id]: sel }))} />
              {active.notes ? <T variant="small">{active.notes}</T> : null}
              <Row wrap>
                {active.locked ? (
                  <Button small variant="secondary" title="Desbloquear (editar manualmente)" onPress={() => confirmAction('Desbloquear plano', 'Planos prescritos devem ser alterados com seu profissional. Deseja desbloquear?', () => store.update<DietPlan>('diet_plans', active.id, { locked: false }))} />
                ) : null}
                <Button small variant="secondary" title="Desativar" onPress={() => store.update<DietPlan>('diet_plans', active.id, { active: false })} />
                <Button small variant="danger" title="Excluir" onPress={() => confirmAction('Excluir plano', active.name, () => store.remove('diet_plans', active.id))} />
              </Row>
            </>
          ) : null}

          <SectionHeader title="Importar minha dieta" />
          <Card>
            <Toggle label="É um plano prescrito por nutricionista/médico" value={professional} onChange={setProfessional} />
            {aiReady ? <Button icon="document-attach-outline" title="Enviar foto ou PDF do plano" onPress={importFile} loading={busy} /> : null}
            <Field
              label="Ou cole/digite o plano"
              value={text}
              onChangeText={setText}
              multiline
              placeholder={'Café da manhã (07:00): 1 pão francês + 2 ovos OU 1 iogurte e 1 banana\nAlmoço: 4 colheres de sopa de arroz, 1 concha de feijão, 120 g de frango'}
              hint={aiReady ? 'A IA separa refeições, horários, quantidades e alternativas.' : 'Uma refeição por linha; "OU" separa alternativas.'}
            />
            <Button variant="secondary" title="Interpretar texto" onPress={importText} loading={busy} disabled={text.trim().length < 5} />
          </Card>
          <SectionHeader title="Não tenho um plano" />
          <Card>
            <T variant="small">Gere uma proposta orientativa com alimentos brasileiros simples, ajustada às suas metas, restrições e alergias. Não substitui um nutricionista.</T>
            <Button variant="secondary" icon="sparkles-outline" title="Gerar proposta orientativa" onPress={generate} />
            {goals?.protein_g.value ? (
              <T variant="small">{`Distribuição sugerida de proteína: ${Object.entries(proteinDistribution(goals.protein_g.value)).map(([m, g]) => `${MEAL_LABELS[m as MealType]} ${g} g`).join(' · ')}`}</T>
            ) : null}
          </Card>
          {error ? <Notice kind="warning">{error}</Notice> : null}
          {plans.data.filter((p) => !p.active).length ? (
            <Card>
              <T variant="h3">Planos anteriores</T>
              {plans.data.filter((p) => !p.active).map((p) => (
                <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                  <T variant="small" style={{ flex: 1 }}>{p.name}</T>
                  <Button small variant="ghost" title="Ativar" onPress={async () => {
                    if (active) await store.update<DietPlan>('diet_plans', active.id, { active: false });
                    await store.update<DietPlan>('diet_plans', p.id, { active: true });
                  }} />
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Adherence({ plan, entries, today }: { plan: DietPlan; entries: DiaryEntry[]; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const results = days.map((d) => planAdherence(plan, entries, d)).filter((r) => r.planned);
  const withLogs = days.filter((d) => entries.some((e) => e.date === d)).length;
  const avg = results.length ? results.reduce((s, r) => s + (r.pct ?? 0), 0) / results.length : null;
  const todayR = planAdherence(plan, entries, today);
  return (
    <T variant="small">
      {`Hoje: ${todayR.logged}/${todayR.planned} refeições do plano registradas. Últimos 7 dias: ${avg === null ? '—' : `${Math.round(avg)}%`} de adesão (${withLogs} dias com registro; dias sem registro contam como não registrados, não como não cumpridos).`}
    </T>
  );
}

function PlanView({ plan, goals, selection, onSelect }: { plan: Pick<DietPlan, 'meals'>; goals: Parameters<typeof planFindings>[1]; selection?: number[]; onSelect: (sel: number[]) => void }) {
  // seleção de opções apenas para visualização (não altera o plano salvo)
  const meals = useMemo(() => plan.meals.map((m, i) => ({ ...m, selected_option: selection?.[i] ?? m.selected_option })), [plan.meals, selection]);
  const n = planNutrition({ meals });
  const findings = planFindings(n, goals);
  return (
    <>
      <Card>
        <T variant="h3">Total diário (opções selecionadas)</T>
        <T>{`${num(n.total.values.energy_kcal)} kcal · ${num(n.total.values.protein_g, 1)} g proteína · ${num(n.total.values.carbs_g, 1)} g carbo · ${num(n.total.values.fat_g, 1)} g gordura · ${num(n.total.values.fiber_g, 1)} g fibras`}</T>
        <T variant="small">{`Faixa conforme as alternativas escolhidas: ${num(n.range.energy_kcal?.[0])}–${num(n.range.energy_kcal?.[1])} kcal · ${num(n.range.protein_g?.[0])}–${num(n.range.protein_g?.[1])} g proteína`}</T>
        {goals ? <T variant="small">{`Metas: ${num(goals.energy_kcal.value)} kcal · ${num(goals.protein_g.value)} g proteína`}</T> : null}
        {findings.map((f) => <Notice key={f.message} kind={f.level === 'attention' ? 'warning' : 'info'}>{f.message}</Notice>)}
      </Card>
      {n.meals.map((mn, i) => (
        <Card key={i}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">{`${mn.meal.name}${mn.meal.time ? ` · ${mn.meal.time}` : ''}`}</T>
            <T variant="small">{`${num(mn.selected.totals.values.energy_kcal)} kcal · ${num(mn.selected.totals.values.protein_g, 1)} g prot.`}</T>
          </Row>
          {mn.meal.options.length > 1 ? (
            <Row wrap>
              {mn.meal.options.map((o, j) => (
                <Chip key={j} label={o.label} selected={mn.meal.selected_option === j} onPress={() => onSelect(meals.map((m, k) => (k === i ? j : m.selected_option)))} />
              ))}
            </Row>
          ) : null}
          {mn.meal.options[mn.meal.selected_option]?.items.map((it, k) => (
            <T key={k} variant="small">{`• ${it.food_name}${it.amount !== null ? ` — ${num(it.amount, 1)} ${it.unit ?? ''}` : ''}${it.amount_g ? ` (${num(it.amount_g)} g)` : ''}${it.note ? `\n   ${it.note}` : ''}`}</T>
          ))}
          {mn.selected.unresolvedItems ? <T variant="tiny">{`${mn.selected.unresolvedItems} item(ns) sem correspondência ou quantidade: não entram no total.`}</T> : null}
          <Divider />
        </Card>
      ))}
    </>
  );
}
