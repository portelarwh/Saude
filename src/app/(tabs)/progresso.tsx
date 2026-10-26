/**
 * Progresso — relatórios visuais da semana ou do mês: calorias e proteína por
 * dia contra a meta, distribuição dos macros, água, peso e composição.
 * Médias só consideram dias com registro.
 */
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { movingAverage } from '../../domain/bodyComposition';
import { creatineStatus } from '../../domain/creatine';
import { addDays, formatDateBR, parseISODate } from '../../domain/dates';
import { buildReport, dailyNutrientSeries, dailyWaterSeries, macroEnergySplit } from '../../domain/reports';
import type { ActivityLog, BodyAssessment, DiaryEntry, WaterLog, WeightEntry, WellbeingLog } from '../../domain/types';
import { WELLBEING_LABELS } from '../../domain/wellbeing';
import { exportReportPDF } from '../../services/export';
import { useCollection, useGoals, useProfile, useToday } from '../../state/hooks';
import { Donut, GoalBarChart, LineChart } from '../../ui/charts';
import { Badge, Button, Card, Chip, ListItem, Notice, Row, Screen, T } from '../../ui/components';
import { InsightCard, SectionTitle, StatCard } from '../../ui/dashboard';
import { ml, num, signed } from '../../ui/format';
import { spacing, useTheme } from '../../ui/theme';

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Progress() {
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const { profile } = useProfile();
  const { goalSet } = useGoals();
  const [period, setPeriod] = useState<7 | 30>(7);
  const from = addDays(today, -(period - 1));
  const entries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', from] });
  const creatineEntries = useCollection<DiaryEntry>('diary_entries', { gte: ['date', addDays(today, -90)] });
  const creatine = useMemo(() => creatineStatus(creatineEntries.data, today), [creatineEntries.data, today]);
  const wellbeing = useCollection<WellbeingLog>('wellbeing_logs', { gte: ['date', from], order: { field: 'date', ascending: true } });
  const swelling = wellbeing.data.filter((w) => w.kind !== 'ok');
  const water = useCollection<WaterLog>('water_logs', { gte: ['date', from] });
  const activities = useCollection<ActivityLog>('activities', { gte: ['date', from] });
  const weights = useCollection<WeightEntry>('weight_entries', { order: { field: 'measured_at', ascending: true } });
  const assessments = useCollection<BodyAssessment>('body_assessments', { order: { field: 'measured_at', ascending: true } });
  const [msg, setMsg] = useState<string | null>(null);
  const goals = goalSet?.targets ?? null;

  const report = useMemo(
    () => buildReport({ from, to: today, entries: entries.data, waterLogs: water.data, activities: activities.data, weights: weights.data, assessments: assessments.data, goals }),
    [from, today, entries.data, water.data, activities.data, weights.data, assessments.data, goals],
  );
  const label = (d: string) => (period === 7 ? WD[parseISODate(d).getDay()] : String(parseISODate(d).getDate()));
  const kcal = dailyNutrientSeries(entries.data, from, today, 'energy_kcal').map((x) => ({ label: label(x.date), value: x.value }));
  const protein = dailyNutrientSeries(entries.data, from, today, 'protein_g').map((x) => ({ label: label(x.date), value: x.value }));
  const waterS = dailyWaterSeries(water.data, from, today, goals?.water_ml.value ?? null).map((x) => ({ label: label(x.date), value: x.value }));
  const split = macroEnergySplit(entries.data, from, today);
  const weightPts = weights.data.map((w) => ({ date: w.measured_at, value: w.weight_kg }));
  const smooth = movingAverage(weightPts, 7);

  return (
    <Screen>
      <Row>
        <Chip label="Semana" selected={period === 7} onPress={() => setPeriod(7)} />
        <Chip label="30 dias" selected={period === 30} onPress={() => setPeriod(30)} />
        <Badge label={`registros: confiabilidade ${report.confidence}`} tone={report.confidence === 'alta' ? 'primary' : report.confidence === 'média' ? 'info' : 'warning'} />
      </Row>

      <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
        <StatCard icon="flame-outline" label="Média de calorias" value={report.food.avgKcal === null ? '—' : `${num(report.food.avgKcal)}`} sub={goals?.energy_kcal.value ? `meta ${num(goals.energy_kcal.value)} kcal` : 'kcal/dia'} color={colors.macro.carbs} />
        <StatCard icon="barbell-outline" label="Média de proteína" value={report.food.avgProtein === null ? '—' : `${num(report.food.avgProtein)} g`} sub={goals?.protein_g.value ? `meta ${num(goals.protein_g.value)} g` : undefined} />
      </Row>
      <Row gap={spacing.sm} style={{ alignItems: 'stretch' }}>
        <StatCard icon="water-outline" label="Meta de água" value={`${report.hydration.daysMet}/${report.hydration.daysWithLogs || 0}`} sub="dias atingidos (com registro)" color={colors.water} />
        <StatCard icon="walk-outline" label="Atividades" value={`${report.activity.sessions}`} sub={`${report.activity.minutes} min · ${report.activity.strengthSessions} de força`} onPress={() => router.push('/(tabs)/atividades')} />
      </Row>

      <Card>
        <T variant="h3">Calorias por dia</T>
        <GoalBarChart title="Calorias por dia" data={kcal} goal={goals?.energy_kcal.value ?? null} unit="kcal" color={colors.macro.carbs} />
      </Card>
      <Card>
        <T variant="h3">Proteína por dia</T>
        <GoalBarChart title="Proteína por dia" data={protein} goal={goals?.protein_g.value ?? null} unit="g" color={colors.macro.protein} />
      </Card>
      <Card>
        <T variant="h3">Distribuição das calorias</T>
        {split ? (
          <Donut
            centerLabel={`${Math.round(split.protein * 100)}%`}
            centerSub="de proteína"
            parts={[
              { label: 'Proteína', value: split.protein, color: colors.macro.protein },
              { label: 'Carboidratos', value: split.carbs, color: colors.macro.carbs },
              { label: 'Gorduras', value: split.fat, color: colors.macro.fat },
            ]}
          />
        ) : (
          <T variant="small">Sem registros no período.</T>
        )}
      </Card>
      <Card>
        <T variant="h3">Água por dia</T>
        <GoalBarChart title="Água por dia" data={waterS} goal={goals?.water_ml.value ?? null} unit="ml" color={colors.chart.water} />
        {report.hydration.avgMl !== null ? <T variant="tiny">{`Média nos dias com registro: ${ml(report.hydration.avgMl)}`}</T> : null}
      </Card>

      <SectionTitle title="Corpo" />
      <Card onPress={() => router.push('/peso')} accessibilityLabel="Peso">
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="h3">Peso</T>
          <T variant="small">{smooth.length ? `${num(smooth[smooth.length - 1].value, 1)} kg${weightPts.length > 1 ? ` · ${signed(smooth[smooth.length - 1].value - weightPts[0].value, 1)} kg` : ''}` : 'sem pesagens'}</T>
        </Row>
        {weightPts.length ? <LineChart title="Peso" points={weightPts} smooth={weightPts.length >= 3 ? smooth : undefined} unit="kg" color={colors.chart.primary} /> : <T variant="small">Toque para registrar seu peso.</T>}
        {creatine.startedOn && creatine.startedOn >= from ? <T variant="tiny">{`Início da creatina em ${formatDateBR(creatine.startedOn)}: nas primeiras semanas o peso pode subir 1–2 kg de água no músculo.`}</T> : null}
        {swelling.length ? (
          <T variant="tiny">{`Inchaço registrado: ${swelling.map((w) => `${formatDateBR(w.date).slice(0, 5)} (${WELLBEING_LABELS[w.kind].toLowerCase()})`).join(', ')}. Oscilações de peso nesses dias costumam ser água.`}</T>
        ) : null}
      </Card>
      <Card>
        <ListItem icon="cloud-upload-outline" title="Importar exame de bioimpedância" subtitle="PDF ou foto do laudo, lido pela IA que você usa" onPress={() => router.push('/composicao/nova')} />
        <ListItem icon="body-outline" title="Composição corporal" subtitle={assessments.data.length ? `${assessments.data.length} avaliação(ões) · comparação e tendências` : 'Adicione sua bioimpedância'} onPress={() => router.push('/(tabs)/evolucao')} />
        <ListItem icon="walk-outline" title="Atividades" subtitle="Registros e consistência semanal" onPress={() => router.push('/(tabs)/atividades')} />
        <ListItem icon="document-text-outline" title="Relatório detalhado" subtitle="Texto completo, lacunas e exportação CSV" onPress={() => router.push('/relatorios')} />
      </Card>

      {report.suggestions.length ? (
        <>
          <SectionTitle title="Para o próximo período" />
          {report.suggestions.slice(0, 3).map((s) => <InsightCard key={s} icon="bulb-outline" title="Sugestão" text={s} />)}
        </>
      ) : null}
      {report.missing.length ? <Notice kind="info" title="Informações faltantes">{report.missing.join(' ')}</Notice> : null}
      {msg ? <Notice kind="error">{msg}</Notice> : null}
      <Button icon="document-outline" title="Exportar relatório em PDF" onPress={() => exportReportPDF(report, period === 7 ? 'Relatório semanal' : 'Relatório mensal', profile?.name ?? '').catch((e) => setMsg(e.message))} />
    </Screen>
  );
}
