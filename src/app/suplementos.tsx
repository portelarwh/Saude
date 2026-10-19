/**
 * Meus Suplementos: produtos cadastrados (por rótulo, com valores por
 * marca/sabor/versão), registro de doses e mistura com outros alimentos.
 *
 * Não pré-cadastramos produtos de marcas com valores nutricionais: sem
 * verificação do rótulo atual, isso violaria a regra de não apresentar dados
 * não conferidos. O usuário cadastra pelo rótulo (foto + IA ou digitação).
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { buildEntry, buildSupplementEntry, compoundTotals } from '../domain/entries';
import { searchFoods } from '../domain/foodSearch';
import { sumNutrients } from '../domain/nutrients';
import { MEAL_LABELS, MEAL_ORDER, type DiaryEntry, type Food, type MealType } from '../domain/types';
import { newId } from '../services/ids';
import { useStore } from '../state/AppProvider';
import { useAllFoods, useCollection, useToday } from '../state/hooks';
import { Badge, Button, Card, ChipSelect, EmptyState, Field, ListItem, Notice, NumberField, Row, Screen, SectionHeader, Sheet, T } from '../ui/components';
import { num } from '../ui/format';
import { SUPPLEMENT_LABELS } from '../ui/labels';
import { currentMeal } from '../ui/QuickAdd';

const BRANDS = ['Growth Supplements', 'DUX Nutrition', 'Integralmédica', 'Max Titanium', 'Soldiers Nutrition', 'Probiótica', 'Black Skull', 'Essential Nutrition'];

export default function Supplements() {
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const { foods, userFoods } = useAllFoods();
  const supplements = userFoods.filter((f) => f.is_supplement);
  const todays = useCollection<DiaryEntry>('diary_entries', { eq: { date: today } });
  const [selected, setSelected] = useState<Food | null>(null);
  const [doses, setDoses] = useState<number | null>(1);
  const [meal, setMeal] = useState<MealType>(currentMeal());
  const [mixQuery, setMixQuery] = useState('');
  const [mix, setMix] = useState<{ food: Food; amount: number }[]>([]);
  const mixHits = useMemo(() => (mixQuery.trim().length >= 2 ? searchFoods(foods.filter((f) => !f.is_supplement), mixQuery, 5) : []), [foods, mixQuery]);

  const supplementEntries = todays.data.filter((e) => e.origin === 'supplement');
  const compounds = compoundTotals(todays.data);
  const supProtein = sumNutrients(supplementEntries.map((e) => e.nutrients)).values.protein_g;

  const preview = useMemo(() => {
    if (!selected || !doses) return null;
    const opts = { date: today, meal, origin: 'supplement' as const };
    const items = [buildSupplementEntry(selected, doses, opts), ...mix.map((m) => buildEntry(m.food, m.amount, opts))];
    return { items, totals: sumNutrients(items.map((i) => i.nutrients)) };
  }, [selected, doses, mix, today, meal]);

  const register = async () => {
    if (!preview) return;
    const group = mix.length ? newId() : null;
    const consumed_at = new Date().toISOString();
    await store.insertMany<DiaryEntry>('diary_entries', preview.items.map((i) => ({ ...i, group_id: group, consumed_at })));
    setSelected(null);
    setMix([]);
    setDoses(1);
  };

  return (
    <Screen>
      <Card>
        <T variant="h3">Hoje</T>
        {supplementEntries.length === 0 ? <T variant="small">Nenhum suplemento registrado hoje.</T> : null}
        {supplementEntries.map((e) => (
          <T key={e.id} variant="small">{`• ${e.food_name}: ${num(e.servings ?? 0, 1)} dose(s), ${num(e.nutrients.protein_g, 1)} g proteína${e.compounds?.creatine_g ? `, ${num(e.compounds.creatine_g, 1)} g creatina` : ''}`}</T>
        ))}
        {supplementEntries.length ? <T variant="small">{`Proteína vinda de suplementos: ${num(supProtein, 1)} g (já somada ao total do dia).`}</T> : null}
        {compounds.creatine_g ? <T variant="small">{`Creatina: ${num(compounds.creatine_g, 1)} g (registrada à parte; não conta como proteína).`}</T> : null}
      </Card>

      <SectionHeader title="Meus suplementos" action={<Button small icon="add" title="Cadastrar" onPress={() => router.push({ pathname: '/alimento/novo', params: { supplement: '1' } })} />} />
      {supplements.length === 0 ? (
        <EmptyState
          icon="flask-outline"
          title="Nenhum suplemento cadastrado"
          message="Cadastre pela foto do rótulo ou digitando a tabela. Cada sabor e versão tem valores próprios."
          action={<Button title="Fotografar rótulo" icon="camera-outline" onPress={() => router.push({ pathname: '/adicionar', params: { tab: 'rotulo', meal: currentMeal() } })} />}
        />
      ) : (
        <Card>
          {supplements.map((s) => (
            <ListItem
              key={s.id}
              icon="flask-outline"
              title={[s.name, s.brand, s.flavor].filter(Boolean).join(' · ')}
              subtitle={`${s.supplement_category ? SUPPLEMENT_LABELS[s.supplement_category] : 'Suplemento'} · dose ${num(s.serving_size)} ${s.base_unit} · ${s.compounds_per_serving?.creatine_g ? `${num(s.compounds_per_serving.creatine_g, 1)} g creatina` : `${num(((s.per100.protein_g ?? 0) * (s.serving_size ?? 0)) / 100, 1)} g proteína/dose`}`}
              onPress={() => {
                setSelected(s);
                setDoses(1);
                setMix([]);
              }}
            />
          ))}
        </Card>
      )}

      <Card>
        <T variant="h3">Categorias</T>
        <Row wrap>{Object.values(SUPPLEMENT_LABELS).map((l) => <Badge key={l} label={l} />)}</Row>
        <T variant="small">{`Marcas comuns no Brasil: ${BRANDS.join(', ')}.`}</T>
        <T variant="tiny">Não incluímos valores pré-cadastrados de marcas: rótulos mudam entre sabores, versões e lotes. Cadastre a partir do rótulo do seu produto para garantir valores corretos.</T>
      </Card>

      <Sheet visible={Boolean(selected)} onClose={() => setSelected(null)} title="Registrar dose">
        {selected ? (
          <>
            <T variant="h3">{[selected.name, selected.brand, selected.flavor].filter(Boolean).join(' · ')}</T>
            <NumberField label={`Doses (1 dose = ${num(selected.serving_size)} ${selected.base_unit}${selected.serving_label ? `, ${selected.serving_label}` : ''})`} value={doses} onChange={setDoses} />
            <ChipSelect label="Refeição / horário" options={MEAL_ORDER.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={meal} onChange={setMeal} />
            <Field label="Misturado com (opcional)" value={mixQuery} onChangeText={setMixQuery} placeholder="Ex.: leite, banana, aveia" />
            {mixHits.map(({ food }) => (
              <ListItem
                key={food.id}
                title={food.name}
                subtitle={food.household_measures[0] ? `${food.household_measures[0].label} ≈ ${food.household_measures[0].amount} ${food.base_unit}` : `100 ${food.base_unit}`}
                onPress={() => {
                  setMix((m) => [...m, { food, amount: food.household_measures[0]?.amount ?? 100 }]);
                  setMixQuery('');
                }}
              />
            ))}
            {mix.map((m, i) => (
              <Row key={i} style={{ alignItems: 'flex-end' }}>
                <NumberField label={m.food.name} suffix={m.food.base_unit} value={m.amount} onChange={(v) => v && setMix((cur) => cur.map((x, j) => (j === i ? { ...x, amount: v } : x)))} style={{ flex: 1 }} />
                <Button small variant="ghost" title="Remover" onPress={() => setMix((cur) => cur.filter((_, j) => j !== i))} />
              </Row>
            ))}
            {preview ? (
              <Notice kind="info" title="Prévia">
                {`${num(preview.totals.values.energy_kcal)} kcal · ${num(preview.totals.values.protein_g, 1)} g proteína · ${num(preview.totals.values.carbs_g, 1)} g carbo${preview.items[0].compounds?.creatine_g ? ` · creatina ${num(preview.items[0].compounds.creatine_g, 1)} g (fora da proteína)` : ''}`}
              </Notice>
            ) : null}
            <Button title="Registrar" icon="checkmark" onPress={register} disabled={!doses || doses <= 0} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
