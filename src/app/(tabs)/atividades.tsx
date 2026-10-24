import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { ACTIVITY_LABELS, INTENSITY_LABELS, weekStart, weeklyActivity } from '../../domain/activities';
import { addDays, formatDateBR } from '../../domain/dates';
import type { ActivityLog } from '../../domain/types';
import { useStore } from '../../state/AppProvider';
import { useCollection, useToday } from '../../state/hooks';
import { BarChart } from '../../ui/charts';
import { Button, Card, EmptyState, ListItem, Row, Screen, SectionHeader, T } from '../../ui/components';
import { confirmAction } from '../../ui/confirm';
import { num } from '../../ui/format';
import { useTheme } from '../../ui/theme';

export default function Activities() {
  const { colors } = useTheme();
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const since = addDays(weekStart(today), -21);
  const list = useCollection<ActivityLog>('activities', { gte: ['date', since], order: { field: 'started_at', ascending: false } });
  const thisWeek = weeklyActivity(list.data, weekStart(today));
  const weeks = useMemo(
    () => [3, 2, 1, 0].map((i) => weeklyActivity(list.data, addDays(weekStart(today), -7 * i))),
    [list.data, today],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(today), i));

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Button icon="add" title="Registrar atividade" onPress={() => router.push('/atividade')} />
        <Card>
          <T variant="h3">Esta semana</T>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Sessões" value={String(thisWeek.sessions)} />
            <Stat label="Minutos" value={String(thisWeek.totalMinutes)} />
            <Stat label="Dias ativos" value={`${thisWeek.activeDays}/7`} />
            <Stat label="Força" value={String(thisWeek.strengthSessions)} />
          </Row>
          <BarChart
            title="Minutos por dia nesta semana"
            data={days.map((d) => ({ label: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][days.indexOf(d)], value: list.data.filter((a) => a.date === d).reduce((s, a) => s + a.duration_min, 0) }))}
            unit="min"
            color={colors.chart.primary}
          />
          <T variant="small">{thisWeek.meetsWhoMinimum ? 'Você atingiu a referência da OMS de 150 min/semana de atividade moderada (ou equivalente).' : 'Referência da OMS: 150–300 min/semana de atividade moderada, ou 75–150 min intensa, e força 2×/semana.'}</T>
        </Card>
        <Card>
          <T variant="h3">Consistência (4 semanas)</T>
          {weeks.map((w) => (
            <Row key={w.weekStart} style={{ justifyContent: 'space-between' }}>
              <T variant="small">{`Semana de ${formatDateBR(w.weekStart)}`}</T>
              <T variant="small">{`${w.sessions} sessões · ${w.totalMinutes} min`}</T>
            </Row>
          ))}
        </Card>
        <SectionHeader title="Registros" />
        {list.data.length === 0 ? (
          <EmptyState icon="walk-outline" title="Nenhuma atividade registrada" message="Caminhada, musculação, bicicleta, dança, tarefas domésticas — tudo conta." />
        ) : (
          <Card>
            {list.data.map((a) => (
              <ListItem
                key={a.id}
                icon="walk-outline"
                title={`${a.custom_name || ACTIVITY_LABELS[a.type]} · ${a.duration_min} min`}
                subtitle={`${formatDateBR(a.date)} · ${INTENSITY_LABELS[a.intensity]}${a.distance_km ? ` · ${num(a.distance_km, 1)} km` : ''}${a.kcal_estimated ? ` · ~${a.kcal_estimated} kcal (estimativa)` : ''}`}
                right={<Button small variant="ghost" title="Excluir" onPress={() => confirmAction('Excluir atividade', ACTIVITY_LABELS[a.type], () => store.remove('activities', a.id))} />}
              />
            ))}
          </Card>
        )}
        <T variant="tiny">Calorias estimadas por MET (Compendium of Physical Activities) são aproximadas (±25%) e não são somadas automaticamente à sua meta alimentar. Integração com Health Connect e relógios está planejada para a Fase 4.</T>
      </Screen>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <T variant="h2">{value}</T>
      <T variant="tiny">{label}</T>
    </View>
  );
}
