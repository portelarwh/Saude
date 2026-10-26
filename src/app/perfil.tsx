import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ACTIVITY_FACTORS } from '../domain/energy';
import { assessTimeline, combineObjectives, normalizeHeightCm, profileObjectives } from '../domain/goals';
import { formatDateBR, normalizeTime, normalizeTimeFields, parseBRDate } from '../domain/dates';
import type { Profile, Sex } from '../domain/types';
import { recalculateGoals } from '../services/goalsService';
import { useApp, useStore } from '../state/AppProvider';
import { useGoals, useProfile } from '../state/hooks';
import { Button, Card, ChipSelect, DateField, Divider, Field, HeightField, ListItem, TimeField, MultiChipSelect, Notice, NumberField, Row, Screen, T, Toggle } from '../ui/components';
import { ACTIVITY_OPTIONS, HEALTH_FLAGS } from '../ui/labels';
import { RestrictionsSelect } from '../ui/RestrictionsSelect';
import { TrainingFields } from '../ui/TrainingFields';
import { ObjectivesSelect } from '../ui/ObjectivesSelect';
import { TimelineNotice } from '../ui/TimelineNotice';

export default function ProfileScreen() {
  const { profile } = useProfile();
  if (!profile) return <Screen><T>Carregando…</T></Screen>;
  return <ProfileForm key={profile.id} initial={profile} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const store = useStore();
  const { mode, session, signOut } = useApp();
  const { profile, save } = useProfile();
  const { goalSet } = useGoals();
  const [p, setP] = useState<Profile>(initial);
  const [birth, setBirth] = useState(initial.birth_date ? formatDateBR(initial.birth_date) : '');
  const [target, setTarget] = useState(initial.target_date ? formatDateBR(initial.target_date) : '');
  const [msg, setMsg] = useState<string | null>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP({ ...p, [k]: v });

  const submit = async () => {
    setMsg(null);
    if (birth && !parseBRDate(birth)) return setMsg('Data de nascimento inválida.');
    for (const t of [p.wake_time, p.sleep_time]) if (t && !normalizeTime(t)) return setMsg('Horário inválido: digite só os números, ex.: 0700.');
    const updated = await save({ ...normalizeTimeFields(p), height_cm: normalizeHeightCm(p.height_cm), objectives: profileObjectives(p), birth_date: parseBRDate(birth), target_date: parseBRDate(target) });
    await recalculateGoals(store, updated, goalSet, 'Perfil atualizado');
    setMsg('Perfil salvo. Metas sugeridas recalculadas (metas suas ou prescritas foram mantidas).');
  };

  return (
    <Screen>
      <Card>
        <ListItem icon="flag-outline" title="Minhas metas" subtitle="Valores, origem e como foram calculadas" onPress={() => router.push('/metas')} />
        <Divider />
        <ListItem icon="notifications-outline" title="Notificações e lembretes" onPress={() => router.push('/notificacoes')} />
        <Divider />
        <ListItem icon="document-text-outline" title="Plano alimentar" subtitle="Importar dieta, adesão" onPress={() => router.push('/dieta')} />
        <Divider />
        <ListItem icon="stats-chart-outline" title="Relatórios e exportação" onPress={() => router.push('/relatorios')} />
        <Divider />
        <ListItem icon="shield-checkmark-outline" title="Privacidade e dados" subtitle="Consentimentos, exportar, excluir" onPress={() => router.push('/privacidade')} />
        <Divider />
        <ListItem icon="nutrition-outline" title="Meus alimentos" subtitle="Editar ou excluir alimentos que você cadastrou" onPress={() => router.push('/meus-alimentos')} />
        <ListItem icon="server-outline" title="Base de alimentos" subtitle="Exportar meus cadastros para a base do sistema ou importar" onPress={() => router.push('/base-alimentos')} />
        <ListItem icon="library-outline" title="Fontes de dados e licenças" onPress={() => router.push('/fontes')} />
      </Card>

      <Card>
        <T variant="h3">Aparência</T>
        <ChipSelect
          options={[{ value: 'system', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]}
          value={profile?.settings?.theme ?? 'system'}
          onChange={(v) => save({ settings: { ...(profile?.settings ?? {}), theme: v as 'system' | 'light' | 'dark' } })}
        />
      </Card>

      <Card>
        <T variant="h3">Dados pessoais</T>
        <Field label="Nome" value={p.name} onChangeText={(t) => set('name', t)} />
        <DateField label="Data de nascimento" value={birth} onChangeText={setBirth} />
        <ChipSelect<Sex> label="Sexo biológico (equações)" options={[{ value: 'female', label: 'Feminino' }, { value: 'male', label: 'Masculino' }]} value={p.sex} onChange={(v) => set('sex', v)} />
        <Row>
          <HeightField label="Altura (cm)" value={p.height_cm} onChange={(v) => set('height_cm', v)} style={{ flex: 1 }} />
          <NumberField label="Peso atual" suffix="kg" value={p.current_weight_kg} onChange={(v) => set('current_weight_kg', v)} style={{ flex: 1 }} />
        </Row>
        <Row>
          <NumberField label="Peso desejado" suffix="kg" value={p.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} style={{ flex: 1 }} />
          <DateField label="Prazo" value={target} onChangeText={setTarget} style={{ flex: 1 }} />
        </Row>
        <TimelineNotice timeline={p.current_weight_kg && p.target_weight_kg ? assessTimeline(p.current_weight_kg, p.target_weight_kg, parseBRDate(target)) : null} onUseSuggested={setTarget} />
        <Row>
          <NumberField label="Cintura" suffix="cm" value={p.waist_cm} onChange={(v) => set('waist_cm', v)} style={{ flex: 1 }} />
          <NumberField label="Quadril" suffix="cm" value={p.hip_cm} onChange={(v) => set('hip_cm', v)} style={{ flex: 1 }} />
        </Row>
      </Card>

      <Card>
        <T variant="h3">Rotina e objetivo</T>
        <ObjectivesSelect value={profileObjectives(p)} onChange={(list) => setP({ ...p, objectives: list, objective: combineObjectives(list) })} />
        <ChipSelect label="Atividade" options={ACTIVITY_OPTIONS} value={p.activity_level} onChange={(v) => set('activity_level', v)} />
        {p.activity_level ? <T variant="tiny">{ACTIVITY_FACTORS[p.activity_level].description}</T> : null}
        <TrainingFields p={p} onChange={(patch) => setP({ ...p, ...patch })} />
        <Field label="Rotina de trabalho" value={p.work_routine ?? ''} onChangeText={(t) => set('work_routine', t)} />
        <Row>
          <TimeField label="Acordo às" value={p.wake_time ?? ''} onChangeText={(t) => set('wake_time', t)} style={{ flex: 1 }} />
          <TimeField label="Durmo às" value={p.sleep_time ?? ''} onChangeText={(t) => set('sleep_time', t)} style={{ flex: 1 }} />
        </Row>
      </Card>

      <Card>
        <T variant="h3">Alimentação</T>
        <RestrictionsSelect value={p.food_restrictions ?? []} onChange={(v) => set('food_restrictions', v)} />
        <Field label="Alergias (não pode comer)" value={(p.allergies ?? []).join(', ')} onChangeText={(t) => set('allergies', t.split(',').map((x) => x.trim()).filter(Boolean))} />
        <Field label="Intolerâncias (faz mal)" value={(p.intolerances ?? []).join(', ')} onChangeText={(t) => set('intolerances', t.split(',').map((x) => x.trim()).filter(Boolean))} />
        <Field label="Do que você gosta" value={p.food_preferences ?? ''} onChangeText={(t) => set('food_preferences', t)} multiline />
      </Card>

      <Card>
        <T variant="h3">Saúde (protegido)</T>
        <MultiChipSelect label="Condições" options={HEALTH_FLAGS} value={p.health_flags ?? []} onChange={(v) => set('health_flags', v)} />
        <Field label="Observações de saúde" value={p.health_notes ?? ''} onChangeText={(t) => set('health_notes', t)} multiline />
        <Field label="Suplementos" value={p.supplements_notes ?? ''} onChangeText={(t) => set('supplements_notes', t)} />
        <Field label="Orientações profissionais" value={p.professional_guidance ?? ''} onChangeText={(t) => set('professional_guidance', t)} multiline />
        <Toggle label="Clima quente" value={Boolean(p.hot_climate)} onChange={(v) => set('hot_climate', v)} />
        <NumberField label="Referência de líquidos (ml/kg/dia)" value={p.water_ml_per_kg} onChange={(v) => set('water_ml_per_kg', v)} hint="Padrão 30 ml/kg. Ajuste conforme orientação profissional (faixa aceita: 20–60)." />
      </Card>

      {msg ? <Notice kind={msg.startsWith('Perfil salvo') ? 'success' : 'error'}>{msg}</Notice> : null}
      <Button title="Salvar perfil" icon="checkmark" onPress={submit} />
      <T variant="tiny">{mode === 'cloud' ? `Conectado como ${session?.user.email ?? ''}` : 'Modo local: dados apenas neste aparelho.'}</T>
      {mode === 'cloud' ? <Button variant="secondary" icon="log-out-outline" title="Sair" onPress={signOut} /> : null}
    </Screen>
  );
}
