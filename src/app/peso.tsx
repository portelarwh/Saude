import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { formatDateBR, parseBRDate } from '../domain/dates';
import type { Profile, WeightEntry } from '../domain/types';
import { useStore } from '../state/AppProvider';
import { useCollection, useGoals, useProfile } from '../state/hooks';
import { recalculateGoals } from '../services/goalsService';
import { Button, Card, Field, ListItem, Notice, NumberField, Row, Screen, T } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { num } from '../ui/format';

export default function Weight() {
  const router = useRouter();
  const store = useStore();
  const { profile, save } = useProfile();
  const { goalSet } = useGoals();
  const weights = useCollection<WeightEntry>('weight_entries', { order: { field: 'measured_at', ascending: false } });
  const [value, setValue] = useState<number | null>(null);
  const [dateText, setDateText] = useState(formatDateBR(new Date()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const date = parseBRDate(dateText);
    if (!date) return setError('Data inválida.');
    if (!value || value < 20 || value > 400) return setError('Peso fora da faixa plausível.');
    const measured_at = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
    await store.insert<WeightEntry>('weight_entries', { measured_at, weight_kg: value, source: 'manual', note: note.trim() || null });
    const latest = weights.data[0];
    if (profile && (!latest || measured_at >= latest.measured_at)) {
      const updated = await save({ current_weight_kg: value });
      // metas do sistema acompanham o peso; metas do usuário/profissional são preservadas
      await recalculateGoals(store, updated as Profile, goalSet, 'Peso atualizado');
    }
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Row>
          <NumberField label="Peso" suffix="kg" value={value} onChange={setValue} style={{ flex: 1 }} />
          <Field label="Data" value={dateText} onChangeText={setDateText} style={{ flex: 1 }} />
        </Row>
        <Field label="Observação (opcional)" value={note} onChangeText={setNote} placeholder="Ex.: em jejum, após o banheiro" />
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Button title="Registrar" icon="checkmark" onPress={add} />
        <T variant="tiny">Para comparar melhor, pese-se no mesmo horário e condições. O app mostra a tendência com média móvel de 7 dias para reduzir oscilações diárias (água, sal, intestino).</T>
      </Card>
      <Card>
        <T variant="h3">Histórico</T>
        {weights.data.map((w) => (
          <ListItem
            key={w.id}
            title={`${num(w.weight_kg, 1)} kg`}
            subtitle={`${formatDateBR(w.measured_at)}${w.source === 'assessment' ? ' · avaliação corporal' : ''}${w.note ? ` · ${w.note}` : ''}`}
            right={<Button small variant="ghost" title="Excluir" onPress={() => confirmAction('Excluir pesagem', `${num(w.weight_kg, 1)} kg em ${formatDateBR(w.measured_at)}`, () => store.remove('weight_entries', w.id))} />}
          />
        ))}
      </Card>
    </Screen>
  );
}
