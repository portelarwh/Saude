import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { confirmAction } from '../../ui/confirm';
import { addDays, formatDateBR } from '../../domain/dates';
import { formatCompounds } from '../../domain/compounds';
import { copyEntries } from '../../domain/entries';
import { planAdherence } from '../../domain/dietPlan';
import { scalePer100, sumNutrients } from '../../domain/nutrients';
import { MEAL_LABELS, MEAL_ORDER, type DiaryEntry, type DietPlan, type MealType, type SavedMeal } from '../../domain/types';
import { describeAmount } from '../../domain/portions';
import { savedMealFromEntries } from '../../domain/savedMeals';
import { useStore } from '../../state/AppProvider';
import { useAllFoods, useCollection, useGoals, useToday } from '../../state/hooks';
import { Badge, Button, Card, Divider, IconButton, ListItem, Notice, Row, Screen, Sheet, T } from '../../ui/components';
import { AmountField } from '../../ui/AmountField';
import { num, SOURCE_LABEL, VERIFICATION_LABEL } from '../../ui/format';
import { useTheme } from '../../ui/theme';

export default function Diary() {
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const [date, setDate] = useState(today);
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', addDays(date, -1)], lte: ['date', date] });
  const plans = useCollection<DietPlan>('diet_plans', { eq: { active: true } });
  const { goalSet } = useGoals();
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const { foods } = useAllFoods();
  const foodById = (id: string) => foods.find((f) => f.id === id);
  const measureOf = (e: DiaryEntry) => (e.origin === 'supplement' ? null : foodById(e.food_id)?.household_measures[0] ?? null);
  const [amount, setAmount] = useState<number | null>(null);

  const dayEntries = entries.data.filter((e) => e.date === date);
  const yesterday = entries.data.filter((e) => e.date === addDays(date, -1));
  const totals = useMemo(() => sumNutrients(dayEntries.map((e) => e.nutrients)), [dayEntries]);
  const plan = plans.data[0] ?? null;
  const adherence = plan ? planAdherence(plan, dayEntries, date) : null;
  const goals = goalSet?.targets;

  const copyFromYesterday = async (meal: MealType) => {
    const src = yesterday.filter((e) => e.meal === meal);
    if (!src.length) return;
    await store.insertMany<DiaryEntry>('diary_entries', copyEntries(src, { date }));
  };

  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const saveAsMeal = async (meal: MealType, list: DiaryEntry[]) => {
    const name = `${MEAL_LABELS[meal]} de ${formatDateBR(date)}`;
    await store.insert<SavedMeal>('saved_meals', savedMealFromEntries(name, list));
    setSavedMsg(`“${name}” salva em Refeições salvas (renomeie lá se quiser).`);
  };

  const saveEdit = async () => {
    if (!editing || !amount || amount <= 0) return;
    await store.update<DiaryEntry>('diary_entries', editing.id, { amount, nutrients: scalePer100(editing.per100_snapshot, amount) });
    setEditing(null);
  };

  const remove = (e: DiaryEntry) =>
    confirmAction('Excluir item', `Remover "${e.food_name}" do diário?`, async () => {
      await store.remove('diary_entries', e.id);
      setEditing(null);
    });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label="Dia anterior" onPress={() => setDate(addDays(date, -1))} />
          <View style={{ alignItems: 'center' }}>
            <T variant="h3">{date === today ? 'Hoje' : formatDateBR(date)}</T>
            {date !== today ? <Button small variant="ghost" title="Voltar para hoje" onPress={() => setDate(today)} /> : null}
          </View>
          <IconButton icon="chevron-forward" label="Próximo dia" onPress={() => setDate(addDays(date, 1))} />
        </Row>

        <Card>
          {dayEntries.length === 0 ? (
            <T variant="small">Sem registros neste dia. A ausência de registro não é contabilizada como consumo zero.</T>
          ) : (
            <Row style={{ justifyContent: 'space-between' }}>
              <Macro label="kcal" value={totals.values.energy_kcal} target={goals?.energy_kcal.value} />
              <Macro label="Proteína" value={totals.values.protein_g} target={goals?.protein_g.value} unit="g" />
              <Macro label="Carbo" value={totals.values.carbs_g} target={goals?.carbs_g.value} unit="g" />
              <Macro label="Gordura" value={totals.values.fat_g} target={goals?.fat_g.value} unit="g" />
            </Row>
          )}
          {totals.missing.energy_kcal > 0 && dayEntries.length ? <T variant="tiny">{`${totals.missing.energy_kcal} item(ns) sem energia informada na fonte: total parcial.`}</T> : null}
        </Card>

        {savedMsg ? <Notice kind="success">{savedMsg}</Notice> : null}
        {adherence ? (
          <Card onPress={() => router.push('/dieta')}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">{plan!.name}</T>
              {plan!.locked ? <Badge label="prescrito" tone="primary" /> : null}
            </Row>
            <T variant="small">{`Adesão hoje: ${adherence.logged} de ${adherence.planned} refeições do plano registradas.`}</T>
          </Card>
        ) : null}

        {MEAL_ORDER.map((meal) => {
          const list = dayEntries.filter((e) => e.meal === meal);
          const t = sumNutrients(list.map((e) => e.nutrients));
          const canCopy = list.length === 0 && yesterday.some((e) => e.meal === meal);
          return (
            <Card key={meal}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{MEAL_LABELS[meal]}</T>
                  {list.length ? <T variant="small">{`${num(t.values.energy_kcal)} kcal · ${num(t.values.protein_g, 1)} g proteína`}</T> : null}
                </View>
                <Row>
                  <Button small variant="secondary" icon="camera-outline" title="Foto" onPress={() => router.push({ pathname: '/colar', params: { date, meal, foto: '1' } })} />
                  <Button small icon="add" title="Adicionar" onPress={() => router.push({ pathname: '/adicionar', params: { date, meal } })} />
                </Row>
              </Row>
              {list.map((e) => (
                <ListItem
                  key={e.id}
                  title={e.food_name}
                  subtitle={`${describeAmount(e.amount, e.unit, measureOf(e))} · ${num(e.nutrients.energy_kcal)} kcal · ${num(e.nutrients.protein_g, 1)} g prot.${e.compounds ? ` · ${formatCompounds(e.compounds)}` : ''}`}
                  onPress={() => {
                    setEditing(e);
                    setAmount(e.amount);
                  }}
                />
              ))}
              {canCopy ? <Button small variant="ghost" icon="copy-outline" title="Repetir de ontem" onPress={() => copyFromYesterday(meal)} /> : null}
              {list.length ? <Button small variant="ghost" icon="bookmark-outline" title="Salvar como refeição" onPress={() => saveAsMeal(meal, list)} /> : null}
            </Card>
          );
        })}

        <Row wrap>
          <Button small variant="secondary" icon="bookmark-outline" title="Refeições salvas" onPress={() => router.push({ pathname: '/refeicoes', params: { date } })} />
          <Button small variant="secondary" icon="nutrition-outline" title="Meus alimentos" onPress={() => router.push('/meus-alimentos')} />
          <Button small variant="secondary" icon="clipboard-outline" title="Colar do agente" onPress={() => router.push({ pathname: '/colar', params: { date } })} />
          <Button small variant="secondary" icon="book-outline" title="Receitas" onPress={() => router.push('/receitas')} />
          <Button small variant="secondary" icon="document-text-outline" title="Plano alimentar" onPress={() => router.push('/dieta')} />
          <Button small variant="secondary" icon="flask-outline" title="Suplementos" onPress={() => router.push('/suplementos')} />
        </Row>
      </Screen>

      <Sheet visible={Boolean(editing)} onClose={() => setEditing(null)} title="Editar item">
        {editing ? (
          <>
            <T variant="h3">{editing.food_name}</T>
            <Row wrap>
              <Badge label={SOURCE_LABEL[editing.source] ?? editing.source} tone="info" />
              <Badge label={VERIFICATION_LABEL[editing.verification]} tone={editing.verification === 'estimated' ? 'warning' : 'neutral'} />
            </Row>
            <AmountField key={editing.id} unit={editing.unit} value={amount} onChange={setAmount} measures={editing.origin === 'supplement' ? null : foodById(editing.food_id)?.household_measures} />
            {amount ? (
              <T variant="small">{`${num(scalePer100(editing.per100_snapshot, amount).energy_kcal)} kcal · ${num(scalePer100(editing.per100_snapshot, amount).protein_g, 1)} g de proteína`}</T>
            ) : null}
            {editing.origin === 'supplement' ? <Notice kind="info">Para suplementos, prefira registrar novamente pela tela de suplementos para manter as doses.</Notice> : null}
            <Button title="Salvar" onPress={saveEdit} disabled={!amount} />
            <Divider />
            <Button
              variant="secondary"
              icon="copy-outline"
              title="Copiar para amanhã"
              onPress={async () => {
                await store.insertMany<DiaryEntry>('diary_entries', copyEntries([editing], { date: addDays(editing.date, 1) }));
                setEditing(null);
              }}
            />
            <Button variant="danger" icon="trash-outline" title="Excluir" onPress={() => remove(editing)} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

function Macro({ label, value, target, unit = '' }: { label: string; value: number; target?: number | null; unit?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 2 }}>
      <T variant="h3">{`${num(value)}${unit}`}</T>
      <T variant="tiny">{target ? `de ${num(target)}${unit}` : 'sem meta'}</T>
      <T variant="tiny" color={colors.textSecondary}>{label}</T>
    </View>
  );
}

