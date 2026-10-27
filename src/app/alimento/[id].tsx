/** Detalhe do alimento: quantidade, medidas caseiras, nutrientes e fonte. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { formatCompounds } from '../../domain/compounds';
import { buildEntry, buildSupplementEntry } from '../../domain/entries';
import { NUTRIENT_KEYS, NUTRIENT_LABELS, scalePer100 } from '../../domain/nutrients';
import { foodTags } from '../../domain/foodTags';
import { MEAL_LABELS, MEAL_ORDER, type DiaryEntry, type Food, type MealType } from '../../domain/types';
import { useStore } from '../../state/AppProvider';
import { useAllFoods, useCollection, useToday } from '../../state/hooks';
import { AmountField } from '../../ui/AmountField';
import { Badge, Button, Card, ChipSelect, Divider, Loading, Notice, NumberField, Row, Screen, T } from '../../ui/components';
import { confirmAction } from '../../ui/confirm';
import { nutrient, num, SOURCE_LABEL, VERIFICATION_LABEL } from '../../ui/format';

export default function FoodDetail() {
  const params = useLocalSearchParams<{ id: string; date?: string; meal?: MealType }>();
  const { foods, loading } = useAllFoods();
  const food = foods.find((f) => f.id === params.id);
  if (!food) return loading ? <Loading /> : <Screen><Notice kind="error">Alimento não encontrado.</Notice></Screen>;
  return <Detail key={food.id} food={food} params={params} />;
}

function Detail({ food, params }: { food: Food; params: { id: string; date?: string; meal?: MealType } }) {
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const favorites = useCollection<{ id: string; food_id: string }>('food_favorites');
  const [meal, setMeal] = useState<MealType>((params.meal as MealType) ?? 'breakfast');
  const [amount, setAmount] = useState<number | null>(food.household_measures[0]?.amount ?? food.serving_size ?? 100);
  const [doses, setDoses] = useState<number | null>(1);
  const scaled = useMemo(() => (amount ? scalePer100(food.per100, amount) : null), [food, amount]);

  const fav = favorites.data.find((f) => f.food_id === food.id);
  const isSupplement = food.is_supplement && food.serving_size;

  const add = async () => {
    const opts = { date: params.date ?? today, meal, origin: 'search' as const, consumed_at: new Date().toISOString() };
    const entry = isSupplement && doses ? buildSupplementEntry(food, doses, opts) : buildEntry(food, amount!, opts);
    await store.insert<DiaryEntry>('diary_entries', entry);
    router.dismissTo({ pathname: '/(tabs)/alimentacao' });
  };

  return (
    <Screen>
      <T variant="h2">{food.name}</T>
      {[food.brand, food.variant, food.flavor].some(Boolean) ? <T variant="small">{[food.brand, food.variant, food.flavor].filter(Boolean).join(' · ')}</T> : null}
      <Row wrap>
        <Badge label={SOURCE_LABEL[food.source] ?? food.source} tone="info" />
        <Badge label={VERIFICATION_LABEL[food.verification]} tone={food.verification === 'estimated' ? 'warning' : 'neutral'} />
        {food.preparation_state ? <Badge label={food.preparation_state} /> : null}
        {food.label_basis === 'prepared' ? <Badge label="valores do produto preparado" tone="warning" /> : null}
      </Row>

      <Card>
        <ChipSelect label="Refeição" options={MEAL_ORDER.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={meal} onChange={setMeal} />
        {isSupplement ? (
          <NumberField label={`Doses (1 dose = ${num(food.serving_size)} ${food.base_unit}${food.serving_label ? `, ${food.serving_label}` : ''})`} value={doses} onChange={(v) => { setDoses(v); if (v) setAmount(v * food.serving_size!); }} />
        ) : (
          <>
            <AmountField unit={food.base_unit} value={amount} onChange={setAmount} measures={food.household_measures} />
          </>
        )}
        {scaled ? (
          <T>{`${nutrient(scaled.energy_kcal, 'kcal', 0)} · ${nutrient(scaled.protein_g, 'g prot.')} · ${nutrient(scaled.carbs_g, 'g carbo')} · ${nutrient(scaled.fat_g, 'g gord.')}`}</T>
        ) : null}
        {food.compounds_per_serving && doses ? (
          <T variant="small">{`${formatCompounds(Object.fromEntries(Object.entries(food.compounds_per_serving).map(([k, v]) => [k, v * doses])))} — registrado à parte, não altera calorias nem macros.`}</T>
        ) : null}
        <Button title="Adicionar ao diário" icon="add" onPress={add} disabled={!amount || amount <= 0} />
      </Card>

      <Card>
        <T variant="h3">{`Informação nutricional por 100 ${food.base_unit}`}</T>
        {NUTRIENT_KEYS.filter((k) => k in food.per100).map((k) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <T variant="small">{NUTRIENT_LABELS[k].label}</T>
            <T variant="small">{food.trace_nutrients.includes(k) ? 'traços' : nutrient(food.per100[k], NUTRIENT_LABELS[k].unit)}</T>
          </Row>
        ))}
        <Divider />
        <T variant="tiny">{`Fonte: ${SOURCE_LABEL[food.source] ?? food.source}${food.source_ref ? ` (${food.source_ref})` : ''}${food.verified_at ? ` · atualizado em ${food.verified_at}` : ''}. "Não informado" significa que a fonte não traz o valor — ele não é tratado como zero.`}</T>
        {food.ingredients_text ? <T variant="tiny">{`Ingredientes: ${food.ingredients_text}`}</T> : null}
        {foodTags(food).length ? <T variant="tiny">{`Grupos na busca: ${foodTags(food).map((t) => `#${t}`).join(' ')}${food.user_id ? ' (edite em Editar)' : ''}`}</T> : null}
      </Card>

      <Row wrap>
        <Button
          small
          variant="secondary"
          icon={fav ? 'star' : 'star-outline'}
          title={fav ? 'Remover dos favoritos' : 'Favoritar'}
          onPress={() => (fav ? store.remove('food_favorites', fav.id) : store.insert<{ food_id: string }>('food_favorites', { food_id: food.id }))}
        />
        {food.user_id ? (
          <>
            <Button small variant="secondary" icon="create-outline" title="Editar" onPress={() => router.push({ pathname: '/alimento/novo', params: { edit: food.id } })} />
            <Button
              small
              variant="danger"
              icon="trash-outline"
              title="Excluir"
              onPress={() => confirmAction('Excluir alimento', 'Os registros já feitos no diário são mantidos.', async () => {
                await store.remove('foods', food.id);
                router.back();
              })}
            />
          </>
        ) : null}
      </Row>
    </Screen>
  );
}
