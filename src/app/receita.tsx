import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { searchFoods } from '../domain/foodSearch';
import { calculateRecipe, ingredientFromFood } from '../domain/recipes';
import type { Food, Recipe, RecipeIngredient } from '../domain/types';
import { useStore } from '../state/AppProvider';
import { useAllFoods, useCollection } from '../state/hooks';
import { AmountField } from '../ui/AmountField';
import { Button, Card, Field, ListItem, Notice, NumberField, Row, Screen, T, Toggle } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { num } from '../ui/format';

export default function RecipeEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recipes = useCollection<Recipe>('recipes');
  const existing = id ? recipes.data.find((r) => r.id === id) : undefined;
  if (id && !existing) return <Screen><T>{recipes.loading ? 'Carregando…' : 'Receita não encontrada.'}</T></Screen>;
  return <Editor key={existing?.id ?? 'nova'} existing={existing} />;
}

function Editor({ existing }: { existing?: Recipe }) {
  const router = useRouter();
  const store = useStore();
  const { foods } = useAllFoods();
  const [name, setName] = useState(existing?.name ?? '');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [finalWeight, setFinalWeight] = useState<number | null>(existing?.final_weight_g ?? null);
  const [servings, setServings] = useState<number | null>(existing?.servings ?? 4);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [q, setQ] = useState('');
  const [replacing, setReplacing] = useState<number | null>(null);

  const hits = useMemo(() => (q.trim().length >= 2 ? searchFoods(foods.filter((f) => f.source !== 'recipe'), q, 6) : []), [foods, q]);
  const nutrition = useMemo(() => {
    try {
      return ingredients.length && servings ? calculateRecipe({ ingredients, final_weight_g: finalWeight, servings }) : null;
    } catch {
      return null;
    }
  }, [ingredients, finalWeight, servings]);

  const pick = (food: Food) => {
    const amount = food.household_measures[0]?.amount ?? 100;
    if (replacing !== null) {
      setIngredients((cur) => cur.map((x, i) => (i === replacing ? ingredientFromFood(food, x.amount) : x)));
      setReplacing(null);
    } else {
      setIngredients((cur) => [...cur, ingredientFromFood(food, amount)]);
    }
    setQ('');
  };

  const save = async () => {
    const row = { name: name.trim(), ingredients, final_weight_g: finalWeight, servings: servings!, favorite, notes: notes.trim() || null };
    if (existing) await store.update<Recipe>('recipes', existing.id, row);
    else await store.insert<Recipe>('recipes', row);
    router.back();
  };

  return (
    <Screen>
      <Field label="Nome da receita" value={name} onChangeText={setName} placeholder="Frango desfiado com creme de ricota" />
      <Card>
        <T variant="h3">Ingredientes</T>
        {ingredients.map((ing, i) => (
          <View key={i} style={{ gap: 4, paddingVertical: 4 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <T variant="label" style={{ flex: 1 }}>{ing.food_name}</T>
              <Button small variant="ghost" icon="swap-horizontal" title="Trocar" onPress={() => setReplacing(i)} />
              <Button small variant="ghost" icon="trash-outline" title="Remover" onPress={() => setIngredients((cur) => cur.filter((_, j) => j !== i))} />
            </Row>
            <AmountField
              label="Quantidade"
              unit={ing.unit}
              value={ing.amount}
              measure={foods.find((f) => f.id === ing.food_id)?.household_measures[0] ?? null}
              onChange={(v) => setIngredients((cur) => cur.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
            />
          </View>
        ))}
        {replacing !== null ? <Notice kind="info">{`Escolha o substituto de "${ingredients[replacing]?.food_name}" (mesma quantidade).`}</Notice> : null}
        <Field label={replacing !== null ? 'Substituir por' : 'Adicionar ingrediente'} value={q} onChangeText={setQ} placeholder="Ex.: peito de frango cozido" />
        {hits.map(({ food }) => <ListItem key={food.id} title={food.name} subtitle={`${num(food.per100.energy_kcal)} kcal/100 ${food.base_unit}`} onPress={() => pick(food)} />)}
      </Card>
      <Card>
        <Row>
          <NumberField label="Peso final pronto (opcional)" suffix="g" value={finalWeight} onChange={setFinalWeight} style={{ flex: 1 }} hint="Pese a preparação pronta: considera perda/ganho de água no preparo." />
          <NumberField label="Porções" value={servings} onChange={setServings} style={{ width: 110 }} />
        </Row>
        <Field label="Modo de preparo / observações" value={notes} onChangeText={setNotes} multiline />
        <Toggle label="Favorita" value={favorite} onChange={setFavorite} />
      </Card>
      {nutrition ? (
        <Card>
          <T variant="h3">Informação nutricional</T>
          <T variant="small">{`Receita inteira (${num(nutrition.finalWeight)} g${finalWeight ? `; cru ${num(nutrition.rawWeight)} g, rendimento ${num(nutrition.yieldFactor * 100)}%` : ''}): ${num(nutrition.total.values.energy_kcal)} kcal · ${num(nutrition.total.values.protein_g, 1)} g proteína`}</T>
          <T variant="small">{`Por porção (~${num(nutrition.servingWeight)} g): ${num(nutrition.perServing.energy_kcal)} kcal · ${num(nutrition.perServing.protein_g, 1)} g proteína · ${num(nutrition.perServing.carbs_g, 1)} g carbo · ${num(nutrition.perServing.fat_g, 1)} g gordura`}</T>
          <T variant="small">{`Por 100 g: ${num(nutrition.per100.energy_kcal)} kcal · ${num(nutrition.per100.protein_g, 1)} g proteína`}</T>
          {Object.values(nutrition.total.missing).some((m) => m > 0) ? <T variant="tiny">Alguns ingredientes não têm todos os nutrientes na fonte; esses nutrientes aparecem como não informados na receita.</T> : null}
        </Card>
      ) : null}
      <Button title="Salvar receita" icon="checkmark" onPress={save} disabled={!name.trim() || !ingredients.length || !servings || servings <= 0} />
      {existing ? (
        <Button variant="danger" title="Excluir receita" onPress={() => confirmAction('Excluir receita', existing.name, async () => { await store.remove('recipes', existing.id); router.back(); })} />
      ) : null}
    </Screen>
  );
}
