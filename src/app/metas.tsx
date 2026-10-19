/**
 * Minhas metas: valor, origem (sugerida / usuário / profissional), como foi
 * calculada e histórico de versões. Metas prescritas têm prioridade.
 */
import React, { useState } from 'react';
import { formatDateBR } from '../domain/dates';
import { GOAL_KEYS, GOAL_LABELS, ORIGIN_LABELS } from '../domain/goals';
import type { GoalKey, GoalOrigin, GoalSet, Profile } from '../domain/types';
import { recalculateGoals, saveManualTarget } from '../services/goalsService';
import { useStore } from '../state/AppProvider';
import { useCollection, useGoals, useProfile } from '../state/hooks';
import { Badge, Button, Card, ChipSelect, Field, ListItem, Notice, NumberField, Row, Screen, Sheet, T } from '../ui/components';
import { num } from '../ui/format';
import { useTheme } from '../ui/theme';

export default function Goals() {
  const { colors } = useTheme();
  const store = useStore();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const history = useCollection<GoalSet>('goal_sets', { order: { field: 'valid_from', ascending: false }, limit: 20 });
  const [editing, setEditing] = useState<GoalKey | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [origin, setOrigin] = useState<GoalOrigin>('user');
  const [professional, setProfessional] = useState('');
  const [busy, setBusy] = useState(false);

  const recalc = async () => {
    if (!profile) return;
    setBusy(true);
    await recalculateGoals(store, profile as Profile, goalSet, 'Recalculado a pedido do usuário');
    setBusy(false);
  };

  const save = async () => {
    if (!goalSet || !editing || !profile) return;
    await saveManualTarget(store, goalSet, editing, origin === 'system' ? null : value, origin, professional.trim() || null, profile);
    setEditing(null);
  };

  if (!goalSet) {
    return (
      <Screen>
        <Notice kind="info">Nenhuma meta calculada ainda.</Notice>
        <Button title="Calcular metas a partir do perfil" onPress={recalc} loading={busy} disabled={!profile} />
      </Screen>
    );
  }
  const calc = goalSet.calc as { bmr?: { kcal: number; explanation: string } | null; tdee?: { kcal: number; explanation: string } | null; missingData?: string[] } | null;

  return (
    <Screen>
      <T variant="small">Metas orientativas. As prescritas por profissional nunca são alteradas automaticamente; as definidas por você são mantidas nos recálculos.</T>
      {calc?.bmr ? (
        <Card>
          <T variant="h3">Base do cálculo</T>
          <T variant="small">{calc.bmr.explanation}</T>
          {calc.tdee ? <T variant="small">{calc.tdee.explanation}</T> : null}
          <T variant="tiny">Equações estimam médias populacionais; o gasto real pode variar ±10% ou mais. Ajuste conforme sua evolução e orientação profissional.</T>
        </Card>
      ) : null}
      {calc?.missingData?.length ? <Notice kind="warning">{`Dados faltantes: ${calc.missingData.join(', ')}. Complete em Perfil.`}</Notice> : null}

      {GOAL_KEYS.map((k) => {
        const t = goalSet.targets[k];
        return (
          <Card key={k}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">{GOAL_LABELS[k].label}</T>
              <T variant="h3" color={colors.primary}>{t.value !== null ? `${num(t.value)} ${GOAL_LABELS[k].unit}` : 'não definida'}</T>
            </Row>
            <Row wrap>
              <Badge label={ORIGIN_LABELS[t.origin]} tone={t.origin === 'professional' ? 'primary' : t.origin === 'user' ? 'info' : 'neutral'} />
              {t.professional_name ? <Badge label={t.professional_name} /> : null}
              {t.range ? <Badge label={`faixa de referência ${num(t.range[0])}–${num(t.range[1])}`} /> : null}
            </Row>
            <T variant="small">{t.explanation}</T>
            {t.warnings?.map((w) => <Notice key={w} kind="warning">{w}</Notice>)}
            <Button
              small
              variant="secondary"
              icon="create-outline"
              title="Alterar"
              onPress={() => {
                setEditing(k);
                setValue(t.value);
                setOrigin(t.origin === 'system' ? 'user' : t.origin);
                setProfessional(t.professional_name ?? '');
              }}
            />
          </Card>
        );
      })}

      <Button variant="secondary" icon="refresh" title="Recalcular sugestões do app" onPress={recalc} loading={busy} />

      <Card>
        <T variant="h3">Histórico de versões</T>
        {history.data.map((g) => (
          <ListItem key={g.id} title={`${formatDateBR(g.valid_from)} · ${num(g.targets.energy_kcal.value)} kcal · ${num(g.targets.protein_g.value)} g proteína`} subtitle={g.note ?? undefined} />
        ))}
      </Card>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing ? `Meta de ${GOAL_LABELS[editing].label.toLowerCase()}` : ''}>
        <ChipSelect<GoalOrigin>
          label="Origem"
          options={[
            { value: 'user', label: 'Definida por mim' },
            { value: 'professional', label: 'Prescrita por profissional' },
            { value: 'system', label: 'Voltar à sugestão do app' },
          ]}
          value={origin}
          onChange={setOrigin}
        />
        {origin !== 'system' && editing ? <NumberField label="Valor" suffix={GOAL_LABELS[editing].unit} value={value} onChange={setValue} /> : null}
        {origin === 'professional' ? <Field label="Nome do profissional (opcional)" value={professional} onChangeText={setProfessional} /> : null}
        {origin === 'professional' ? <Notice kind="info">Metas prescritas ficam bloqueadas para recálculos automáticos e para a IA.</Notice> : null}
        <Button title="Salvar" onPress={save} disabled={origin !== 'system' && (value === null || value <= 0)} />
      </Sheet>
    </Screen>
  );
}
