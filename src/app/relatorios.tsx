import React, { useMemo, useState } from 'react';
import { addDays, formatDateBR } from '../domain/dates';
import { buildReport } from '../domain/reports';
import type { ActivityLog, BodyAssessment, DiaryEntry, WaterLog, WeightEntry } from '../domain/types';
import { exportReportPDF, exportTableCSV } from '../services/export';
import { useStore } from '../state/AppProvider';
import { useCollection, useGoals, useProfile, useToday } from '../state/hooks';
import { Badge, Button, Card, Chip, Notice, Row, Screen, T } from '../ui/components';
import { ComparisonView } from '../ui/ComparisonView';
import { ml, num, signed } from '../ui/format';

export default function Reports() {
  const store = useStore();
  const today = useToday();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const [period, setPeriod] = useState<'semana' | 'mes'>('semana');
  const from = addDays(today, period === 'semana' ? -6 : -29);
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', from] });
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', from] });
  const activities = useCollection<ActivityLog>('activities', { gte: ['date', from] });
  const weights = useCollection<WeightEntry>('weight_entries');
  const assessments = useCollection<BodyAssessment>('body_assessments');
  const [msg, setMsg] = useState<string | null>(null);

  const r = useMemo(
    () => buildReport({ from, to: today, entries: entries.data, waterLogs: water.data, activities: activities.data, weights: weights.data, assessments: assessments.data, goals: goalSet?.targets ?? null }),
    [from, today, entries.data, water.data, activities.data, weights.data, assessments.data, goalSet],
  );
  const title = period === 'semana' ? 'Relatório semanal' : 'Relatório mensal';

  return (
    <Screen>
      <Row>
        <Chip label="Últimos 7 dias" selected={period === 'semana'} onPress={() => setPeriod('semana')} />
        <Chip label="Últimos 30 dias" selected={period === 'mes'} onPress={() => setPeriod('mes')} />
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="small">{`${formatDateBR(r.from)} a ${formatDateBR(r.to)}`}</T>
        <Badge label={`confiabilidade ${r.confidence}`} tone={r.confidence === 'alta' ? 'primary' : r.confidence === 'média' ? 'info' : 'warning'} />
      </Row>

      <Card>
        <T variant="h3">Alimentação</T>
        <T variant="small">{`Média dos ${r.food.daysWithRecords} dias com registro (de ${r.days}):`}</T>
        <T>{`${num(r.food.avgKcal)} kcal · ${num(r.food.avgProtein, 1)} g proteína · ${num(r.food.avgCarbs, 1)} g carbo · ${num(r.food.avgFat, 1)} g gordura · ${num(r.food.avgFiber, 1)} g fibras`}</T>
        <T variant="small">{`Meta de proteína atingida em ${r.food.proteinGoalDays} dia(s). Média de ${num(r.food.avgMealsPerLoggedDay, 1)} refeições registradas por dia.`}</T>
      </Card>
      <Card>
        <T variant="h3">Hidratação</T>
        <T>{`Meta atingida em ${r.hydration.daysMet} de ${r.hydration.daysWithLogs} dias com registro${r.hydration.pct !== null ? ` (${Math.round(r.hydration.pct)}%)` : ''}. Média ${ml(r.hydration.avgMl)}/dia.`}</T>
      </Card>
      <Card>
        <T variant="h3">Atividade física</T>
        <T>{`${r.activity.sessions} sessões · ${r.activity.activeDays} dias ativos · ${r.activity.minutes} min · ${r.activity.strengthSessions} de força`}</T>
      </Card>
      <Card>
        <T variant="h3">Peso</T>
        <T>{r.weight.points ? `${num(r.weight.first, 1)} → ${num(r.weight.last, 1)} kg (${signed(r.weight.change)} kg, média móvel de 7 dias; ${r.weight.points} pesagens)` : 'Sem pesagens no período.'}</T>
      </Card>
      {r.body ? <ComparisonView comparison={r.body.comparison} /> : <Notice kind="info">Sem nova avaliação corporal no período para comparar.</Notice>}
      <Card>
        <T variant="h3">Informações faltantes</T>
        {r.missing.length ? r.missing.map((m) => <T key={m} variant="small">{`• ${m}`}</T>) : <T variant="small">Registros completos no período.</T>}
      </Card>
      <Card>
        <T variant="h3">Sugestões para o próximo período</T>
        {r.suggestions.length ? r.suggestions.map((m) => <T key={m} variant="small">{`• ${m}`}</T>) : <T variant="small">Continue assim!</T>}
        <T variant="tiny">Sugestões gerais baseadas nos seus registros; não substituem orientação profissional.</T>
      </Card>
      {msg ? <Notice kind="error">{msg}</Notice> : null}
      <Button icon="document-outline" title="Exportar relatório em PDF" onPress={() => exportReportPDF(r, title, profile?.name ?? '').catch((e) => setMsg(e.message))} />
      <Row wrap>
        <Button small variant="secondary" title="Diário (CSV)" onPress={() => exportTableCSV(store, 'diary_entries').catch((e) => setMsg(e.message))} />
        <Button small variant="secondary" title="Água (CSV)" onPress={() => exportTableCSV(store, 'water_logs').catch((e) => setMsg(e.message))} />
        <Button small variant="secondary" title="Peso (CSV)" onPress={() => exportTableCSV(store, 'weight_entries').catch((e) => setMsg(e.message))} />
        <Button small variant="secondary" title="Avaliações (CSV)" onPress={() => exportTableCSV(store, 'body_assessments').catch((e) => setMsg(e.message))} />
      </Row>
    </Screen>
  );
}
