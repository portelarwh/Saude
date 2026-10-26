/**
 * Editar refeição salva: nome, quantidade de cada item (g/ml ou porções),
 * remover e adicionar itens da base. Os valores por 100 g/ml de cada item
 * continuam os da fonte original.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { searchFoods } from '../../domain/foodSearch';
import { foodToSavedItem, removeSavedItem, savedMealTotals, setSavedItemAmount } from '../../domain/savedMeals';
import { MEAL_LABELS, MEAL_ORDER, type MealType, type SavedMeal, type SavedMealItem } from '../../domain/types';
import { useStore } from '../../state/AppProvider';
import { useAllFoods, useCollection } from '../../state/hooks';
import { AmountField } from '../../ui/AmountField';
import { Badge, Button, Card, ChipSelect, Field, ListItem, Notice, Row, Screen, T } from '../../ui/components';
import { num } from '../../ui/format';

export default function EditSavedMeal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useCollection<SavedMeal>('saved_meals');
  const meal = list.data.find((m) => m.id === id);
  if (list.loading) return <Screen><T>Carregando…</T></Screen>;
  if (!meal) return <Screen><Notice kind="error">Refeição não encontrada.</Notice></Screen>;
  return <Editor key={meal.id} meal={meal} />;
}

function Editor({ meal }: { meal: SavedMeal }) {
  const router = useRouter();
  const store = useStore();
  const { foods } = useAllFoods();
  const [name, setName] = useState(meal.name);
  const [type, setType] = useState<MealType | null>(meal.meal);
  const [items, setItems] = useState<SavedMealItem[]>(meal.items);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hits = useMemo(() => (q.trim().length >= 2 ? searchFoods(foods, q, 8) : []), [foods, q]);
  const totals = savedMealTotals({ items });
  const measureOf = (it: SavedMealItem) => (it.food_id ? foods.find((f) => f.id === it.food_id)?.household_measures[0] ?? null : null);

  const run = (fn: () => void) => {
    try {
      setError(null);
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    if (!name.trim()) return setError('Dê um nome à refeição.');
    await store.update<SavedMeal>('saved_meals', meal.id, { name: name.trim(), meal: type, items });
    router.back();
  };

  return (
    <Screen>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Card>
        <Field label="Nome" value={name} onChangeText={setName} />
        <ChipSelect<MealType> label="Refeição" options={MEAL_ORDER.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={type} onChange={setType} />
      </Card>
      <Card>
        <T variant="h3">Itens</T>
        {items.map((it, i) => (
          <View key={`${it.food_name}-${i}`} style={{ gap: 4, paddingVertical: 4 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <T variant="label" style={{ flex: 1 }}>{it.food_name}</T>
              {it.source === 'ai_estimate' ? <Badge label="estimativa" tone="warning" /> : null}
              <Button small variant="ghost" icon="trash-outline" title="Remover" onPress={() => run(() => setItems((cur) => removeSavedItem(cur, i)))} />
            </Row>
            <AmountField label="Quantidade" unit={it.unit} value={it.amount} measure={measureOf(it)} onChange={(v) => run(() => setItems((cur) => setSavedItemAmount(cur, i, v)))} />
          </View>
        ))}
        <Field label="Adicionar item" value={q} onChangeText={setQ} placeholder="Busque um alimento" />
        {hits.map(({ food }) => (
          <ListItem
            key={food.id}
            title={food.name}
            subtitle={`${num(food.per100.energy_kcal)} kcal/100 ${food.base_unit}`}
            onPress={() => {
              setItems((cur) => [...cur, foodToSavedItem(food, food.household_measures[0]?.amount ?? 100)]);
              setQ('');
            }}
          />
        ))}
      </Card>
      <Card>
        <T variant="small">{`Total: ${num(totals.values.energy_kcal)} kcal · ${num(totals.values.protein_g, 1)} g proteína · ${num(totals.values.carbs_g, 1)} g carbo · ${num(totals.values.fat_g, 1)} g gordura`}</T>
        {totals.missing.energy_kcal ? <T variant="tiny">{`${totals.missing.energy_kcal} item(ns) sem calorias informadas: total parcial.`}</T> : null}
      </Card>
      <Button title="Salvar alterações" icon="checkmark" onPress={save} />
    </Screen>
  );
}
