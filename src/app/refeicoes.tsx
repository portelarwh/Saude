/** Refeições salvas: registrar de novo com um toque, favoritar ou excluir. */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { hasEstimates, savedMealToEntries, savedMealTotals } from '../domain/savedMeals';
import { MEAL_LABELS, MEAL_ORDER, type DiaryEntry, type MealType, type SavedMeal } from '../domain/types';
import { newId } from '../services/ids';
import { useStore } from '../state/AppProvider';
import { useCollection, useToday } from '../state/hooks';
import { Badge, Button, Card, ChipSelect, EmptyState, Field, Notice, Row, Screen, Sheet, T } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { num } from '../ui/format';
import { currentMeal } from '../ui/QuickAdd';

export default function SavedMeals() {
  const params = useLocalSearchParams<{ date?: string; meal?: MealType }>();
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const list = useCollection<SavedMeal>('saved_meals', { order: { field: 'name' } });
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const [meal, setMeal] = useState<MealType>(params.meal ?? currentMeal());
  const [msg, setMsg] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ meal: SavedMeal; name: string } | null>(null);
  const sorted = [...list.data].sort((a, b) => Number(b.favorite) - Number(a.favorite));

  const log = async () => {
    if (!logging) return;
    await store.insertMany<DiaryEntry>('diary_entries', savedMealToEntries(logging, { date: params.date ?? today, meal, consumed_at: new Date().toISOString(), groupId: newId() }));
    setMsg(`“${logging.name}” registrada em ${MEAL_LABELS[meal]}.`);
    setLogging(null);
  };

  return (
    <Screen>
      <Button icon="clipboard-outline" title="Colar do agente de IA" onPress={() => router.push({ pathname: '/colar', params: { date: params.date, meal: params.meal } })} />
      {msg ? <Notice kind="success">{msg}</Notice> : null}
      {sorted.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title="Nenhuma refeição salva"
          message="Cole uma refeição montada pelo seu agente de IA, ou salve uma refeição do diário (botão “Salvar” em cada refeição)."
        />
      ) : null}
      {sorted.map((m) => {
        const t = savedMealTotals(m);
        return (
          <Card key={m.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3" style={{ flex: 1 }}>{m.name}</T>
              {m.favorite ? <Badge label="favorita" tone="primary" /> : null}
            </Row>
            <Row wrap>
              {m.meal ? <Badge label={MEAL_LABELS[m.meal]} /> : null}
              <Badge label={m.origin === 'agent' ? 'do seu agente' : m.origin === 'diary' ? 'do diário' : 'manual'} tone="info" />
              {hasEstimates(m) ? <Badge label="contém estimativas da IA" tone="warning" /> : null}
            </Row>
            <T variant="small">{`${num(t.values.energy_kcal)} kcal · ${num(t.values.protein_g, 1)} g proteína · ${num(t.values.carbs_g, 1)} g carbo · ${num(t.values.fat_g, 1)} g gordura`}</T>
            {m.items.map((i, k) => (
              <T key={k} variant="tiny">{`• ${i.food_name} — ${num(i.amount)} ${i.unit}${i.measure ? ` (${i.measure})` : ''}${i.source === 'ai_estimate' ? ' · estimativa' : ''}`}</T>
            ))}
            <Row wrap>
              <Button
                small
                icon="add"
                title="Registrar"
                onPress={() => {
                  setLogging(m);
                  setMeal(params.meal ?? m.meal ?? currentMeal());
                }}
              />
              <Button small variant="secondary" icon="create-outline" title="Renomear" onPress={() => setRenaming({ meal: m, name: m.name })} />
              <Button small variant="secondary" icon={m.favorite ? 'star' : 'star-outline'} title={m.favorite ? 'Desfavoritar' : 'Favoritar'} onPress={() => store.update<SavedMeal>('saved_meals', m.id, { favorite: !m.favorite })} />
              <Button small variant="danger" icon="trash-outline" title="Excluir" onPress={() => confirmAction('Excluir refeição salva', m.name, () => store.remove('saved_meals', m.id))} />
            </Row>
          </Card>
        );
      })}

      <Sheet visible={Boolean(renaming)} onClose={() => setRenaming(null)} title="Renomear refeição">
        {renaming ? (
          <>
            <Field label="Nome" value={renaming.name} onChangeText={(t) => setRenaming({ ...renaming, name: t })} />
            <Button
              title="Salvar"
              disabled={!renaming.name.trim()}
              onPress={async () => {
                await store.update<SavedMeal>('saved_meals', renaming.meal.id, { name: renaming.name.trim() });
                setRenaming(null);
              }}
            />
          </>
        ) : null}
      </Sheet>
      <Sheet visible={Boolean(logging)} onClose={() => setLogging(null)} title="Registrar refeição">
        {logging ? (
          <>
            <T variant="h3">{logging.name}</T>
            <ChipSelect label="Em qual refeição?" options={MEAL_ORDER.map((x) => ({ value: x, label: MEAL_LABELS[x] }))} value={meal} onChange={setMeal} />
            <T variant="small">{`Data: ${params.date ?? today}. Cada item entra no diário com a fonte original (base do app, rótulo ou estimativa).`}</T>
            <Button title="Registrar no diário" icon="checkmark" onPress={log} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
