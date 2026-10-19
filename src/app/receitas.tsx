import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { calculateRecipe, recipeToFood, scaleRecipe, shoppingList } from '../domain/recipes';
import type { Food, Recipe } from '../domain/types';
import { useStore } from '../state/AppProvider';
import { useCollection } from '../state/hooks';
import { Badge, Button, Card, EmptyState, ListItem, NumberField, Row, Screen, SectionHeader, Sheet, T } from '../ui/components';
import { num } from '../ui/format';
import { currentMeal } from '../ui/QuickAdd';

export default function Recipes() {
  const router = useRouter();
  const store = useStore();
  const recipes = useCollection<Recipe>('recipes', { order: { field: 'name' } });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marmitas, setMarmitas] = useState<Record<string, number | null>>({});
  const [listOpen, setListOpen] = useState(false);

  const sorted = [...recipes.data].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const chosen = sorted.filter((r) => selected.has(r.id)).map((r) => (marmitas[r.id] ? scaleRecipe(r, marmitas[r.id]!) : r));
  const list = shoppingList(chosen);

  const logPortion = async (r: Recipe) => {
    const food = recipeToFood(r, store.userId);
    await store.upsert<Food>('foods', food);
    router.push({ pathname: '/alimento/[id]', params: { id: food.id, meal: currentMeal() } });
  };

  return (
    <Screen>
      <Button icon="add" title="Nova receita" onPress={() => router.push('/receita')} />
      {sorted.length === 0 ? (
        <EmptyState icon="book-outline" title="Nenhuma receita" message='Cadastre preparações caseiras como "Frango desfiado com creme de ricota": o app soma os ingredientes e calcula por porção e por 100 g.' />
      ) : null}
      {sorted.map((r) => {
        let n: ReturnType<typeof calculateRecipe> | null = null;
        try {
          n = calculateRecipe(r);
        } catch {
          n = null;
        }
        const on = selected.has(r.id);
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3" style={{ flex: 1 }}>{r.name}</T>
              {r.favorite ? <Badge label="favorita" tone="primary" /> : null}
            </Row>
            {n ? (
              <T variant="small">{`${r.servings} porções de ~${num(n.servingWeight)} g · por porção: ${num(n.perServing.energy_kcal)} kcal, ${num(n.perServing.protein_g, 1)} g proteína`}</T>
            ) : null}
            <Row wrap>
              <Button small icon="add" title="Registrar porção" onPress={() => logPortion(r)} />
              <Button small variant="secondary" icon="create-outline" title="Editar" onPress={() => router.push({ pathname: '/receita', params: { id: r.id } })} />
              <Button small variant="secondary" icon={r.favorite ? 'star' : 'star-outline'} title={r.favorite ? 'Desfavoritar' : 'Favoritar'} onPress={() => store.update<Recipe>('recipes', r.id, { favorite: !r.favorite })} />
              <Button
                small
                variant={on ? 'primary' : 'secondary'}
                icon="cart-outline"
                title={on ? 'Na lista' : 'Lista de compras'}
                onPress={() => setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(r.id)) next.delete(r.id);
                  else next.add(r.id);
                  return next;
                })}
              />
            </Row>
            {on ? <NumberField label="Marmitas/porções para a semana" value={marmitas[r.id] ?? r.servings} onChange={(v) => setMarmitas((m) => ({ ...m, [r.id]: v }))} /> : null}
          </Card>
        );
      })}
      {selected.size ? <Button icon="cart" title={`Ver lista de compras (${list.length} itens)`} onPress={() => setListOpen(true)} /> : null}

      <Sheet visible={listOpen} onClose={() => setListOpen(false)} title="Lista de compras">
        <T variant="small">Quantidades dos ingredientes como usados nas receitas (peso cru/como comprado).</T>
        {list.map((i) => <ListItem key={i.name + i.unit} title={i.name} right={<T>{`${num(i.amount)} ${i.unit}`}</T>} />)}
        <SectionHeader title="Receitas incluídas" />
        {chosen.map((r) => <T key={r.id} variant="small">{`• ${r.name} (${r.servings} porções)`}</T>)}
      </Sheet>
    </Screen>
  );
}
