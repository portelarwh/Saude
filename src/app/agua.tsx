import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, formatDateBR, toISODate } from '../domain/dates';
import { BEVERAGE_LABELS, hourlyDistribution, hydrationNudge, QUICK_VOLUMES_ML, summarizeHydration } from '../domain/hydration';
import type { Beverage, Container, WaterLog } from '../domain/types';
import { useStore } from '../state/AppProvider';
import { useCollection, useCountedBeverages, useGoals, useProfile, useToday } from '../state/hooks';
import { BarChart, Ring } from '../ui/charts';
import { Badge, Button, Card, ChipSelect, Field, ListItem, Notice, NumberField, Row, Screen, SectionHeader, Sheet, T, Toggle } from '../ui/components';
import { HydrationGuide } from '../ui/GuideCards';
import { confirmAction } from '../ui/confirm';
import { ml, num } from '../ui/format';
import { spacing, useTheme } from '../ui/theme';

export default function Water() {
  const { colors } = useTheme();
  const store = useStore();
  const today = useToday();
  const { profile, save } = useProfile();
  const { goalSet } = useGoals();
  const counted = useCountedBeverages(profile);
  const monthAgo = addDays(today, -29);
  const logs = useCollection<WaterLog>('water_logs', { gte: ['date', monthAgo], order: { field: 'logged_at', ascending: false } });
  const containers = useCollection<Container>('containers');
  const [beverage, setBeverage] = useState<Beverage>('water');
  const [custom, setCustom] = useState<number | null>(null);
  const [range, setRange] = useState<'hoje' | 'semana' | 'mes'>('hoje');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newContainer, setNewContainer] = useState<{ name: string; volume: number | null }>({ name: '', volume: null });
  const goal = goalSet?.targets.water_ml.value ?? null;

  const summary = summarizeHydration(today, logs.data, goal, counted);
  const nudge = hydrationNudge(summary, new Date(), profile?.wake_time ?? undefined, profile?.sleep_time ?? undefined);

  const add = async (volume: number, containerId: string | null = null) => {
    if (!(volume > 0 && volume <= 3000)) return;
    const now = new Date();
    await store.insert<WaterLog>('water_logs', { date: toISODate(now), logged_at: now.toISOString(), volume_ml: Math.round(volume), beverage, container_id: containerId });
  };

  const history = useMemo(() => {
    if (range === 'hoje') return hourlyDistribution(logs.data, today).map((v, h) => ({ label: `${h}h`, value: v })).slice(5, 24);
    const days = range === 'semana' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(today, i - days + 1);
      return { label: d.slice(8, 10), value: summarizeHydration(d, logs.data, goal, counted).counted_ml };
    });
  }, [range, logs.data, today, goal, counted]);

  const todayLogs = logs.data.filter((l) => l.date === today);

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <Ring size={150} pct={summary.pct} color={colors.chart.water} label={summary.logs ? `${summary.counted_ml} de ${goal ?? '?'} mililitros` : 'Sem registros hoje'}>
          <T variant="h1">{summary.logs ? ml(summary.counted_ml) : '—'}</T>
          <T variant="small">{goal ? `meta ${ml(goal)}` : 'sem meta definida'}</T>
        </Ring>
        <Row style={{ justifyContent: 'space-around', alignSelf: 'stretch' }}>
          <Mini label="Restante" value={goal ? ml(summary.remaining_ml) : '—'} />
          <Mini label="Atingido" value={summary.pct !== null ? `${Math.round(summary.pct)}%` : '—'} />
          <Mini label="Água pura" value={ml(summary.pure_water_ml)} />
          <Mini label="Outras bebidas" value={ml(summary.other_counted_ml)} />
        </Row>
        {summary.not_counted_ml ? <T variant="tiny">{`${ml(summary.not_counted_ml)} em bebidas que não contam para a meta (configurável).`}</T> : null}
        {summary.food_water_ml ? <T variant="tiny">{`Água dos alimentos registrados: ~${ml(summary.food_water_ml)} (informativo, fora da meta).`}</T> : null}
      </Card>

      {nudge.message ? <Notice kind={nudge.behind ? 'info' : 'success'}>{nudge.message}</Notice> : null}
      <HydrationGuide profile={profile} />

      <ChipSelect label="Bebida" options={(Object.keys(BEVERAGE_LABELS) as Beverage[]).map((b) => ({ value: b, label: BEVERAGE_LABELS[b] }))} value={beverage} onChange={setBeverage} />
      <Row wrap>
        {QUICK_VOLUMES_ML.map((v) => (
          <Button key={v} small variant="water" title={`+${v} ml`} onPress={() => add(v)} accessibilityLabel={`Adicionar ${v} mililitros de ${BEVERAGE_LABELS[beverage]}`} />
        ))}
      </Row>
      {containers.data.length ? (
        <Row wrap>
          {containers.data.map((c) => (
            <Button key={c.id} small variant="secondary" icon="water-outline" title={`${c.name} (${c.volume_ml} ml)`} onPress={() => add(c.volume_ml, c.id)} />
          ))}
        </Row>
      ) : null}
      <Row style={{ alignItems: 'flex-end' }}>
        <NumberField label="Outro valor" suffix="ml" value={custom} onChange={setCustom} style={{ flex: 1 }} />
        <Button title="Adicionar" onPress={() => custom && add(custom)} disabled={!custom || custom <= 0 || custom > 3000} />
      </Row>

      <SectionHeader title="Histórico" action={<Button small variant="ghost" icon="settings-outline" title="Ajustes" onPress={() => setSettingsOpen(true)} />} />
      <Row>
        {(['hoje', 'semana', 'mes'] as const).map((r) => (
          <Button key={r} small variant={range === r ? 'primary' : 'secondary'} title={{ hoje: 'Por horário', semana: '7 dias', mes: '30 dias' }[r]} onPress={() => setRange(r)} />
        ))}
      </Row>
      <Card>
        <BarChart title={range === 'hoje' ? 'Líquidos por horário hoje' : 'Líquidos por dia'} data={history} unit="ml" />
        {range !== 'hoje' && goal ? <T variant="tiny">{`Meta diária: ${ml(goal)}. Dias sem registro aparecem vazios (não significam consumo zero).`}</T> : null}
      </Card>

      <Card>
        <T variant="h3">Registros de hoje</T>
        {todayLogs.length === 0 ? <T variant="small">Nenhum registro hoje.</T> : null}
        {todayLogs.map((l) => (
          <ListItem
            key={l.id}
            icon="water-outline"
            iconColor={colors.water}
            title={`${l.volume_ml} ml · ${BEVERAGE_LABELS[l.beverage]}`}
            subtitle={new Date(l.logged_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            right={<Button small variant="ghost" title="Excluir" onPress={() => confirmAction('Excluir registro', `Remover ${l.volume_ml} ml?`, () => store.remove('water_logs', l.id))} />}
          />
        ))}
      </Card>
      <T variant="tiny">{`A meta refere-se a bebidas. Beba conforme a sede e a orientação profissional; não é necessário compensar atrasos com grandes volumes. ${goalSet ? `Meta: ${goalSet.targets.water_ml.explanation}` : ''}`}</T>

      <Sheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes de hidratação">
        <T variant="h3">Bebidas que contam para a meta</T>
        {(Object.keys(BEVERAGE_LABELS) as Beverage[]).filter((b) => b !== 'water').map((b) => (
          <Toggle
            key={b}
            label={BEVERAGE_LABELS[b]}
            value={counted[b]}
            onChange={(v) => save({ settings: { ...(profile?.settings ?? {}), counted_beverages: { ...(profile?.settings?.counted_beverages ?? {}), [b]: v } } })}
          />
        ))}
        <T variant="h3">Recipientes favoritos</T>
        {containers.data.map((c) => (
          <ListItem key={c.id} title={`${c.name} · ${c.volume_ml} ml`} right={<Button small variant="ghost" title="Excluir" onPress={() => store.remove('containers', c.id)} />} />
        ))}
        <Row style={{ alignItems: 'flex-end' }}>
          <Field label="Nome" value={newContainer.name} onChangeText={(t) => setNewContainer((c) => ({ ...c, name: t }))} style={{ flex: 1 }} placeholder="Garrafa do trabalho" />
          <NumberField label="Volume" suffix="ml" value={newContainer.volume} onChange={(v) => setNewContainer((c) => ({ ...c, volume: v }))} style={{ width: 120 }} />
        </Row>
        <Button
          small
          title="Adicionar recipiente"
          disabled={!newContainer.name.trim() || !newContainer.volume || newContainer.volume > 3000}
          onPress={async () => {
            await store.insert<Container>('containers', { name: newContainer.name.trim(), volume_ml: Math.round(newContainer.volume!), icon: null });
            setNewContainer({ name: '', volume: null });
          }}
        />
        <Badge label={`Últimos 30 dias: ${num(logs.data.length)} registros desde ${formatDateBR(monthAgo)}`} />
      </Sheet>
    </Screen>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2, paddingTop: spacing.sm }}>
      <T variant="h3">{value}</T>
      <T variant="tiny">{label}</T>
    </View>
  );
}
