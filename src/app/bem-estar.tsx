/**
 * "Como você está hoje?": registra bem-estar/inchaço e mostra o que pode ter
 * contribuído (últimas 48 h), dicas e sinais de alerta. Não é diagnóstico.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { creatineStatus } from '../domain/creatine';
import { addDays, formatDateBR } from '../domain/dates';
import { summarizeHydration } from '../domain/hydration';
import type { DiaryEntry, WaterLog, WellbeingLog } from '../domain/types';
import { analyzeSwelling, INTENSITY_LABELS, WELLBEING_LABELS, type Intensity, type WellbeingKind } from '../domain/wellbeing';
import { useStore } from '../state/AppProvider';
import { useCollection, useCountedBeverages, useGoals, useProfile, useToday } from '../state/hooks';
import { Button, Card, ChipSelect, Field, ListItem, Notice, Row, Screen, T } from '../ui/components';
import { confirmAction } from '../ui/confirm';
import { spacing, useTheme } from '../ui/theme';

export default function Wellbeing() {
  const params = useLocalSearchParams<{ kind?: WellbeingKind }>();
  const { colors } = useTheme();
  const store = useStore();
  const today = useToday();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const counted = useCountedBeverages(profile);
  const [kind, setKind] = useState<WellbeingKind>(params.kind ?? 'fluid_retention');
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', addDays(today, -60)] });
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', addDays(today, -2)] });
  const history = useCollection<WellbeingLog>('wellbeing_logs', { order: { field: 'logged_at', ascending: false }, limit: 20 });

  const analysis = useMemo(() => {
    if (kind === 'ok') return null;
    const goal = goalSet?.targets.water_ml.value ?? null;
    return analyzeSwelling({
      kind,
      date: today,
      entries: entries.data.filter((e) => e.date >= addDays(today, -4)),
      waterLogs: water.data,
      water: [addDays(today, -1), today].map((d) => ({ date: d, counted_ml: summarizeHydration(d, water.data, goal, counted).counted_ml, goal_ml: goal })),
      creatine: creatineStatus(entries.data, today),
      sex: profile?.sex ?? null,
      intolerances: profile?.intolerances ?? [],
    });
  }, [kind, today, entries.data, water.data, goalSet, counted, profile]);

  const register = async () => {
    await store.insert<WellbeingLog>('wellbeing_logs', {
      date: today,
      logged_at: new Date().toISOString(),
      kind,
      intensity: kind === 'ok' ? null : intensity,
      note: note.trim() || null,
      contributors: analysis ? analysis.contributors.map((c) => ({ id: c.id, title: c.title })) : null,
    });
    setNote('');
    setSaved(kind === 'ok' ? 'Registrado. Que bom!' : 'Registrado. Veja abaixo o que pode ter contribuído e as dicas.');
  };

  return (
    <Screen>
      <Card>
        <T variant="h3">Como você está hoje?</T>
        <ChipSelect<WellbeingKind>
          options={(['ok', 'bloating', 'fluid_retention'] as const).map((k) => ({ value: k, label: WELLBEING_LABELS[k] }))}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setSaved(null);
          }}
        />
        {kind === 'bloating' ? <T variant="tiny">Barriga estufada: gases, sensação de estufamento depois de comer.</T> : null}
        {kind === 'fluid_retention' ? <T variant="tiny">Retenção: pés, mãos ou rosto inchados, anel ou meia marcando, peso que sobe de um dia para o outro.</T> : null}
        {kind !== 'ok' ? (
          <ChipSelect<Intensity> label="Intensidade" options={([1, 2, 3] as const).map((i) => ({ value: i, label: INTENSITY_LABELS[i] }))} value={intensity} onChange={setIntensity} />
        ) : null}
        <Field label="Observação (opcional)" value={note} onChangeText={setNote} placeholder="Ex.: pés inchados no fim do dia" />
        <Button icon="checkmark" title="Registrar" onPress={register} />
        {saved ? <Notice kind="success">{saved}</Notice> : null}
      </Card>

      {analysis ? (
        <>
          <Card>
            <T variant="h3">O que pode ter contribuído</T>
            <T variant="tiny">Com base nos seus registros das últimas 48 h. Não é diagnóstico.</T>
            {analysis.contributors.length ? (
              analysis.contributors.map((c) => (
                <View key={c.id} style={{ gap: 2, paddingVertical: spacing.xs }}>
                  <T variant="label" color={colors.warning}>{c.title}</T>
                  <T variant="small">{c.detail}</T>
                </View>
              ))
            ) : (
              <T variant="small">Nada nos seus registros recentes chama atenção. Sono ruim, calor, ficar muito tempo sentado ou em pé e estresse também influenciam.</T>
            )}
            {analysis.notes.map((n) => <T key={n} variant="tiny">{n}</T>)}
          </Card>
          <Card>
            <T variant="h3">O que ajuda</T>
            {analysis.tips.map((t) => <T key={t} variant="small">{`• ${t}`}</T>)}
            <T variant="tiny">Se durar mais de alguns dias ou vier com outros sintomas, converse com seu médico.</T>
          </Card>
          <Notice kind="warning" title="Procure atendimento se tiver">
            {analysis.redFlags.map((r) => `• ${r}`).join('\n')}
          </Notice>
        </>
      ) : null}

      <Card>
        <T variant="h3">Seus registros</T>
        {history.data.length === 0 ? <T variant="small">Nenhum registro ainda. Eles aparecem no Progresso, junto do peso.</T> : null}
        {history.data.map((h) => (
          <ListItem
            key={h.id}
            icon={h.kind === 'ok' ? 'happy-outline' : 'water-outline'}
            title={`${formatDateBR(h.date)} · ${WELLBEING_LABELS[h.kind]}${h.intensity ? ` (${INTENSITY_LABELS[h.intensity as Intensity]})` : ''}`}
            subtitle={[h.contributors?.map((c) => c.title).join(', '), h.note].filter(Boolean).join(' · ') || undefined}
            right={<Row><Button small variant="ghost" title="Excluir" onPress={() => confirmAction('Excluir registro', formatDateBR(h.date), () => store.remove('wellbeing_logs', h.id))} /></Row>}
          />
        ))}
      </Card>
    </Screen>
  );
}
