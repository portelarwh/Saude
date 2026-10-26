/**
 * Minhas metas: valor, origem (sugerida / usuário / profissional), como foi
 * calculada e histórico de versões. Metas prescritas têm prioridade.
 */
import React, { useState } from 'react';
import { formatDateBR } from '../domain/dates';
import { bmi } from '../domain/energy';
import { GOAL_KEYS, GOAL_LABELS, ORIGIN_LABELS, formatFactor, PROTEIN_FACTOR_OPTIONS, proteinFactor, validProteinFactor } from '../domain/goals';
import type { BodyAssessment, GoalKey, GoalOrigin, GoalSet, Profile, ProteinBasis } from '../domain/types';
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

  const recalc = async (updated?: Profile, note = 'Recalculado a pedido do usuário') => {
    const p = updated ?? (profile as Profile | null);
    if (!p) return;
    setBusy(true);
    await recalculateGoals(store, p, goalSet, note);
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
        <Button title="Calcular metas a partir do perfil" onPress={() => recalc()} loading={busy} disabled={!profile} />
      </Screen>
    );
  }
  const calc = goalSet.calc as { bmr?: { kcal: number; explanation: string } | null; tdee?: { kcal: number; explanation: string } | null; missingData?: string[]; formula_version?: string } | null;

  return (
    <Screen>
      <T variant="small">Metas orientativas. As prescritas por profissional nunca são alteradas automaticamente; as definidas por você são mantidas nos recálculos.</T>
      {calc?.bmr ? (
        <Card>
          <T variant="h3">Como calculamos sua meta</T>
          <T variant="small">{calc.bmr.explanation}</T>
          {calc.tdee ? <T variant="small">{calc.tdee.explanation}</T> : null}
          <T variant="tiny">{`Equações estimam médias populacionais; o gasto real pode variar ±10% ou mais. Ajuste conforme sua evolução e orientação profissional.${calc.formula_version ? ` Fórmulas: ${calc.formula_version}.` : ''}`}</T>
        </Card>
      ) : null}
      {calc?.missingData?.length ? <Notice kind="warning">{`Dados faltantes: ${calc.missingData.join(', ')}. Complete em Perfil.`}</Notice> : null}

      {profile ? <ProteinPattern profile={profile as Profile} onSaved={recalc} manual={goalSet.targets.protein_g.origin !== 'system'} /> : null}

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
            {t.source && t.origin === 'system' ? <T variant="tiny" color={colors.muted}>{`Fonte: ${t.source}`}</T> : null}
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

      <Button variant="secondary" icon="refresh" title="Recalcular sugestões do app" onPress={() => recalc()} loading={busy} />

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

/** Padrão de proteína: fator (g/kg) e peso usado como base. Salva no perfil e recalcula as sugestões. */
function ProteinPattern({ profile, onSaved, manual }: { profile: Profile; onSaved: (p: Profile, note: string) => Promise<void>; manual: boolean }) {
  const { save } = useProfile();
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: false }, limit: 1 });
  const ffm = assessments.data[0]?.metrics.fat_free_mass_kg?.value ?? null;
  const highBmi = Boolean(profile.current_weight_kg && profile.height_cm && bmi(profile.current_weight_kg, profile.height_cm) >= 30);
  const objective = profile.objective ?? 'maintenance';
  const sessions = profile.strength_sessions_per_week;
  const rt = sessions !== null && sessions !== undefined ? sessions > 0 : Boolean(profile.does_resistance_training);
  const appDefault = proteinFactor(objective, rt);
  const factor = validProteinFactor(profile.protein_g_per_kg);
  const basis: ProteinBasis = profile.protein_basis ?? 'reference';
  const apply = async (patch: Partial<Profile>, what: string) => onSaved(await save(patch), `Padrão de proteína: ${what}`);

  return (
    <Card>
      <T variant="h3">Padrão de proteína</T>
      <T variant="small">{`Padrão do app para o seu objetivo: ${formatFactor(appDefault.factor)} g/kg (faixa usual ${formatFactor(appDefault.range[0])}–${formatFactor(appDefault.range[1])} g/kg).`}</T>
      <ChipSelect<number>
        label="Gramas por kg"
        options={[{ value: 0, label: 'Padrão do app' }, ...PROTEIN_FACTOR_OPTIONS.map((f) => ({ value: f, label: `${formatFactor(f)} g/kg` }))]}
        value={factor ?? 0}
        onChange={(v) => apply({ protein_g_per_kg: v === 0 ? null : v }, v === 0 ? 'padrão do app' : `${formatFactor(v)} g/kg`)}
      />
      <ChipSelect<ProteinBasis>
        label="Calcular sobre"
        options={[
          { value: 'reference', label: highBmi ? 'Peso de referência (IMC 25)' : 'Peso atual' },
          ...(ffm ? [{ value: 'fat_free_mass' as const, label: `Massa magra (${num(ffm, 1)} kg)` }] : []),
        ]}
        value={basis === 'current' && !highBmi ? 'reference' : basis}
        onChange={(v) => apply({ protein_basis: v }, v === 'fat_free_mass' ? 'base na massa magra' : 'base no peso de referência')}
      />
      {highBmi ? <T variant="tiny">Com IMC ≥ 30 o peso total superestima a necessidade de proteína; por isso o app usa o peso equivalente a IMC 25 (ou a massa magra da bioimpedância).</T> : null}
      {!ffm ? <T variant="tiny">Registre uma bioimpedância para poder calcular sobre a massa magra.</T> : null}
      {manual ? <Notice kind="info">Sua meta de proteína está definida manualmente (por você ou profissional): o padrão só vale quando ela voltar a ser a sugestão do app.</Notice> : null}
      <T variant="tiny">Doença renal ou hepática: a meta de proteína não é calculada automaticamente.</T>
    </Card>
  );
}
